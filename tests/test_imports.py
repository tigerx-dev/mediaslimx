"""Browser import invariants: bounded paths, complete bytes, export-only, persistence."""
import asyncio
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from PIL import Image
from mediaslimx.engine import Engine
from mediaslimx.imports import ImportManager, portable_name, MAX_FILES, MAX_BATCH_BYTES
from mediaslimx.paths import fingerprint

PARAMS = {"preset": "balanced", "max_width": None, "max_height": None}


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.root = self.base / "media"; self.root.mkdir()
        self.engine = Engine(self.base / "data", [self.root])
        self.imports = ImportManager(self.engine)
        image = io.BytesIO()
        Image.new("RGB", (640, 480), (180, 60, 20)).save(image, format="JPEG", quality=100)
        self.jpg = image.getvalue()

    def tearDown(self):
        self.tmp.cleanup()

    def allocate(self, name="photo.jpg", content=None, key=None):
        content = self.jpg if content is None else content
        return self.imports.allocate([{"name": name, "size": len(content)}], key)

    def receive(self, allocation, content=None, stream=None):
        async def chunks():
            data = self.jpg if content is None else content
            yield data[:50]
            yield data[50:]
        return asyncio.run(self.imports.receive(allocation["id"], allocation["files"][0]["id"], stream or chunks()))

    def imported(self):
        a = self.allocate(); self.receive(a)
        return a, self.imports.scan(a["id"])

    def create(self, scan):
        key = self.engine.create(scan["id"], [e["id"] for e in scan["entries"] if e["status"] == "ready"],
                                 PARAMS, "export", output=str(self.imports.default_output))
        return self.engine.wait(key)

    def test_portable_names_reject_traversal_ads_hidden_reserved_and_nonmedia(self):
        for name in ["../a.jpg", "a/b.jpg", "C:\\a.jpg", "photo.jpg:stream", ".secret.jpg",
                     "NUL.jpg", "CoM1.png", "a.jpg ", "a.jpg\n", "a.txt", "a?.png"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                portable_name(name)
        self.assertEqual(portable_name("照片.JPG"), "照片.JPG")

    def test_limits_and_duplicate_names_are_atomic(self):
        a = self.allocate()
        b = self.allocate("PHOTO.jpg", key=a["id"])
        self.assertEqual(b["files"][0]["name"], "PHOTO (2).jpg")
        before = self.engine.get("import", a["id"])
        for files in [[{"name": "a.jpg", "size": 1}] * MAX_FILES,
                      [{"name": "a.jpg", "size": True}],
                      [{"name": "a.jpg", "size": 1}, {"name": "../bad.png", "size": 1}],
                      [{"name": "a.mp4", "size": 1024**3}] * 3]:
            with self.assertRaises(ValueError):
                self.imports.allocate(files, a["id"])
            self.assertEqual(before, self.engine.get("import", a["id"]))

    def test_upload_rejects_size_mismatch_and_can_retry(self):
        for data in [b"x", self.jpg + b"x"]:
            a = self.allocate()
            with self.assertRaises(ValueError):
                self.receive(a, data)
            self.assertFalse(self.imports.active)
            self.assertEqual(list(self.imports._root(a["id"]).iterdir()), [])
            self.receive(a)
            with self.assertRaises(ValueError):
                self.receive(a)  # Completed bytes cannot be overwritten.
            self.assertEqual(self.imports.scan(a["id"])["entries"][0]["status"], "ready")

    def test_cancel_removes_partial_and_releases_lock(self):
        a = self.allocate()
        async def interrupted():
            yield self.jpg[:50]
            raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            self.receive(a, stream=interrupted())
        self.assertFalse(self.imports.active)
        self.assertFalse(list(self.imports._root(a["id"]).iterdir()))
        self.receive(a)

    def test_active_upload_blocks_scan_append_and_discard(self):
        a = self.allocate()
        async def paused():
            for action in [lambda: self.imports.scan(a["id"]), lambda: self.imports.discard(a["id"]),
                           lambda: self.allocate(key=a["id"])]:
                with self.assertRaises(ValueError):
                    action()
            yield self.jpg
        self.receive(a, stream=paused())

    def test_save_failure_does_not_leave_active_upload(self):
        a = self.allocate()
        with patch.object(self.engine, "save", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.receive(a)
        self.assertFalse(self.imports.active)

    def test_corrupt_media_and_animation_do_not_enter_ready_list(self):
        a = self.allocate(content=b"not an image"); self.receive(a, b"not an image")
        scan = self.imports.scan(a["id"])
        self.assertEqual(scan["entries"][0]["status"], "failed")
        data = io.BytesIO()
        frames = [Image.new("RGBA", (20, 20), color) for color in ["red", "blue"]]
        frames[0].save(data, format="WEBP", save_all=True, append_images=frames[1:], duration=100)
        a = self.allocate("motion.webp", data.getvalue()); self.receive(a, data.getvalue())
        self.assertEqual(self.imports.scan(a["id"])["entries"][0]["status"], "unsupported")

    def test_imports_export_only_and_forged_root_cannot_bypass_scope(self):
        a, scan = self.imported()
        for mode in ["backup", "overwrite"]:
            with self.assertRaises(ValueError):
                self.engine.create(scan["id"], [scan["entries"][0]["id"]], PARAMS, mode,
                                   backup=str(self.base/"backup"), confirm=True)
        scan["root"] = str(self.root)
        self.engine.save("scan", scan)
        with self.assertRaises(ValueError):
            self.create(scan)
        with self.assertRaises(ValueError):
            self.engine.scan(str(self.imports._root(a["id"])))

    def test_append_invalidates_old_scan_and_task_seals_batch(self):
        a, old = self.imported()
        b = self.allocate(key=a["id"]); self.receive(b)
        with self.assertRaises(ValueError):
            self.create(old)
        scan = self.imports.scan(a["id"])
        task = self.create(scan)
        self.assertEqual(task["status"], "completed")
        self.assertEqual([e["relative"] for e in task["entries"]], ["photo.jpg", "photo (2).jpg"])
        for action in [lambda: self.allocate(key=a["id"]), lambda: self.imports.discard(a["id"]),
                       lambda: self.imports.scan(a["id"]), lambda: self.create(scan)]:
            with self.assertRaises(ValueError):
                action()

    def test_export_download_original_preview_and_restart(self):
        a, scan = self.imported(); task = self.create(scan); entry = task["entries"][0]
        self.assertEqual(entry["status"], "success", entry["reason"])
        self.assertEqual(Path(entry["source"]).read_bytes(), self.jpg)
        self.assertLess(entry["result_size"], len(self.jpg))
        restored = Engine(self.engine.data_dir, [self.root]); manager = ImportManager(restored)
        original, _ = restored.preview(task["id"], entry["id"], "original")
        self.assertEqual(original.read_bytes(), self.jpg)
        package = manager.archive(task["id"])
        with zipfile.ZipFile(package) as archive:
            self.assertEqual(set(archive.namelist()), {"photo.jpg", "report.csv"})
            self.assertEqual(archive.read("photo.jpg"), Path(entry["destination"]).read_bytes())
            self.assertNotIn(str(self.base).encode(), archive.read("report.csv"))
            self.assertTrue(archive.read("report.csv").decode("utf-8-sig").startswith("relative_path,"))
        package.unlink()
        Path(entry["destination"]).write_bytes(b"changed")
        with self.assertRaises(ValueError):
            manager.archive(task["id"])
        self.assertFalse(list(restored.work_dir.glob("download-*.zip")))

    def test_resume_rejects_released_import_copies_without_touching_exports(self):
        batch, scan = self.imported()
        task = self.create(scan)
        entry = task["entries"][0]
        export = Path(entry["destination"])
        exported = export.read_bytes()
        entry.update(status="cancelled", destination=None, result_fp=None,
                     result_size=entry["size"])
        task["status"] = "cancelled"
        self.engine.save("task", task)
        preview = self.imports.release_preview(batch["id"])
        self.assertTrue(preview["can_release"])
        self.imports.release(batch["id"], True, preview["record_version"])
        with self.assertRaisesRegex(ValueError, "导入原始副本已清理"):
            self.engine.resume(task["id"])
        self.assertEqual(export.read_bytes(), exported)

    def test_discard_removes_only_unused_copies_and_invalidates_scan(self):
        a, scan = self.imported()
        original = self.root/"photo.jpg"; original.write_bytes(self.jpg)
        self.imports.discard(a["id"])
        self.assertEqual(original.read_bytes(), self.jpg)
        self.assertFalse(self.imports._root(a["id"]).exists())
        with self.assertRaises(ValueError):
            self.create(scan)

    def test_startup_cleans_interrupted_upload_and_download(self):
        a = self.allocate()
        batch = self.engine.get("import", a["id"]); batch["files"][0]["state"] = "uploading"
        self.engine.save("import", batch)
        part = self.imports._root(a["id"])/(a["files"][0]["id"]+".jpg.part")
        part.write_bytes(b"partial")
        download = self.engine.work_dir/"download-interrupted.zip"; download.write_bytes(b"partial")
        manager = ImportManager(self.engine)
        self.assertFalse(part.exists()); self.assertFalse(download.exists())
        self.assertEqual(self.engine.get("import", a["id"])["files"][0]["state"], "pending")
        self.assertFalse(manager.active)

    def test_cleanup_snapshot_protects_task_created_after_listing(self):
        a, scan = self.imported()
        snapshot = [b["id"] for b in self.imports.unused()]
        self.assertEqual(snapshot, [a["id"]])
        with self.assertRaises(ValueError):
            self.imports.clear_unused(snapshot + ["../escape"])
        self.assertTrue(self.imports._root(a["id"]).is_dir())
        task = self.create(scan)
        b = self.allocate()
        result = self.imports.clear_unused(snapshot + [b["id"]])
        self.assertEqual(result, {"cleared": [b["id"]], "protected": [a["id"]]})
        self.assertEqual(self.imports.unused(), [])
        self.assertTrue(self.engine.preview(task["id"], task["entries"][0]["id"], "original")[0].is_file())

    def test_relative_hierarchy_exports_and_zips_with_same_names(self):
        files = []
        for relative in ["素材/images/photo.jpg", "素材/other/photo.jpg", "素材/other/photo.jpg"]:
            allocation = self.imports.allocate([{"name": "photo.jpg", "size": len(self.jpg), "relative_path": relative}], files[0]["id"] if files else None)
            self.receive(allocation); files.append(allocation)
        scan = self.imports.scan(files[0]["id"])
        self.assertEqual([e["relative"] for e in scan["entries"]],
                         ["素材/images/photo.jpg", "素材/other/photo.jpg", "素材/other/photo (2).jpg"])
        task = self.create(scan)
        for entry in task["entries"]:
            self.assertEqual(entry["status"], "success", entry["reason"])
            self.assertTrue(Path(entry["destination"]).as_posix().endswith(entry["relative"]))
            self.assertEqual(Path(entry["source"]).parent, self.imports._root(files[0]["id"]))
        archive = self.imports.archive(task["id"])
        with zipfile.ZipFile(archive) as package:
            self.assertEqual(set(package.namelist()), {e["relative"] for e in task["entries"]} | {"report.csv"})
        archive.unlink()

    def test_relative_path_and_exclusions_are_server_enforced(self):
        for relative in ["/photo.jpg", "../photo.jpg", "folder/../photo.jpg", "folder//photo.jpg",
                         r"folder\photo.jpg", "C:/photo.jpg", "folder/.hidden/photo.jpg",
                         "folder/node_modules/photo.jpg", "folder/OUTPUT/photo.jpg",
                         "folder/mediaslimx-export/photo.jpg", "folder/backup/photo.jpg",
                         "report.csv/photo.jpg", "folder/NUL/photo.jpg",
                         "/".join(["deep"] * 21 + ["photo.jpg"]), "folder/different.jpg"]:
            with self.subTest(relative=relative), self.assertRaises(ValueError):
                self.imports.allocate([{"name": "photo.jpg", "size": len(self.jpg), "relative_path": relative}])
        self.assertEqual(self.engine.all("import"), [])
        custom = self.base / "custom-output"; custom.mkdir()
        with self.engine.db() as db:
            db.execute("INSERT INTO exclusions VALUES (?)", (str(custom),))
        self.assertIn("custom-output", self.imports.policy()["skip_dirs"])
        with self.assertRaises(ValueError):
            self.imports.allocate([{"name":"photo.jpg","size":len(self.jpg),"relative_path":"素材/custom-output/photo.jpg"}])

    def test_directory_casing_is_canonical_and_file_prefixes_cannot_collide(self):
        a = self.imports.allocate([{"name":"a.jpg","size":len(self.jpg),"relative_path":"Folder/Images/a.jpg"}])
        b = self.imports.allocate([{"name":"b.jpg","size":len(self.jpg),"relative_path":"folder/images/b.jpg"}], a["id"])
        self.assertEqual(b["files"][0]["relative"], "Folder/Images/b.jpg")
        c = self.allocate("first.jpg")
        with self.assertRaises(ValueError):
            self.imports.allocate([{"name":"photo.jpg","size":len(self.jpg),"relative_path":"first.jpg/sub/photo.jpg"}], c["id"])

    def test_flat_legacy_import_manifest_stays_readable(self):
        a = self.allocate(); self.receive(a)
        batch = self.engine.get("import", a["id"])
        for f in batch["files"]:
            f.pop("relative", None); f.pop("original_relative", None)
        self.engine.save("import", batch)
        scan = self.imports.scan(a["id"])
        self.assertEqual(scan["entries"][0]["relative"], "photo.jpg")
        self.assertEqual(self.create(scan)["entries"][0]["status"], "success")
