"""Explicit browser-file imports. Original paths are never accepted or inferred."""
from contextlib import contextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile
import time
import unicodedata
import uuid
import zipfile

from starlette.concurrency import run_in_threadpool

from .paths import absolute, ensure_dir, open_read, parent_fd
from .engine import SKIP_DIRS

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".pdf"}
MAX_FILES = 200
MAX_FILE_BYTES = 1024**3
MAX_BATCH_BYTES = 2 * 1024**3
MAX_STORED_BYTES = 8 * 1024**3


MAX_DEPTH = 20
MAX_RELATIVE_BYTES = 1024


def portable_component(value):
    value = unicodedata.normalize("NFC", value)
    if (not value or value.startswith(".") or value.endswith((" ", "."))
            or len(value.encode("utf-8")) > 200
            or re.search(r'[/\\:*?"<>|\x00-\x1f\x7f]', value)
            or value.split(".")[0].upper() in {"CON", "PRN", "AUX", "NUL", *("COM"+str(i) for i in range(1, 10)), *("LPT"+str(i) for i in range(1, 10))}):
        raise ValueError("文件名不适合跨平台保存，请使用不含路径或特殊字符的普通媒体文件名")
    return value


def portable_name(value):
    value = portable_component(value)
    if Path(value).suffix.lower() not in EXTENSIONS:
        raise ValueError("文件导入仅支持 JPG、PNG、静态 WebP、普通 MP4 和可选普通 PDF")
    return value


def portable_relative(value):
    # These names affect export/ZIP only; physical inbox names stay server-generated.
    if (not isinstance(value, str) or len(value.encode("utf-8")) > MAX_RELATIVE_BYTES
            or "\\" in value or value.startswith("/") or not value):
        raise ValueError("导入相对路径无效：不能是绝对路径、反斜杠或超过 1024 字节")
    parts = value.split("/")
    if len(parts) > MAX_DEPTH + 1:
        raise ValueError("导入目录超过 20 层，请改用目录扫描或缩小范围")
    parts = [portable_component(part) for part in parts]
    portable_name(parts[-1])
    if len(parts) > 1 and parts[0].casefold() == "report.csv":
        raise ValueError("顶层目录 report.csv 与导出报告名称冲突，请重命名")
    return "/".join(parts)


