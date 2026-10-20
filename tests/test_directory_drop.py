"""One native directory grant: bounded scope and no implicit media work."""
import io
import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

from mediaslimx.app import create_app
from mediaslimx.engine import Engine, DEFAULT_ARTIFACT_DIRS
from mediaslimx.folders import FolderBrowser
from mediaslimx import window
import test_window as window_tests


class DirectoryDropBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.media = self.base / "media"
        self.media.mkdir()
        self.engine = Engine(self.base / "data", [self.media])
        self.folders = FolderBrowser(self.engine)
        # Exercise the trusted desktop caller on POSIX too; no native picker.
        self.folders.desktop = True

    def tearDown(self):
        self.engine.begin_shutdown()
        self.assertTrue(self.engine.wait_shutdown(5))
        self.tmp.cleanup()

    def external(self, name="chosen"):
        value = self.base / name
        value.mkdir()
        return value

    def assert_rejected(self, value, reason=None):
        before = list(self.engine.roots)
        with self.assertRaisesRegex((OSError, ValueError), reason or "."):
            self.folders.dropped_directory(value)
        self.assertEqual(self.engine.roots, before)
        self.assertFalse(self.folders.settings.exists())

    def test_grant_exact_directory_without_scanning_reading_media_or_starting_task(self):
        chosen = self.external("chosen photos")
        (chosen / "private.py").write_text("non-media must not be read", encoding="utf-8")
        with patch.object(self.engine, "scan") as scan, patch.object(self.engine, "create") as create:
            self.assertEqual(self.folders.dropped_directory(str(chosen)), {"path": str(chosen)})
        scan.assert_not_called()
        create.assert_not_called()
        self.assertEqual(self.engine.roots, [self.media, chosen])
        self.assertNotIn(self.base, self.engine.roots)
        self.assertEqual(json.loads(self.folders.settings.read_text(encoding="utf-8")),
                         [str(self.media), str(chosen)])
        self.assertEqual(self.engine.all("scan"), [])
        self.assertEqual(self.engine.all("task"), [])

    def test_repeat_grant_does_not_duplicate_scope_or_create_tasks(self):
        chosen = self.external()
        for _ in range(3):
            self.folders.dropped_directory(str(chosen))
        self.assertEqual(self.engine.roots, [self.media, chosen])
        self.assertEqual(self.engine.all("task"), [])

    def test_server_mode_cannot_receive_a_directory_grant(self):
        self.folders.desktop = False
        self.assert_rejected(str(self.external()), "Windows")

    def test_closing_folder_browser_or_engine_rejects_late_grants(self):
        chosen = self.external()
        self.folders.close_native()
        self.assert_rejected(str(chosen), "退出")
        self.folders = FolderBrowser(self.engine)
        self.folders.desktop = True
        self.engine.begin_shutdown()
        self.assert_rejected(str(chosen), "退出")

    def test_hidden_dependency_and_default_output_roots_are_not_granted(self):
        for name in (".hidden", "node_modules", "venv", "output", "backups", *sorted(DEFAULT_ARTIFACT_DIRS)):
            with self.subTest(name=name):
                self.assert_rejected(str(self.external(name)), "隐藏目录|运行数据")
        nested = self.base / "mediaslimx-export" / "task" / "photos"
        nested.mkdir(parents=True)
        self.assert_rejected(str(nested), "隐藏目录")

    def test_explicit_output_backup_and_data_scopes_are_not_granted(self):
        excluded = self.external("custom result storage")
        nested = excluded / "child"
        nested.mkdir()
        with self.engine.db() as db:
            db.execute("INSERT INTO exclusions VALUES (?)", (str(excluded),))
        for value in (excluded, nested, self.engine.data_dir, self.engine.import_dir):
            with self.subTest(value=value):
                self.assert_rejected(str(value), "运行数据")

    def test_file_missing_relative_oversized_and_cross_platform_paths_rejected(self):
        file = self.base / "photo.jpg"
        file.write_bytes(b"synthetic")
        invalid_platform = "/mnt/d/media" if os.name == "nt" else "D:\\media"
        for value in (str(file), str(self.base / "missing"), "relative/path", "x" * 4097,
                      str(self.base) + "\0bad", None, {}, invalid_platform):
            with self.subTest(value=str(value)[:60]):
                self.assert_rejected(value)

    def test_link_and_directory_through_link_cannot_expand_authorized_scope(self):
        outside = self.external()
        (outside / "nested").mkdir()
        link = self.base / "alias"
        if os.name == "nt":
            subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(outside)],
                           check=True, capture_output=True)
        else:
            link.symlink_to(outside, target_is_directory=True)
        try:
            for value in (link, link / "nested"):
                with self.subTest(value=value):
                    self.assert_rejected(str(value), "链接|重解析")
        finally:
            # Remove the test junction itself before TemporaryDirectory cleanup;
            # never recursively remove its target through the link.
            if os.name == "nt":
                link.rmdir()
            else:
                link.unlink()
        self.assertTrue((outside / "nested").is_dir())

    def test_settings_write_failure_rolls_back_only_the_new_scope(self):
        chosen = self.external()
        with patch.object(Path, "write_text", side_effect=OSError("synthetic full disk")):
            self.assert_rejected(str(chosen), "full disk")

    def test_web_apps_do_not_advertise_the_private_window_capability_or_grant_route(self):
        app = create_app(self.engine, desktop=True)
        self.assertIs(app.state.window_directory_drop, False)
        self.assertTrue(callable(app.state.authorize_window_directory_drop))
        self.assertFalse(any("drop" in route.path or "grant" in route.path for route in app.routes))


