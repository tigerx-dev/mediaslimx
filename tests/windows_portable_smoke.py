"""Exercise an extracted Windows EXE with no Python/FFmpeg entries on PATH.

Creates only private synthetic fixtures, never the user's source instance/data.
The runner may use Python to generate fixtures; the product EXE must not use it.
"""
from concurrent.futures import ThreadPoolExecutor
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import signal
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def direct_children(parent_pid, executable_name):
    class ProcessEntry(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("usage", wintypes.DWORD), ("pid", wintypes.DWORD),
                    ("heap", ctypes.c_size_t), ("module", wintypes.DWORD), ("threads", wintypes.DWORD),
                    ("parent", wintypes.DWORD), ("priority", wintypes.LONG), ("flags", wintypes.DWORD),
                    ("name", wintypes.WCHAR * 260)]
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
    kernel.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    snapshot = kernel.CreateToolhelp32Snapshot(2, 0)
    if snapshot == ctypes.c_void_p(-1).value:
        raise OSError("Process snapshot failed")
    found = []
    try:
        item = ProcessEntry()
        item.size = ctypes.sizeof(item)
        more = kernel.Process32FirstW(snapshot, ctypes.byref(item))
        while more:
            if item.parent == parent_pid and item.name.casefold() == executable_name.casefold():
                found.append(item.pid)
            more = kernel.Process32NextW(snapshot, ctypes.byref(item))
    finally:
        kernel.CloseHandle(snapshot)
    return found


def process_handle(pid):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    result = kernel.OpenProcess(0x1000, False, pid)
    if not result:
        raise OSError("Cannot inspect our fixture process")
    return result


def alive(handle):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    value = wintypes.DWORD()
    return bool(kernel.GetExitCodeProcess(handle, ctypes.byref(value))) and value.value == 259


def close_handle(handle):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle(handle)


