"""Record deletion forgets history only, with explicit consent and race guards."""
import asyncio
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

from PIL import Image

from mediaslimx.engine import Engine
from mediaslimx.imports import ImportManager
from mediaslimx.library import ListLibrary

PARAMS = {"preset": "balanced", "max_width": None, "max_height": None}


class RecordDeletionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.root = self.base / "source"
        self.root.mkdir()
        self.source = self.root / "photo.jpg"
        Image.new("RGB", (640, 480), (180, 60, 20)).save(self.source, quality=100)
        self.engine = Engine(self.base / "data", [self.root])
        self.library = ListLibrary(self.engine)
        self.imports = ImportManager(self.engine)

    def tearDown(self):
        self.temporary.cleanup()

    def create(self, mode="export", scan=None):
        scan = scan or self.engine.scan(str(self.root))
        key = self.engine.create(scan["id"], [e["id"] for e in scan["entries"] if e["status"] == "ready"],
                                 PARAMS, mode, output=str(self.base / "exports"), backup=str(self.base / "backups"))
        return self.engine.wait(key)

    def archive(self, task):
        self.assertEqual(self.library.clear_tasks([task["id"]])["cleared"], [task["id"]])
        return self.library.deletion_preview(task["id"])

    def delete(self, task, preview=None):
        preview = preview or self.archive(task)
        return self.library.delete_record(task["id"], True, preview["record_version"])

    def fingerprints(self):
        return {str(p.relative_to(self.base)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.base.rglob("*") if p.is_file() and p.suffix.lower() == ".jpg"}

    def test_export_deletion_preserves_files_scans_hashes_exclusions_and_other_task(self):
        original = self.source.read_bytes()
        task = self.create()
        other = self.create()
        entry = task["entries"][0]
        self.assertEqual(entry["status"], "success", entry["reason"])
        before = self.fingerprints()
        scans = self.engine.all("scan")
        with self.engine.db() as db:
            processed = db.execute("SELECT * FROM processed").fetchall()
        exclusions = self.engine.exclusions()
        preview = self.archive(task)
        self.assertEqual(preview["result_count"], 1)
        self.assertEqual(preview["backup_count"], 0)
        self.assertFalse(preview["has_imported_originals"])
        self.assertTrue(self.delete(task, preview)["deleted"])
        self.assertEqual(self.fingerprints(), before)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(self.engine.all("scan"), scans)
        self.assertEqual(self.engine.get("task", other["id"])["id"], other["id"])
        self.assertEqual(self.engine.exclusions(), exclusions)
        with self.engine.db() as db:
            self.assertEqual(db.execute("SELECT * FROM processed").fetchall(), processed)
            self.assertIsNone(db.execute("SELECT 1 FROM list_state WHERE kind='task' AND key=?", (task["id"],)).fetchone())
        self.assertNotIn(task["id"], self.engine.threads)
        self.assertNotIn(task["id"], self.engine.events)
        for action in [lambda: self.engine.get("task", task["id"]), lambda: self.engine.report(task["id"]),
                       lambda: self.engine.preview(task["id"], entry["id"], "result"),
                       lambda: self.engine.restore(task["id"]), lambda: self.library.deletion_preview(task["id"])]:
            with self.assertRaisesRegex(ValueError, "记录"):
                action()
        restarted = Engine(self.engine.data_dir, [self.root])
        self.assertEqual([t["id"] for t in restarted.all("task")], [other["id"]])
        self.assertEqual(self.fingerprints(), before)

    def test_backup_deletion_preserves_optimized_source_and_original_backup(self):
        original = self.source.read_bytes()
        task = self.create("backup")
        entry = task["entries"][0]
        self.assertEqual(entry["status"], "success", entry["reason"])
        self.assertEqual(Path(entry["backup"]).read_bytes(), original)
        before = self.fingerprints()
        preview = self.archive(task)
        self.assertEqual(preview["backup_count"], 1)
        self.assertEqual(preview["restorable_count"], 1)
        self.delete(task, preview)
        self.assertEqual(self.fingerprints(), before)
        self.assertNotEqual(self.source.read_bytes(), original)
        self.assertEqual(Path(entry["backup"]).read_bytes(), original)
        with self.assertRaisesRegex(ValueError, "记录不存在"):
            self.engine.restore(task["id"])

    def test_deleted_import_remains_protected_from_cleanup_and_after_restart(self):
        data = self.source.read_bytes()
        allocation = self.imports.allocate([{"name": "photo.jpg", "size": len(data)}])
        async def chunks():
            yield data
        asyncio.run(self.imports.receive(allocation["id"], allocation["files"][0]["id"], chunks()))
        task = self.create(scan=self.imports.scan(allocation["id"]))
        before = self.fingerprints()
        preview = self.archive(task)
        self.assertTrue(preview["has_imported_originals"])
        self.delete(task, preview)
        for manager in [self.imports, ImportManager(Engine(self.engine.data_dir, [self.root]))]:
            self.assertNotIn(allocation["id"], [b["id"] for b in manager.unused()])
            self.assertEqual(manager.clear_unused([allocation["id"]]), {"cleared": [], "protected": [allocation["id"]]})
            with self.assertRaisesRegex(ValueError, "不能作为未使用导入清理"):
                manager.discard(allocation["id"])
            with self.assertRaises(ValueError):
                manager.archive(task["id"])
        self.assertEqual(self.fingerprints(), before)
        # Normal genuinely-unused imports remain eligible; no global cleanup ban.
        unused = self.imports.allocate([{"name": "unused.jpg", "size": len(data)}])
        self.assertEqual(self.imports.clear_unused([unused["id"]])["cleared"], [unused["id"]])

    def test_legacy_import_manifest_is_sealed_in_same_delete_transaction(self):
        task = self.create()
        batch = self.imports.allocate([{"name": "old.jpg", "size": 100}])
        task.update(source_kind="import", import_id=batch["id"])
        self.engine.save("task", task)
        self.assertFalse(self.engine.get("import", batch["id"])["sealed"])
        self.delete(task)
        self.assertTrue(self.engine.get("import", batch["id"])["sealed"])
        self.assertEqual(self.imports.unused(), [])
        self.assertEqual(self.imports.clear_unused([batch["id"]])["protected"], [batch["id"]])

    def test_requires_archive_not_pin_consent_and_current_version(self):
        task = self.create()
        key = task["id"]
        with self.assertRaisesRegex(ValueError, "仅已归档"):
            self.library.deletion_preview(key)
        preview = self.archive(task)
        for confirm in [False, None, 1, "true"]:
            with self.subTest(confirm=confirm), self.assertRaisesRegex(ValueError, "请先确认"):
                self.library.delete_record(key, confirm, preview["record_version"])
        with self.assertRaisesRegex(ValueError, "重新确认"):
            self.library.delete_record(key, True, "invalid")
        self.library.pin_task(key, True)
        for action in [lambda: self.library.deletion_preview(key), lambda: self.delete(task, preview)]:
            with self.assertRaisesRegex(ValueError, "固定任务"):
                action()
        self.library.pin_task(key, False)
        self.library.clear_tasks([key])
        task["entries"][0]["reason"] = "record was updated"
        self.engine.save("task", task)
        with self.assertRaisesRegex(ValueError, "已变化"):
            self.delete(task, preview)
        new = self.library.deletion_preview(key)
        self.assertNotEqual(new["record_version"], preview["record_version"])
        self.assertTrue(self.delete(task, new)["deleted"])

    def test_unarchive_after_preview_protects_record(self):
        task = self.create()
        preview = self.archive(task)
        self.library.restore_task(task["id"])
        with self.assertRaisesRegex(ValueError, "仅已归档"):
            self.delete(task, preview)
        self.assertEqual(self.engine.get("task", task["id"])["status"], "completed")

    def test_busy_worker_and_terminal_publication_cannot_revive_deleted_record(self):
        task = self.create()
        preview = self.archive(task)
        self.engine.worker_lock.acquire()
        try:
            with self.assertRaisesRegex(ValueError, "处理或恢复"):
                self.delete(task, preview)
        finally:
            self.engine.worker_lock.release()
        published, release = threading.Event(), threading.Event()
        def finishing():
            published.set()
            release.wait(5)
            self.engine.save("task", task)
        worker = threading.Thread(target=finishing)
        self.engine.threads[task["id"]] = worker
        worker.start()
        try:
            self.assertTrue(published.wait(5))
            with self.assertRaisesRegex(ValueError, "仍在结束"):
                self.delete(task, preview)
        finally:
            release.set()
            worker.join(5)
        # The worker has exited, so no subsequent worker save can resurrect it.
        self.assertTrue(self.delete(task, preview)["deleted"])
        restarted = Engine(self.engine.data_dir, [self.root])
        self.assertEqual(restarted.all("task"), [])

    def test_restore_race_is_blocked_and_changes_confirmation_version(self):
        task = self.create("backup")
        preview = self.archive(task)
        started, release = threading.Event(), threading.Event()
        from mediaslimx.engine import commit_file
        failure = []
        def paused_commit(*args, **kwargs):
            started.set()
            if not release.wait(5):
                raise RuntimeError("test synchronization timed out")
            return commit_file(*args, **kwargs)
        def restore():
            try:
                self.engine.restore(task["id"])
            except Exception as exc:
                failure.append(exc)
        with patch("mediaslimx.engine.commit_file", side_effect=paused_commit):
            thread = threading.Thread(target=restore)
            thread.start()
            try:
                self.assertTrue(started.wait(5))
                with self.assertRaisesRegex(ValueError, "处理或恢复"):
                    self.delete(task, preview)
            finally:
                release.set()
                thread.join(10)
        self.assertEqual(failure, [])
        with self.assertRaisesRegex(ValueError, "已变化"):
            self.delete(task, preview)
        current = self.library.deletion_preview(task["id"])
        self.assertEqual(current["restorable_count"], 0)
        self.assertTrue(self.delete(task, current)["deleted"])

    def test_active_and_unknown_statuses_cannot_be_deleted(self):
        task = self.create()
        preview = self.archive(task)
        for status in ["running", "cancelling", "restoring", "queued", "unknown"]:
            task["status"] = status
            self.engine.save("task", task)
            with self.subTest(status=status), self.assertRaisesRegex(ValueError, "进行中或恢复中"):
                self.delete(task, preview)
        task["status"] = "completed"
        self.engine.save("task", task)

    def test_repeat_confirmation_is_safe_and_invalid_ids_do_not_access_paths(self):
        task = self.create()
        preview = self.archive(task)
        self.assertTrue(self.delete(task, preview)["deleted"])
        repeated = self.delete(task, preview)
        self.assertFalse(repeated["deleted"])
        self.assertTrue(repeated["already_absent"])
        for key in ["../tasks.sqlite3", "/absolute", "not-a-task", "A" * 32]:
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "无效任务"):
                self.library.deletion_preview(key)
            with self.assertRaisesRegex(ValueError, "无效任务"):
                self.library.delete_record(key, True, preview["record_version"])
        self.assertEqual(self.library.tasks(hidden=True), [])