class DirectoryDropProtocolTests(unittest.TestCase):
    def test_valid_private_event_is_small_and_strictly_typed(self):
        event = {"event": "directory_dropped", "request_id": "a" * 32, "path": "/synthetic/chosen"}
        self.assertTrue(window.valid_directory_drop(event))
        self.assertLess(len(json.dumps(event)), 65536)
        for changes in ({"request_id": "../escape"}, {"request_id": "A" * 32}, {"path": None},
                        {"path": "x" * 4097}, {"path": "bad\0path"}, {"extra": "scope"}):
            with self.subTest(changes=changes):
                self.assertFalse(window.valid_directory_drop({**event, **changes}))

    def test_invalid_drop_does_not_close_or_poison_later_owner_messages(self):
        events = queue.Queue()
        window.read_events(io.StringIO('{"event":"directory_dropped","request_id":"bad","path":"/x"}\n'
                                      '{"event":"close_requested"}\n'), events)
        self.assertEqual([events.get_nowait()["event"], events.get_nowait()["event"]],
                         ["close_requested", "host_ended"])
        self.assertTrue(events.empty())

    def test_native_source_keeps_the_attachment_and_origin_security_gates(self):
        source = (Path(__file__).resolve().parents[1] / "native/MediaSlimX.Window.cs").read_text(encoding="utf-8")
        for gate in ('core.Settings.AreHostObjectsAllowed = false', 'TopDocumentAddress(e.Source)',
                     'raw.Length > 512', 'message.Count != 2', '(string)operation != "dropped_directory"',
                     'e.AdditionalObjects.Count != 1', 'e.AdditionalObjects[0] as CoreWebView2File',
                     '!Directory.Exists(path)', 'directoryRequests.Remove((string)identifier)'):
            self.assertIn(gate, source)
        self.assertNotIn('AddHostObjectToScript', source)


class DirectoryDropOwnerTests(unittest.TestCase):
    setUp = window_tests.WindowCoordinatorTests.setUp
    tearDown = window_tests.WindowCoordinatorTests.tearDown
    run_owner = window_tests.WindowCoordinatorTests.run_owner

    def test_valid_drop_only_authorizes_and_replies_then_normal_close_still_drains(self):
        callback = Mock(return_value={"path": str(self.data)})
        self.app.state.authorize_window_directory_drop = callback
        event = {"event": "directory_dropped", "request_id": "a" * 32, "path": str(self.data)}

        def sequence(host):
            host.stdout.put(event)
            host.stdout.put({"event": "close_requested"})

        host = window_tests.FakeHost(self.order, self.engine, after_start=sequence)
        self.run_owner(host)
        callback.assert_called_once_with(str(self.data))
        self.assertTrue(self.app.state.window_directory_drop)
        self.assertIn({"op": "directory_result", "request_id": "a" * 32, "path": str(self.data)}, host.operations)
        self.assertLess(self.order.index("host:directory_result"), self.order.index("engine:begin"))

    def failed_grant(self, exception, reason):
        callback = Mock(side_effect=exception)
        self.app.state.authorize_window_directory_drop = callback
        event = {"event": "directory_dropped", "request_id": "b" * 32, "path": str(self.data)}
        host = window_tests.FakeHost(self.order, self.engine, after_start=lambda h: (
            h.stdout.put(event), h.stdout.put({"event": "close_requested"})))
        self.run_owner(host)
        replies = [op for op in host.operations if op["op"] == "directory_result"]
        self.assertEqual(len(replies), 1)
        self.assertIn(reason, replies[0]["error"])
        self.assertNotIn("host:error", self.order)

    def test_rejected_grant_is_nonfatal_and_window_can_close_normally(self):
        self.failed_grant(ValueError("synthetic denied"), "synthetic denied")

    def test_storage_error_is_nonfatal_and_window_can_close_normally(self):
        self.failed_grant(OSError("synthetic denied"), "无法接收")

    def test_drop_queued_after_close_request_never_grants_a_new_directory(self):
        callback = Mock()
        self.app.state.authorize_window_directory_drop = callback
        event = {"event": "directory_dropped", "request_id": "c" * 32, "path": str(self.data)}
        host = window_tests.FakeHost(self.order, self.engine, after_start=lambda h: (
            h.stdout.put({"event": "close_requested"}), h.stdout.put(event)))
        self.run_owner(host)
        callback.assert_not_called()
        self.assertTrue(any(op["op"] == "directory_result" and "退出" in op.get("error", "")
                            for op in host.operations))


if __name__ == "__main__":
    unittest.main()
