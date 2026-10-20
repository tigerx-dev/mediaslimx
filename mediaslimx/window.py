"""Windows window owner: one local service, one private WebView2 host.

The native host displays the existing web UI and relays one actual dropped
directory object over its private stdio pipe. It exposes no general native API
or public directory-authorization/shutdown endpoint.
Normal close drains media transactions before allowing the window to exit.
"""
import argparse
import ctypes
import hashlib
import json
import logging
import os
from pathlib import Path
import queue
import re
import secrets
import subprocess
import sys
import threading
import time

from .paths import ensure_dir

LOG = logging.getLogger(__name__)
EVENTS = {"ready", "error", "startup_failed", "startup_retry", "close_requested", "close_confirmed", "close_cancelled", "directory_dropped"}


def valid_directory_drop(message):
    """Validate the small private event independently of the native host."""
    return (isinstance(message, dict) and set(message) == {"event", "path", "request_id"}
            and message.get("event") == "directory_dropped"
            and isinstance(message.get("request_id"), str)
            and re.fullmatch(r"[a-f0-9]{32}", message["request_id"]) is not None
            and isinstance(message.get("path"), str) and 1 <= len(message["path"]) <= 4096
            and "\0" not in message["path"])


def window_key(data):
    return "MediaSlimX.Window." + hashlib.sha256(str(Path(data).resolve()).casefold().encode()).hexdigest()


def host_directory(override=None):
    if override:
        return Path(override).resolve()
    resource = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    if getattr(sys, "frozen", False):
        return resource / "window-host"
    sdk = json.loads((resource / "scripts" / "window-host-sdk.json").read_text(encoding="utf-8-sig"))
    return resource / ".mediaslimx" / "window-host" / sdk["version"] / "bin"


def read_events(stream, events):
    """Only the child process pipe can submit these bounded control messages."""
    try:
        while True:
            line = stream.readline(65537)
            if not line:
                break
            if len(line) > 65536 or not line.endswith("\n"):
                raise ValueError("Invalid window protocol size")
            value = json.loads(line)
            if not isinstance(value, dict) or not isinstance(value.get("event"), str) or value["event"] not in EVENTS:
                raise ValueError("Invalid window protocol event")
            if value["event"] == "directory_dropped" and not valid_directory_drop(value):
                continue  # A rejected drop must not close a healthy window.
            events.put(value)
    except (OSError, ValueError):
        events.put({"event": "error", "message": "窗口通信异常 / Window communication failed"})
    finally:
        events.put({"event": "host_ended"})


def activate_existing(data, wait=8):
    """Verify the live service and native owner before focusing its window.

    A running browser instance is never adopted as this window's backend.
    The second launcher owns no server or native child and cannot stop either.
    """
    from ctypes import wintypes
    from .launch import _verify

    user = ctypes.WinDLL("user32", use_last_error=True)
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.GetWindowThreadProcessId.restype = wintypes.DWORD
    user.GetPropW.argtypes = [wintypes.HWND, wintypes.LPCWSTR]
    user.GetPropW.restype = wintypes.HANDLE
    user.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user.SetForegroundWindow.argtypes = [wintypes.HWND]
    until = time.monotonic() + wait
    while time.monotonic() < until:
        try:
            record = json.loads((data / "window.json").read_text(encoding="utf-8"))
            env = _verify(record["url"], data)
            if env["pid"] != record["owner_pid"]:
                raise ValueError("Different service owner")
            handle, process = record["hwnd"], wintypes.DWORD()
            if type(handle) is not int or type(record["host_pid"]) is not int:
                raise ValueError("Invalid native window record")
            user.GetWindowThreadProcessId(handle, ctypes.byref(process))
            if process.value != record["host_pid"] or not user.GetPropW(handle, window_key(data)):
                raise ValueError("Native window is no longer available")
            user.ShowWindow(handle, 9)  # SW_RESTORE
            user.SetForegroundWindow(handle)
            return True
        except (OSError, ValueError, KeyError, TypeError):
            time.sleep(.1)
    return False


def show_error(message):
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, str(message), "MediaSlim X", 0x10)
    else:
        raise RuntimeError(message)


def ask_launch_retry(message):
    """Fallback for failures before the native window can present its own UI."""
    if os.name != "nt":
        raise RuntimeError(message)
    # MB_RETRYCANCEL | MB_ICONERROR | MB_DEFBUTTON2: never retry on its own.
    return ctypes.windll.user32.MessageBoxW(None, str(message), "MediaSlim X", 0x115) == 4


