"""Exercise the real WinForms/WebView2 startup cover with a private fake page.

Windows-only manual acceptance driver. It never opens the user's task store or
media roots. Run against a separately compiled host and keep its report local.
"""
import argparse
import ctypes
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import secrets
import subprocess
import tempfile
import threading
import time

from PIL import Image


user32 = ctypes.WinDLL("user32", use_last_error=True)
user32.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM), wintypes.LPARAM]
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowThreadProcessId.restype = wintypes.DWORD
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.EnumChildWindows.argtypes = [wintypes.HWND, ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM), wintypes.LPARAM]
user32.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int,
                               ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
user32.SetWindowPos.restype = wintypes.BOOL
user32.PrintWindow.argtypes = [wintypes.HWND, wintypes.HDC, wintypes.UINT]
user32.PrintWindow.restype = wintypes.BOOL
user32.GetWindowDC.argtypes = [wintypes.HWND]
user32.GetWindowDC.restype = wintypes.HDC
user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
gdi32.CreateCompatibleDC.argtypes = [wintypes.HDC]
gdi32.CreateCompatibleDC.restype = wintypes.HDC
gdi32.CreateCompatibleBitmap.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int]
gdi32.CreateCompatibleBitmap.restype = wintypes.HBITMAP
gdi32.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
gdi32.SelectObject.restype = wintypes.HGDIOBJ
gdi32.GetDIBits.argtypes = [wintypes.HDC, wintypes.HBITMAP, wintypes.UINT,
                           wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT]
gdi32.GetDIBits.restype = ctypes.c_int
gdi32.DeleteObject.argtypes = [wintypes.HGDIOBJ]
gdi32.DeleteDC.argtypes = [wintypes.HDC]
def window_text(hwnd):
    buffer = ctypes.create_unicode_buffer(256)
    user32.GetWindowTextW(hwnd, buffer, len(buffer))
    return buffer.value


def owned_window(pid):
    found = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    @callback_type
    def callback(hwnd, _):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value == pid and window_text(hwnd) == "MediaSlim X":
            found.append(hwnd)
        return True

    user32.EnumWindows(callback, 0)
    return found[0] if found else None


def child_button(hwnd, title):
    found = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    @callback_type
    def callback(child, _):
        if window_text(child) == title:
            found.append(child)
        return True

    user32.EnumChildWindows(hwnd, callback, 0)
    return found[0] if found else None


class DemoServer(ThreadingHTTPServer):
    daemon_threads = True
    mode = "wait"
    language = "zh-CN"
    theme = "dark"
    requests = None


class DemoPage(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.requests.append([self.path, self.server.mode])
        if self.path == "/":
            body = b'<!doctype html><html><head><meta charset="utf-8"><title>Startup acceptance</title></head><body><main>Isolated startup acceptance page</main><script src="/test.js"></script></body></html>'
            content_type = "text/html; charset=utf-8"
        elif self.path == "/test.js":
            language = self.server.language
            mode = self.server.mode
            operation = "workspace_failed" if mode == "fail" else "workspace_ready"
            delay = 350 if mode == "fail" else 4000 if mode == "wait" else 0
            payload = {"op": operation}
            if mode == "fail":
                payload.update(language=language, theme=self.server.theme)
            script = (
                "chrome.webview.postMessage({op:'window_ui_ready',language:"
                + json.dumps(language) + ",theme:" + json.dumps(self.server.theme) + "});"
            )
            if mode != "hang":
                script += "setTimeout(()=>chrome.webview.postMessage(" + json.dumps(payload) + ")," + str(delay) + ");"
            body = script.encode("utf-8")
            content_type = "text/javascript; charset=utf-8"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class BitmapInfoHeader(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("width", wintypes.LONG),
                ("height", wintypes.LONG), ("planes", wintypes.WORD),
                ("bit_count", wintypes.WORD), ("compression", wintypes.DWORD),
                ("image_size", wintypes.DWORD), ("x_pixels", wintypes.LONG),
                ("y_pixels", wintypes.LONG), ("colors_used", wintypes.DWORD),
                ("colors_important", wintypes.DWORD)]


def print_window(hwnd, width, height):
    source_dc = user32.GetWindowDC(hwnd)
    if not source_dc:
        raise RuntimeError("Could not read the test window device context")
    memory_dc = gdi32.CreateCompatibleDC(source_dc)
    bitmap = gdi32.CreateCompatibleBitmap(source_dc, width, height)
    previous = gdi32.SelectObject(memory_dc, bitmap)
    try:
        if not user32.PrintWindow(hwnd, memory_dc, 2):  # PW_RENDERFULLCONTENT
            raise RuntimeError("Windows could not render the isolated test window")
        info = BitmapInfoHeader(ctypes.sizeof(BitmapInfoHeader), width, -height,
                                1, 32, 0, 0, 0, 0, 0, 0)
        pixels = ctypes.create_string_buffer(width * height * 4)
        if gdi32.GetDIBits(memory_dc, bitmap, 0, height, pixels, ctypes.byref(info), 0) != height:
            raise RuntimeError("Windows could not copy the test window pixels")
        return Image.frombytes("RGB", (width, height), pixels.raw, "raw", "BGRX")
    finally:
        gdi32.SelectObject(memory_dc, previous)
        gdi32.DeleteObject(bitmap)
        gdi32.DeleteDC(memory_dc)
        user32.ReleaseDC(hwnd, source_dc)


def capture(hwnd, path):
    if not hwnd:
        raise RuntimeError("Test window disappeared before capture")
    user32.ShowWindow(hwnd, 9)
    # PrintWindow targets this exact owned HWND, even when another application
    # has focus. A light-title-bar pixel is no longer a valid identity check:
    # the product now intentionally uses a dark system title bar in dark mode.
    window_rect = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(window_rect)):
        raise RuntimeError("Could not locate test window bounds")
    width = window_rect.right - window_rect.left
    height = window_rect.bottom - window_rect.top
    image = print_window(hwnd, width, height)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)
    return [image.width, image.height]


