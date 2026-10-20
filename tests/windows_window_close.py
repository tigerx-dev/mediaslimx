"""Exercise safe drain after display loss in an isolated actual Windows ZIP.

This is deliberately not a physical titlebar/Yes-No click acceptance. The only
display action is CDP Browser.close on the exact private debug port. No OS UI
automation, process-name kills, default data, or personal media are involved.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import time
import urllib.request


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def processes():
    command = "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress"
    result = subprocess.check_output(["powershell.exe", "-NoProfile", "-Command", command], encoding="utf-8")
    return json.loads(result)


def main(state_file):
    from urllib.parse import urlsplit, parse_qs
    project = Path(__file__).resolve().parents[1]
    state = json.loads(state_file.read_text(encoding="utf-8"))
    root, data = Path(state["root"]), Path(state["data"])
    if root.parent != project / ".mediaslimx" / "window-tests" or data != root / "data":
        raise ValueError("Not a private window acceptance run")
    record = json.loads((data / "window.json").read_text(encoding="utf-8"))
    url = urlsplit(record["url"])
    if url.hostname != "127.0.0.1" or url.port in (8765, 8766):
        raise ValueError("Not an isolated window address")
    base, token = "http://127.0.0.1:" + str(url.port), parse_qs(url.fragment)["token"][0]

    def api(route, body=None):
        request = urllib.request.Request(base + route, data=json.dumps(body).encode() if body is not None else None, headers={"X-MediaSlimX-Token": token, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    assert api("/api/environment")["pid"] == record["owner_pid"]
    params = {"preset": "balanced", "max_width": None, "max_height": None}

    def task_for(scan, selected, mode, **values):
        task = api("/api/tasks", {"scan_id": scan["id"], "selected": selected, "preset": params["preset"], "mode": mode, **values})
        return task

    def wait(task):
        for _ in range(600):
            task = api("/api/tasks/" + task["id"])
            if task["status"] not in ("running", "cancelling", "restoring"):
                return task
            time.sleep(.1)
        raise TimeoutError("Private acceptance task did not complete")

    # Establish actual completed output and recoverable backup before exiting.
    scan = api("/api/scans", {"path": state["media"]})
    entry = next(e for e in scan["entries"] if e["relative"] == "picture.jpg")
    export = wait(task_for(scan, [entry["id"]], "export", output=str(root / "exit-export")))
    assert next(e for e in export["entries"] if e["relative"] == "picture.jpg")["status"] == "success"
    backup = wait(task_for(scan, [entry["id"]], "backup", backup=str(root / "exit-backup")))
    backed_up = next(e for e in backup["entries"] if e["relative"] == "picture.jpg")
    assert backed_up["status"] == "success"
    restored = api("/api/tasks/" + backup["id"] + "/restore", {"entry_id": backed_up["id"]})
    assert next(e for e in restored["entries"] if e["relative"] == "picture.jpg")["status"] == "restored"
    retained = {str(p): digest(p) for p in root.rglob("*") if p.is_file() and any(part in ("exports", "exit-export", "exit-backup", "downloads", "imports") for part in p.relative_to(root).parts)}
    completed = [t["id"] for t in api("/api/tasks") if t["status"] == "completed"]

    scan = api("/api/scans", {"path": state["closing_media"]})
    video = next(e for e in scan["entries"] if e["relative"] == "closing-video.mp4")
    task = task_for(scan, [video["id"]], "export", output=str(root / "exit-video-export"))
    owned, active = set(), False
    for _ in range(80):
        snapshot = processes()
        owned = {record["owner_pid"], state["launcher_pid"]}
        for _ in range(20):
            previous = len(owned)
            owned.update(p["ProcessId"] for p in snapshot if p["ParentProcessId"] in owned)
            if len(owned) == previous:
                break
        active = any(p["ProcessId"] in owned and p["Name"].lower() == "ffmpeg.exe" for p in snapshot)
        if active:
            break
        time.sleep(.1)
    current = api("/api/tasks/" + task["id"])
    assert active and current["status"] == "running", "Must observe a real owned active encode before display loss"
    report = {"actual_zip": True, "trigger": "CDP display-process loss; NOT physical titlebar X or Yes/No click", "active_ffmpeg": True, "status_before": current["status"], "owned_pids": sorted(owned), "checks": []}
    node = "const {chromium}=require(process.env.MSX_PLAYWRIGHT); (async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:'+process.argv[1]); const c=await b.newBrowserCDPSession(); await c.send('Browser.close').catch(()=>{}); process.exit(0);})().catch(e=>{console.error(e);process.exit(1)});"
    env = os.environ.copy()
    env["MSX_PLAYWRIGHT"] = str(project / ".mediaslimx" / "browser-tools" / "node_modules" / "playwright")
    subprocess.run(["C:/Program Files/nodejs/node.exe", "-e", node, str(state["debug_port"])], env=env, check=True)
    for _ in range(90):
        alive = {p["ProcessId"] for p in processes()}
        if not (owned & alive) and not (data / "window.json").exists():
            break
        time.sleep(.3)
    assert not owned & alive, "An owned process survived display loss"
    assert not (data / "window.json").exists()
    assert not any((data / "work").iterdir()), "Scratch work survived safe drain"
    for port in (url.port, state["debug_port"]):
        with socket.socket() as sock:
            assert sock.connect_ex(("127.0.0.1", port)) != 0, "A private test port survived safe drain"
    report["checks"].append("owned encoder/host/service ended, window record removed and scratch empty")
    with sqlite3.connect((data / "tasks.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        records = {key: json.loads(value) for key, value in db.execute("SELECT id,data FROM records WHERE kind='task'")}
    assert records[task["id"]]["status"] == "cancelled"
    assert all(records[key]["status"] == "completed" for key in completed)
    assert all(digest(root / relative) == original for relative, original in state["original_hashes"].items())
    assert all(Path(name).is_file() and digest(Path(name)) == original for name, original in retained.items())
    report["checks"].append("cancelled task persisted; all originals/completed records/reports/exports/backup/import copies retained")
    after = {}
    for port in (8765, 8766):
        with socket.socket() as sock:
            after[str(port)] = sock.connect_ex(("127.0.0.1", port)) == 0
    alive = {p["ProcessId"] for p in processes()}
    for key in ("user_owner_pid", "user_host_pid"):
        if key in state.get("unrelated_baseline", {}):
            after[key + "_alive"] = state["unrelated_baseline"][key] in alive
    report["unrelated_after"] = after
    report["unrelated_baseline"] = state.get("unrelated_baseline", {})
    report["originals_checked"] = len(state["original_hashes"])
    report["retained_files_checked"] = len(retained)
    report["task_status"] = records[task["id"]]["status"]
    report["success"] = True
    report_file = root / "window-close-report.json"
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"success": True, "report": str(report_file), "owned_processes": len(owned), "task_status": report["task_status"], "unrelated_after": after}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True, type=Path)
    args = parser.parse_args()
    if os.name != "nt":
        raise SystemExit("Native Windows only")
    main(args.state)
