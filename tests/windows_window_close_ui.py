"""Prepare/verify a real portable-window close test without OS UI control.

Preparation creates only synthetic hard links inside the private fixture root,
limits only that test owner to one CPU at below-normal priority and starts an
export queue. The separate browser script clicks the product's Quit entry and
its actual confirmation panel. Verification never kills or closes anything.
"""
import argparse
from collections import Counter
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import socket
import sqlite3
import time
import urllib.request
from urllib.parse import parse_qs, urlsplit

from windows_window_manual_verify import digest, listening
from windows_window_close import processes


def descendants(snapshot, owned):
    for _ in range(20):
        previous = len(owned)
        owned.update(item["ProcessId"] for item in snapshot if item["ParentProcessId"] in owned)
        if len(owned) == previous:
            break
    return owned


def prepare(state_file, state, root, data, fixture_count=20):
    record = json.loads((data / "window.json").read_text(encoding="utf-8"))
    address = urlsplit(record["url"])
    assert address.hostname == "127.0.0.1" and address.port == state["port"]
    token = parse_qs(address.fragment)["token"][0]

    def api(route, body=None):
        request = urllib.request.Request("http://127.0.0.1:" + str(address.port) + route,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"X-MediaSlimX-Token": token, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    assert api("/api/environment")["pid"] == record["owner_pid"] == state["owner_pid"]
    assert all(t["status"] not in ("running", "cancelling", "restoring") for t in api("/api/tasks"))

    def wait(task):
        for _ in range(300):
            current = api("/api/tasks/" + task["id"])
            if current["status"] not in ("running", "cancelling", "restoring"):
                assert current["status"] == "completed", current["status"]
                return current
            time.sleep(.1)
        raise TimeoutError("Synthetic baseline task did not finish")

    # Keep a real recoverable backup and a completed export before exit.
    scan = api("/api/scans", {"path": state["media"]})
    picture = next(e for e in scan["entries"] if e["relative"] == "picture.jpg")
    settings = {"scan_id": scan["id"], "selected": [picture["id"]], "preset": "balanced"}
    wait(api("/api/tasks", {**settings, "mode": "export", "output": str(root / "exit-export")}))
    backup = wait(api("/api/tasks", {**settings, "mode": "backup", "backup": str(root / "exit-backup")}))
    entry = next(e for e in backup["entries"] if e["relative"] == "picture.jpg")
    assert entry["status"] == "success"
    restored = api("/api/tasks/" + backup["id"] + "/restore", {"entry_id": entry["id"]})
    assert next(e for e in restored["entries"] if e["id"] == entry["id"])["status"] == "restored"

    closing = Path(state["closing_media"])
    assert closing == root / "closing-media"
    original = closing / "closing-video.mp4"
    original_hash = digest(original)
    assert 20 <= fixture_count <= 80
    for index in range(1, fixture_count):
        target = closing / ("close-ui-%02d.mp4" % index)
        assert not target.exists()
        os.link(original, target)
        state["original_hashes"][str(target.relative_to(root))] = original_hash

    # These settings affect only our exact private owner and future encoders.
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.GetProcessAffinityMask.argtypes = [wintypes.HANDLE, ctypes.POINTER(ctypes.c_size_t), ctypes.POINTER(ctypes.c_size_t)]
    kernel.SetProcessAffinityMask.argtypes = [wintypes.HANDLE, ctypes.c_size_t]
    kernel.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x0200 | 0x0400, False, record["owner_pid"])
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        process_mask, system_mask = ctypes.c_size_t(), ctypes.c_size_t()
        assert kernel.GetProcessAffinityMask(handle, ctypes.byref(process_mask), ctypes.byref(system_mask))
        affinity = process_mask.value & -process_mask.value
        assert kernel.SetProcessAffinityMask(handle, affinity)
        assert kernel.SetPriorityClass(handle, 0x4000)  # BELOW_NORMAL_PRIORITY_CLASS
    finally:
        kernel.CloseHandle(handle)
    baseline = {
        "completed_task_ids": [t["id"] for t in api("/api/tasks") if t["status"] == "completed"],
        "retained_files": {str(p.relative_to(root)): digest(p) for p in root.rglob("*") if p.is_file() and any(part in ("exports", "exit-export", "exit-backup", "downloads", "imports") for part in p.relative_to(root).parts)},
        "test_only_affinity": affinity,
        "test_only_below_normal_priority": True,
    }
    scan = api("/api/scans", {"path": str(closing)})
    assert len(scan["entries"]) == fixture_count and all(e["status"] == "ready" for e in scan["entries"])
    task = api("/api/tasks", {"scan_id": scan["id"], "selected": [e["id"] for e in scan["entries"]], "preset": "quality", "mode": "export", "output": str(root / "close-ui-exports")})
    for _ in range(30):
        snapshot = processes()
        owned = descendants(snapshot, {record["owner_pid"], state["launcher_pid"]})
        encoders = [p["ProcessId"] for p in snapshot if p["ProcessId"] in owned and p["Name"].lower() == "ffmpeg.exe"]
        if encoders:
            break
        time.sleep(.1)
    assert encoders and api("/api/tasks/" + task["id"])["status"] == "running"
    state["close_task_id"] = task["id"]
    baseline.update(task_id=task["id"], owned_pids=sorted(owned), active_encoders=encoders)
    state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "window-close-ui-baseline.json").write_text(json.dumps(baseline, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"prepared": True, "files": fixture_count, "active_encoders": len(encoders), "test_only_affinity": affinity}))


