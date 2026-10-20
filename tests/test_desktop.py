"""Risk-bearing picker protocol and process lifetime tests; no GUI is opened."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
import uuid

from mediaslimx import desktop


@unittest.skipUnless(os.name == "nt", "Windows child-process picker")
class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.request_id = uuid.uuid4().hex
        self.process = Mock()
        self.process.returncode = 0
        self.process.poll.return_value = 0
        self.process.communicate.return_value = (json.dumps({"path": str(self.root)}).encode(), b"")

    def tearDown(self):
        self.tmp.cleanup()

    def test_path_is_data_and_helper_uses_current_windows_python(self):
        with patch.object(desktop.subprocess, "Popen", return_value=self.process) as launch:
            self.assertEqual(desktop.choose_native_folder(self.root, self.request_id), str(self.root))
        args, kwargs = launch.call_args
        self.assertEqual(args[0], [getattr(desktop.sys, "_base_executable", desktop.sys.executable), "-X", "utf8", "-m", "mediaslimx.desktop"])
        self.assertNotIn(str(self.root), args[0])
        self.assertEqual(kwargs["env"]["MEDIASLIMX_PICKER_INITIAL"], str(self.root))
        self.assertNotIn("shell", kwargs)
        self.assertIsNone(desktop._process)
        self.assertFalse(desktop.PICKER_LOCK.locked())

    def test_cancel_before_spawn_does_not_open_a_window(self):
        desktop.cancel_native_folder(self.request_id)
        with patch.object(desktop.subprocess, "Popen") as launch:
            self.assertIsNone(desktop.choose_native_folder(self.root, self.request_id))
        launch.assert_not_called()

    def test_cancel_matches_only_its_own_request_and_discards_late_selection(self):
        def complete(**kwargs):
            desktop.cancel_native_folder("another-request")
            self.process.kill.assert_not_called()
            desktop.cancel_native_folder(self.request_id)
            self.process.kill.assert_called_once()
            self.process.poll.return_value = 0
            return json.dumps({"path": str(self.root)}).encode(), b""
        self.process.poll.return_value = None
        self.process.communicate.side_effect = complete
        with patch.object(desktop.subprocess, "Popen", return_value=self.process):
            self.assertIsNone(desktop.choose_native_folder(self.root, self.request_id))

    def test_timeout_kills_and_reaps_child_then_releases_lock(self):
        self.process.communicate.side_effect = [subprocess.TimeoutExpired("picker", 300), (b"", b"")]
        with patch.object(desktop.subprocess, "Popen", return_value=self.process):
            with self.assertRaisesRegex(ValueError, "超时"):
                desktop.choose_native_folder(self.root, self.request_id)
        self.process.kill.assert_called_once()
        self.assertEqual(self.process.communicate.call_count, 2)
        self.assertFalse(desktop.PICKER_LOCK.locked())

    def test_missing_tk_is_an_actionable_error(self):
        self.process.returncode = 1
        self.process.communicate.return_value = (json.dumps({"error": "Python 缺少 Tcl/Tk，请使用网页目录浏览器"}).encode(), b"")
        with patch.object(desktop.subprocess, "Popen", return_value=self.process):
            with self.assertRaisesRegex(ValueError, "Tcl/Tk"):
                desktop.choose_native_folder(self.root, self.request_id)

    def test_invalid_protocol_is_not_a_500(self):
        for raw in [b"", b"[]", b"bad-json", b'{"path":2}']:
            self.process.communicate.return_value = (raw, b"")
            with patch.object(desktop.subprocess, "Popen", return_value=self.process):
                with self.assertRaises(ValueError):
                    desktop.choose_native_folder(self.root, self.request_id)

    def test_spawn_failure_releases_lock(self):
        with patch.object(desktop.subprocess, "Popen", side_effect=OSError("spawn failed")):
            with self.assertRaises(OSError):
                desktop.choose_native_folder(self.root, self.request_id)
        self.assertFalse(desktop.PICKER_LOCK.locked())
        self.assertIsNone(desktop._process)

    def test_service_closed_before_spawn_cannot_open_a_window(self):
        closing = threading.Event()
        desktop.stop_native_folder(closing)
        with patch.object(desktop.subprocess, "Popen") as launch:
            self.assertIsNone(desktop.choose_native_folder(self.root, self.request_id, closing=closing))
        launch.assert_not_called()
        self.assertFalse(desktop.PICKER_LOCK.locked())

    def test_service_stop_only_kills_its_owned_picker_and_discards_late_result(self):
        closing, another_app = threading.Event(), threading.Event()

        def complete(**kwargs):
            desktop.stop_native_folder(another_app)
            self.process.kill.assert_not_called()
            self.assertFalse(closing.is_set())
            desktop.stop_native_folder(closing)
            self.process.kill.assert_called_once()
            self.process.poll.return_value = 0
            return json.dumps({"path": str(self.root)}).encode(), b""

        self.process.poll.return_value = None
        self.process.communicate.side_effect = complete
        with patch.object(desktop.subprocess, "Popen", return_value=self.process):
            self.assertIsNone(desktop.choose_native_folder(self.root, self.request_id, closing=closing))
        self.assertTrue(closing.is_set())
        self.assertIsNone(desktop._active_owner)
        self.assertIsNone(desktop._process)

    def test_stop_during_spawn_reaps_the_registered_helper_without_a_new_window(self):
        closing, spawning, release_spawn, killed = (threading.Event() for _ in range(4))
        results, errors = [], []
        self.process.poll.return_value = None
        self.process.kill.side_effect = killed.set

        def launch(*args, **kwargs):
            spawning.set()
            if not release_spawn.wait(3):
                raise AssertionError("Test did not release the pending spawn")
            return self.process

        def complete(**kwargs):
            if not killed.wait(3):
                raise AssertionError("Service stop did not close its newly registered helper")
            self.process.poll.return_value = 0
            return json.dumps({"path": str(self.root)}).encode(), b""

        def choose():
            try:
                results.append(desktop.choose_native_folder(self.root, self.request_id, closing=closing))
            except BaseException as error:
                errors.append(error)

        self.process.communicate.side_effect = complete
        worker = threading.Thread(target=choose)
        stopper = threading.Thread(target=desktop.stop_native_folder, args=(closing,))
        with patch.object(desktop.subprocess, "Popen", side_effect=launch):
            worker.start()
            try:
                self.assertTrue(spawning.wait(3))
                stopper.start()
                release_spawn.set()
                worker.join(5)
                stopper.join(5)
            finally:
                release_spawn.set()
                worker.join(5)
                if stopper.ident is not None:
                    stopper.join(5)
        self.assertFalse(worker.is_alive())
        self.assertFalse(stopper.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(results, [None])
        self.process.kill.assert_called_once()
        self.assertFalse(desktop.PICKER_LOCK.locked())
        self.assertIsNone(desktop._process)


if __name__ == "__main__":
    unittest.main()