class ImportManager:
    def __init__(self, engine):
        self.engine = engine
        self.lock = engine.lock
        self.active = set()
        self._container_ids = {str(p): self._identity(p.lstat()) for p in (engine.data_dir, engine.import_dir)}
        self.default_output = absolute(engine.data_dir.parent / ("exports-" + engine.data_dir.name))
        for path in engine.work_dir.glob("download-*.zip"):
            if not path.is_symlink():
                path.unlink(missing_ok=True)
        # Reclaim only known partial files from interrupted imports; retain originals
        # referenced by completed tasks so previews still work after restart.
        for batch in engine.all("import"):
            try:
                if batch.get("state") == "released":
                    continue
                if batch.get("state") in {"releasing", "release_failed"}:
                    batch["state"] = "release_failed"
                    engine.save("import", batch)
                    continue
                root = self._root(batch["id"])
                for item in batch["files"]:
                    part = root / (item["id"] + Path(item["name"]).suffix.lower() + ".part")
                    absolute(part)
                    part.unlink(missing_ok=True)
                    if item["state"] == "uploading":
                        item["state"] = "pending"
                batch["state"] = "open"
                engine.save("import", batch)
            except (OSError, ValueError, KeyError):
                continue

    def _root(self, key):
        if not re.fullmatch("[0-9a-f]{32}", key):
            raise ValueError("无效导入标识")
        return absolute(self.engine.import_dir / key / "files")

    def _batch(self, key):
        self._root(key)
        return self.engine.get("import", key)

    @staticmethod
    def _identity(value):
        return {"device": value.st_dev, "inode": value.st_ino}

    def _assert_containers(self):
        for name, expected in self._container_ids.items():
            path = absolute(name)
            if self._identity(path.lstat()) != expected:
                raise ValueError("导入数据目录已被替换，已停止清理，请检查后重启服务")

    @contextmanager
    def _owned_root(self, batch):
        """Pin the existing private directory; never recurse through user content."""
        self._assert_containers()
        root = self._root(batch["id"])
        with parent_fd(root / ".release-anchor") as (fd, _):
            current = os.fstat(fd) if fd is not None else root.lstat()
            if not stat.S_ISDIR(current.st_mode):
                raise ValueError("导入副本目录无效")
            if batch.get("root_identity") and self._identity(current) != batch["root_identity"]:
                raise ValueError("导入副本目录已被替换，已停止清理")
            yield fd, root, self._identity(current)

    def _known_fingerprints(self, key):
        result = {}
        for kind in ("scan", "task"):
            for record in self.engine.all(kind):
                if record.get("source_kind") == "import" and record.get("import_id") == key:
                    for item in record.get("entries", []):
                        if item.get("source_fp"):
                            result[item["id"]] = item["source_fp"]
        return result

    def _snapshot(self, batch, verify=False):
        expected_names = {}
        known = self._known_fingerprints(batch["id"])
        for item in batch["files"]:
            if not re.fullmatch(r"[0-9a-f]{32}", item["id"]):
                raise ValueError("导入文件标识无效，已停止清理")
            name = item["id"] + Path(portable_name(item["name"])).suffix.lower()
            if name in expected_names:
                raise ValueError("导入记录存在重复标识，已停止清理")
            expected_names[name] = (item, item.get("upload_fp") or known.get(item["id"]))
        snapshot, total = [], 0
        with self._owned_root(batch) as (fd, root, root_identity):
            actual_names = set(os.listdir(fd if fd is not None else root))
            allowed_names = set(expected_names) | {name + ".part" for name in expected_names}
            if not actual_names <= allowed_names:
                raise ValueError("导入目录中存在未登记文件，已停止清理；请先检查运行数据目录")
            removed = {p["name"] for p in batch.get("release_plan", [])}
            for name in sorted(allowed_names):
                item, expected = expected_names[name.removesuffix(".part")]
                if name not in actual_names:
                    if (not name.endswith(".part") and item["state"] == "uploaded"
                            and not (batch.get("state") == "release_failed" and name in removed)):
                        raise ValueError("导入副本已丢失或移动，已停止清理，请检查后重试")
                    continue
                value = os.stat(name, dir_fd=fd, follow_symlinks=False) if fd is not None else (root / name).lstat()
                if (not stat.S_ISREG(value.st_mode) or getattr(value, "st_file_attributes", 0) & 0x400
                        or value.st_nlink != 1):
                    raise ValueError("导入副本不是独立普通文件，已停止清理")
                signature = {"name": name, "size": value.st_size, "mtime_ns": value.st_mtime_ns,
                             **self._identity(value)}
                if not name.endswith(".part"):
                    if item.get("file_identity") and self._identity(value) != item["file_identity"]:
                        raise ValueError("导入副本已被替换，已停止清理")
                    if item["state"] != "uploaded":
                        raise ValueError("导入文件状态与实际副本不符，已停止清理，请人工检查")
                    # Legacy unscanned manifests have no upload hash. Explicit
                    # preview + confirmation binds their current private bytes,
                    # identity and directory to a version instead of inventing
                    # an original fingerprint or requiring a sealed rescan.
                    if expected and (value.st_size, value.st_mtime_ns) != (expected["size"], expected["mtime_ns"]):
                        raise ValueError("导入副本已修改，已停止清理")
                if verify:
                    # POSIX hashes the file under the same pinned dirfd used for
                    # unlink. Windows ancestry and each read handle deny rename.
                    if fd is not None:
                        number = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_NONBLOCK", 0), dir_fd=fd)
                        inp = os.fdopen(number, "rb")
                    else:
                        inp = open_read(root / name)
                    with inp:
                        before = os.fstat(inp.fileno())
                        digest = hashlib.sha256()
                        for chunk in iter(lambda: inp.read(1024**2), b""):
                            digest.update(chunk)
                        after = os.fstat(inp.fileno())
                    actual_fp = {"size": after.st_size, "mtime_ns": after.st_mtime_ns, "sha256": digest.hexdigest()}
                    if (self._identity(before) != self._identity(value)
                            or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns)
                            or (not name.endswith(".part") and expected and actual_fp != expected)):
                        raise ValueError("导入副本校验失败或读取时变化，已停止清理")
                    signature["sha256"] = digest.hexdigest()
                snapshot.append(signature)
                total += value.st_size
        return {"root_identity": root_identity, "files": snapshot}, total

    def _related_tasks(self, key):
        return [t for t in self.engine.all("task") if t.get("import_id") == key]

    def _protection(self, batch, tasks, worker_owned=False):
        if batch.get("state") == "released":
            return "导入副本已清理"
        if self.active:
            return "有文件正在传入，请等待传输结束"
        if batch.get("state") not in {"open", "release_failed"}:
            return "导入正在验证或清理，请稍后重试"
        if not worker_owned and self.engine.worker_lock.locked():
            return "当前有处理或恢复任务，请等待结束"
        for task in tasks:
            if task["status"] not in {"completed", "cancelled", "interrupted"}:
                return "关联任务正在处理或恢复，暂不能清理"
            thread = self.engine.threads.get(task["id"])
            if thread is not None and thread.is_alive():
                return "关联任务仍在结束，请稍后重试"
        return None

    def _description(self, batch, verify=False, worker_owned=False):
        tasks = self._related_tasks(batch["id"])
        reason = self._protection(batch, tasks, worker_owned)
        snapshot = None
        total = 0
        usage_verified = True
        if batch.get("state") != "released":
            try:
                snapshot, total = self._snapshot(batch, verify=verify and not reason)
            except (OSError, ValueError, KeyError) as exc:
                reason = reason or str(exc)
                usage_verified = False
        version = hashlib.sha256(json.dumps({"batch": batch, "tasks": tasks, "snapshot": snapshot},
                                               sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
        exported = {entry["id"] for task in tasks for entry in task["entries"] if entry.get("result_fp")}
        known = self._known_fingerprints(batch["id"])
        snapshot_only = sum(f["state"] == "uploaded" and not (f.get("upload_fp") or known.get(f["id"])) for f in batch["files"])
        return {"id": batch["id"], "created": batch["created"], "files": len(batch["files"]),
                "sample_files": [f.get("relative", f["name"]) for f in batch["files"][:3]],
                "unexported_files": sum(f["id"] not in exported for f in batch["files"]), "usage_verified": usage_verified,
                "snapshot_only_files": snapshot_only,
                "bytes": total, "reserved_bytes": 0 if batch.get("state") == "released" else sum(f["size"] for f in batch["files"]),
                "state": batch.get("state", "open"), "sealed": bool(batch.get("sealed")),
                "task_count": len(tasks), "tasks": [{"id": t["id"], "created": t["created"], "status": t["status"],
                                                       "label": t.get("source_label") or ("文件导入 · " + t["id"][:8])} for t in tasks],
                "can_release": not reason, "protected_reason": reason, "record_version": version,
                "released_at": batch.get("released_at")}, snapshot

    def storage(self):
        with self.lock:
            batches = [self._description(b)[0] for b in self.engine.all("import")]
            return {"usage_bytes": sum(b["bytes"] for b in batches),
                    "reserved_bytes": sum(b["reserved_bytes"] for b in batches),
                    "limit_bytes": MAX_STORED_BYTES, "usage_complete": all(b["usage_verified"] for b in batches), "batches": batches}

    def release_preview(self, key):
        with self.lock:
            description, _ = self._description(self._batch(key), verify=True)
            return description | {"original_preview_lost": True, "outputs_preserved": True,
                                  "reports_preserved": True, "backups_preserved": True}

    def release(self, key, confirm, record_version):
        self._root(key)
        if confirm is not True:
            raise ValueError("请先确认：只清理本服务导入副本，原件预览将不可用，导出、报告和备份保留")
        if not isinstance(record_version, str) or not re.fullmatch(r"[0-9a-f]{64}", record_version):
            raise ValueError("请先查看清理影响并重新确认")
        if not self.engine.worker_lock.acquire(blocking=False):
            raise ValueError("当前有处理或恢复任务，请在结束后清理副本")
        try:
            with self.lock:
                batch = self._batch(key)
                if batch.get("state") == "released":
                    return {"ok": True, "id": key, "released": False, "already_released": True, "released_bytes": 0}
                description, snapshot = self._description(batch, verify=True, worker_owned=True)
                if not description["can_release"]:
                    raise ValueError(description["protected_reason"])
                if not hmac.compare_digest(description["record_version"], record_version):
                    raise ValueError("导入副本或关联任务已变化，请重新查看清理影响并确认")
                batch.update(state="releasing", release_plan=snapshot["files"], latest_scan=None)
                self.engine.save("import", batch)
                try:
                    with self._owned_root(batch) as (fd, root, _):
                        for item in snapshot["files"]:
                            name = item["name"]
                            value = os.stat(name, dir_fd=fd, follow_symlinks=False) if fd is not None else (root / name).lstat()
                            if (self._identity(value) != {"device": item["device"], "inode": item["inode"]}
                                    or (value.st_size, value.st_mtime_ns) != (item["size"], item["mtime_ns"])):
                                raise ValueError("导入副本在清理时变化，已停止；未完成部分保留")
                            if fd is None:
                                (root / name).unlink()
                            else:
                                os.unlink(name, dir_fd=fd)
                        if fd is not None:
                            os.fsync(fd)
                    batch.update(state="released", released_at=time.time(), released_bytes=description["bytes"])
                    batch.pop("release_plan", None)
                    batch.pop("release_error", None)
                    self.engine.save("import", batch)
                except BaseException as exc:
                    batch.update(state="release_failed", release_error=str(exc))
                    self.engine.save("import", batch)
                    raise
                return {"ok": True, "id": key, "released": True, "already_released": False,
                        "released_bytes": description["bytes"]}
        finally:
            self.engine.worker_lock.release()

    def policy(self):
        # No original absolute path is exposed by browsers. Conservatively skip
        # known output/backup basenames anywhere in a browser-provided hierarchy.
        names = SKIP_DIRS | {"mediaslimx-export", "mediaslimx-backup",
                            "mediaslimx-exports", "mediaslimx-backups",
                            self.engine.data_dir.name, self.default_output.name}
        names |= {p.name for p in self.engine.exclusions()}
        return {"skip_dirs": sorted({n.casefold() for n in names}), "max_depth": MAX_DEPTH,
                "max_entries": 20000, "files": MAX_FILES, "batch_bytes": MAX_BATCH_BYTES}

    def allocate(self, files, batch_id=None):
        with self.lock:
            batch = self._batch(batch_id) if batch_id else {
                "id": uuid.uuid4().hex, "created": time.time(), "files": [], "sealed": False, "state": "open"
            }
            if batch["sealed"] or batch["state"] != "open":
                raise ValueError("此导入正在验证或已用于任务，请建立新的导入列表")
            if any(key[0] == batch["id"] for key in self.active):
                raise ValueError("请等待当前文件传输结束后继续添加")
            if not files or len(batch["files"]) + len(files) > MAX_FILES:
                raise ValueError("每个导入列表最多 200 个文件")
            used = {item.get("relative", item["name"]).casefold() for item in batch["files"]}
            directories = {}
            for item in batch["files"]:
                parts = item.get("relative", item["name"]).split("/")
                for index in range(1, len(parts)):
                    prefix = "/".join(parts[:index])
                    directories[prefix.casefold()] = prefix
            excluded = set(self.policy()["skip_dirs"])
            added = []
            for file in files:
                name = portable_name(file["name"])
                if Path(name).suffix.lower() == ".pdf" and file["size"] > 64 * 1024**2:
                    raise ValueError("PDF 超过 64 MiB 的首版文件限制")
                size = file["size"]
                if type(size) is not int or not 0 < size <= MAX_FILE_BYTES:
                    raise ValueError("单文件需大于 0 且不超过 1 GiB")
                relative = portable_relative(file.get("relative_path") or name)
                if relative.split("/")[-1] != name:
                    raise ValueError("文件名与相对路径末尾不一致")
                original_relative = relative
                parts = relative.split("/")
                for index, component in enumerate(parts[:-1]):
                    if component.casefold() in excluded:
                        raise ValueError("导入路径包含隐藏、依赖、输出或备份目录：" + component)
                    prefix = "/".join(parts[:index + 1])
                    if prefix.casefold() in used:
                        raise ValueError("导入文件与目录名称冲突，请重命名：" + prefix)
                    canonical = directories.get(prefix.casefold(), prefix)
                    parts[:index + 1] = canonical.split("/")
                    directories[canonical.casefold()] = canonical
                parent = "/".join(parts[:-1])
                original, number = parts[-1], 2
                relative = "/".join([parent, original]) if parent else original
                while relative.casefold() in used or relative.casefold() in directories:
                    p = Path(original)
                    name = portable_name(p.stem + f" ({number})" + p.suffix)
                    relative = parent + "/" + name if parent else name
                    number += 1
                relative = portable_relative(relative)
                name = relative.split("/")[-1]
                used.add(relative.casefold())
                added.append({"id": uuid.uuid4().hex, "name": name, "original_name": original,
                              "relative": relative, "original_relative": original_relative,
                              "size": size, "state": "pending"})
            total = sum(item["size"] for item in batch["files"] + added)
            if total > MAX_BATCH_BYTES:
                raise ValueError("单个导入列表最多 2 GiB")
            reserved = sum(item["size"] for b in self.engine.all("import") if b.get("state") != "released" for item in b["files"])
            if reserved + sum(item["size"] for item in added) > MAX_STORED_BYTES:
                raise ValueError("当前平台导入区达到 8 GiB 限制，请打开导入空间管理，确认后清理副本")
            if shutil.disk_usage(self.engine.data_dir).free < total + max(item["size"] for item in added) + 64 * 1024**2:
                raise ValueError("磁盘剩余空间不足，请先释放空间")
            root = ensure_dir(self._root(batch["id"]))
            batch.setdefault("root_identity", self._identity(root.lstat()))
            batch["files"].extend(added)
            batch["latest_scan"] = None
            self.engine.save("import", batch)
            return {"id": batch["id"], "files": added}

    async def receive(self, key, file_id, stream):
        pair = (key, file_id)
        with self.lock:
            batch = self._batch(key)
            item = next((f for f in batch["files"] if f["id"] == file_id), None)
            if not item or not re.fullmatch("[0-9a-f]{32}", file_id):
                raise ValueError("文件不属于此导入")
            if batch["sealed"] or batch["state"] != "open" or item["state"] == "uploaded" or pair in self.active:
                raise ValueError("文件已传入、正在传输或导入已锁定")
            item["state"] = "uploading"
            self.engine.save("import", batch)
            destination = self._root(key) / (file_id + Path(item["name"]).suffix.lower())
            part = destination.with_name(destination.name + ".part")
            expected_size = item["size"]
            self.active.add(pair)
        success = False
        try:
            with parent_fd(part) as (fd, path):
                flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
                number = os.open(path.name if fd is not None else path, flags, 0o600, **({"dir_fd": fd} if fd is not None else {}))
                try:
                    with os.fdopen(number, "wb") as out:
                        count, digest = 0, hashlib.sha256()
                        async for chunk in stream:
                            count += len(chunk)
                            if count > expected_size or count > MAX_FILE_BYTES:
                                raise ValueError("文件实际大小超过声明或限制，已停止接收")
                            digest.update(chunk)
                            for offset in range(0, len(chunk), 1024**2):
                                await run_in_threadpool(out.write, chunk[offset:offset + 1024**2])
                        if count != expected_size:
                            raise ValueError("文件未完整传输，未加入待处理列表")
                        await run_in_threadpool(out.flush)
                        await run_in_threadpool(os.fsync, out.fileno())
                    absolute(destination)
                    if fd is None:
                        os.replace(path, destination)
                    else:
                        os.replace(path.name, destination.name, src_dir_fd=fd, dst_dir_fd=fd)
                    received_fp = {"size": count, "sha256": digest.hexdigest(), "mtime_ns": destination.stat().st_mtime_ns}
                    received_identity = self._identity(destination.lstat())
                    success = True
                finally:
                    if not success:
                        if fd is None:
                            path.unlink(missing_ok=True)
                        else:
                            try:
                                os.unlink(path.name, dir_fd=fd)
                            except FileNotFoundError:
                                pass
            return {"id": file_id, "name": item["name"], "bytes": count, "sha256": digest.hexdigest()}
        finally:
            with self.lock:
                self.active.discard(pair)
                latest = self._batch(key)
                current = next(f for f in latest["files"] if f["id"] == file_id)
                current["state"] = "uploaded" if success else "pending"
                if success:
                    current["upload_fp"] = received_fp
                    current["file_identity"] = received_identity
                self.engine.save("import", latest)

    def scan(self, key):
        with self.lock:
            batch = self._batch(key)
            if batch["sealed"] or batch["state"] != "open" or any(pair[0] == key for pair in self.active):
                raise ValueError("导入仍在传输、验证或已用于任务")
            uploaded = [f for f in batch["files"] if f["state"] == "uploaded"]
            if not uploaded:
                raise ValueError("尚无完整传入的文件")
            batch["state"] = "scanning"
            self.engine.save("import", batch)
        try:
            root = self._root(key)
            scan = {"id": uuid.uuid4().hex, "created": time.time(), "root": str(root), "entries": [],
                    "non_media": 0, "skipped_files": 0, "skipped_dirs": 0, "warnings": [],
                    "source_kind": "import", "import_id": key, "default_output": str(self.default_output)}
            for file in uploaded:
                path = root / (file["id"] + Path(file["name"]).suffix.lower())
                entry = self.engine._scan_candidate(path, file.get("relative", file["name"]))
                entry["id"] = file["id"]
                scan["entries"].append(entry)
                relative = file.get("relative", file["name"])
                original = file.get("original_relative", file["original_name"])
                if relative != original:
                    scan["warnings"].append(f"路径区分：{original} → {relative}")
            pending = len(batch["files"]) - len(uploaded)
            if pending:
                scan["warnings"].append(f"{pending} 个文件未完整传入，未加入待处理列表")
            with self.lock:
                self.engine.save("scan", scan)
                batch["latest_scan"] = scan["id"]
                return scan
        finally:
            with self.lock:
                batch["state"] = "open"
                self.engine.save("import", batch)

    def discard(self, key):
        with self.lock:
            batch = self._batch(key)
            if batch["state"] != "open" or any(pair[0] == key for pair in self.active):
                raise ValueError("导入仍在清理，请稍后重试")
            # A sealed manifest records that these originals were used even
            # after their task history is explicitly deleted. Never turn them
            # into disposable uploads, including after a program restart.
            if batch.get("sealed") or any(t.get("import_id") == key for t in self.engine.all("task")):
                raise ValueError("此副本用于任务历史和预览，不能作为未使用导入清理")
            root = self._root(key)
            for item in batch["files"]:
                for ending in ["", ".part"]:
                    path = root / (item["id"] + Path(item["name"]).suffix.lower() + ending)
                    with parent_fd(path) as (fd, p):
                        if fd is None:
                            p.unlink(missing_ok=True)
                        else:
                            try:
                                os.unlink(p.name, dir_fd=fd)
                            except FileNotFoundError:
                                pass
            root.rmdir()
            root.parent.rmdir()
            with self.engine.db() as db:
                db.execute("DELETE FROM records WHERE kind='import' AND id=?", (key,))
            return {"ok": True}

    def unused(self):
        with self.lock:
            referenced = {t.get("import_id") for t in self.engine.all("task")}
            return [{"id": b["id"], "files": len(b["files"]),
                     "bytes": sum(f["size"] for f in b["files"] if f["state"] == "uploaded")}
                    for b in self.engine.all("import")
                    if not b.get("sealed") and b["id"] not in referenced and b["state"] == "open"
                    and not any(pair[0] == b["id"] for pair in self.active)]

    def clear_unused(self, keys):
        cleared, protected = [], []
        with self.lock:
            for key in keys:
                self._root(key)
            for key in dict.fromkeys(keys):
                # Recheck under the same lock: a task may have started after the
                # browser opened its confirmation; its originals must survive.
                try:
                    self.discard(key)
                    cleared.append(key)
                except ValueError:
                    protected.append(key)
        return {"cleared": cleared, "protected": protected}

    def archive(self, task_id):
        task = self.engine.get("task", task_id)
        if task.get("source_kind") != "import" or task["status"] in {"running", "cancelling", "restoring"}:
            raise ValueError("仅已结束的文件导入任务可下载导出包")
        fd, filename = tempfile.mkstemp(prefix="download-", suffix=".zip", dir=self.engine.work_dir)
        os.close(fd)
        try:
            with zipfile.ZipFile(filename, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
                for entry in task["entries"]:
                    if not entry.get("result_fp"):
                        continue
                    path, expected = self.engine.preview(task_id, entry["id"], "result")
                    name = portable_relative(entry["relative"])
                    digest = hashlib.sha256()
                    with open_read(path) as inp, archive.open(name, "w", force_zip64=True) as out:
                        for chunk in iter(lambda: inp.read(1024**2), b""):
                            out.write(chunk); digest.update(chunk)
                    if digest.hexdigest() != expected["sha256"]:
                        raise ValueError("导出文件在打包时发生变化，请重试")
                archive.writestr("report.csv", self.engine.report(task_id).encode("utf-8"))
            return Path(filename)
        except BaseException:
            Path(filename).unlink(missing_ok=True)
            raise
