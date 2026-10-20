"""Isolated acceptance fixtures and launcher for the actual portable window.

Runs only on native Windows. All media and records live under a fresh ignored
window-tests directory. Never opens the default portable data directory.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import shutil
import subprocess
import time
import uuid


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unrelated_baseline():
    """Read connection/process metadata only, never other task databases."""
    import ctypes
    from ctypes import wintypes
    result = {}
    for port in (8765, 8766):
        with socket.socket() as sock:
            result[str(port)] = sock.connect_ex(("127.0.0.1", port)) == 0
    record = Path(os.environ["LOCALAPPDATA"]) / "MediaSlimX" / "portable" / "window.json"
    if record.is_file():
        metadata = json.loads(record.read_text(encoding="utf-8"))
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        for key in ("owner_pid", "host_pid"):
            pid = metadata[key]
            handle = kernel.OpenProcess(0x00100000, False, pid)
            try:
                alive = kernel.WaitForSingleObject(handle, 0) == 258 if handle else None
            finally:
                if handle:
                    kernel.CloseHandle(handle)
            result["user_" + key] = pid
            result["user_" + key + "_was_alive"] = alive
    return result


def prepare(executable, fixture_video, closing_video, label="window"):
    from PIL import Image, ImageDraw
    import pikepdf

    project = Path(__file__).resolve().parents[1]
    root = project / ".mediaslimx" / "window-tests" / (label + " 中文 space " + uuid.uuid4().hex)
    media, large = root / "media", root / "large-directory"
    media.mkdir(parents=True)
    large.mkdir()
    image = Image.new("RGB", (800, 600), (50, 90, 120))
    draw = ImageDraw.Draw(image)
    for n in range(80):
        draw.rectangle((n * 9, n * 6, n * 9 + 65, n * 6 + 45), fill=(n * 3 % 256, n * 5 % 256, n * 7 % 256))
    image.save(media / "picture.jpg", quality=100)
    image.save(media / "picture.png", compress_level=0)
    image.save(media / "picture.webp", quality=100)
    tiny = Image.new("RGB", (48, 32), (100, 180, 140))
    for n in range(201):
        folder = large / ("nested" if n % 2 else "gallery")
        folder.mkdir(exist_ok=True)
        tiny.save(folder / (str(n).zfill(3) + ".jpg"), quality=100)
    for name in (".hidden", "node_modules", "mediaslimx-export", "mediaslimx-backup"):
        folder = large / name
        folder.mkdir()
        tiny.save(folder / "skip.jpg")
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(600, 800))
    page.Contents = pdf.make_stream(b"q 0.2 0.5 0.8 rg 20 20 300 500 re f Q\n" * 1000)
    pdf.save(media / "document.pdf", compress_streams=False)
    pdf.close()
    # The distribution's minimal engine intentionally omits fixture-generation
    # filters/lavfi. Supply generated test videos; never use personal media.
    shutil.copyfile(fixture_video, media / "video.mp4")
    # Long enough to observe an owned active encode before display-failure exit.
    closing = root / "closing-media"
    closing.mkdir()
    shutil.copyfile(closing_video, closing / "closing-video.mp4")
    ungranted = root / "ungranted-folder"
    ungranted.mkdir()
    tiny.save(ungranted / "new-scope.jpg", quality=100)
    originals = {str(p.relative_to(root)): digest(p) for p in list(media.glob("*")) + list(large.rglob("*.jpg")) + list(closing.glob("*")) + list(ungranted.glob("*"))}
    state = {"root": str(root), "data": str(root / "data"), "media": str(media), "large_directory": str(large), "closing_media": str(closing), "ungranted_directory": str(ungranted), "exports": str(root / "exports"), "executable": str(executable), "debug_port": free_port(), "port": free_port(), "fixture_files": [str(p) for p in media.glob("*")], "original_hashes": originals}
    (root / "downloads").mkdir()
    state_path = root / "acceptance-state.json"
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return state_path


def start(state_path):
    state = json.loads(state_path.read_text(encoding="utf-8"))
    root = Path(state["root"])
    if Path(state["data"]) != root / "data" or root.parent != Path(__file__).resolve().parents[1] / ".mediaslimx" / "window-tests":
        raise ValueError("Not an isolated window acceptance directory")
    record_path = Path(state["data"]) / "window.json"
    if record_path.exists():
        raise ValueError("Existing window record; do not activate or replace it")
    state["unrelated_baseline"] = unrelated_baseline()
    env = os.environ.copy()
    system_root = env.get("SYSTEMROOT") or env["SystemRoot"]
    env["PATH"] = os.pathsep.join([str(Path(system_root) / "System32"), system_root, str(Path(system_root) / "System32" / "Wbem")])
    env["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--remote-debugging-port=" + str(state["debug_port"]) + " --remote-debugging-address=127.0.0.1"
    child = subprocess.Popen([state["executable"], "--data-dir", state["data"], "--allow-root", state["media"], "--allow-root", state["large_directory"], "--allow-root", state["closing_media"], "--port", str(state["port"])], cwd=str(root), env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    state["launcher_pid"] = child.pid
    for _ in range(300):
        if record_path.is_file():
            record = json.loads(record_path.read_text(encoding="utf-8"))
            state["owner_pid"], state["host_pid"] = record["owner_pid"], record["host_pid"]
            state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
            return {"state": str(state_path), "owner_pid": state["owner_pid"], "host_pid": state["host_pid"], "port": state["port"], "debug_port": state["debug_port"]}
        if child.poll() is not None:
            raise RuntimeError("Acceptance launcher ended before the window became ready")
        time.sleep(.2)
    raise RuntimeError("Acceptance window readiness timed out; inspect only its window.log")


def main():
    if os.name != "nt":
        raise SystemExit("Run with native Windows Python")
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", type=Path)
    parser.add_argument("--state", type=Path)
    parser.add_argument("--fixture-video", type=Path)
    parser.add_argument("--closing-video", type=Path)
    parser.add_argument("--run-label", default="window", choices=("window", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"))
    parser.add_argument("--hold", action="store_true", help="Keep the test parent alive until its own window exits")
    args = parser.parse_args()
    if not args.state and not all((args.executable, args.fixture_video, args.closing_video)):
        parser.error("prepare requires --executable, --fixture-video and --closing-video (synthetic only)")
    state_path = args.state or prepare(args.executable.resolve(), args.fixture_video, args.closing_video, args.run_label)
    print(json.dumps(start(state_path), ensure_ascii=False), flush=True)
    if args.hold:
        state = json.loads(state_path.read_text(encoding="utf-8"))
        while (Path(state["data"]) / "window.json").exists():
            time.sleep(.5)


if __name__ == "__main__":
    main()
