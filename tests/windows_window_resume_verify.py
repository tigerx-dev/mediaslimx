"""Read-only terminal check for one named isolated Windows resume run."""
import argparse
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import socket
import time


def alive(pid):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    handle = kernel.OpenProcess(0x00100000, False, pid)
    if not handle:
        return False
    try:
        return kernel.WaitForSingleObject(handle, 0) == 258
    finally:
        kernel.CloseHandle(handle)


def port_open(port):
    with socket.socket() as client:
        client.settimeout(0.3)
        return client.connect_ex(("127.0.0.1", port)) == 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    state_file = args.state.resolve(strict=True)
    root = state_file.parent
    if root.parent != Path(__file__).resolve().parents[1] / ".mediaslimx" / "window-tests" or not root.name.startswith(("r8 中文 space ", "r9 中文 space ", "r10 中文 space ")):
        raise SystemExit("Only an isolated r8/r9/r10 synthetic run is allowed")
    state = json.loads(state_file.read_text(encoding="utf-8"))
    assert Path(state["data"]) == root / "data"
    for _ in range(100):
        running = {name: alive(state[name]) for name in ("owner_pid", "host_pid")}
        ports = {name: port_open(state[name]) for name in ("port", "debug_port")}
        if not any(running.values()) and not any(ports.values()):
            break
        time.sleep(0.1)
    scratch = list((root / "data" / "work").iterdir())
    result = {"owner_host_running": running, "private_ports_open": ports,
              "window_record_exists": (root / "data" / "window.json").exists(),
              "scratch_count": len(scratch), "unrelated_baseline": state.get("unrelated_baseline")}
    assert not any(running.values()) and not any(ports.values()) and not result["window_record_exists"] and not scratch, result
    (root / "window-resume-terminal.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
