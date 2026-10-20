"""Verify a private ZIP instance after a human reports native titlebar close.

This script only observes processes, ports, persisted tasks and synthetic files.
It never closes a window, kills a process or substitutes for the human click.
Run with native Windows Python, recording only what the human actually observed.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import time

from windows_window_close import processes


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def listening(port):
    with socket.socket() as sock:
        sock.settimeout(1)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def main(state_file, close_statement, yes_confirmed=False):
    project = Path(__file__).resolve().parents[1]
    state = json.loads(state_file.read_text(encoding="utf-8"))
    root, data = Path(state["root"]), Path(state["data"])
    if root.parent != project / ".mediaslimx" / "window-tests" or data != root / "data":
        raise ValueError("Only an isolated synthetic acceptance run is allowed")
    manual = json.loads((root / "manual-close-state.json").read_text(encoding="utf-8"))
    assert manual["step"] == "awaiting_human_yes"
    assert manual["human_no"]["task_status_after"] == "running"
    assert manual["human_no"]["active_encoder_after"]
    assert manual["status_before_yes"] == "running"
    assert all(port not in (8765, 8766) for port in (state["port"], state["debug_port"]))
    owned = set(manual["owned_pids_before_yes"])
    assert {manual["owner_pid"], manual["host_pid"], state["launcher_pid"]} <= owned
    report = {
        "scope": "Human native titlebar close; machine verification after the window exits",
        "human_no": manual["human_no"],
        "human_close": {"statement": close_statement, "yes_confirmed": yes_confirmed, "recorded_utc": datetime.now(timezone.utc).isoformat()},
        "test_only_cpu_limit": manual.get("test_only_cpu_limit", False),
        "fixture_count": manual["fixture_count"],
        "task_id": manual["task_id"],
        "owned_pids_before_yes": sorted(owned),
        "checks": [],
    }
    try:
        # Give the application time to cancel its own queue and drain normally.
        # No process termination or UI action is performed by this verifier.
        for _ in range(30):
            snapshot = processes()
            # Catch an encoder started after the pre-click snapshot as well.
            for _ in range(20):
                previous = len(owned)
                owned.update(item["ProcessId"] for item in snapshot if item["ParentProcessId"] in owned)
                if len(owned) == previous:
                    break
            alive = {item["ProcessId"] for item in snapshot}
            if not owned & alive and not (data / "window.json").exists():
                break
            time.sleep(.3)
        assert not owned & alive, "An observed owned process is still alive"
        assert not (data / "window.json").exists(), "The private owner record remains"
        assert not any((data / "work").iterdir()), "Unfinished scratch work remains"
        assert not listening(state["port"]) and not listening(state["debug_port"])
        report["observed_owned_processes"] = sorted(owned)
        report["checks"].append("all observed owned processes exited naturally; private HTTP/CDP ports closed; window record and scratch removed")

        with sqlite3.connect((data / "tasks.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
            tasks = {key: json.loads(value) for key, value in db.execute("SELECT id,data FROM records WHERE kind='task'")}
        task = tasks[manual["task_id"]]
        statuses = Counter(entry["status"] for entry in task["entries"])
        assert task["status"] in ("cancelled", "completed"), task["status"]
        if task["status"] == "cancelled":
            assert statuses["cancelled"] > 0, statuses
            report["remaining_cancel_observed"] = True
            report["checks"].append("remaining queue cancelled and persisted")
        else:
            assert set(statuses) <= {"success", "no_gain"}, statuses
            report["remaining_cancel_observed"] = False
            report["limitation"] = "Queue completed before closure; this click does not verify cancellation of pending items"
        if not yes_confirmed:
            report["human_yes_limitation"] = "Human did not observe or confirm clicking Yes; no Yes-branch acceptance is claimed"
        assert not statuses["failed"], statuses
        assert all(tasks[key]["status"] == "completed" for key in manual["completed_task_ids_before"])
        report["task_status"] = task["status"]
        report["entry_statuses"] = dict(statuses)
        report["checks"].append("earlier completed tasks remain completed")

        for relative, expected in state["original_hashes"].items():
            assert digest(root / relative) == expected, "A synthetic original changed: " + relative
        for relative, expected in manual["retained_files"].items():
            assert digest(root / relative) == expected, "A retained result changed: " + relative
        results = 0
        for entry in task["entries"]:
            if entry["status"] in ("success", "no_gain"):
                assert digest(Path(entry["destination"])) == entry["result_fp"]["sha256"]
                results += 1
        report.update(originals_checked=len(state["original_hashes"]), retained_files_checked=len(manual["retained_files"]), completed_results_checked=results)
        report["checks"].append("SHA-256 originals, earlier exports/backups/reports/import copies and completed current results preserved")

        baseline = state.get("unrelated_baseline", {})
        after = {str(port): listening(port) for port in (8765, 8766)}
        assert all(after[str(port)] == baseline[str(port)] for port in (8765, 8766))
        report.update(unrelated_baseline=baseline, unrelated_after=after, success=True)
        report["checks"].append("unrelated service reachability unchanged from the recorded baseline")
    except Exception as error:
        report.update(success=False, error=str(error))
        raise
    finally:
        report_file = root / "manual-busy-close-report.json"
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("success", "task_status", "entry_statuses", "remaining_cancel_observed", "originals_checked", "retained_files_checked", "completed_results_checked", "unrelated_after")}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--human-close", required=True, help="Exact latest human report; do not infer a Yes click")
    parser.add_argument("--yes-confirmed", action="store_true", help="Only when the person explicitly confirms observing and clicking Yes")
    args = parser.parse_args()
    if os.name != "nt":
        raise SystemExit("Native Windows only")
    main(args.state, args.human_close, args.yes_confirmed)
