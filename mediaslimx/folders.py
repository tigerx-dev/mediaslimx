"""Metadata-only folder browsing, bounded by explicit media roots."""
import json
import os
import threading

from .desktop import choose_native_folder, cancel_native_folder, stop_native_folder
from .engine import SKIP_DIRS, DEFAULT_ARTIFACT_DIRS
from .paths import absolute, inside, is_hidden, parent_fd
from .library import ListLibrary


class FolderBrowser:
    def __init__(self, engine, desktop=False):
        self.engine = engine
        self.library = ListLibrary(engine)
        self.desktop = desktop and os.name == "nt"
        self._closing = threading.Event()
        self._lifecycle_lock = threading.Lock()
        self.settings = engine.data_dir / "authorized-roots.json"
        if self.desktop and self.settings.exists():
            try:
                saved_roots = json.loads(self.settings.read_text(encoding="utf-8"))
                if not isinstance(saved_roots, list) or not all(isinstance(r, str) for r in saved_roots):
                    saved_roots = []
            except (OSError, ValueError):
                saved_roots = []
            for saved in saved_roots:
                try:
                    self._grant(saved, persist=False)
                except (OSError, ValueError):
                    pass

    def _grant(self, value, persist=True):
        p = absolute(value)
        if not p.is_dir():
            raise ValueError("所选目录不存在")
        if not any(inside(p, r) for r in self.engine.roots):
            self.engine.roots.append(p)
        if persist:
            tmp = self.settings.with_suffix(".tmp")
            tmp.write_text(json.dumps([str(r) for r in self.engine.roots], ensure_ascii=False), encoding="utf-8")
            tmp.replace(self.settings)
        return p

    def browse(self, value=None, purpose="media"):
        if purpose not in {"media", "output", "backup"}:
            raise ValueError("未知目录用途")
        roots = [str(r) for r in self.engine.roots]
        shortcut_state = {"root_items": self.library.directories(self.engine.roots),
                          "hidden_roots_count": len(self.library.directories(self.engine.roots, hidden=True))}
        if not value:
            return {"path": None, "parent": None, "roots": roots, "directories": [], "skipped": 0, **shortcut_state}
        p = self.engine._root(value)
        if inside(p, self.engine.data_dir) or (purpose == "media" and self.engine._excluded(p)):
            raise ValueError("运行数据、输出或备份目录不能作为媒体扫描范围")
        directories, skipped = [], 0
        with os.scandir(p) as entries:
            for entry in entries:
                try:
                    if not entry.is_dir(follow_symlinks=False):
                        continue
                    child = absolute(p / entry.name)
                    if is_hidden(child) or entry.name.lower() in SKIP_DIRS or inside(child, self.engine.data_dir):
                        skipped += 1
                    elif purpose == "media" and self.engine._excluded(child):
                        skipped += 1
                    else:
                        directories.append({"name": entry.name, "path": str(child)})
                except (OSError, ValueError):
                    skipped += 1
        parent = str(p.parent) if any(inside(p.parent, r) for r in self.engine.roots) else None
        return {"path": str(p), "parent": parent, "roots": roots,
                "directories": sorted(directories, key=lambda e: e["name"].casefold()), "skipped": skipped, **shortcut_state}

    def cancel_native(self, request_id):
        if not self.desktop:
            raise ValueError("当前是服务器/WSL 模式，没有系统选择窗口")
        cancel_native_folder(request_id)
        return {"cancelled": True}

    def close_native(self):
        # Serialize the stop boundary with accepting a returned directory: a
        # late picker result must not authorize a new root after service stop.
        with self._lifecycle_lock:
            stop_native_folder(self._closing)

    def dropped_directory(self, value):
        """Authorize one host-observed drop, never a path submitted over HTTP.

        The window's private pipe is the only caller. No scan, task, media read
        or file replacement is started here; the UI requests a normal scan next.
        Pin Windows directory ancestry while recording the validated scope.
        """
        if not self.desktop:
            raise ValueError("当前不是 Windows 本地服务，不能接收原生目录拖入。")
        with self.engine._lifecycle_lock, self._lifecycle_lock:
            if self._closing.is_set() or self.engine.closing.is_set():
                raise ValueError("正在安全退出，暂不接受拖入目录。")
            if not isinstance(value, str) or not 1 <= len(value) <= 4096 or "\0" in value:
                raise ValueError("未能识别拖入的本机目录，请使用选择目录。")
            path = absolute(value)
            with parent_fd(path / ".directory-anchor"):
                path = absolute(path)
                if not path.is_dir():
                    raise ValueError("未能识别拖入的本机目录，请使用选择目录。")
                if (is_hidden(path) or path.name.casefold() in SKIP_DIRS
                        or any(part.casefold() in DEFAULT_ARTIFACT_DIRS for part in path.parts)):
                    raise ValueError("隐藏目录、依赖目录及默认输出或备份目录不能作为拖入扫描范围。")
                if self.engine._excluded(path):
                    raise ValueError("运行数据、输出和备份目录不能作为拖入扫描范围。")
                # Roll back in-memory scope if persisting this new grant fails.
                # The existing media/results and authorized-roots file survive.
                previous = list(self.engine.roots)
                try:
                    self._grant(path)
                except (OSError, ValueError):
                    self.engine.roots[:] = previous
                    raise
                return {"path": str(path)}

    def native(self, purpose="media", request_id=None):
        if not self.desktop:
            raise ValueError("当前是服务器/WSL 模式，请使用网页目录浏览器；不会打开其他设备的窗口")
        if purpose not in {"media", "output", "backup"}:
            raise ValueError("未知目录用途")
        selected = choose_native_folder(self.engine.roots[0], request_id, closing=self._closing)
        if not selected:
            return {"path": None}
        with self._lifecycle_lock:
            if self._closing.is_set():
                return {"path": None}
            path = absolute(selected)
            if inside(path, self.engine.data_dir) or (purpose == "media" and self.engine._excluded(path)):
                raise ValueError("请选择运行数据、输出和备份范围之外的媒体目录")
            if purpose == "media":
                self._grant(path)
            return {"path": str(path)}