class RecordDeletionHTTPTests(unittest.TestCase):
    """Use a real isolated server, avoiding test-only HTTP-client dependencies."""
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.base = Path(cls.temporary.name)
        cls.root = cls.base / "source"
        cls.root.mkdir()
        Image.new("RGB", (640, 480), "red").save(cls.root / "photo.jpg", quality=100)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.token = "record-delete-private-test-token"
        cls.url = f"http://127.0.0.1:{cls.port}"
        code = "from mediaslimx.engine import Engine; from mediaslimx.app import create_app; import uvicorn,sys; e=Engine(sys.argv[1],[sys.argv[2]]); uvicorn.run(create_app(e,sys.argv[3],int(sys.argv[4])),host='127.0.0.1',port=int(sys.argv[4]),log_level='error',access_log=False)"
        cls.process = subprocess.Popen([sys.executable, "-c", code, str(cls.base / "data"), str(cls.root), cls.token, str(cls.port)],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            try:
                cls.request("/api/environment")
                break
            except (urllib.error.URLError, ConnectionError):
                time.sleep(.05)
        else:
            raise RuntimeError("isolated record deletion test server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)
        cls.process.stderr.close()
        cls.temporary.cleanup()

    @classmethod
    def request(cls, path, body=None, headers=None, auth=True, method=None):
        values = {"X-MediaSlimX-Token": cls.token} if auth else {}
        if body is not None:
            values["Content-Type"] = "application/json"
        values.update(headers or {})
        request = urllib.request.Request(cls.url + path, data=json.dumps(body).encode() if body is not None else None,
                                         headers=values, method=method)
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read()
            return response.status, json.loads(data) if response.headers.get_content_type() == "application/json" else data

    def task(self):
        _, scan = self.request("/api/scans", {"path": str(self.root)})
        _, result = self.request("/api/tasks", {"scan_id": scan["id"], "selected": [e["id"] for e in scan["entries"]],
                                                "output": str(self.base / "export")})
        for _ in range(100):
            _, task = self.request("/api/tasks/" + result["id"])
            if task["status"] == "completed":
                break
            time.sleep(.02)
        self.assertEqual(task["status"], "completed")
        self.request("/api/tasks/clear-history", {"task_ids": [task["id"]]})
        return task

    def test_guards_strict_confirmation_old_endpoints_and_files_remain(self):
        task = self.task()
        key = task["id"]
        preview_path = f"/api/tasks/{key}/deletion-preview"
        delete_path = f"/api/tasks/{key}/delete-record"
        _, preview = self.request(preview_path)
        self.assertEqual(preview["entry_count"], 1)
        body = {"confirm": True, "record_version": preview["record_version"]}
        for path, value in [(preview_path, None), (delete_path, body)]:
            for headers, auth, status in [({}, False, 401), ({"Origin": "https://evil.example"}, True, 403),
                                           ({"Host": "evil.example"}, True, 403), ({"Sec-Fetch-Site": "cross-site"}, True, 403)]:
                with self.subTest(path=path, headers=headers), self.assertRaises(urllib.error.HTTPError) as raised:
                    self.request(path, value, headers, auth)
                self.assertEqual(raised.exception.code, status)
        for bad, status in [({"record_version": preview["record_version"]}, 422),
                            ({**body, "confirm": False}, 400), ({**body, "confirm": "true"}, 422),
                            ({**body, "confirm": 1}, 422), ({**body, "record_version": "0" * 64}, 400),
                            ({**body, "record_version": "bad"}, 422), ({**body, "delete_files": True}, 422)]:
            with self.subTest(body=bad), self.assertRaises(urllib.error.HTTPError) as raised:
                self.request(delete_path, bad)
            self.assertEqual(raised.exception.code, status)
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.request(delete_path)
        self.assertEqual(raised.exception.code, 405)
        before = {p: p.read_bytes() for p in [self.root / "photo.jpg", Path(task["entries"][0]["destination"])]}
        self.assertTrue(self.request(delete_path, body)[1]["deleted"])
        self.assertTrue(self.request(delete_path, body)[1]["already_absent"])
        for path in [preview_path, f"/api/tasks/{key}", f"/api/tasks/{key}/report.csv",
                     f"/api/tasks/{key}/preview/{task['entries'][0]['id']}/result"]:
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as raised:
                self.request(path)
            self.assertEqual(raised.exception.code, 400)
        with self.assertRaises(urllib.error.HTTPError):
            self.request(f"/api/tasks/{key}/restore", {})
        self.assertEqual({p: p.read_bytes() for p in before}, before)
        self.assertNotIn(key, [t["id"] for t in self.request("/api/tasks?hidden=true")[1]])


if __name__ == "__main__":
    unittest.main()
