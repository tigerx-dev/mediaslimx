"""Windows portable launchers for the browser and standalone-window builds.

This entry owns no media-processing logic. It dispatches frozen helpers, keeps
its state separate from source/WSL installations, and delegates to normal main.
"""
import ctypes
import os
from pathlib import Path
import socket
import sys

# Keep the Windows Job handle open until this launcher exits. Helpers then cannot
# outlive their owner. Only this launcher and its own descendants join it.
_job_handle = None


def _restore_worker_streams():
    """Windowed PyInstaller workers still need their parent's JSON pipes.

    The GUI bootloader may set Python streams to None even when Popen supplied
    valid standard handles. Duplicate only those inherited handles; never
    attach a console or send worker JSON to the main application's log.
    """
    if os.name != "nt":
        return
    import msvcrt
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetStdHandle.argtypes = [wintypes.DWORD]
    kernel.GetStdHandle.restype = wintypes.HANDLE
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.DuplicateHandle.argtypes = [wintypes.HANDLE, wintypes.HANDLE, wintypes.HANDLE,
                                      ctypes.POINTER(wintypes.HANDLE), wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.DuplicateHandle.restype = wintypes.BOOL
    process = kernel.GetCurrentProcess()
    for name, number, mode, flag in (("stdin", -10, "r", os.O_RDONLY),
                                      ("stdout", -11, "w", os.O_WRONLY), ("stderr", -12, "w", os.O_WRONLY)):
        if getattr(sys, name) is not None:
            continue
        handle = kernel.GetStdHandle(number & 0xFFFFFFFF)
        if not handle or handle == wintypes.HANDLE(-1).value:
            continue
        copied = wintypes.HANDLE()
        if not kernel.DuplicateHandle(process, handle, process, ctypes.byref(copied), 0, False, 2):
            raise OSError(ctypes.get_last_error(), "Cannot duplicate worker pipe")
        descriptor = msvcrt.open_osfhandle(copied.value, flag | os.O_BINARY)
        setattr(sys, name, os.fdopen(descriptor, mode, encoding="utf-8", newline="\n", buffering=1))


def _own_process_tree(allow_breakaway=True):
    from ctypes import wintypes

    class Limits(ctypes.Structure):
        _fields_ = [("process_time", ctypes.c_int64), ("job_time", ctypes.c_int64),
                    ("flags", wintypes.DWORD), ("working_min", ctypes.c_size_t),
                    ("working_max", ctypes.c_size_t), ("active_processes", wintypes.DWORD),
                    ("affinity", ctypes.c_size_t), ("priority", wintypes.DWORD),
                    ("scheduling", wintypes.DWORD)]

    class Counters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_uint64) for name in (
            "read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]

    class Extended(ctypes.Structure):
        _fields_ = [("basic", Limits), ("io", Counters),
                    ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                    ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel.SetInformationJobObject.restype = wintypes.BOOL
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    handle = kernel.CreateJobObjectW(None, None)
    limits = Extended()
    limits.basic.flags = 0x00002000 | (0x00000800 if allow_breakaway else 0)
    if not handle or not kernel.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not kernel.AssignProcessToJobObject(handle, kernel.GetCurrentProcess()):
        raise SystemExit("无法创建本机服务进程组，请使用普通 Windows 会话重新启动。 / Cannot create process group.")
    global _job_handle
    _job_handle = handle


def _free_port():
    for port in range(8767, 8867):
        try:
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", port))
            return port
        except OSError:
            continue
    raise SystemExit("8767–8866 均被占用，请用 --port 指定其他端口。 / Specify another --port.")


def main(window=False):
    if sys.argv[1:2] in (["--mediaslimx-folder-worker"], ["--mediaslimx-pdf-worker"], ["--mediaslimx-browser-worker"]):
        _restore_worker_streams()
    # Pipes from frozen helpers use UTF-8 even on a non-UTF-8 Windows console.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    if sys.argv[1:2] == ["--mediaslimx-browser-worker"]:
        from .launch import _browser_worker
        raise SystemExit(_browser_worker())
    if sys.argv[1:2] == ["--mediaslimx-folder-worker"]:
        from .desktop import main as picker
        raise SystemExit(picker())
    if sys.argv[1:2] == ["--mediaslimx-pdf-worker"]:
        from .pdf import _main as pdf_worker
        pdf_worker()
        return
    if os.name != "nt":
        raise SystemExit("This entry is for Windows. Linux/WSL: python -m mediaslimx")
    if window:
        from .window import main as window_main
        window_main(portable=True)
        return
    _own_process_tree()
    # Never use the current working directory or the source installation's data.
    base = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")))
    data = base / "MediaSlimX" / "portable"
    resource_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    tools = resource_root / "bin"
    if tools.is_dir():
        os.environ["PATH"] = str(tools) + os.pathsep + os.environ.get("PATH", "")
    args = sys.argv[1:]
    defaults = ["--desktop"]
    if "--data-dir" not in args:
        defaults += ["--data-dir", str(data)]
    if "--port" not in args:
        defaults += ["--port", str(_free_port())]
    if "--allow-root" not in args:
        pictures = Path.home() / "Pictures"
        defaults += ["--allow-root", str(pictures if pictures.is_dir() else Path(sys.executable).parent)]
    if "--no-browser" not in args and "--open-browser" not in args:
        defaults.append("--open-browser")
    sys.argv = [sys.argv[0], *defaults, *args]
    print("MediaSlim X · Windows 便携版 / Portable", flush=True)
    print("保留此窗口。停止任务后按 Ctrl+C 退出；关闭浏览器不会停止服务。", flush=True)
    print("Keep this window open. After tasks finish, press Ctrl+C to stop the service.", flush=True)
    from .__main__ import main as application
    application()
