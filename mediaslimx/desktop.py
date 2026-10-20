"""Opt-in Windows picker, isolated from the web worker and cancellable."""
from collections import OrderedDict
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import uuid

from .paths import absolute

PICKER_LOCK = threading.Lock()
_STATE_LOCK = threading.Lock()
_active_id = None
_active_owner = None
_process = None
_cancelled = OrderedDict()


def cancel_native_folder(request_id):
    """Cancel only the matching request, including a cancel arriving before spawn."""
    global _cancelled
    with _STATE_LOCK:
        _cancelled[request_id] = True
        while len(_cancelled) > 64:
            _cancelled.popitem(last=False)
        if _active_id == request_id and _process is not None and _process.poll() is None:
            try:
                _process.kill()
            except OSError:
                pass  # It may have just exited; the caller still discards the result.


def stop_native_folder(closing):
    """Close this app's picker before the HTTP server waits for its request.

    Registering the closing event and killing the tracked helper share the
    spawn lock: a request cannot slip a new helper past service shutdown.
    Other app instances and browser processes are outside this ownership scope.
    The request's worker remains responsible for communicate()/reaping.
    """
    with _STATE_LOCK:
        closing.set()
        if _active_owner is closing and _active_id is not None:
            _cancelled[_active_id] = True
            if _process is not None and _process.poll() is None:
                try:
                    _process.kill()
                except OSError:
                    pass  # It may already have exited; discard the late result.


def choose_native_folder(initial, request_id=None, *, closing=None):
    if os.name != "nt":
        raise ValueError("系统文件夹窗口仅在 Windows 本地桌面模式可用，请使用网页目录浏览器")
    if not PICKER_LOCK.acquire(blocking=False):
        raise ValueError("已有系统目录窗口打开，请先完成或取消")
    global _active_id, _active_owner, _process
    request_id = request_id or uuid.uuid4().hex
    process = None
    try:
        env = os.environ.copy()
        # The initial path is data, never Python/PowerShell source or a shell command.
        env["MEDIASLIMX_PICKER_INITIAL"] = str(initial)
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        with _STATE_LOCK:
            if request_id in _cancelled or (closing is not None and closing.is_set()):
                return None
            _active_id = request_id
            _active_owner = closing
            # The Windows venv executable is a redirector. Use its base Python
            # so the tracked PID owns the window and cancellation has no orphan.
            # This helper uses only the standard library.
            process = subprocess.Popen(
                ([sys.executable, "--mediaslimx-folder-worker"] if getattr(sys, "frozen", False) else
                 [getattr(sys, "_base_executable", sys.executable), "-X", "utf8", "-m", "mediaslimx.desktop"]),
                cwd=str(Path(__file__).resolve().parent.parent),
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env=env, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            _process = process
        try:
            stdout, _ = process.communicate(timeout=300)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            raise ValueError("系统目录选择超时，请重试或使用网页目录浏览器") from None
        with _STATE_LOCK:
            if request_id in _cancelled or (closing is not None and closing.is_set()):
                return None
        try:
            result = json.loads(stdout.decode("utf-8-sig"))
            if not isinstance(result, dict):
                raise ValueError
        except (UnicodeError, ValueError):
            raise ValueError("系统选择器未正常返回，请重试或使用网页目录浏览器") from None
        if process.returncode or result.get("error"):
            raise ValueError(result.get("error") or "系统选择器启动失败，请使用网页目录浏览器")
        selected = result.get("path")
        if selected is not None and not isinstance(selected, str):
            raise ValueError("系统选择器返回了无效目录，请重试")
        return str(absolute(selected)) if selected else None
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.communicate()
        with _STATE_LOCK:
            if _active_id == request_id:
                _active_id, _active_owner, _process = None, None, None
            _cancelled.pop(request_id, None)
        PICKER_LOCK.release()


def _picker_window(initial):
    """Run on the child process main thread, with a real Tk message loop.

    The Tk owner stays withdrawn: users should see only the OS folder dialog.
    Keep the message loop and parent relationship for modal lifetime management.
    No directory listing or file contents are returned by this helper.
    """
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.title("MediaSlim X — 选择目录")
    root.attributes("-topmost", True)
    root.update_idletasks()
    result = {"path": None}

    def select():
        try:
            chosen = filedialog.askdirectory(
                parent=root, title="MediaSlim X — 选择文件夹",
                initialdir=initial, mustexist=True,
            )
            result["path"] = chosen or None
        except Exception:
            result["error"] = "系统目录窗口无法打开，请使用网页目录浏览器"
        finally:
            root.destroy()

    root.after(0, select)
    root.mainloop()
    return result


def main():
    if os.name != "nt":
        result = {"error": "系统目录窗口仅支持 Windows 本地模式"}
    else:
        try:
            result = _picker_window(os.environ.get("MEDIASLIMX_PICKER_INITIAL", ""))
        except ImportError:
            result = {"error": "当前 Windows Python 缺少 Tcl/Tk，请修改 Python 安装启用 Tcl/Tk，或使用网页目录浏览器"}
        except Exception:
            result = {"error": "系统目录窗口启动失败，请使用网页目录浏览器"}
    print(json.dumps(result, ensure_ascii=True), flush=True)
    return 1 if result.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main())