def run_window(engine, app, port, host_dir, data):
    """Own the child host and server until every accepted mutation is drained."""
    import uvicorn
    from . import __version__
    from .server import LocalServer
    from .launch import _verify

    host_exe = Path(host_dir) / "MediaSlimX.Window.exe"
    if not host_exe.is_file():
        raise ValueError("缺少窗口组件，请完整解压程序，或运行 scripts/build-window-host.ps1。\n"
                         "Window component missing. Extract the entire bundle or build the window host.")
    config = uvicorn.Config(app, host="127.0.0.1", port=port, access_log=False,
                            log_config=None, timeout_graceful_shutdown=None)
    server = LocalServer(config, app.state.stop_native_picker)
    app.state.window_directory_drop = True
    events = queue.Queue()

    def serve():
        try:
            server.run()
        except BaseException:
            LOG.exception("Local window service failed")
        finally:
            events.put({"event": "server_ended"})

    thread = threading.Thread(target=serve, name="MediaSlimX-HTTP", daemon=False)
    host = None
    closing = False
    startup_failed = False
    shutdown_thread = None
    drained = threading.Event()
    drain_failed = threading.Event()
    token = app.state.token
    url = f"http://127.0.0.1:{port}/#token={token}"
    send_lock = threading.Lock()

    def send(op, **values):
        if host is None or host.poll() is not None:
            return
        try:
            with send_lock:
                host.stdin.write(json.dumps({"op": op, **values}, ensure_ascii=True) + "\n")
                host.stdin.flush()
        except (OSError, ValueError):
            pass  # A crashed host still follows the same Python drain path.

    def start_shutdown():
        nonlocal closing, shutdown_thread
        if drained.is_set() or (closing and not drain_failed.is_set()):
            return
        if shutdown_thread is not None:
            shutdown_thread.join()
        drain_failed.clear()
        if not closing:
            closing = True
            engine.begin_shutdown()
            app.state.stop_native_picker()
        send("closing")
        server.should_exit = True

        def drain():
            # No arbitrary timeout: HTTP includes synchronous restoration,
            # import cleanup and accepted uploads. These must finish safely.
            try:
                thread.join()
                if engine.wait_shutdown() is not True:
                    raise RuntimeError("Media shutdown did not confirm safe completion")
            except Exception:
                LOG.exception("Safe window shutdown could not drain")
                drain_failed.set()
                events.put({"event": "drain_failed"})
            else:
                # Set this only after HTTP and file work actually completed.
                # The finally path also checks it before closing any display.
                drained.set()
                events.put({"event": "drained"})

        shutdown_thread = threading.Thread(target=drain, name="MediaSlimX-safe-exit", daemon=False)
        try:
            shutdown_thread.start()
        except RuntimeError:
            # Under thread exhaustion, the owner can safely wait itself: the
            # UI is a separate process and remains able to show closing status.
            shutdown_thread = None
            drain()

    def report_drain_failure():
        send("error", message=("安全退出尚未完成，文件处理状态仍保留。请再次关闭窗口重试；"
                               "详细原因见 window.log。\n"
                               "Safe exit is incomplete; file work is still protected. "
                               "Close the window again to retry. See window.log."))

    thread.start()
    try:
        for _ in range(150):
            if not thread.is_alive():
                raise RuntimeError("本机服务启动失败，请检查端口或 window.log。 / Local service could not start.")
            try:
                _verify(url, data)
                break
            except (OSError, ValueError):
                time.sleep(.1)
        else:
            raise RuntimeError("本机服务未能就绪 / Local service readiness timed out")

        host = subprocess.Popen([str(host_exe)], cwd=str(host_dir), stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                                encoding="utf-8-sig", bufsize=1,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        threading.Thread(target=read_events, args=(host.stdout, events), daemon=True).start()
        send("start", url=url, profile=str(data / "webview"), window_key=window_key(data),
             parent_pid=os.getpid(), app_version=__version__)
        started = time.monotonic()
        ready = False
        while True:
            try:
                message = events.get(timeout=.2)
            except queue.Empty:
                if not ready and not closing and not startup_failed and time.monotonic() - started > 45:
                    raise RuntimeError("窗口未能就绪，请检查WebView2运行时。 / Window startup timed out.")
                if host.poll() is not None and not closing:
                    start_shutdown()
                elif host.poll() is not None and drain_failed.is_set():
                    # A crashed display cannot offer the retry control. Keep
                    # ownership and retry draining, never force media exit.
                    time.sleep(.2)
                    start_shutdown()
                continue
            event = message["event"]
            if event == "ready":
                if closing:
                    continue
                if type(message.get("hwnd")) is not int or message.get("pid") != host.pid:
                    raise ValueError("窗口身份校验失败 / Window identity mismatch")
                record = {"url": url, "owner_pid": os.getpid(), "host_pid": host.pid, "hwnd": message["hwnd"]}
                temporary = data / "window.json.tmp"
                temporary.write_text(json.dumps(record), encoding="utf-8")
                temporary.chmod(0o600)
                temporary.replace(data / "window.json")
                ready = True
                startup_failed = False
            elif event == "startup_failed":
                startup_failed = True
                LOG.warning("Window startup needs attention: %s; %s",
                            message.get("reason", "unknown"), str(message.get("diagnostic", ""))[:2048])
            elif event == "startup_retry":
                startup_failed = False
                started = time.monotonic()
            elif event == "close_requested":
                if closing:
                    if drain_failed.is_set():
                        start_shutdown()
                elif engine.worker_lock.locked():
                    send("confirm_close", busy=True)
                else:
                    start_shutdown()
            elif event == "directory_dropped":
                if not valid_directory_drop(message):
                    continue
                request_id = message["request_id"]
                if closing or not ready or engine.closing.is_set():
                    send("directory_result", request_id=request_id, error="正在安全退出，暂不接受拖入目录。")
                    continue
                try:
                    result = app.state.authorize_window_directory_drop(message["path"])
                    send("directory_result", request_id=request_id, path=result["path"])
                except ValueError as error:
                    send("directory_result", request_id=request_id, error=str(error)[:4096])
                except OSError:
                    send("directory_result", request_id=request_id,
                         error="无法接收拖入目录，请检查目录权限后使用选择目录。")
            elif event == "close_confirmed":
                start_shutdown()
            elif event == "close_cancelled":
                pass
            elif event == "error":
                LOG.error("Window host error: %s", message.get("message", "unknown"))
                # The host owns its actionable error dialog. Never open a
                # default browser as a silent fallback.
                start_shutdown()
            elif event in {"host_ended", "server_ended"}:
                if not closing:
                    start_shutdown()
            elif event == "drain_failed":
                if drain_failed.is_set():
                    report_drain_failure()
            elif event == "drained":
                send("close")
                if host.poll() is None:
                    try:
                        host.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        # All file work and requests are finished. Only this
                        # exact owned display process may now be terminated.
                        host.kill()
                        host.wait()
                break
    finally:
        start_shutdown()
        while not drained.is_set():
            if shutdown_thread is not None:
                shutdown_thread.join()
            if drained.is_set():
                break
            report_drain_failure()
            # An unrelated coordinator exception must not bypass file safety.
            # Retry while retaining the instance lock and Windows Job owner.
            time.sleep(.5)
            start_shutdown()
        send("close")
        if host is not None:
            if host.poll() is None:
                try:
                    host.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    host.kill()
                    host.wait()
            host.stdin.close()
            host.stdout.close()
        (data / "window.json").unlink(missing_ok=True)


def default_media_root(source_root):
    pictures = Path.home() / "Pictures"
    if pictures.is_dir():
        return pictures
    # Frozen __file__ lives inside _internal, not beside the user-facing EXE.
    return Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(source_root)


def main(portable=False):
    if os.name != "nt":
        raise SystemExit("独立窗口仅支持Windows；服务器/WSL请继续 python -m mediaslimx。")
    parser = argparse.ArgumentParser(description="MediaSlim X Windows 独立窗口")
    parser.add_argument("--data-dir")
    parser.add_argument("--allow-root", action="append")
    parser.add_argument("--port", type=int)
    parser.add_argument("--host-dir")
    args = parser.parse_args()
    if args.port is not None and not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")
    root = Path(__file__).resolve().parent.parent
    default_data = (Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "MediaSlimX" / "portable"
                    if portable else root / ".mediaslimx" / "windows-window")
    data = ensure_dir(args.data_dir or default_data)
    lock = open(data / "instance.lock", "a+b")
    try:
        import msvcrt
        lock.seek(0)
        lock.write(b"0")
        lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            if not activate_existing(data):
                show_error("此数据目录已有实例运行或正在启动。不会接管或关闭其他实例。\n"
                           "This data directory is already in use. Try again later or close that instance yourself.")
            return
        from .portable import _free_port, _own_process_tree
        _own_process_tree(allow_breakaway=False)
        logging.basicConfig(filename=str(data / "window.log"), encoding="utf-8", level=logging.INFO,
                            format="%(asctime)s %(levelname)s %(name)s %(message)s")
        from .app import create_app
        from .engine import Engine
        resources = Path(getattr(sys, "_MEIPASS", root))
        if (resources / "bin").is_dir():
            os.environ["PATH"] = str(resources / "bin") + os.pathsep + os.environ.get("PATH", "")
        roots = args.allow_root or [str(default_media_root(root))]
        while True:
            try:
                engine = Engine(data, roots)
                port = args.port or _free_port()
                app = create_app(engine, secrets.token_urlsafe(32), port, desktop=True)
                run_window(engine, app, port, host_directory(args.host_dir), data)
                break
            except Exception as error:
                LOG.exception("Window launch failed")
                if not ask_launch_retry(str(error) + "\n\n日志 / Log: " + str(data / "window.log")
                                        + "\n\n重试启动？ / Retry startup?"):
                    break
    finally:
        lock.close()


if __name__ == "__main__":
    main()
