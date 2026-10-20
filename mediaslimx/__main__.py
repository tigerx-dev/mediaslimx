"""Launch the local application; never bind a public interface."""
import argparse
import os
from pathlib import Path
import secrets

from .paths import absolute, ensure_dir


def main():
    parser = argparse.ArgumentParser(description="MediaSlim X 本机媒体瘦身工具")
    parser.add_argument("--allow-root", action="append", help="允许扫描的绝对根目录，可重复指定；默认启动目录")
    parser.add_argument("--data-dir", default=str(Path.cwd() / ".mediaslimx" / ("windows" if os.name == "nt" else "wsl")))
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    parser.add_argument("--open-browser", action="store_true", help="服务就绪后自动打开默认浏览器")
    parser.add_argument("--desktop", action="store_true", help="启用本机桌面功能；Windows 允许系统目录选择")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("端口需为 1024~65535")
    data = ensure_dir(args.data_dir)
    # Lock before Engine initialization or stale-work cleanup.
    lockpath = absolute(data / "instance.lock")
    lock = open(lockpath, "a+b")
    try:
        if os.name == "posix":
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        else:
            import msvcrt
            lock.seek(0)
            lock.write(b"0")
            lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        from .launch import reopen_existing
        if reopen_existing(data, args.open_browser and not args.no_browser):
            lock.close()
            return
        raise SystemExit("同一数据目录已有 MediaSlim X 运行，请关闭原进程或使用其他 --data-dir")
    try:
        from .app import create_app
        from .engine import Engine
        from .server import run_server
        engine = Engine(data, args.allow_root or [Path.cwd()])
        token = secrets.token_urlsafe(32)
        app = create_app(engine, token, args.port, desktop=args.desktop)
        from .launch import open_when_ready
        open_when_ready(f"http://127.0.0.1:{args.port}/#token={token}", data, args.open_browser and not args.no_browser)
        print(f"\nMediaSlim X · 本机处理 · 仅监听回环地址\n打开 http://127.0.0.1:{args.port}/#token={token}", flush=True)
        print("请勿分享令牌。服务器请通过 SSH 隧道访问。Ctrl+C 停止。\n", flush=True)
        run_server(app, args.port)
    finally:
        lock.close()


if __name__ == "__main__":
    main()
