"""List cleanup must never remove media, backups, task data or permissions."""
from pathlib import Path
import tempfile
import unittest

from mediaslimx.engine import Engine
from mediaslimx.folders import FolderBrowser
from mediaslimx.library import ListLibrary


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.root = self.base / "media"; self.root.mkdir()
        self.backup = self.base / "backup.jpg"; self.backup.write_bytes(b"original-backup")
        self.source = self.root / "photo.jpg"; self.source.write_bytes(b"source-media")
        self.engine = Engine(self.base / "data", [self.root])
        self.library = ListLibrary(self.engine)

    def tearDown(self):
        self.tmp.cleanup()

    def task(self, key, status="completed", created=1):
        task = dict(id=key, created=created, root=str(self.root), status=status,
                    mode="backup", entries=[{"backup": str(self.backup)}])
        self.engine.save("task", task)
        return task

    def test_clear_is_display_only_and_records_remain_accessible(self):
        self.task("a")
        self.assertEqual(self.library.clear_tasks(["a"])["cleared"], ["a"])
        self.assertEqual(self.library.tasks(), [])
        self.assertEqual(self.library.tasks(hidden=True)[0]["id"], "a")
        self.assertEqual(self.engine.get("task", "a")["entries"][0]["backup"], str(self.backup))
        self.assertEqual(self.source.read_bytes(), b"source-media")
        self.assertEqual(self.backup.read_bytes(), b"original-backup")
        self.library.restore_task("a")
        self.assertEqual(self.library.tasks()[0]["id"], "a")

    def test_pin_after_confirmation_protects_task_at_commit(self):
        self.task("a"); self.task("b")
        snapshot = ["a", "b"]
        self.library.pin_task("a", True)
        result = self.library.clear_tasks(snapshot)
        self.assertEqual(result, {"cleared": ["b"], "protected": ["a"]})
        self.assertTrue(self.library.tasks()[0]["pinned"])

    def test_active_tasks_are_always_protected(self):
        for status in ["running", "cancelling", "restoring"]:
            self.task(status, status)
        result = self.library.clear_tasks(["running", "cancelling", "restoring"])
        self.assertEqual(result["cleared"], [])
        self.assertEqual(len(result["protected"]), 3)

    def test_snapshot_does_not_clear_new_completed_task(self):
        self.task("a")
        snapshot = ["a"]
        self.task("new", created=2)
        self.library.clear_tasks(snapshot)
        self.assertEqual([t["id"] for t in self.library.tasks()], ["new"])

    def test_worker_save_does_not_overwrite_pin_or_clear_flags(self):
        task = self.task("a")
        self.library.pin_task("a", True)
        self.engine.save("task", task)
        self.assertTrue(self.library.tasks()[0]["pinned"])
        self.library.pin_task("a", False)
        self.library.clear_tasks(["a"])
        self.engine.save("task", task)
        self.assertEqual(self.library.tasks(), [])

    def test_list_flags_persist_after_engine_restart(self):
        self.task("a"); self.task("b")
        self.library.pin_task("a", True); self.library.clear_tasks(["b"])
        engine = Engine(self.engine.data_dir, [self.root])
        library = ListLibrary(engine)
        self.assertTrue(library.tasks()[0]["pinned"])
        self.assertEqual(library.tasks(hidden=True)[0]["id"], "b")

    def test_pinned_tasks_sort_before_newer_unpinned_tasks(self):
        self.task("old", created=1); self.task("new", created=2)
        self.library.pin_task("old", True)
        self.assertEqual([t["id"] for t in self.library.tasks()], ["old", "new"])

    def test_hiding_directory_shortcuts_keeps_scope_and_files(self):
        extra = self.base / "other"; extra.mkdir(); self.engine.roots.append(extra)
        before = list(self.engine.roots)
        items = self.library.directories(before)
        self.assertTrue(items[0]["pinned"])
        result = self.library.clear_directories([str(self.root), str(extra)])
        self.assertEqual(result["protected"], [str(self.root)])
        self.assertEqual(result["cleared"], [str(extra)])
        self.assertEqual(self.engine.roots, before)
        self.assertEqual(self.engine._root(str(extra)), extra)
        self.assertEqual(self.source.read_bytes(), b"source-media")
        self.library.restore_directory(str(extra))
        self.assertEqual(len(self.library.directories(before)), 2)

    def test_directory_pin_is_rechecked_and_unknown_path_cannot_grant_scope(self):
        extra = self.base / "other"; extra.mkdir(); self.engine.roots.append(extra)
        self.library.directories(self.engine.roots)
        self.library.pin_directory(str(extra), True)
        self.assertEqual(self.library.clear_directories([str(extra)])["protected"], [str(extra)])
        unknown = self.base / "private"; unknown.mkdir()
        with self.assertRaises(ValueError):
            self.library.pin_directory(str(unknown), True)
        self.assertNotIn(unknown, self.engine.roots)

    def test_folder_browser_reports_shortcuts_separate_from_allowed_roots(self):
        extra = self.base / "other"; extra.mkdir(); self.engine.roots.append(extra)
        browser = FolderBrowser(self.engine)
        browser.library.clear_directories([str(extra)])
        data = browser.browse()
        self.assertIn(str(extra), data["roots"])
        self.assertNotIn(str(extra), [r["path"] for r in data["root_items"]])
        self.assertEqual(data["hidden_roots_count"], 1)


if __name__ == "__main__":
    unittest.main()
