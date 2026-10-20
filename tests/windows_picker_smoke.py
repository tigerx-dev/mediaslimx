"""Windows interactive-desktop smoke: real window creation, cancellation, retry.

Only our own helper processes are stopped, through the app's cancellation API.
No mouse/keyboard input is injected. This does not verify a human's folder click.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import ctypes
from ctypes import wintypes
import sys
from pathlib import Path
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mediaslimx import desktop


def visible_windows(process_id):
    """Read metadata for our helper's top-level windows; no UI input is sent."""
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user32.EnumWindows.restype = wintypes.BOOL
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.restype = wintypes.BOOL
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    windows = []

    @callback_type
    def inspect(hwnd, _):
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value == process_id and user32.IsWindowVisible(hwnd):
            title = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, title, len(title))
            rect = wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            # OS input-method helper windows can have WS_VISIBLE but zero area.
            if rect.right > rect.left and rect.bottom > rect.top:
                windows.append(title.value)
        return True

    user32.EnumWindows(inspect, 0)
    return windows


def main():
    if os.name != "nt":
        raise SystemExit("Run with Windows Python on an interactive desktop")
    results = []
    with ThreadPoolExecutor(max_workers=1) as executor:
        for _ in range(2):
            request_id = uuid.uuid4().hex
            future = executor.submit(desktop.choose_native_folder, os.getcwd(), request_id)
            process = None
            windows = []
            try:
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    with desktop._STATE_LOCK:
                        process = desktop._process
                    if process is not None:
                        windows = visible_windows(process.pid)
                        if "MediaSlim X — 选择文件夹" in windows:
                            break
                    if future.done():
                        raise AssertionError("Picker exited before displaying a window: " + str(future.result()))
                    time.sleep(.1)
                assert "MediaSlim X — 选择文件夹" in windows, "Native folder dialog was not visible"
                time.sleep(.2)
                windows = visible_windows(process.pid)
                assert windows == ["MediaSlim X — 选择文件夹"], "Unexpected extra window: " + repr(windows)
            finally:
                desktop.cancel_native_folder(request_id)
            assert future.result(timeout=5) is None
            assert process.poll() is not None
            assert desktop._process is None and not desktop.PICKER_LOCK.locked()
            results.append({"visibleWindows": windows, "cancelled": True, "processReaped": True})
    print(json.dumps({"attempts": results, "manualSelectionVerified": False}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
