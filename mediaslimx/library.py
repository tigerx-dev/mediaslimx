"""List organization and explicit task-record deletion; media files stay intact."""
import hashlib
import hmac
import json
import re


ACTIVE_TASKS = {"running", "cancelling", "restoring"}
FINISHED_TASKS = {"completed", "cancelled", "interrupted"}


class ListLibrary:
    def __init__(self, engine):
        self.engine = engine
        with engine.lock, engine.db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS list_state (
                kind TEXT NOT NULL, key TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
                hidden INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,key))""")

    def _states(self, kind, db):
        return {key: {"pinned": bool(pin), "hidden": bool(hidden)}
                for key, pin, hidden in db.execute(
                    "SELECT key,pinned,hidden FROM list_state WHERE kind=?", (kind,))}

    def tasks(self, hidden=False):
        with self.engine.lock, self.engine.db() as db:
            states = self._states("task", db)
            records = self.engine.all("task")
        result = []
        for task in records:
            flags = states.get(task["id"], {"pinned": False, "hidden": False})
            if flags["hidden"] != hidden:
                continue
            result.append({k: task[k] for k in ("id", "created", "root", "status", "mode")} | flags | {"source_kind": task.get("source_kind", "directory"), "source_label": task.get("source_label"), "stop_reason": task.get("stop_reason")})
        return sorted(result, key=lambda t: (not t["pinned"], -t["created"], t["id"]))

    def pin_task(self, task_id, pinned):
        with self.engine.lock, self.engine.db() as db:
            self.engine.get("task", task_id)
            self._pin(db, "task", task_id, pinned)
        return {"ok": True}

    def clear_tasks(self, task_ids):
        cleared, protected = [], []
        with self.engine.lock, self.engine.db() as db:
            states = self._states("task", db)
            for key in dict.fromkeys(task_ids):
                row = db.execute("SELECT data FROM records WHERE kind='task' AND id=?", (key,)).fetchone()
                if not row:
                    continue
                task = json.loads(row[0])
                flags = states.get(key, {})
                # Recheck at commit time, not just when the confirmation was opened.
                if flags.get("pinned") or task["status"] not in FINISHED_TASKS:
                    protected.append(key)
                    continue
                if flags.get("hidden"):
                    continue
                self._hide(db, "task", key)
                cleared.append(key)
        return {"cleared": cleared, "protected": protected}

    def restore_task(self, task_id):
        with self.engine.lock, self.engine.db() as db:
            self.engine.get("task", task_id)
            db.execute("UPDATE list_state SET hidden=0 WHERE kind='task' AND key=?", (task_id,))
        return {"ok": True}

    @staticmethod
    def _delete_key(task_id):
        if not isinstance(task_id, str) or not re.fullmatch(r"[0-9a-f]{32}", task_id):
            raise ValueError("无效任务标识")

    def _deletion_record(self, db, task_id):
        row = db.execute("SELECT data FROM records WHERE kind='task' AND id=?", (task_id,)).fetchone()
        if not row:
            return None
        task = json.loads(row[0])
        flags = db.execute("SELECT pinned,hidden FROM list_state WHERE kind='task' AND key=?", (task_id,)).fetchone()
        pinned, hidden = flags if flags else (0, 0)
        if pinned:
            raise ValueError("固定任务不能删除记录，请先取消固定并归档")
        if not hidden:
            raise ValueError("仅已归档任务可以彻底删除记录，请先归档")
        if task["status"] not in FINISHED_TASKS:
            raise ValueError("进行中或恢复中的任务不能删除记录")
        # A worker can publish its final state just before it exits. Waiting for
        # both the state and thread prevents a later save from reviving deletion.
        thread = self.engine.threads.get(task_id)
        if thread is not None and thread.is_alive():
            raise ValueError("任务仍在结束，请稍后重试")
        version = hashlib.sha256((row[0] + f"\n{int(pinned)}:{int(hidden)}").encode("utf-8")).hexdigest()
        return task, version

    def deletion_preview(self, task_id):
        """Describe record-only deletion; no paths are opened or removed."""
        self._delete_key(task_id)
        with self.engine.lock, self.engine.db() as db:
            record = self._deletion_record(db, task_id)
            if record is None:
                raise ValueError("记录已删除或不存在，请刷新归档列表")
            task, version = record
            entries = task["entries"]
            return {"id": task_id, "record_version": version, "created": task["created"],
                    "mode": task["mode"], "source_kind": task.get("source_kind", "directory"),
                    "entry_count": len(entries),
                    "result_count": sum(bool(e.get("result_fp")) for e in entries),
                    "backup_count": sum(bool(e.get("backup")) for e in entries),
                    "restorable_count": sum(bool(e.get("backup")) and e["status"] in {"success", "restore_conflict"} for e in entries),
                    "has_imported_originals": task.get("source_kind") == "import"}

    def delete_record(self, task_id, confirm, record_version):
        """Forget a single archived task, keeping every media file and hash."""
        self._delete_key(task_id)
        if confirm is not True:
            raise ValueError("请先确认：删除记录会失去报告、预览和程序内备份恢复入口，所有文件仍保留")
        if not isinstance(record_version, str) or not re.fullmatch(r"[0-9a-f]{64}", record_version):
            raise ValueError("请先查看删除影响并重新确认")
        # Restore and create share this lock. Acquire in their same order before
        # the metadata transaction so neither can save an old task afterwards.
        if not self.engine.worker_lock.acquire(blocking=False):
            raise ValueError("当前有处理或恢复任务，请在结束后删除记录")
        try:
            with self.engine.lock, self.engine.db() as db:
                db.execute("BEGIN IMMEDIATE")
                record = self._deletion_record(db, task_id)
                if record is None:
                    return {"ok": True, "id": task_id, "deleted": False, "already_absent": True}
                task, version = record
                if not hmac.compare_digest(version, record_version):
                    raise ValueError("任务记录或归档状态已变化，请重新查看删除影响并确认")
                if task.get("source_kind") == "import":
                    # sealed is a durable, minimal 'ever used' bit, not a task
                    # tombstone. Old manifests are sealed in this transaction
                    # too: deleting history must never make originals cleanable.
                    row = db.execute("SELECT data FROM records WHERE kind='import' AND id=?", (task.get("import_id"),)).fetchone()
                    if row:
                        batch = json.loads(row[0])
                        if not batch.get("sealed"):
                            batch["sealed"] = True
                            db.execute("UPDATE records SET data=? WHERE kind='import' AND id=?",
                                       (json.dumps(batch, ensure_ascii=False), batch["id"]))
                db.execute("DELETE FROM records WHERE kind='task' AND id=?", (task_id,))
                db.execute("DELETE FROM list_state WHERE kind='task' AND key=?", (task_id,))
            self.engine.events.pop(task_id, None)
            self.engine.threads.pop(task_id, None)
            return {"ok": True, "id": task_id, "deleted": True}
        finally:
            self.engine.worker_lock.release()

    def directories(self, roots, hidden=False):
        """Roots are supplied by the folder boundary, never by a browser grant."""
        roots = list(roots)
        with self.engine.lock, self.engine.db() as db:
            for index, root in enumerate(roots):
                db.execute("INSERT OR IGNORE INTO list_state(kind,key,pinned) VALUES ('directory',?,?)",
                           (str(root), int(index == 0)))
            flags = self._states("directory", db)
        result = [{"path": str(root), **flags[str(root)]} for root in roots
                  if flags[str(root)]["hidden"] == hidden]
        return sorted(result, key=lambda item: not item["pinned"])

    def _directory_key(self, value):
        # Exact authorized root only. This operation cannot grant or revoke scope.
        from .paths import absolute
        path = absolute(value)
        for root in self.engine.roots:
            if path == root:
                return str(root)
        raise ValueError("该目录不在已允许范围中，不能添加快捷入口")

    def pin_directory(self, value, pinned):
        with self.engine.lock, self.engine.db() as db:
            self._pin(db, "directory", self._directory_key(value), pinned)
        return {"ok": True}

    def clear_directories(self, values):
        cleared, protected = [], []
        # Initialize defaults even if a client calls clear before opening browse.
        self.directories(self.engine.roots)
        with self.engine.lock, self.engine.db() as db:
            states = self._states("directory", db)
            for value in dict.fromkeys(values):
                key = self._directory_key(value)
                flags = states.get(key, {})
                if flags.get("pinned"):
                    protected.append(key)
                elif not flags.get("hidden"):
                    self._hide(db, "directory", key)
                    cleared.append(key)
        return {"cleared": cleared, "protected": protected}

    def restore_directory(self, value):
        with self.engine.lock, self.engine.db() as db:
            key = self._directory_key(value)
            db.execute("UPDATE list_state SET hidden=0 WHERE kind='directory' AND key=?", (key,))
        return {"ok": True}

    @staticmethod
    def _pin(db, kind, key, pinned):
        db.execute("""INSERT INTO list_state(kind,key,pinned,hidden) VALUES (?,?,?,0)
                      ON CONFLICT(kind,key) DO UPDATE SET pinned=excluded.pinned,
                      hidden=CASE WHEN excluded.pinned=1 THEN 0 ELSE list_state.hidden END""",
                   (kind, key, int(pinned)))

    @staticmethod
    def _hide(db, kind, key):
        db.execute("""INSERT INTO list_state(kind,key,hidden) VALUES (?,?,1)
                      ON CONFLICT(kind,key) DO UPDATE SET hidden=1""", (kind, key))
