"""Reopen only a previously drained private ZIP window and verify persistence."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import parse_qs, urlsplit

from windows_window_close import processes


def main(state_file):
    project = Path(__file__).resolve().parents[1]
    previous = json.loads(state_file.read_text(encoding="utf-8"))
    root = Path(previous["root"])
    if root.parent != project / ".mediaslimx" / "window-tests":
        raise ValueError("Only isolated acceptance runs are allowed")
    if (Path(previous["data"]) / "window.json").exists():
        raise ValueError("Reopen test requires a drained, stopped instance")
    helper = subprocess.Popen([sys.executable, "-X", "utf8", str(project / "tests" / "windows_window_acceptance.py"), "--state", str(state_file), "--hold"], stdout=subprocess.PIPE, text=True, encoding="utf-8")
    ready = json.loads(helper.stdout.readline())
    state = json.loads(state_file.read_text(encoding="utf-8"))
    record_path = Path(state["data"]) / "window.json"
    record = json.loads(record_path.read_text(encoding="utf-8"))
    url = urlsplit(record["url"])
    base, token = "http://127.0.0.1:" + str(url.port), parse_qs(url.fragment)["token"][0]

    def get(route):
        request = urllib.request.Request(base + route, headers={"X-MediaSlimX-Token": token})
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)

    report = {"checks": [], "scope": "Actual ZIP reopen/repeat activation; idle display-loss exit, not a physical X click"}
    try:
        env = get("/api/environment")
        assert env["pid"] == record["owner_pid"] and env["window_directory_drop"]
        assert state["ungranted_directory"].casefold() in {p.casefold() for p in env["roots"]}
        ui = json.loads((root / "window-ui-report.json").read_text(encoding="utf-8"))
        for key in ("completed_task_id", "five_format_task_id"):
            assert get("/api/tasks/" + ui[key])["status"] == "completed"
        assert all(t["status"] not in ("running", "cancelling", "restoring") for t in get("/api/tasks"))
        report["checks"].append("completed tasks and exact dropped-folder authorization survive reopening; work is not resumed automatically")
        second = subprocess.run([state["executable"], "--data-dir", state["data"]], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        assert second.returncode == 0
        assert json.loads(record_path.read_text(encoding="utf-8")) == record
        assert get("/api/environment")["pid"] == record["owner_pid"]
        report["checks"].append("repeat launch activates the same verified owner/host and does not create another background service")
        owned = {state["launcher_pid"], record["owner_pid"]}
        snapshot = processes()
        for _ in range(20):
            previous_count = len(owned)
            owned.update(p["ProcessId"] for p in snapshot if p["ParentProcessId"] in owned)
            if len(owned) == previous_count:
                break
        node = "const{chromium}=require(process.env.MSX_PLAYWRIGHT);(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:'+process.argv[1]);const c=await b.newBrowserCDPSession();await c.send('Browser.close').catch(()=>{});process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});"
        driver_env = os.environ.copy()
        driver_env["MSX_PLAYWRIGHT"] = str(project / ".mediaslimx/browser-tools/node_modules/playwright")
        subprocess.run(["C:/Program Files/nodejs/node.exe", "-e", node, str(state["debug_port"])], env=driver_env, check=True)
        assert helper.wait(timeout=60) == 0
        for _ in range(30):
            alive = {p["ProcessId"] for p in processes()}
            if not owned & alive:
                break
            time.sleep(.2)
        assert not owned & alive and not record_path.exists()
        for port in (state["port"], state["debug_port"]):
            with socket.socket() as sock:
                assert sock.connect_ex(("127.0.0.1", port)) != 0
        report["checks"].append("idle display loss drains only the reopened instance; all observed owned processes and both private ports exit")
        report["success"] = True
        report["owned_process_count"] = len(owned)
    except Exception as error:
        report["success"] = False
        report["error"] = str(error)
        raise
    finally:
        (root / "window-reopen-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"success": True, "report": str(root / "window-reopen-report.json"), "checks": len(report["checks"]), "owned_processes": len(owned)}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    if os.name != "nt":
        raise SystemExit("Native Windows only")
    main(args.state)
