"""Persistent single-worker tasks. All media reads are bounded and no-follow."""
import copy
from contextlib import contextmanager
import csv
import io
import json
import os
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import uuid
from pathlib import Path

from PIL import UnidentifiedImageError

from . import media
from .process_control import cancel_scope
from .paths import absolute, commit_file, ensure_dir, fingerprint, inside, open_read, require_fingerprint, same_content, is_hidden

# These names are reserved even before an output path has been registered by
# a task, e.g. when scanning media copied from another MediaSlim X instance.
DEFAULT_ARTIFACT_DIRS = {"mediaslimx-export", "mediaslimx-backup", "mediaslimx-exports", "mediaslimx-backups"}
SKIP_DIRS = {"node_modules", "venv", "env", "__pycache__", "site-packages", "vendor", "dist", "build",
             "backups", "backup", "output", "outputs", "exports", "cache"} | DEFAULT_ARTIFACT_DIRS
TERMINAL = {"success", "no_gain", "duplicate", "unsupported", "failed", "cancelled", "restored", "restore_conflict"}


def task_folder_name(task):
    """Use a readable folder for new tasks; retain the ID path of old records."""
    task_id = task["id"]
    name = task.get("folder_name", task_id)
    dated = isinstance(name, str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9a-f]{8}", name)
    if name != task_id and (not dated or not name.endswith(task_id[:8])):
        raise ValueError("任务目录记录无效")
    return name