def picker_windows(executable):
    user = ctypes.WinDLL("user32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user.IsWindowVisible.argtypes = [wintypes.HWND]
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    found = []

    @callback_type
    def visit(hwnd, _):
        if not user.IsWindowVisible(hwnd):
            return True
        title = ctypes.create_unicode_buffer(512)
        user.GetWindowTextW(hwnd, title, len(title))
        if title.value != "MediaSlim X — 选择文件夹":
            return True
        pid = wintypes.DWORD()
        user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        handle = kernel.OpenProcess(0x1000, False, pid.value)
        if handle:
            try:
                name = ctypes.create_unicode_buffer(32768)
                length = wintypes.DWORD(len(name))
                if kernel.QueryFullProcessImageNameW(handle, 0, name, ctypes.byref(length)) and Path(name.value) == executable:
                    found.append(pid.value)
            finally:
                kernel.CloseHandle(handle)
        return True

    user.EnumWindows(visit, 0)
    return found


def main():
    if os.name != "nt":
        raise SystemExit("Run using Windows Python.")
    from PIL import Image
    import pikepdf

    project = Path(__file__).resolve().parent.parent
    base = project / ".mediaslimx" / "packaging"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, default=base / "MediaSlimX-windows-x64-local-prototype.zip")
    parser.add_argument("--fixture-ffmpeg", type=Path,
                        help="Host-only full FFmpeg for synthetic testsrc fixtures; never used by the product.")
    args = parser.parse_args()
    package = args.package.resolve(strict=True)
    fixture_binary = args.fixture_ffmpeg or shutil.which("ffmpeg")
    if not fixture_binary:
        parser.error("Supply --fixture-ffmpeg for host-only synthetic fixtures; the runtime engine need not include lavfi.")
    fixture_binary = Path(fixture_binary).resolve(strict=True)
    run = base / ("验证 space " + uuid.uuid4().hex)
    run.mkdir()
    with zipfile.ZipFile(package) as archive:
        archive.extractall(run)
    executable = run / "MediaSlimX" / "MediaSlimX.exe"
    media = run / "媒体 source"
    media.mkdir()
    Image.effect_noise((480, 320), 70).convert("RGB").save(media / "picture.jpg", quality=100)
    image = Image.new("RGBA", (90, 60), (10, 200, 130, 190))
    image.save(media / "picture.png")
    image.convert("RGB").save(media / "picture.webp", quality=100)
    document = pikepdf.Pdf.new()
    page = document.add_blank_page(page_size=(500, 700))
    page.Contents = document.make_stream(b"q 0.2 0.5 0.8 rg 20 20 300 500 re f Q\n" * 1200)
    document.save(media / "document.pdf", compress_streams=False)
    document.close()
    subprocess.run([str(fixture_binary), "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24", "-t", "1", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", str(media / "video.mp4")], check=True, capture_output=True)
    original_hashes = {p.name: sha(p) for p in media.iterdir()}
    env = os.environ.copy()
    env["PATH"] = str(Path(env.get("SystemRoot", r"C:\Windows")) / "System32")
    env["LOCALAPPDATA"] = str(run / "WindowsLocalAppData")
    # Browser launching itself is exercised safely through an explicit Windows
    # controller recording the URL locally, without exposing its capability.
    browser_log = run / "browser-open.txt"
    browser_script = run / "browser.ps1"
    browser_stop = run / "browser-stop.txt"
    browser_pids = run / "browser-pids.txt"
    browser_script.write_text(
        'param([string]$Url)\n'
        '[System.IO.File]::WriteAllText($env:MEDIASLIMX_TEST_BROWSER_LOG, $Url)\n'
        '[System.IO.File]::AppendAllText($env:MEDIASLIMX_TEST_BROWSER_PIDS, [string]$PID + "`n")\n'
        '$deadline=[DateTime]::UtcNow.AddSeconds(120)\n'
        'while (-not [System.IO.File]::Exists($env:MEDIASLIMX_TEST_BROWSER_STOP) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }\n',
        encoding="ascii")
    env["MEDIASLIMX_TEST_BROWSER_STOP"] = str(browser_stop)
    env["MEDIASLIMX_TEST_BROWSER_PIDS"] = str(browser_pids)
    env["MEDIASLIMX_TEST_BROWSER_LOG"] = str(browser_log)
    powershell = Path(env.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    env["BROWSER"] = '"' + str(powershell) + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + str(browser_script) + '" %s &'
    command = [str(executable), "--allow-root", str(media)]
    data = Path(env["LOCALAPPDATA"]) / "MediaSlimX" / "portable"
    log = (run / "service.log").open("wb")
    process = subprocess.Popen(command, cwd=env.get("SystemRoot", r"C:\Windows"), env=env,
                               stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    report = {"checks": [], "success": False, "evidence": str(run), "manualFolderSelection": False,
              "cleanWindowsVM": False, "package_sha256": sha(package),
              "fixtureGenerator": "host-only encoder; product PATH excludes it",
              "browserController": "recording controller, no real default-browser UI assertion"}
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    watched_handles = []
    try:
        record = data / "server.json"
        for _ in range(300):
            if record.exists():
                break
            if process.poll() is not None:
                raise AssertionError("Portable EXE exited before readiness; see private service.log")
            time.sleep(.1)
        else:
            raise TimeoutError("Portable readiness timed out")
        url = json.loads(record.read_text(encoding="utf-8"))["url"]
        parsed = urllib.parse.urlsplit(url)
        token = urllib.parse.parse_qs(parsed.fragment)["token"][0]
        origin = f"http://127.0.0.1:{parsed.port}"

        def request(path, body=None):
            headers = {"X-MediaSlimX-Token": token}
            if body is not None:
                headers.update({"Content-Type": "application/json", "Origin": origin})
            req = urllib.request.Request(origin + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
            with opener.open(req, timeout=90) as response:
                data = response.read()
                return json.loads(data) if response.headers.get_content_type() == "application/json" else data

        environment = request("/api/environment")
        assert Path(environment["data_dir"]) == data
        assert environment["runtime"] == "Windows 本地"
        assert environment["pdf"] and environment["ffmpeg"] and environment["ffprobe"] and environment["native_picker"]
        assert environment["pid"] == process.pid
        assert parsed.port != 8766
        for name in ("index.html", "app.js", "style.css", "storage.js", "i18n-catalog.js", "icons.svg", "favicon.svg", "brand/favicon.svg", "brand/mark.svg"):
            endpoint = "/" if name == "index.html" else "/static/" + name
            assert hashlib.sha256(request(endpoint)).hexdigest() == sha(project / "mediaslimx" / "static" / name)
        try:
            request("/static/brand/private.svg")
            raise AssertionError("Unknown nested static resource was accessible")
        except urllib.error.HTTPError as error:
            assert error.code == 404
        report["checks"].append("Extracted EXE starts from unrelated CWD with no Python/FFmpeg on PATH; own LocalAppData, loopback and current static assets")
        for _ in range(30):
            if browser_log.exists():
                break
            time.sleep(.1)
        assert browser_log.exists(), "Automatic browser opening was not dispatched"
        assert url in browser_log.read_text(encoding="utf-8", errors="replace")
        report["checks"].append("Automatic authenticated browser-open dispatch recorded locally without printing token")
        second = subprocess.run(command, cwd=env.get("SystemRoot", r"C:\Windows"), env=env, capture_output=True, timeout=30)
        assert second.returncode == 0
        assert request("/api/environment")["pid"] == process.pid
        report["checks"].append("Second EXE launch reuses the running authenticated instance")
        scan = request("/api/scans", {"path": str(media)})
        assert len(scan["entries"]) == 5
        assert all(e["status"] == "ready" for e in scan["entries"]), [(e["relative"], e["status"], e["reason"]) for e in scan["entries"]]
        task_id = request("/api/tasks", {"scan_id": scan["id"], "selected": [e["id"] for e in scan["entries"]], "preset": "balanced", "mode": "export", "output": str(run / "output")})["id"]
        for _ in range(600):
            task = request("/api/tasks/" + task_id)
            if task["status"] not in {"running", "queued"}:
                break
            time.sleep(.1)
        assert all(e["status"] in {"success", "no_gain"} for e in task["entries"]), [(e["relative"], e["status"], e["reason"]) for e in task["entries"]]
        assert all(sha(media / name) == value for name, value in original_hashes.items())
        assert all(Path(e["destination"]).is_file() for e in task["entries"])
        csv = request("/api/tasks/" + task_id + "/report.csv")
        assert b"picture.jpg" in csv and b"document.pdf" in csv
        jpeg = next(e for e in task["entries"] if e["relative"] == "picture.jpg")
        assert request(f"/api/tasks/{task_id}/preview/{jpeg['id']}/result")
        report["checks"].append("Real JPG/PNG/WebP/MP4/PDF scan/export, PDF frozen worker, image preview, CSV and unchanged originals")
        assert request("/api/imports/storage") is not None
        report["checks"].append("Import storage API is included in the frozen build")
        batch = request("/api/imports", {"files": [{"name": "dropped.jpg", "size": (media / "picture.jpg").stat().st_size}]})
        upload = urllib.request.Request(origin + f"/api/imports/{batch['id']}/files/{batch['files'][0]['id']}",
                                        data=(media / "picture.jpg").read_bytes(), method="PUT",
                                        headers={"X-MediaSlimX-Token": token, "Content-Type": "application/octet-stream", "Origin": origin})
        with opener.open(upload, timeout=30) as response:
            assert response.status == 200
        imported = request(f"/api/imports/{batch['id']}/scan", {})
        imported_task_id = request("/api/tasks", {"scan_id": imported["id"], "selected": [imported["entries"][0]["id"]], "preset": "balanced", "mode": "export", "output": str(run / "import-output")})["id"]
        for _ in range(300):
            imported_task = request("/api/tasks/" + imported_task_id)
            if imported_task["status"] != "running":
                break
            time.sleep(.1)
        assert imported_task["entries"][0]["status"] in {"success", "no_gain", "duplicate"}
        exported = Path(imported_task["entries"][0]["destination"])
        exported_hash = sha(exported)
        used_bytes = request("/api/imports/storage")["usage_bytes"]
        preview = request(f"/api/imports/{batch['id']}/release-preview")
        assert preview["sample_files"] == ["dropped.jpg"]
        assert next(b for b in request("/api/imports/storage")["batches"] if b["id"] == batch["id"])["sample_files"] == ["dropped.jpg"]
        released = request(f"/api/imports/{batch['id']}/release", {"confirm": True, "record_version": preview["record_version"]})
        assert released["released"] is True
        assert request("/api/imports/storage")["usage_bytes"] < used_bytes
        assert sha(exported) == exported_hash and sha(media / "picture.jpg") == original_hashes["picture.jpg"]
        assert request("/api/tasks/" + imported_task_id)["import_copies_released"] is True
        assert request(f"/api/tasks/{imported_task_id}/preview/{imported_task['entries'][0]['id']}/result")
        assert request(f"/api/tasks/{imported_task_id}/report.csv")
        report["checks"].append("Frozen HTTP file import -> actual export -> version-confirmed original-copy release; disk use drops and exported result/report stay accessible")
        with ThreadPoolExecutor(max_workers=1) as executor:
            picker_id = uuid.uuid4().hex
            pending = executor.submit(request, "/api/directories/native", {"purpose": "media", "request_id": picker_id})
            try:
                for _ in range(150):
                    if picker_windows(executable):
                        break
                    if pending.done():
                        raise AssertionError("Frozen native picker exited before its real window opened")
                    time.sleep(.1)
                else:
                    raise AssertionError("Frozen native picker window was not visible")
            finally:
                request("/api/directories/native/cancel", {"request_id": picker_id})
            assert pending.result(timeout=10)["path"] is None
        report["checks"].append("Frozen Tcl/Tk native folder window is real, cancel works and helper exits; no human folder click claimed")
        # A real long-lived browser controller must survive service shutdown,
        # while a real in-flight FFmpeg and a native picker helper must not.
        for _ in range(100):
            pids = browser_pids.read_text().splitlines() if browser_pids.exists() else []
            if len(pids) >= 2:
                break
            time.sleep(.1)
        assert len(pids) >= 2
        browser_handles = [process_handle(int(pid)) for pid in pids]
        watched_handles.extend(browser_handles)
        assert all(alive(handle) for handle in browser_handles)
        long_video = media / "interrupt.mp4"
        subprocess.run([str(fixture_binary), "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30",
                        "-t", "15", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-pix_fmt", "yuv420p", str(long_video)],
                       check=True, capture_output=True, timeout=60)
        interrupted_scan = request("/api/scans", {"path": str(media)})
        entry = next(e for e in interrupted_scan["entries"] if e["relative"] == "interrupt.mp4")
        assert entry["status"] == "ready"
        with ThreadPoolExecutor(max_workers=1) as executor:
            picker_id = uuid.uuid4().hex
            pending = executor.submit(request, "/api/directories/native", {"purpose": "media", "request_id": picker_id})
            for _ in range(150):
                picker_pids = picker_windows(executable)
                if picker_pids:
                    break
                time.sleep(.1)
            assert picker_pids
            helper_handle = process_handle(picker_pids[0])
            watched_handles.append(helper_handle)
            request("/api/tasks", {"scan_id": interrupted_scan["id"], "selected": [entry["id"]], "preset": "balanced", "mode": "export", "output": str(run / "interrupt-output")})
            for _ in range(300):
                ffmpeg_pids = direct_children(process.pid, "ffmpeg.exe")
                if ffmpeg_pids:
                    break
                time.sleep(.01)
            assert ffmpeg_pids, "Did not observe the actual processing FFmpeg child"
            media_handle = process_handle(ffmpeg_pids[0])
            watched_handles.append(media_handle)
            assert alive(media_handle) and alive(helper_handle)
            process.send_signal(signal.CTRL_BREAK_EVENT)
            process.wait(timeout=15)
            for _ in range(100):
                if not alive(media_handle) and not alive(helper_handle):
                    break
                time.sleep(.1)
            assert not alive(media_handle) and not alive(helper_handle)
            assert all(alive(handle) for handle in browser_handles), "Service exit killed a browser controller"
            try:
                pending.result(timeout=10)
            except (OSError, urllib.error.URLError):
                pass  # The service intentionally closed before returning the dialog request.
        report["checks"].append("Console exit stops its real in-flight FFmpeg and picker helper; both long-lived browser controllers survive")
        report["success"] = True
        (run / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        # Preserve partial evidence on failure; completed checks are not a pass
        # for the whole package. Never include the private service URL/token.
        (run / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        browser_stop.touch()
        for handle in watched_handles:
            close_handle(handle)
        if process.poll() is None:
            subprocess.run(["taskkill.exe", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
            process.wait(timeout=10)
        log.close()


if __name__ == "__main__":
    main()
