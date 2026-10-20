"""Browser opening after authenticated readiness and safe reuse of one instance."""
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser


def _verify(url, data_dir):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.path != "/" or parsed.username or parsed.query:
        raise ValueError("无效的本机启动记录")
    token = urllib.parse.parse_qs(parsed.fragment).get("token", [""])[0]
    if len(token) < 32:
        raise ValueError("无效的本机令牌记录")
    request = urllib.request.Request(f"http://127.0.0.1:{parsed.port}/api/environment",
                                     headers={"X-MediaSlimX-Token": token})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=1) as response:
        env = json.load(response)
    if Path(env["data_dir"]) != Path(data_dir):
        raise ValueError("运行记录与服务不匹配")
    return env


def _open_browser(url):
    if os.name != "nt" or not getattr(sys, "frozen", False):
        return webbrowser.open(url)
    # A default browser must never inherit the service's kill-on-close Job.
    # Explicit breakaway can be denied by an outer Job. In that case fail closed
    # and leave the already printed URL for manual opening; never retry inside
    # the service Job or terminate a browser process.
    environment = os.environ.copy()
    environment["MEDIASLIMX_BROWSER_URL"] = url
    try:
        result = subprocess.run([sys.executable, "--mediaslimx-browser-worker"],
                                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, env=environment, timeout=10,
                                creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_BREAKAWAY_FROM_JOB)
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _browser_worker():
    url = os.environ.pop("MEDIASLIMX_BROWSER_URL", "")
    try:
        parsed = urllib.parse.urlsplit(url)
        token = urllib.parse.parse_qs(parsed.fragment).get("token", [""])[0]
        if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.path != "/"
                or parsed.username or parsed.password or parsed.query or not parsed.port
                or not 1024 <= parsed.port <= 65535 or len(token) < 32):
            return 1
        return 0 if webbrowser.open(url) else 1
    except (OSError, ValueError, webbrowser.Error):
        return 1


def _browser_error():
    print("未能安全自动打开浏览器，请复制上方完整 URL。 / Open the complete URL above manually.", flush=True)


def reopen_existing(data_dir, open_browser):
    try:
        record = json.loads((data_dir / "server.json").read_text(encoding="utf-8"))
        _verify(record["url"], data_dir)
        print("MediaSlim X 已在运行：" + record["url"], flush=True)
        if open_browser and not _open_browser(record["url"]):
            _browser_error()
        return True
    except (OSError, ValueError, KeyError):
        return False


def open_when_ready(url, data_dir, open_browser):
    def ready():
        for _ in range(100):
            try:
                _verify(url, data_dir)
                record = data_dir / "server.json"
                tmp = record.with_suffix(".tmp")
                tmp.write_text(json.dumps({"url": url}, ensure_ascii=False), encoding="utf-8")
                tmp.chmod(0o600)
                tmp.replace(record)
                if open_browser:
                    if not _open_browser(url):
                        _browser_error()
                return
            except (OSError, ValueError):
                time.sleep(.1)
    threading.Thread(target=ready, daemon=True).start()
