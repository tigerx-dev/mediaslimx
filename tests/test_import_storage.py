"""Explicit private-copy release: consent, byte boundaries, failure and persistence."""
import asyncio
import hashlib
import io
import json
import os
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
import zipfile

from PIL import Image

from mediaslimx.engine import Engine
from mediaslimx.imports import ImportManager
from mediaslimx.library import ListLibrary

PARAMS = {"preset": "balanced", "max_width": None, "max_height": None}


class ImportStorageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.root = self.base / "source"
        self.root.mkdir()
        self.original = self.root / "photo.jpg"
        Image.new("RGB", (640, 480), (180, 60, 20)).save(self.original, quality=100)
        self.data = self.original.read_bytes()
        self.engine = Engine(self.base / "data", [self.root])
        self.imports = ImportManager(self.engine)
        self.library = ListLibrary(self.engine)

    def tearDown(self):
        self.temporary.cleanup()

    def allocate(self, count=1, uploaded=True):
        result = self.imports.allocate([{"name": f"photo{index}.jpg", "size": len(self.data)} for index in range(count)])
        if uploaded:
            async def stream():
                yield self.data
            for item in result["files"]:
                asyncio.run(self.imports.receive(result["id"], item["id"], stream()))
        return result

    def used(self, count=1):
        batch = self.allocate(count)
        scan = self.imports.scan(batch["id"])
        key = self.engine.create(scan["id"], [scan["entries"][0]["id"]], PARAMS,
                                 "export", output=str(self.base / "exports"))
        task = self.engine.wait(key)
        return batch, scan, task

    def release(self, batch, preview=None):
        preview = preview or self.imports.release_preview(batch["id"])
        return self.imports.release(batch["id"], True, preview["record_version"])

    def test_used_release_preserves_original_results_reports_and_duplicate_fingerprints(self):
        batch, scan, task = self.used(2)
        entry = task["entries"][0]
        report = self.engine.report(task["id"])
        result = Path(entry["destination"])
        result_bytes = result.read_bytes()
        source_bytes = self.original.read_bytes()
        with self.engine.db() as db:
            processed = db.execute("SELECT * FROM processed").fetchall()
        view = self.imports.release_preview(batch["id"])
        self.assertTrue(view["can_release"], view["protected_reason"])
        self.assertEqual(view["unexported_files"], 1)
        self.assertEqual(view["task_count"], 1)
        self.assertNotIn(str(self.base), json.dumps(view))
        self.assertEqual(view["bytes"], 2 * len(self.data))
        self.assertEqual(self.release(batch, view)["released_bytes"], 2 * len(self.data))
        self.assertEqual(self.original.read_bytes(), source_bytes)
        self.assertEqual(result.read_bytes(), result_bytes)
        self.assertEqual(self.engine.report(task["id"]), report)
        self.assertEqual(self.engine.preview(task["id"], entry["id"], "result")[0], result)
        with self.assertRaisesRegex(ValueError, "副本已清理"):
            self.engine.preview(task["id"], entry["id"], "original")
        archive = self.imports.archive(task["id"])
        with zipfile.ZipFile(archive) as data:
            self.assertEqual(data.read(entry["relative"]), result_bytes)
            self.assertEqual(data.read("report.csv").decode(), report)
        archive.unlink()
        self.assertEqual(self.engine.get("task", task["id"])["status"], "completed")
        with self.engine.db() as db:
            self.assertEqual(db.execute("SELECT * FROM processed").fetchall(), processed)
        self.assertEqual(self.imports.storage()["usage_bytes"], 0)
        self.assertEqual(self.imports.storage()["reserved_bytes"], 0)
        self.assertTrue(self.imports.storage()["usage_complete"])
        self.assertEqual(self.engine.get("import", batch["id"])["state"], "released")
        self.assertTrue(self.release(batch, view)["already_released"])
        for action in [lambda: self.imports.scan(batch["id"]),
                       lambda: self.imports.allocate([{"name": "new.jpg", "size": len(self.data)}], batch["id"]),
                       lambda: self.engine.create(scan["id"], [entry["id"]], PARAMS, "export", output=str(self.base / "other"))]:
            with self.assertRaises(ValueError):
                action()

    def test_unrelated_backup_task_and_its_restore_remain_usable(self):
        scan = self.engine.scan(str(self.root))
        key = self.engine.create(scan["id"], [scan["entries"][0]["id"]], PARAMS, "backup", backup=str(self.base / "backups"))
        backed_up = self.engine.wait(key)
        entry = backed_up["entries"][0]
        self.assertEqual(entry["status"], "success")
        backup = Path(entry["backup"])
        before_backup = backup.read_bytes()
        before_source = self.original.read_bytes()
        batch, _, _ = self.used()
        self.release(batch)
        self.assertEqual(backup.read_bytes(), before_backup)
        self.assertEqual(self.original.read_bytes(), before_source)
        self.assertIn("relative_path,", self.engine.report(key))
        self.engine.restore(key)
        self.assertEqual(self.original.read_bytes(), self.data)
        self.assertEqual(backup.read_bytes(), before_backup)

    def test_release_holds_worker_lock_before_any_bytes_are_removed(self):
        batch = self.allocate()
        scan = self.imports.scan(batch["id"])
        preview = self.imports.release_preview(batch["id"])
        entered, proceed = threading.Event(), threading.Event()
        save = self.engine.save
        failures = []
        def paused_save(kind, record):
            if kind == "import" and record.get("state") == "releasing":
                entered.set()
                if not proceed.wait(5):
                    raise RuntimeError("synchronization timed out")
            return save(kind, record)
        def clean():
            try:
                self.release(batch, preview)
            except BaseException as exc:
                failures.append(exc)
        with patch.object(self.engine, "save", side_effect=paused_save):
            thread = threading.Thread(target=clean); thread.start()
            try:
                self.assertTrue(entered.wait(5))
                with self.assertRaisesRegex(ValueError, "处理或恢复"):
                    self.engine.create(scan["id"], [scan["entries"][0]["id"]], PARAMS, "export", output=str(self.base / "export"))
            finally:
                proceed.set(); thread.join(10)
        self.assertEqual(failures, [])
        self.assertFalse(thread.is_alive())
        self.assertEqual(self.imports.storage()["reserved_bytes"], 0)

    def test_quota_released_for_pending_and_uploaded_batches_survives_restart(self):
        with patch("mediaslimx.imports.MAX_STORED_BYTES", len(self.data)):
            batch = self.allocate(uploaded=False)
            storage = self.imports.storage()
            self.assertEqual(storage["usage_bytes"], 0)
            self.assertEqual(storage["reserved_bytes"], len(self.data))
            with self.assertRaisesRegex(ValueError, "空间管理"):
                self.allocate()
            self.release(batch)
            self.allocate()
        engine = Engine(self.engine.data_dir, [self.root])
        manager = ImportManager(engine)
        self.assertEqual(engine.get("import", batch["id"])["state"], "released")
        self.assertNotIn(batch["id"], [b["id"] for b in manager.unused()])
        self.assertEqual(manager.clear_unused([batch["id"]])["protected"], [batch["id"]])
        self.assertEqual(manager.storage()["reserved_bytes"], len(self.data))

    def test_deleted_record_stays_sealed_but_explicit_release_is_available(self):
        batch, _, task = self.used()
        self.library.clear_tasks([task["id"]])
        view = self.library.deletion_preview(task["id"])
        self.library.delete_record(task["id"], True, view["record_version"])
        manager = ImportManager(Engine(self.engine.data_dir, [self.root]))
        self.assertEqual(manager.unused(), [])
        self.assertEqual(manager.clear_unused([batch["id"]])["protected"], [batch["id"]])
        preview = manager.release_preview(batch["id"])
        self.assertEqual(preview["task_count"], 0)
        self.assertEqual(preview["unexported_files"], 1)
        self.assertTrue(manager.release(batch["id"], True, preview["record_version"])["released"])
        self.assertEqual(self.original.read_bytes(), self.data)
        self.assertTrue(Path(task["entries"][0]["destination"]).is_file())

    def test_confirmation_version_and_invalid_identifiers(self):
        batch = self.allocate()
        view = self.imports.release_preview(batch["id"])
        for confirm in (False, None, 1, "true"):
            with self.subTest(confirm=confirm), self.assertRaisesRegex(ValueError, "请先确认"):
                self.imports.release(batch["id"], confirm, view["record_version"])
        for version in (None, "bad", "0" * 64):
            with self.subTest(version=version), self.assertRaises(ValueError):
                self.imports.release(batch["id"], True, version)
        for key in ("../outside", "A" * 32, "/absolute"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.imports.release_preview(key)
            with self.assertRaises(ValueError):
                self.imports.release(key, True, view["record_version"])
        self.assertEqual(self.imports.storage()["usage_bytes"], len(self.data))

    def test_preview_snapshot_invalidated_by_added_file_or_new_task(self):
        batch = self.allocate()
        preview = self.imports.release_preview(batch["id"])
        added = self.imports.allocate([{"name": "second.jpg", "size": len(self.data)}], batch["id"])
        with self.assertRaisesRegex(ValueError, "已变化"):
            self.release(batch, preview)
        preview = self.imports.release_preview(batch["id"])
        scan = self.imports.scan(batch["id"])
        key = self.engine.create(scan["id"], [scan["entries"][0]["id"]], PARAMS, "export", output=str(self.base / "export"))
        self.engine.wait(key)
        with self.assertRaisesRegex(ValueError, "已变化"):
            self.release(batch, preview)
        self.assertEqual(self.imports.release_preview(batch["id"])["unexported_files"], 1)
        self.assertEqual(added["id"], batch["id"])

    def test_file_bytes_tampered_with_same_size_and_timestamp_fail_hash_verification(self):
        batch = self.allocate()
        item = batch["files"][0]
        path = self.imports._root(batch["id"]) / (item["id"] + ".jpg")
        before = path.stat()
        data = bytearray(path.read_bytes()); data[-1] ^= 1
        path.write_bytes(data)
        os.utime(path, ns=(before.st_atime_ns, before.st_mtime_ns))
        view = self.imports.release_preview(batch["id"])
        self.assertFalse(view["can_release"])
        self.assertIn("校验失败", view["protected_reason"])
        with self.assertRaises(ValueError):
            self.release(batch, view)
        self.assertEqual(path.read_bytes(), bytes(data))
        self.assertEqual(self.original.read_bytes(), self.data)

    def test_file_replacement_and_unregistered_entries_are_never_removed(self):
        batch = self.allocate()
        root = self.imports._root(batch["id"])
        extra = root / "user-notes.txt"; extra.write_text("keep")
        view = self.imports.release_preview(batch["id"])
        self.assertFalse(view["can_release"])
        with self.assertRaisesRegex(ValueError, "未登记"):
            self.release(batch, view)
        self.assertEqual(extra.read_text(), "keep")
        extra.unlink()
        path = next(root.glob("*.jpg"))
        replacement = path.with_name("replacement.jpg")
        replacement.write_bytes(path.read_bytes())
        os.replace(replacement, path)
        view = self.imports.release_preview(batch["id"])
        self.assertFalse(view["can_release"])
        with self.assertRaisesRegex(ValueError, "替换"):
            self.release(batch, view)
        self.assertTrue(path.exists())

    def test_batch_directory_replacement_and_import_container_replacement_are_refused(self):
        batch = self.allocate()
        root = self.imports._root(batch["id"])
        moved = root.with_name("saved-originals")
        root.rename(moved); root.mkdir()
        view = self.imports.release_preview(batch["id"])
        self.assertFalse(view["can_release"])
        self.assertIn("替换", view["protected_reason"])
        root.rmdir(); moved.rename(root)
        imports = self.engine.import_dir
        moved_imports = imports.with_name("saved-imports")
        imports.rename(moved_imports); imports.mkdir()
        view = self.imports.release_preview(batch["id"])
        self.assertFalse(view["can_release"])
        with self.assertRaisesRegex(ValueError, "数据目录已被替换"):
            self.release(batch, view)
        imports.rmdir(); moved_imports.rename(imports)
        self.assertTrue(self.imports.release_preview(batch["id"])["can_release"])

    def test_symlink_and_hardlink_files_cannot_escape_cleanup(self):
        batch = self.allocate()
        path = next(self.imports._root(batch["id"]).glob("*.jpg"))
        original = path.read_bytes(); path.unlink()
        try:
            path.symlink_to(self.original)
        except OSError:
            path.write_bytes(original)
            self.skipTest("current platform does not allow creating symbolic links")
        view = self.imports.release_preview(batch["id"])
        self.assertFalse(view["can_release"])
        with self.assertRaises(ValueError):
            self.release(batch, view)
        self.assertEqual(self.original.read_bytes(), self.data)
        path.unlink()
        os.link(self.original, path)
        view = self.imports.release_preview(batch["id"])
        self.assertFalse(view["can_release"])
        with self.assertRaises(ValueError):
            self.release(batch, view)
        self.assertEqual(self.original.read_bytes(), self.data)

    def test_upload_scan_worker_and_live_thread_are_protected(self):
        batch = self.allocate(uploaded=False)
        view = self.imports.release_preview(batch["id"])
        async def stream():
            active = self.imports.release_preview(batch["id"])
            self.assertFalse(active["can_release"])
            with self.assertRaisesRegex(ValueError, "传入"):
                self.release(batch, view)
            yield self.data
        asyncio.run(self.imports.receive(batch["id"], batch["files"][0]["id"], stream()))
        self.engine.worker_lock.acquire()
        try:
            self.assertFalse(self.imports.release_preview(batch["id"])["can_release"])
            with self.assertRaisesRegex(ValueError, "处理或恢复"):
                self.release(batch, view)
        finally:
            self.engine.worker_lock.release()
        scan = self.imports.scan(batch["id"])
        key = self.engine.create(scan["id"], [scan["entries"][0]["id"]], PARAMS, "export", output=str(self.base / "export"))
        task = self.engine.wait(key)
        stop = threading.Event()
        thread = threading.Thread(target=lambda: stop.wait(5))
        self.engine.threads[key] = thread; thread.start()
        try:
            view = self.imports.release_preview(batch["id"])
            self.assertFalse(view["can_release"])
            with self.assertRaisesRegex(ValueError, "仍在结束"):
                self.release(batch, view)
        finally:
            stop.set(); thread.join(10)
        for state in ("scanning", "releasing"):
            value = self.engine.get("import", batch["id"]); value["state"] = state
            self.engine.save("import", value)
            self.assertFalse(self.imports.release_preview(batch["id"])["can_release"])
            with self.assertRaises(ValueError):
                self.release(batch)
        value["state"] = "open"; self.engine.save("import", value)
        for status in ("running", "cancelling", "restoring", "unknown"):
            task["status"] = status; self.engine.save("task", task)
            with self.assertRaisesRegex(ValueError, "关联任务"):
                self.release(batch)
        task["status"] = "completed"; self.engine.save("task", task)

    def test_partial_failure_retains_quota_and_requires_explicit_retry_after_restart(self):
        batch = self.allocate(2)
        view = self.imports.release_preview(batch["id"])
        unlink = os.unlink
        calls = []
        def fail_second(name, *args, **kwargs):
            if str(name).endswith(".jpg"):
                calls.append(name)
                if len(calls) == 2:
                    raise PermissionError("synthetic file is currently open")
            return unlink(name, *args, **kwargs)
        with patch("mediaslimx.imports.os.unlink", side_effect=fail_second):
            with self.assertRaises(PermissionError):
                self.release(batch, view)
        self.assertEqual(len(list(self.imports._root(batch["id"]).glob("*.jpg"))), 1)
        self.assertEqual(self.engine.get("import", batch["id"])["state"], "release_failed")
        self.assertEqual(self.imports.storage()["reserved_bytes"], 2 * len(self.data))
        engine = Engine(self.engine.data_dir, [self.root]); manager = ImportManager(engine)
        self.assertEqual(len(list(manager._root(batch["id"]).glob("*.jpg"))), 1)
        current = manager.release_preview(batch["id"])
        self.assertTrue(current["can_release"], current["protected_reason"])
        self.assertNotEqual(current["record_version"], view["record_version"])
        with self.assertRaisesRegex(ValueError, "已变化"):
            manager.release(batch["id"], True, view["record_version"])
        self.assertEqual(manager.release(batch["id"], True, current["record_version"])["released_bytes"], len(self.data))
        self.assertEqual(manager.storage()["reserved_bytes"], 0)
        self.assertEqual(self.original.read_bytes(), self.data)

    def test_legacy_deleted_history_uses_confirmed_current_snapshot_and_checks_changes(self):
        batch = self.allocate()
        record = self.engine.get("import", batch["id"])
        record.pop("root_identity")
        record["sealed"] = True
        for item in record["files"]:
            item.pop("upload_fp"); item.pop("file_identity")
        self.engine.save("import", record)
        view = self.imports.release_preview(batch["id"])
        self.assertTrue(view["can_release"], view["protected_reason"])
        self.assertEqual(view["snapshot_only_files"], 1)
        self.assertEqual(self.imports.clear_unused([batch["id"]])["protected"], [batch["id"]])
        path = next(self.imports._root(batch["id"]).glob("*.jpg"))
        before = path.stat()
        data = bytearray(path.read_bytes()); data[-1] ^= 1
        path.write_bytes(data); os.utime(path, ns=(before.st_atime_ns, before.st_mtime_ns))
        with self.assertRaisesRegex(ValueError, "已变化"):
            self.release(batch, view)
        current = self.imports.release_preview(batch["id"])
        self.assertNotEqual(current["record_version"], view["record_version"])
        self.assertTrue(self.release(batch, current)["released"])
        self.assertEqual(self.original.read_bytes(), self.data)

    def test_legacy_used_manifest_uses_existing_scan_fingerprint_without_touching_task(self):
        batch, _, task = self.used()
        record = self.engine.get("import", batch["id"])
        record.pop("root_identity")
        for item in record["files"]:
            item.pop("upload_fp"); item.pop("file_identity")
        self.engine.save("import", record)
        before = self.engine.get("task", task["id"])
        self.assertTrue(self.release(batch)["released"])
        self.assertEqual(self.engine.get("task", task["id"]), before)


class ImportStorageHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.base = Path(cls.temporary.name)
        cls.root = cls.base / "source"; cls.root.mkdir()
        data = io.BytesIO(); Image.new("RGB", (640, 480), "red").save(data, format="JPEG", quality=100)
        cls.data = data.getvalue()
        cls.original = cls.root / "photo.jpg"; cls.original.write_bytes(cls.data)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0)); cls.port = sock.getsockname()[1]
        cls.token = "private-import-storage-validation-token"
        cls.url = f"http://127.0.0.1:{cls.port}"
        code = "from mediaslimx.engine import Engine; from mediaslimx.app import create_app; import uvicorn,sys; e=Engine(sys.argv[1],[sys.argv[2]]); uvicorn.run(create_app(e,sys.argv[3],int(sys.argv[4])),host='127.0.0.1',port=int(sys.argv[4]),log_level='error',access_log=False)"
        cls.process = subprocess.Popen([sys.executable, "-c", code, str(cls.base / "data"), str(cls.root), cls.token, str(cls.port)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            try:
                cls.request("/api/environment"); break
            except (urllib.error.URLError, ConnectionError):
                time.sleep(.05)
        else:
            raise RuntimeError("isolated storage API validation server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate(); cls.process.wait(timeout=10); cls.process.stderr.close()
        cls.temporary.cleanup()

    @classmethod
    def request(cls, path, body=None, headers=None, auth=True, method=None, raw=False):
        values = {"X-MediaSlimX-Token": cls.token} if auth else {}
        if body is not None:
            values["Content-Type"] = "application/octet-stream" if raw else "application/json"
        values.update(headers or {})
        request = urllib.request.Request(cls.url + path, data=(body if raw else json.dumps(body).encode()) if body is not None else None,
                                         headers=values, method=method)
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read()
            return response.status, json.loads(data) if response.headers.get_content_type() == "application/json" else data

    def test_guard_confirmation_and_results_after_release(self):
        _, batch = self.request("/api/imports", {"files": [{"name": "photo.jpg", "size": len(self.data)}]})
        file_id = batch["files"][0]["id"]
        self.request(f'/api/imports/{batch["id"]}/files/{file_id}', self.data, raw=True, method="PUT")
        _, scan = self.request(f'/api/imports/{batch["id"]}/scan', {})
        _, created = self.request("/api/tasks", {"scan_id": scan["id"], "selected": [file_id], "output": str(self.base / "exports")})
        for _ in range(100):
            _, task = self.request('/api/tasks/' + created["id"])
            if task["status"] == "completed":
                break
            time.sleep(.02)
        self.assertEqual(task["status"], "completed")
        self.assertFalse(task["import_copies_released"])
        path = f'/api/imports/{batch["id"]}/release'
        preview_path = path + '-preview'
        _, preview = self.request(preview_path)
        body = {"confirm": True, "record_version": preview["record_version"]}
        for target, payload in [("/api/imports/storage", None), (preview_path, None), (path, body)]:
            for headers, auth, status in [({}, False, 401), ({"Origin": "https://evil.example"}, True, 403),
                                          ({"Host": "evil.example"}, True, 403), ({"Sec-Fetch-Site": "cross-site"}, True, 403)]:
                with self.subTest(target=target, headers=headers), self.assertRaises(urllib.error.HTTPError) as raised:
                    self.request(target, payload, headers=headers, auth=auth)
                self.assertEqual(raised.exception.code, status)
        for bad, status in [({"record_version": preview["record_version"]}, 422), ({**body, "confirm": False}, 400),
                            ({**body, "confirm": 1}, 422), ({**body, "confirm": "true"}, 422),
                            ({**body, "record_version": "0" * 64}, 400), ({**body, "record_version": "bad"}, 422),
                            ({**body, "delete_outputs": True}, 422)]:
            with self.subTest(body=bad), self.assertRaises(urllib.error.HTTPError) as raised:
                self.request(path, bad)
            self.assertEqual(raised.exception.code, status)
        self.assertTrue(self.request(path, body)[1]["released"])
        self.assertTrue(self.request(path, body)[1]["already_released"])
        self.assertTrue(self.request('/api/tasks/' + task["id"])[1]["import_copies_released"])
        prefix = f'/api/tasks/{task["id"]}/preview/{file_id}/'
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.request(prefix + 'original')
        self.assertEqual(raised.exception.code, 400)
        result = self.request(prefix + 'result')[1]
        self.assertEqual(hashlib.sha256(result).hexdigest(), task["entries"][0]["result_fp"]["sha256"])
        self.assertIn(b'relative_path,', self.request(f'/api/tasks/{task["id"]}/report.csv')[1])
        self.assertTrue(self.request(f'/api/tasks/{task["id"]}/download.zip')[1].startswith(b'PK'))
        self.assertEqual(self.original.read_bytes(), self.data)
        self.assertEqual(self.request('/api/imports/storage')[1]["reserved_bytes"], 0)