def verify(state, root, data, human_close=None):
    baseline = json.loads((root / "window-close-ui-baseline.json").read_text(encoding="utf-8"))
    if human_close is None:
        ui = json.loads((root / "window-close-ui-report.json").read_text(encoding="utf-8"))
        assert ui["success"] and ui["status_before_exit"] == "running", "UI must actually choose exit while work is running"
    owned = set(baseline["owned_pids"])
    report = {"trigger": "Human physical titlebar X and reported Safe Exit" if human_close else "Product Quit entry -> same native Close/OnClosing handler -> actual HTML confirmation -> Exit; not a physical titlebar click", "checks": []}
    if human_close is not None:
        report["human_observation"] = human_close
    try:
        for _ in range(30):
            snapshot = processes()
            descendants(snapshot, owned)
            alive = {p["ProcessId"] for p in snapshot}
            if not owned & alive and not (data / "window.json").exists():
                break
            time.sleep(.3)
        assert not owned & alive and not (data / "window.json").exists()
        assert not listening(state["port"]) and not listening(state["debug_port"])
        assert not any((data / "work").iterdir())
        report["checks"].append("owned processes and both private ports exited naturally; owner record and scratch removed")
        with sqlite3.connect((data / "tasks.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
            tasks = {key: json.loads(value) for key, value in db.execute("SELECT id,data FROM records WHERE kind='task'")}
        task = tasks[baseline["task_id"]]
        statuses = Counter(e["status"] for e in task["entries"])
        assert task["status"] == "cancelled" and statuses["cancelled"] > 0 and not statuses["failed"], statuses
        assert all(tasks[key]["status"] == "completed" for key in baseline["completed_task_ids"])
        assert all(digest(root / name) == expected for name, expected in state["original_hashes"].items())
        assert all(digest(root / name) == expected for name, expected in baseline["retained_files"].items())
        results = [e for e in task["entries"] if e["status"] in ("success", "no_gain")]
        assert all(digest(Path(e["destination"])) == e["result_fp"]["sha256"] for e in results)
        report["checks"].append("remaining queue cancelled; original SHA-256, completed exports, backup/restore records, CSV and import copies preserved")
        after = {str(port): listening(port) for port in (8765, 8766)}
        assert all(after[key] == state["unrelated_baseline"][key] for key in after)
        report.update(success=True, task_status=task["status"], entry_statuses=dict(statuses), originals_checked=len(state["original_hashes"]), retained_files_checked=len(baseline["retained_files"]), completed_results_checked=len(results), observed_owned_pids=sorted(owned), unrelated_after=after, unrelated_baseline=state["unrelated_baseline"])
    except Exception as error:
        report.update(success=False, error=str(error))
        raise
    finally:
        (root / "window-close-ui-exit-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("success", "task_status", "entry_statuses", "originals_checked", "retained_files_checked", "unrelated_after")}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--fixture-count", type=int, default=20, help="Synthetic video queue length for a human close test (20-80)")
    parser.add_argument("--human-close", help="Exact human report after physical titlebar X and Safe Exit; verification never clicks or closes the window")
    args = parser.parse_args()
    if os.name != "nt":
        raise SystemExit("Native Windows only")
    state = json.loads(args.state.read_text(encoding="utf-8"))
    root, data = Path(state["root"]), Path(state["data"])
    assert root.parent == Path(__file__).resolve().parents[1] / ".mediaslimx" / "window-tests" and data == root / "data"
    assert state["port"] not in (8765, 8766) and state["debug_port"] not in (8765, 8766)
    prepare(args.state, state, root, data, args.fixture_count) if args.prepare else verify(state, root, data, args.human_close)
