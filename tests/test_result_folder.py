"""Task-owned result folder selection; never trust a path submitted by the UI."""
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch

from mediaslimx.app import create_app, result_directory, task_directory
from mediaslimx.engine import Engine, task_folder_name


TASK_ID = "a" * 32


class RecordStore:
    def __init__(self, task):
        self.task = task

    def get(self, kind, key):
        assert (kind, key) == ("task", TASK_ID)
        return self.task


class ResultFolderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / "source"
        self.source.mkdir()
        self.output = self.base / "output"
        self.output.mkdir()
        self.result = self.output / TASK_ID
        self.result.mkdir()
        self.task = {"id": TASK_ID, "root": str(self.source), "output_root": str(self.output),
                     "mode": "export", "entries": [{"result_fp": {"sha256": "0" * 64}}]}

    def test_export_opens_only_this_tasks_result_directory(self):
        self.assertEqual(result_directory(RecordStore(self.task), TASK_ID), self.result)
        with self.assertRaisesRegex(ValueError, "无效任务编号"):
            result_directory(RecordStore(self.task), "../source")

    def test_dated_folder_for_new_task_and_legacy_folder_for_old_task(self):
        self.assertEqual(task_folder_name(self.task), TASK_ID)
        name = "2026-10-18_15-30-00-aaaaaaaa"
        self.task["folder_name"] = name
        self.result.rmdir()
        self.result = self.output / name
        self.result.mkdir()
        self.assertEqual(result_directory(RecordStore(self.task), TASK_ID), self.result)
        self.task["folder_name"] = "../outside"
        with self.assertRaisesRegex(ValueError, "任务目录记录无效"):
            result_directory(RecordStore(self.task), TASK_ID)
        self.task["folder_name"] = "2026-10-18_15-30-00-bbbbbbbb"
        with self.assertRaisesRegex(ValueError, "任务目录记录无效"):
            result_directory(RecordStore(self.task), TASK_ID)

    def test_both_in_place_modes_open_the_source_directory(self):
        for mode in ("backup", "overwrite"):
            with self.subTest(mode=mode):
                self.task["mode"] = mode
                self.assertEqual(result_directory(RecordStore(self.task), TASK_ID), self.source)

    def test_source_and_backup_folders_are_derived_from_task_records(self):
        engine = Engine(self.base / "data", [self.source])
        engine.save("task", self.task)
        self.assertEqual(task_directory(engine, TASK_ID, "source"), self.source)
        with self.assertRaisesRegex(ValueError, "没有所选目录"):
            task_directory(engine, TASK_ID, "backup")
        self.task.update(mode="backup", backup_root=str(self.base / "backups"))
        backup = self.base / "backups" / TASK_ID
        backup.mkdir(parents=True)
        self.task["entries"][0]["backup_fp"] = {"sha256": "0" * 64}
        engine.save("task", self.task)
        self.assertEqual(task_directory(engine, TASK_ID, "backup"), backup)
        with self.assertRaisesRegex(ValueError, "没有所选目录"):
            task_directory(engine, TASK_ID, "../source")
        backup.rmdir()
        with self.assertRaisesRegex(ValueError, "已移动或删除"):
            task_directory(engine, TASK_ID, "backup")

    def test_no_result_or_missing_folder_is_not_reported_as_opened(self):
        self.task["entries"] = [{"result_fp": None}]
        with self.assertRaisesRegex(ValueError, "尚无可查看"):
            result_directory(RecordStore(self.task), TASK_ID)
        self.task["entries"][0]["result_fp"] = {"sha256": "0" * 64}
        self.result.rmdir()
        with self.assertRaisesRegex(ValueError, "已移动或删除"):
            result_directory(RecordStore(self.task), TASK_ID)

    def test_linked_result_folder_is_rejected(self):
        other = self.base / "other"
        other.mkdir()
        self.result.rmdir()
        try:
            self.result.symlink_to(other, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("This account cannot create directory links")
        with self.assertRaisesRegex(ValueError, "符号链接|重解析点"):
            result_directory(RecordStore(self.task), TASK_ID)

    def test_record_identity_cannot_redirect_the_output(self):
        self.task["id"] = "b" * 32
        with self.assertRaisesRegex(ValueError, "不匹配"):
            result_directory(RecordStore(self.task), TASK_ID)

    @unittest.skipUnless(os.name == "nt", "Windows ShellExecute only")
    def test_native_window_endpoint_opens_validated_task_folder(self):
        engine = Engine(self.base / "data", [self.source])
        engine.save("task", self.task)
        app = create_app(engine, token="test-token", port=8878)
        route = next(r for r in app.routes if getattr(r, "path", None) ==
                     "/api/tasks/{task_id}/open-result-folder")
        with self.assertRaisesRegex(ValueError, "仅 Windows 独立窗口"):
            route.endpoint(TASK_ID)
        app.state.window_directory_drop = True
        with patch("mediaslimx.app.os.startfile") as startfile:
            self.assertEqual(route.endpoint(TASK_ID), {"ok": True})
            startfile.assert_called_once_with(self.result)
        slot_route = next(r for r in app.routes if getattr(r, "path", None) ==
                          "/api/tasks/{task_id}/open-folder/{slot}")
        with patch("mediaslimx.app.os.startfile") as startfile:
            self.assertEqual(slot_route.endpoint(TASK_ID, "source"), {"ok": True})
            self.assertEqual(slot_route.endpoint(TASK_ID, "result"), {"ok": True})
            self.assertEqual(startfile.call_count, 2)
            startfile.assert_any_call(self.source)
            startfile.assert_any_call(self.result)


if __name__ == "__main__":
    unittest.main()