class Engine:
    def __init__(self, data_dir, roots):
        self.data_dir = ensure_dir(data_dir)
        self.work_dir = ensure_dir(self.data_dir / "work")
        self.import_dir = ensure_dir(self.data_dir / "imports")
        self.roots = [absolute(r) for r in roots]
        for root in self.roots:
            if not root.is_dir():
                raise ValueError("允许根目录不存在：" + str(root))
        self.db_path = self.data_dir / "tasks.sqlite3"
        self.lock = threading.RLock()
        self.worker_lock = threading.Lock()
        self._lifecycle_lock = threading.RLock()
        self.closing = threading.Event()
        self.events = {}
        self.threads = {}
        with self.db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, data TEXT NOT NULL, PRIMARY KEY(kind,id))")
            db.execute("CREATE TABLE IF NOT EXISTS processed (hash TEXT, params TEXT, PRIMARY KEY(hash,params))")
            db.execute("CREATE TABLE IF NOT EXISTS exclusions (path TEXT PRIMARY KEY)")
        self._recover()
        # A single instance owns this workspace; stale private scratch directories
        # can only come from a terminated process, never from the media tree.
        for p in self.work_dir.iterdir():
            if p.is_dir() and not p.is_symlink():
                shutil.rmtree(p)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.db_path, timeout=30)
        try:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA synchronous=FULL")
            with db:
                yield db
        finally:
            db.close()

    def save(self, kind, record):
        with self.lock, self.db() as db:
            db.execute("INSERT OR REPLACE INTO records VALUES (?,?,?)",
                       (kind, record["id"], json.dumps(record, ensure_ascii=False)))

    def get(self, kind, key):
        with self.lock, self.db() as db:
            row = db.execute("SELECT data FROM records WHERE kind=? AND id=?", (kind, key)).fetchone()
        if not row:
            raise ValueError("记录不存在")
        record = json.loads(row[0])
        event = self.events.get(key)
        if kind == "task" and event and event.is_set() and record["status"] == "running":
            record["status"] = "cancelling"
        return record

    def all(self, kind):
        with self.lock, self.db() as db:
            rows = db.execute("SELECT data FROM records WHERE kind=?", (kind,)).fetchall()
        return sorted((json.loads(r[0]) for r in rows), key=lambda r: r["created"], reverse=True)

    def _recover(self):
        for task in self.all("task"):
            if task["status"] not in {"running", "cancelling", "restoring"}:
                continue
            for e in task["entries"]:
                if e["status"] in {"committing", "restoring"}:
                    try:
                        fp = fingerprint(e["destination"] if e["status"] == "committing" else e["source"])
                        wanted = e.get("planned_fp") if e["status"] == "committing" else e.get("source_fp")
                        if same_content(fp, wanted):
                            e["result_fp"] = fp
                            e["status"] = e.get("planned_status", "success") if e["status"] == "committing" else "restored"
                            e["result_size"] = fp["size"]
                            e["reason"] = "启动时核对指纹并恢复提交记录"
                            if e["status"] == "success":
                                with self.db() as db:
                                    db.execute("INSERT OR IGNORE INTO processed VALUES (?,?)",
                                               (fp["sha256"], json.dumps(task["params"], sort_keys=True)))
                        else:
                            e.update(status="failed", reason="程序中断，文件状态与预期不符；备份如有仍保留")
                    except (OSError, ValueError):
                        e.update(status="failed", reason="程序中断，无法核对文件；请检查备份")
                elif e["status"] not in TERMINAL:
                    e.update(status="cancelled", reason="程序重启，未自动继续处理")
            task.update(status="interrupted", stop_reason="unexpected", current=None)
            self.save("task", task)

    def _root(self, value):
        p = absolute(value)
        if not any(inside(p, root) for root in self.roots):
            raise ValueError("目录不在启动时 --allow-root 允许范围内")
        if not p.is_dir():
            raise ValueError("媒体目录不存在或不是目录")
        return p

    def exclusions(self):
        with self.db() as db:
            return [Path(r[0]) for r in db.execute("SELECT path FROM exclusions")]

    def _excluded(self, p):
        return any(inside(p, ex) for ex in [self.data_dir, *self.exclusions()])

    def _snapshot(self, source, dest):
        with open_read(source) as inp, open(dest, "xb") as out:
            shutil.copyfileobj(inp, out, 1024 * 1024)

    def scan(self, value):
        root = self._root(value)
        if self._excluded(root) or any(part.casefold() in DEFAULT_ARTIFACT_DIRS for part in root.parts):
            raise ValueError("该目录是运行数据、输出或备份目录，不允许扫描")
        scan = {"id": uuid.uuid4().hex, "created": time.time(), "root": str(root), "entries": [],
                "non_media": 0, "skipped_files": 0, "skipped_dirs": 0, "warnings": []}
        exclusions = [self.data_dir, *self.exclusions()]
        def onerror(error):
            scan["warnings"].append("目录无法访问：" + str(error))
        for directory, dirs, names in os.walk(root, followlinks=False, onerror=onerror):
            kept = []
            for name in dirs:
                p = Path(directory) / name
                try:
                    absolute(p)
                    if is_hidden(p) or name.lower() in SKIP_DIRS or any(inside(p, ex) for ex in exclusions):
                        scan["skipped_dirs"] += 1
                    else:
                        kept.append(name)
                except (OSError, ValueError):
                    scan["skipped_dirs"] += 1
            dirs[:] = kept
            for name in sorted(names):
                p = Path(directory) / name
                suffix = p.suffix.lower()
                try:
                    hidden = is_hidden(p)
                except OSError:
                    hidden = False
                if hidden:
                    scan["skipped_files"] += 1
                    continue
                if suffix not in media.CANDIDATES:
                    scan["non_media"] += 1
                    continue
                e = self._scan_candidate(p, p.relative_to(root).as_posix())
                scan["entries"].append(e)
        self.save("scan", scan)
        return scan

    def _scan_candidate(self, p, relative):
        """Inspect one explicit candidate; directory and import entry points share this."""
        suffix = p.suffix.lower()
        e = {"id": uuid.uuid4().hex, "relative": relative, "source": str(p),
             "size": 0, "status": "ready", "reason": "", "kind": "video" if suffix == ".mp4" else "document" if suffix == ".pdf" else "image"}
        try:
            absolute(p)
            e["source_fp"] = fingerprint(p)
            e["size"] = e["source_fp"]["size"]
            with open_read(p) as inp:
                e["file_mode"] = os.fstat(inp.fileno()).st_mode & 0o777
            with tempfile.TemporaryDirectory(dir=self.work_dir) as tmp:
                snap = Path(tmp) / ("source" + suffix)
                self._snapshot(p, snap)
                if not same_content(fingerprint(snap), e["source_fp"]):
                    raise ValueError("扫描时源文件发生变化，请重新扫描")
                e["info"] = media.inspect(snap, suffix)
                e["kind"] = e["info"]["kind"]
            require_fingerprint(p, e["source_fp"])
        except UnidentifiedImageError:
            e.update(status="failed", reason="损坏媒体或文件内容不是有效图片")
        except ValueError as ex:
            e.update(status="unsupported", reason=str(ex))
        except Exception as ex:
            e.update(status="failed", reason=str(ex))
        return e

    def _source_root(self, record, require_available=True):
        if record.get("source_kind") != "import":
            return self._root(record["root"])
        import_id = record.get("import_id", "")
        if len(import_id) != 32 or any(c not in "0123456789abcdef" for c in import_id):
            raise ValueError("无效的导入记录")
        expected = absolute(self.import_dir / import_id / "files")
        batch = self.get("import", import_id)
        if require_available and batch.get("state") in {"released", "releasing", "release_failed"}:
            raise ValueError("导入原始副本已清理或清理未完成，无法继续处理或预览原件；导出结果仍保留")
        if absolute(record["root"]) != expected or (require_available and not expected.is_dir()):
            raise ValueError("导入副本目录无效")
        return expected

    def create(self, scan_id, selected, params, mode, output=None, backup=None, confirm=False):
        # Keep admission and thread registration on one side of shutdown. The
        # shutdown caller must not miss a task that is still being constructed.
        with self._lifecycle_lock:
            self._require_open()
            return self._create(scan_id, selected, params, mode, output, backup, confirm)

    def _create(self, scan_id, selected, params, mode, output=None, backup=None, confirm=False):
        if not self.worker_lock.acquire(blocking=False):
            raise ValueError("已有处理或恢复任务正在运行")
        try:
            scan = self.get("scan", scan_id)
            self._source_root(scan)
            imported = scan.get("source_kind") == "import"
            if imported and mode != "export":
                raise ValueError("文件导入仅允许导出，不能覆盖或移动浏览器中的原文件")
            if not imported and self._excluded(Path(scan["root"])):
                raise ValueError("扫描范围已成为输出/备份目录，请重新选择")
            if mode not in {"export", "backup", "overwrite"}:
                raise ValueError("未知输出方式")
            if mode == "overwrite" and not confirm:
                raise ValueError("直接覆盖必须明确确认无备份、不可恢复")
            if params.get("preset") not in media.QUALITY:
                raise ValueError("未知画质预设")
            params = {k: params.get(k) for k in ("preset", "max_width", "max_height")}
            for k in ("max_width", "max_height"):
                n = params[k]
                if n is not None and (type(n) is not int or not 2 <= n <= 32768):
                    raise ValueError("最大宽高需为 2~32768 的整数或留空")
            selected = set(selected)
            ready = {e["id"] for e in scan["entries"] if e["status"] == "ready"}
            if not selected or not selected <= ready:
                raise ValueError("请仅选择扫描中支持的文件")
            if mode == "overwrite" and any(e["id"] in selected and e["kind"] == "document" for e in scan["entries"]):
                raise ValueError("PDF 不允许无备份覆盖；请选择导出至新目录或备份后覆盖")
            destroot = None
            if mode != "overwrite":
                raw_destination = output if mode == "export" else backup
                if not isinstance(raw_destination, str) or not raw_destination.strip():
                    raise ValueError("请填写输出或备份的绝对目录")
                destroot = absolute(raw_destination)
                if inside(Path(scan["root"]), destroot):
                    raise ValueError("输出/备份目录不能等于或包含扫描目录")
                if inside(destroot, self.data_dir) or inside(self.data_dir, destroot):
                    raise ValueError("输出/备份目录不得与运行数据目录重叠")
                ensure_dir(destroot)
                with self.db() as db:
                    db.execute("INSERT OR IGNORE INTO exclusions VALUES (?)", (str(destroot),))
            task_id, created = uuid.uuid4().hex, time.time()
            folder_name = time.strftime("%Y-%m-%d_%H-%M-%S", time.localtime(created)) + "-" + task_id[:8]
            task = {"id": task_id, "created": created, "root": scan["root"], "mode": mode,
                    "params": params, "status": "running", "current": None,
                    "folder_name": folder_name,
                    "output_root": str(destroot) if mode == "export" else None,
                    "backup_root": str(destroot) if mode == "backup" else None, "entries": []}
            for raw in scan["entries"]:
                if raw["id"] not in selected and raw["status"] == "ready":
                    continue
                e = copy.deepcopy(raw)
                e.update(status="pending" if e["status"] == "ready" else e["status"],
                         result_size=e["size"], elapsed=0, backup=None, destination=None, result_fp=None)
                if not imported and e["status"] == "pending" and self._excluded(Path(e["source"])):
                    e.update(status="unsupported", reason="该文件位于输出/备份目录，已排除")
                task["entries"].append(e)
            if imported:
                task.update(source_kind="import", import_id=scan["import_id"], source_label="文件导入 · "+str(len(task["entries"]))+" 项")
                with self.lock, self.db() as db:
                    batch = self.get("import", scan["import_id"])
                    if batch.get("sealed") or batch.get("latest_scan") != scan_id or batch.get("state") != "open":
                        raise ValueError("导入列表已更新或已用于任务，请重新导入")
                    batch["sealed"] = True
                    for kind, record in [("import", batch), ("task", task)]:
                        db.execute("INSERT OR REPLACE INTO records VALUES (?,?,?)", (kind, record["id"], json.dumps(record, ensure_ascii=False)))
            else:
                self.save("task", task)
            event = threading.Event()
            self.events[task["id"]] = event
            thread = threading.Thread(target=self._run, args=(task, event), daemon=True)
            self.threads[task["id"]] = thread
            try:
                thread.start()
            except Exception as error:
                # A failed start has no worker to remove these registrations.
                # Keep an honest persistent record, but never make shutdown
                # join a Thread that Python was unable to start.
                self.events.pop(task["id"], None)
                self.threads.pop(task["id"], None)
                for entry in task["entries"]:
                    if entry["status"] == "pending":
                        entry.update(status="cancelled", reason="后台任务未能启动，未处理此文件")
                task.update(status="interrupted", current=None, error="后台任务未能启动：" + str(error))
                self.save("task", task)
                raise ValueError("无法启动后台处理任务，请检查系统资源后重试；原媒体未处理") from error
            return task["id"]
        except Exception:
            self.worker_lock.release()
            raise

    def _cancel_check(self, event):
        if event.is_set():
            raise InterruptedError("已取消，未开始的文件将保留原样")

    def _process(self, task, e, event):
        src = Path(e["source"])
        require_fingerprint(src, e["source_fp"])
        key = json.dumps(task["params"], sort_keys=True)
        with self.db() as db:
            repeated = db.execute("SELECT 1 FROM processed WHERE hash=? AND params=?",
                                  (e["source_fp"]["sha256"], key)).fetchone()
        with tempfile.TemporaryDirectory(dir=self.work_dir) as tmp:
            snap = Path(tmp) / ("source" + src.suffix.lower())
            self._snapshot(src, snap)
            if not same_content(fingerprint(snap), e["source_fp"]):
                raise ValueError("处理开始前源文件改变，请重新扫描")
            if repeated:
                e["actual_params"] = {"skipped": "same output hash and parameters", **task["params"]}
                result, e["result_info"], e["status"] = snap, e["info"], "duplicate"
                e["reason"] = "内容已使用相同参数处理，避免重复有损压缩"
            else:
                result = Path(tmp) / ("result" + src.suffix.lower())
                e["actual_params"] = media.optimize(snap, result, e["info"], task["params"])
                e["result_info"] = media.validate_result(result, src.suffix.lower(), e["info"], task["params"])
                self._cancel_check(event)
                if result.stat().st_size >= e["size"]:
                    result, e["result_info"], e["status"] = snap, e["info"], "no_gain"
                    e["reason"] = "压缩无收益，保留原文件"
                else:
                    e["status"], e["reason"] = "success", ""
            self._cancel_check(event)
            require_fingerprint(src, e["source_fp"])
            final_status = e["status"]
            if task["mode"] == "export":
                destination = Path(task["output_root"]) / task_folder_name(task) / e["relative"]
            else:
                destination = src
                if final_status != "success":
                    e["destination"] = str(src)
                    e["result_fp"] = e["source_fp"]
                    return
            e["status"] = "processing"
            if task["mode"] == "backup" and final_status == "success":
                bpath = Path(task["backup_root"]) / task_folder_name(task) / e["relative"]
                if e.get("backup"):
                    # A stopped attempt may have committed its original backup
                    # before it could publish the optimized source. Reuse only
                    # the exact verified backup from this task; never replace it.
                    if e["backup"] != str(bpath) or not e.get("backup_fp"):
                        raise ValueError("已有备份状态无法核对，已跳过续做；请检查该任务备份")
                    require_fingerprint(bpath, e["backup_fp"])
                else:
                    e["backup"] = str(bpath)
                    self.save("task", task)
                    commit_file(snap, bpath, exclusive=True, mode=e["file_mode"])
                    e["backup_fp"] = fingerprint(bpath)
                    self.save("task", task)
            e["destination"] = str(destination)
            e["planned_fp"] = fingerprint(result)
            e["planned_status"] = final_status
            e["status"] = "committing"
            self.save("task", task)
            def before():
                self._cancel_check(event)
                require_fingerprint(src, e["source_fp"])
            e["result_fp"] = commit_file(result, destination, before=before,
                                         exclusive=task["mode"] == "export", mode=e["file_mode"])
            if not same_content(e["result_fp"], e["planned_fp"]):
                raise ValueError("提交后文件发生变化，不能确认处理成功")
            e["result_size"] = e["result_fp"]["size"]
            e["status"] = final_status
            if final_status == "success":
                with self.db() as db:
                    db.execute("INSERT OR IGNORE INTO processed VALUES (?,?)", (e["result_fp"]["sha256"], key))

    def _run(self, task, event):
        # Only this worker's media/PDF children can observe its cancellation.
        # Atomic file publication and the following database saves keep their
        # existing safe boundaries and never run inside a killable child.
        with cancel_scope(event):
            self._run_owned(task, event)

    def _run_owned(self, task, event):
        try:
            for e in task["entries"]:
                if e["status"] != "pending":
                    continue
                if event.is_set():
                    e.update(status="cancelled", reason="退出后保留，可手动继续" if self.closing.is_set() else "取消剩余任务")
                    self.save("task", task)
                    continue
                task["current"] = e["relative"]
                self.save("task", task)
                started = time.monotonic()
                try:
                    e["status"] = "processing"
                    self._process(task, e, event)
                except InterruptedError as ex:
                    e.update(status="cancelled", reason="退出后保留，可手动继续" if self.closing.is_set() else str(ex))
                except Exception as ex:
                    e.update(status="failed", reason=str(ex))
                e["elapsed"] = round(time.monotonic() - started, 3)
                self.save("task", task)
            task.update(status="cancelled" if event.is_set() else "completed", current=None,
                        stop_reason=("exit" if self.closing.is_set() else "user") if event.is_set() else None)
            self.save("task", task)
        except Exception as ex:
            task.update(status="interrupted", current=None, error=str(ex))
            try:
                self.save("task", task)
            except Exception:
                pass
        finally:
            with self._lifecycle_lock:
                self.events.pop(task["id"], None)
            self.worker_lock.release()

    def cancel(self, task_id):
        with self._lifecycle_lock:
            if task_id not in self.events:
                raise ValueError("该任务已结束，不能取消")
            self.events[task_id].set()

    def resume(self, task_id):
        """Explicitly continue this task's untouched remainder after a stop.

        Completed entries and their task-owned destinations/backups stay in
        place. Every resumed file still passes the normal source fingerprint,
        result validation, backup and atomic-commit checks in _process.
        """
        with self._lifecycle_lock:
            self._require_open()
            if not self.worker_lock.acquire(blocking=False):
                raise ValueError("已有处理或恢复任务正在运行")
            try:
                task = self.get("task", task_id)
                if task["status"] not in {"cancelled", "interrupted"}:
                    raise ValueError("只有已停止或已中断的任务可以继续")
                self._source_root(task)
                target = task.get("output_root") if task["mode"] == "export" else task.get("backup_root") if task["mode"] == "backup" else None
                if target is not None and not absolute(target).is_dir():
                    raise ValueError("原输出或备份目录已不存在，请先检查任务位置，再建立新任务")
                remainder = [e for e in task["entries"] if e["status"] == "cancelled" and e.get("source_fp")]
                if not remainder:
                    raise ValueError("没有可继续的剩余文件；失败或源文件变化的项目请重新扫描")
                for e in remainder:
                    e.update(status="pending", reason="", elapsed=0, result_size=e["size"],
                             destination=None, result_fp=None)
                    for key in ("planned_fp", "planned_status", "actual_params", "result_info"):
                        e.pop(key, None)
                task.update(status="running", current=None, stop_reason=None,
                            resume_count=task.get("resume_count", 0) + 1)
                self.save("task", task)
                event = threading.Event()
                self.events[task_id] = event
                thread = threading.Thread(target=self._run, args=(task, event), daemon=True)
                self.threads[task_id] = thread
                try:
                    thread.start()
                except Exception as error:
                    self.events.pop(task_id, None)
                    self.threads.pop(task_id, None)
                    for e in remainder:
                        if e["status"] == "pending":
                            e.update(status="cancelled", reason="后台任务未能启动，未处理此文件")
                    task.update(status="interrupted", stop_reason="start_failed", current=None,
                                error="后台任务未能启动：" + str(error))
                    self.save("task", task)
                    raise ValueError("无法继续后台任务，请检查系统资源后重试") from error
                return task_id
            except Exception:
                self.worker_lock.release()
                raise

    def _require_open(self):
        if self.closing.is_set():
            raise ValueError("程序正在安全退出，不能开始新的处理或恢复任务")

    def begin_shutdown(self):
        """Close admission and cancel uncommitted work; safe to call repeatedly."""
        with self._lifecycle_lock:
            self.closing.set()
            for event in self.events.values():
                event.set()

    def wait_shutdown(self, timeout=None):
        """Wait for admitted work and synchronous file transactions to finish.

        Never wait with the database lock held: workers need it to persist the
        final result after replacement. A timeout leaves the app closing and
        returns False; callers must keep waiting, not kill a committing worker.
        HTTP request draining must also finish before the launcher exits, since
        import cleanup and record deletion are synchronous request operations.
        """
        deadline = None if timeout is None else time.monotonic() + max(0, timeout)
        with self._lifecycle_lock:
            threads = tuple(self.threads.values())
        for thread in threads:
            if thread is threading.current_thread():
                raise RuntimeError("不能在媒体处理线程中等待自身退出")
            remaining = None if deadline is None else max(0, deadline - time.monotonic())
            thread.join(remaining)
            if thread.is_alive():
                return False
        remaining = None if deadline is None else max(0, deadline - time.monotonic())
        acquired = self.worker_lock.acquire() if remaining is None else self.worker_lock.acquire(timeout=remaining)
        if acquired:
            self.worker_lock.release()
        return acquired

    def wait(self, task_id, timeout=60):
        self.threads[task_id].join(timeout)
        if self.threads[task_id].is_alive():
            raise TimeoutError("任务未在限定时间结束")
        return self.get("task", task_id)

    def restore(self, task_id, entry_id=None):
        # Restores run on the HTTP request thread, not in self.threads. Admit
        # under the same gate and let wait_shutdown drain worker_lock afterward.
        with self._lifecycle_lock:
            self._require_open()
            if not self.worker_lock.acquire(blocking=False):
                raise ValueError("已有处理或恢复任务正在运行")
        try:
            task = self.get("task", task_id)
            if task["mode"] != "backup":
                raise ValueError("该任务没有覆盖前备份，不能恢复")
            task["status"] = "restoring"
            self.save("task", task)
            matched = False
            for e in task["entries"]:
                if entry_id and e["id"] != entry_id:
                    continue
                matched = True
                if not e.get("backup") or e["status"] not in {"success", "restore_conflict"}:
                    continue
                try:
                    self._root(task["root"])
                    require_fingerprint(e["source"], e["result_fp"])
                    require_fingerprint(e["backup"], e["backup_fp"])
                    e["status"] = "restoring"
                    self.save("task", task)
                    def before():
                        require_fingerprint(e["source"], e["result_fp"])
                        require_fingerprint(e["backup"], e["backup_fp"])
                    e["result_fp"] = commit_file(e["backup"], e["source"], before=before, mode=e["file_mode"])
                    if not same_content(e["result_fp"], e["source_fp"]):
                        raise ValueError("恢复提交后文件发生变化")
                    e.update(status="restored", result_info=e["info"], result_size=e["size"], reason="已从任务备份恢复，备份仍保留")
                except Exception as ex:
                    e.update(status="restore_conflict", reason="恢复跳过：" + str(ex))
                self.save("task", task)
            task["status"] = "completed"
            self.save("task", task)
            if entry_id and not matched:
                raise ValueError("文件记录不存在")
            return task
        finally:
            self.worker_lock.release()

    def preview(self, task_id, entry_id, slot):
        task = self.get("task", task_id)
        self._source_root(task, require_available=slot != "result")
        e = next((e for e in task["entries"] if e["id"] == entry_id), None)
        if not e or e["status"] not in {"success", "no_gain", "duplicate", "restored", "restore_conflict"}:
            raise ValueError("该文件没有可用预览")
        if slot == "original":
            if task["mode"] == "export" or e["status"] in {"no_gain", "duplicate", "restored"}:
                p, fp = e["source"], e["source_fp"]
                if e["status"] == "restored":
                    fp = e["result_fp"]
            elif e.get("backup"):
                p, fp = e["backup"], e["backup_fp"]
            else:
                raise ValueError("原文件未保留，无法提供前后对比")
        elif slot == "result":
            p, fp = e["destination"], e["result_fp"]
        else:
            raise ValueError("未知预览槽位")
        p = absolute(p)
        allowed = [Path(task["root"])]
        if task.get("output_root"):
            allowed.append(Path(task["output_root"]) / task_folder_name(task))
        if task.get("backup_root"):
            allowed.append(Path(task["backup_root"]) / task_folder_name(task))
        if not any(inside(p, root) for root in allowed):
            raise ValueError("预览路径越界")
        require_fingerprint(p, fp)
        return p, fp

    def report(self, task_id):
        task = self.get("task", task_id)
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["relative_path", "type", "original_bytes", "result_bytes", "saved_percent", "status", "reason", "seconds", "parameters"])
        for e in task["entries"]:
            def safe(v):
                s = str(v)
                return "'" + s if s and (s[0] in "=+-@\t\r\n" or s.lstrip().startswith(("=", "+", "-", "@"))) else s
            saved = (e["size"] - e["result_size"]) / e["size"] * 100 if e["size"] else 0
            reason = e["reason"]
            for raw, label in [(str(self.data_dir), "[运行数据]"), (task["root"], "[媒体目录]"), (task.get("output_root"), "[输出目录]"), (task.get("backup_root"), "[备份目录]")]:
                if raw:
                    reason = reason.replace(raw, label)
            w.writerow([safe(e["relative"]), e["kind"], e["size"], e["result_size"] if e.get("result_fp") else "", round(saved, 2) if e.get("result_fp") else "",
                        e["status"], safe(reason), e["elapsed"], safe(json.dumps(e.get("actual_params", {}), ensure_ascii=False))])
        return "\ufeff" + out.getvalue()