def one_case(host_exe, output, mode, language, suffix, do_retry=False, do_exit=False,
             small_window=False, theme="dark"):
    server = DemoServer(("127.0.0.1", 0), DemoPage)
    server.mode = mode
    server.language = language
    server.theme = theme
    server.requests = []
    threading.Thread(target=server.serve_forever, daemon=True).start()
    events = queue.Queue()
    token = secrets.token_urlsafe(32)
    start = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="mediaslimx-startup-", ignore_cleanup_errors=True) as private:
        process = subprocess.Popen([str(host_exe)], cwd=str(host_exe.parent),
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, text=True, encoding="utf-8-sig",
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        seen_events = []

        def reader():
            for line in process.stdout:
                try:
                    events.put(json.loads(line))
                except ValueError:
                    events.put({"event": "invalid", "line": line[:100]})

        threading.Thread(target=reader, daemon=True).start()

        def send(op, **data):
            process.stdin.write(json.dumps({"op": op, **data}) + "\n")
            process.stdin.flush()

        def wait_event(name, timeout=15):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                try:
                    event = events.get(timeout=min(.2, max(.01, deadline-time.monotonic())))
                except queue.Empty:
                    if process.poll() is not None:
                        raise RuntimeError("Host exited before " + name)
                    continue
                if event.get("event") == name:
                    return event
                seen_events.append(event)
                if event.get("event") in ("error", "invalid"):
                    raise RuntimeError(str(event))
            raise TimeoutError("Timed out waiting for " + name + "; received " + repr(seen_events) + "; requests " + repr(server.requests))

        try:
            send("start", url=f"http://127.0.0.1:{server.server_port}/#token={token}",
                 profile=str(Path(private) / "webview"),
                 window_key="MediaSlimX.Window." + secrets.token_hex(16),
                 parent_pid=os.getpid(), app_version="0.2.0")
            deadline = time.monotonic() + 12
            hwnd = None
            while time.monotonic() < deadline:
                hwnd = owned_window(process.pid)
                if hwnd:
                    break
                time.sleep(.05)
            if not hwnd:
                raise RuntimeError("Native test window was not created")
            if small_window:
                if not user32.SetWindowPos(hwnd, None, 0, 0, 900, 600, 0x0002 | 0x0004):
                    raise RuntimeError("Could not resize the isolated test window")
                time.sleep(.1)
            report = {"mode": mode, "language": language, "host_pid": process.pid}
            if theme != "dark":
                report["theme"] = theme
            if small_window:
                report["small_window"] = True
            if mode == "wait":
                time.sleep(.75)
                if language == "en":
                    deadline = time.monotonic() + 2
                    while time.monotonic() < deadline and not child_button(owned_window(process.pid), "中文"):
                        time.sleep(.05)
                    if not child_button(owned_window(process.pid), "中文"):
                        raise RuntimeError("English handshake did not reach the native cover")
                report["loading_screenshot"] = str(output / f"startup-{suffix}.png")
                report["loading_size"] = capture(owned_window(process.pid), Path(report["loading_screenshot"]))
                report["loading_visible_at_seconds"] = round(time.monotonic() - start, 3)
            if mode in ("fail", "hang"):
                report["failure"] = wait_event("startup_failed", timeout=36 if mode == "hang" else 15)
                if mode == "hang" and report["failure"].get("reason") != "timeout":
                    raise RuntimeError("Hanging page did not produce the timeout reason")
                report["failure_screenshot"] = str(output / f"startup-error-{suffix}.png")
                hwnd = owned_window(process.pid)
                report["failure_size"] = capture(hwnd, Path(report["failure_screenshot"]))
                if do_retry:
                    server.mode = "quick"
                    button = child_button(hwnd, "Retry" if language == "en" else "重试")
                    if not button:
                        raise RuntimeError("Retry button was not visible")
                    user32.SendMessageW(button, 0xF5, 0, 0)  # BM_CLICK
                    report["retry"] = wait_event("startup_retry")
                    report["ready_after_retry"] = wait_event("ready")
                elif do_exit:
                    button = child_button(hwnd, "Exit" if language == "en" else "退出")
                    if not button:
                        raise RuntimeError("Exit button was not visible")
                    user32.SendMessageW(button, 0xF5, 0, 0)
                    report["exit_request"] = wait_event("close_requested")
            else:
                report["ready"] = wait_event("ready")
                report["ready_seconds"] = round(time.monotonic() - start, 3)
                if mode == "quick":
                    report["ready_screenshot"] = str(output / "startup-fast-ready.png")
                    capture(owned_window(process.pid), Path(report["ready_screenshot"]))
            send("close")  # This isolated host has no media backend to drain.
            process.wait(timeout=10)
            time.sleep(.8)  # WebView2 releases its profile lock just after the host exits.
            return report
        except Exception:
            hwnd = owned_window(process.pid)
            if hwnd:
                capture(hwnd, output / "startup-test-failure.png")
            raise
        finally:
            if process.poll() is None:
                try:
                    send("close")
                    process.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    process.kill()
                    process.wait()
            process.stdin.close()
            process.stdout.close()
            server.shutdown()
            server.server_close()


def product_case(python_exe, project, host_exe, output):
    """Verify the real Python service, page and host reach ready together."""
    with tempfile.TemporaryDirectory(prefix="mediaslimx-product-startup-", ignore_cleanup_errors=True) as private:
        root = Path(private)
        data = root / "data"
        media = root / "synthetic-media"
        media.mkdir()
        command = [str(python_exe), "-B", "-m", "mediaslimx.window",
                   "--data-dir", str(data), "--allow-root", str(media),
                   "--host-dir", str(host_exe.parent)]
        process = subprocess.Popen(command, cwd=str(project), stdin=subprocess.DEVNULL,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            start = time.monotonic()
            record_path = data / "window.json"
            deadline = start + 45
            while time.monotonic() < deadline and not record_path.exists():
                if process.poll() is not None:
                    raise RuntimeError("Real product owner exited before workspace readiness")
                time.sleep(.1)
            if not record_path.exists():
                raise TimeoutError("Real product workspace did not become ready")
            record = json.loads(record_path.read_text(encoding="utf-8"))
            hwnd = owned_window(record["host_pid"])
            if not hwnd or record["hwnd"] != hwnd:
                raise RuntimeError("Ready record did not match the owned native window")
            screenshot = output / "startup-product-ready.png"
            capture(hwnd, screenshot)
            user32.PostMessageW(hwnd, 0x10, 0, 0)  # WM_CLOSE; normal owner drain.
            process.wait(timeout=25)
            if record_path.exists():
                raise RuntimeError("Window owner did not remove its ready record")
            return {"mode": "real_product", "ready_seconds": round(time.monotonic()-start, 3),
                    "owner_exit_code": process.returncode, "ready_screenshot": str(screenshot),
                    "private_media_count": len(list(media.iterdir()))}
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            time.sleep(.8)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host-exe", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--product-python", type=Path)
    parser.add_argument("--project", type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    cases = [
        one_case(args.host_exe, output, "quick", "zh-CN", "fast"),
        one_case(args.host_exe, output, "wait", "zh-CN", "zh-CN"),
        one_case(args.host_exe, output, "wait", "en", "en"),
        one_case(args.host_exe, output, "wait", "en", "small-en", small_window=True),
        one_case(args.host_exe, output, "wait", "zh-CN", "light-zh-CN", theme="light"),
        one_case(args.host_exe, output, "fail", "zh-CN", "zh-CN", do_retry=True),
        one_case(args.host_exe, output, "fail", "en", "en", do_exit=True),
        one_case(args.host_exe, output, "fail", "zh-CN", "light-zh-CN", theme="light"),
        one_case(args.host_exe, output, "fail", "en", "light-en", theme="light"),
        one_case(args.host_exe, output, "fail", "zh-CN", "small-fail-zh-CN",
                 small_window=True),
        one_case(args.host_exe, output, "fail", "en", "small-fail-en", do_exit=True,
                 small_window=True),
        one_case(args.host_exe, output, "hang", "en", "timeout-en", do_exit=True),
    ]
    if args.product_python and args.project:
        cases.append(product_case(args.product_python, args.project, args.host_exe, output))
    (output / "startup-smoke-report.json").write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(cases, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
