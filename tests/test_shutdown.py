"""Safe desktop shutdown uses isolated synthetic media and owned children only."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from PIL import Image

from mediaslimx import media, pdf, process_control
from mediaslimx.engine import Engine
from mediaslimx.paths import commit_file, fingerprint


PARAMS = {"preset": "balanced", "max_width": None, "max_height": None}


def await_file(path, timeout=5):
    deadline = time.monotonic() + timeout
    while not path.exists():
        if time.monotonic() >= deadline:
            raise AssertionError("Owned fixture child did not become ready")
        time.sleep(.01)


class OwnedProcessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_cancel_reaps_only_owned_child_and_scope_does_not_leak(self):
        unrelated = subprocess.Popen([getattr(sys, "_base_executable", sys.executable), "-c", "import time; time.sleep(30)"],
                                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL)
        event, errors, children = threading.Event(), [], []
        ready = self.root / "ready"
        popen = subprocess.Popen

        def track(*args, **kwargs):
            child = popen(*args, **kwargs)
            if Path(args[0][0]).name.casefold() != "taskkill.exe":
                children.append(child)
            return child

        def work():
            try:
                with process_control.cancel_scope(event):
                    process_control.run(
                        [sys.executable, "-c", "import pathlib,sys,time; pathlib.Path(sys.argv[1]).touch(); time.sleep(30)", str(ready)],
                        timeout=30, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            except BaseException as exc:
                errors.append(exc)

        thread = threading.Thread(target=work)
        try:
            with patch.object(process_control.subprocess, "Popen", side_effect=track):
                thread.start()
                await_file(ready)
                event.set()
                thread.join(5)
            self.assertFalse(thread.is_alive())
            self.assertEqual(len(errors), 1)
            self.assertIsInstance(errors[0], InterruptedError)
            self.assertEqual(len(children), 1)
            self.assertIsNotNone(children[0].poll())
            self.assertIsNone(unrelated.poll())
            # The cancelled event must not affect unrelated callers or scans.
            result = process_control.run([sys.executable, "-c", "print('scan remains available')"],
                                         timeout=5, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.assertIn(b"scan remains available", result.stdout)
        finally:
            event.set()
            thread.join(5)
            unrelated.kill()
            unrelated.communicate()

    def test_text_request_survives_poll_retries_and_timeout_reaps_child(self):
        event = threading.Event()
        request = json.dumps({"operation": "inspect", "source": "synthetic.pdf"})
        with process_control.cancel_scope(event):
            result = process_control.run(
                [sys.executable, "-c", "import sys,time; value=sys.stdin.read(); time.sleep(.25); print(value)"],
                input=request, text=True, encoding="utf-8", stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, timeout=5, check=True)
        self.assertEqual(json.loads(result.stdout), json.loads(request))
        children = []
        popen = subprocess.Popen

        def track(*args, **kwargs):
            child = popen(*args, **kwargs)
            if Path(args[0][0]).name.casefold() != "taskkill.exe":
                children.append(child)
            return child

        with patch.object(process_control.subprocess, "Popen", side_effect=track):
            with process_control.cancel_scope(event), self.assertRaises(subprocess.TimeoutExpired):
                process_control.run([sys.executable, "-c", "import time; time.sleep(30)"],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=.15)
        self.assertEqual(len(children), 1)
        self.assertIsNotNone(children[0].poll())

    def test_already_cancelled_scope_never_spawns_a_child(self):
        event = threading.Event()
        event.set()
        with patch.object(process_control.subprocess, "Popen") as popen:
            with process_control.cancel_scope(event), self.assertRaises(InterruptedError):
                process_control.run([sys.executable, "-c", "pass"], timeout=5)
        popen.assert_not_called()

    def test_pdf_parent_uses_its_worker_cancellation_scope_before_spawn(self):
        event = threading.Event()
        event.set()
        with patch.object(pdf, "available", return_value=True), patch.object(process_control.subprocess, "Popen") as popen:
            with process_control.cancel_scope(event), self.assertRaises(InterruptedError):
                pdf.inspect(self.root / "synthetic.pdf")
        popen.assert_not_called()

    @unittest.skipUnless(os.name == "nt", "Windows venv redirector ownership")
    def test_windows_cancel_also_stops_the_actual_venv_worker(self):
        import ctypes
        from ctypes import wintypes

        ready, worker = self.root / "actual-pid.txt", self.root / "worker.py"
        worker.write_text(
            "import os,pathlib,sys,time\n"
            "pathlib.Path(sys.argv[1]).write_text(str(os.getpid()))\n"
            "sys.stdin.read()\ntime.sleep(30)\n", encoding="utf-8")
        event, errors = threading.Event(), []

        def work():
            try:
                with process_control.cancel_scope(event):
                    process_control.run([sys.executable, "-I", "-X", "utf8", str(worker), str(ready)],
                                        input="{}", text=True, encoding="utf-8", stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, timeout=20)
            except BaseException as exc:
                errors.append(exc)

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        thread, handle, actual = threading.Thread(target=work), None, None
        thread.start()
        try:
            await_file(ready)
            actual = int(ready.read_text())
            handle = kernel.OpenProcess(0x00100000, False, actual)  # SYNCHRONIZE only.
            self.assertTrue(handle)
            event.set()
            thread.join(8)
            self.assertFalse(thread.is_alive())
            self.assertEqual(kernel.WaitForSingleObject(handle, 1000), 0)
            self.assertEqual(len(errors), 1)
            self.assertIsInstance(errors[0], InterruptedError)
        finally:
            event.set()
            if handle and kernel.WaitForSingleObject(handle, 0) == 258:
                subprocess.run([str(Path(os.environ["SystemRoot"]) / "System32" / "taskkill.exe"),
                                "/PID", str(actual), "/T", "/F"], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
            thread.join(8)
            if handle:
                kernel.CloseHandle(handle)


class EngineShutdownTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.root = self.base / "media"
        self.root.mkdir()
        self.source = self.root / "sample.jpg"
        Image.new("RGB", (640, 480), (230, 80, 20)).save(self.source, quality=100)
        self.original = self.source.read_bytes()
        self.engine = Engine(self.base / "data", [self.root])
        self.scan = self.engine.scan(str(self.root))

    def tearDown(self):
        self.engine.begin_shutdown()
        self.engine.wait_shutdown(10)
        self.tmp.cleanup()

    def create(self, mode="export"):
        return self.engine.create(self.scan["id"], [e["id"] for e in self.scan["entries"]], PARAMS,
                                  mode, output=str(self.base / "output"), backup=str(self.base / "backups"))

    def assert_clean(self):
        self.assertEqual(list(self.engine.work_dir.iterdir()), [])
        self.assertEqual(list(self.base.rglob(".mediaslimx-*.tmp")), [])

    def test_empty_shutdown_is_idempotent_and_rejects_new_processing_and_restore(self):
        self.engine.begin_shutdown()
        self.engine.begin_shutdown()
        self.assertTrue(self.engine.closing.is_set())
        self.assertTrue(self.engine.wait_shutdown(0))
        with self.assertRaisesRegex(ValueError, "安全退出"):
            self.create()
        with self.assertRaisesRegex(ValueError, "安全退出"):
            self.engine.restore("not-an-existing-task")
        other = Engine(self.base / "other-data", [self.root])
        self.assertFalse(other.closing.is_set())
        other.begin_shutdown()
        self.assertTrue(other.wait_shutdown(0))

    def test_failed_worker_start_leaves_honest_history_and_can_shutdown(self):
        with patch.object(threading.Thread, "start", side_effect=RuntimeError("synthetic thread limit")):
            with self.assertRaisesRegex(ValueError, "无法启动后台处理任务"):
                self.create()
        self.assertEqual(self.engine.events, {})
        self.assertEqual(self.engine.threads, {})
        self.assertFalse(self.engine.worker_lock.locked())
        tasks = self.engine.all("task")
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["status"], "interrupted")
        self.assertIn("synthetic thread limit", tasks[0]["error"])
        self.assertEqual(tasks[0]["entries"][0]["status"], "cancelled")
        self.assertEqual(self.source.read_bytes(), self.original)
        self.engine.begin_shutdown()
        self.assertTrue(self.engine.wait_shutdown(0))
        restarted = Engine(self.base / "data", [self.root])
        self.assertEqual(restarted.get("task", tasks[0]["id"])["status"], "interrupted")
        self.assert_clean()

    def test_shutdown_cancels_owned_encoding_and_keeps_sources_and_previous_results(self):
        Image.new("RGB", (640, 480), "blue").save(self.root / "second.jpg", quality=100)
        Image.new("RGB", (640, 480), "green").save(self.root / "third.jpg", quality=100)
        self.scan = self.engine.scan(str(self.root))
        ready = self.base / "encoding-ready"
        optimize, count = media.optimize, 0

        def encode(*args):
            nonlocal count
            count += 1
            if count == 2:
                media.run([sys.executable, "-c", "import pathlib,sys,time; pathlib.Path(sys.argv[1]).touch(); time.sleep(30)", str(ready)], 30)
            return optimize(*args)

        with patch.object(media, "optimize", side_effect=encode):
            key = self.create()
            await_file(ready)
            self.engine.begin_shutdown()
            self.assertTrue(self.engine.wait_shutdown(5))
        task = self.engine.get("task", key)
        self.assertEqual(task["status"], "cancelled")
        self.assertEqual([e["status"] for e in task["entries"]], ["success", "cancelled", "cancelled"])
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertTrue(Path(task["entries"][0]["destination"]).is_file())
        self.assert_clean()

    def test_shutdown_before_publication_leaves_original_and_removes_target_temp(self):
        entered, release = threading.Event(), threading.Event()

        def commit(source, destination, **kwargs):
            if Path(destination) == self.source:
                entered.set()
                self.assertTrue(release.wait(5))
            return commit_file(source, destination, **kwargs)

        with patch("mediaslimx.engine.commit_file", side_effect=commit):
            key = self.engine.create(
                self.scan["id"], [e["id"] for e in self.scan["entries"]], PARAMS, "overwrite", confirm=True)
            try:
                self.assertTrue(entered.wait(5))
                self.engine.begin_shutdown()
                self.assertFalse(self.engine.wait_shutdown(.05))
            finally:
                release.set()
                self.assertTrue(self.engine.wait_shutdown(5))
        task = self.engine.get("task", key)
        self.assertEqual(task["entries"][0]["status"], "cancelled")
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assert_clean()

    def test_shutdown_after_atomic_replace_waits_for_record_and_fingerprint(self):
        published, release = threading.Event(), threading.Event()

        def commit(source, destination, **kwargs):
            result = commit_file(source, destination, **kwargs)
            if Path(destination) == self.source:
                published.set()
                self.assertTrue(release.wait(5))
            return result

        with patch("mediaslimx.engine.commit_file", side_effect=commit):
            key = self.engine.create(self.scan["id"], [e["id"] for e in self.scan["entries"]],
                                     PARAMS, "overwrite", confirm=True)
            try:
                self.assertTrue(published.wait(5))
                self.assertNotEqual(self.source.read_bytes(), self.original)
                self.engine.begin_shutdown()
                self.assertFalse(self.engine.wait_shutdown(.05))
            finally:
                release.set()
                self.assertTrue(self.engine.wait_shutdown(5))
        task = self.engine.get("task", key)
        entry = task["entries"][0]
        self.assertEqual(entry["status"], "success")
        self.assertEqual(entry["result_fp"], fingerprint(self.source))
        restarted = Engine(self.base / "data", [self.root])
        self.assertEqual(restarted.get("task", key)["entries"][0]["status"], "success")
        with restarted.db() as db:
            self.assertIsNotNone(db.execute("SELECT hash FROM processed WHERE hash=?", (entry["result_fp"]["sha256"],)).fetchone())
        self.assert_clean()

    def test_shutdown_after_backup_preserves_backup_and_leaves_source_unchanged(self):
        backed_up, release = threading.Event(), threading.Event()

        def commit(source, destination, **kwargs):
            result = commit_file(source, destination, **kwargs)
            if self.base / "backups" in Path(destination).parents:
                backed_up.set()
                self.assertTrue(release.wait(5))
            return result

        with patch("mediaslimx.engine.commit_file", side_effect=commit):
            key = self.create("backup")
            try:
                self.assertTrue(backed_up.wait(5))
                self.engine.begin_shutdown()
                self.assertFalse(self.engine.wait_shutdown(.05))
            finally:
                release.set()
                self.assertTrue(self.engine.wait_shutdown(5))
        entry = self.engine.get("task", key)["entries"][0]
        self.assertEqual(entry["status"], "cancelled")
        self.assertEqual(Path(entry["backup"]).read_bytes(), self.original)
        self.assertEqual(entry["backup_fp"], fingerprint(entry["backup"]))
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assert_clean()

    def test_shutdown_waits_for_synchronous_restore_without_interrupting_replacement(self):
        key = self.create("backup")
        self.engine.wait(key)
        entered, release = threading.Event(), threading.Event()
        results, errors = [], []

        def commit(source, destination, **kwargs):
            entered.set()
            self.assertTrue(release.wait(5))
            return commit_file(source, destination, **kwargs)

        def restore():
            try:
                results.append(self.engine.restore(key))
            except BaseException as exc:
                errors.append(exc)

        thread = threading.Thread(target=restore)
        with patch("mediaslimx.engine.commit_file", side_effect=commit):
            thread.start()
            try:
                self.assertTrue(entered.wait(5))
                self.engine.begin_shutdown()
                self.assertFalse(self.engine.wait_shutdown(.05))
            finally:
                release.set()
                thread.join(5)
                self.assertTrue(self.engine.wait_shutdown(5))
        self.assertEqual(errors, [])
        self.assertFalse(thread.is_alive())
        self.assertEqual(results[0]["entries"][0]["status"], "restored")
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assert_clean()

    def test_close_racing_task_admission_cannot_miss_the_new_worker(self):
        admitting, continue_admission, encoding, finish_encoding, closed = (threading.Event() for _ in range(5))
        results, errors = [], []
        save, optimize = self.engine.save, media.optimize

        def save_barrier(kind, record):
            if kind == "task" and not admitting.is_set():
                admitting.set()
                self.assertTrue(continue_admission.wait(5))
            return save(kind, record)

        def encode(*args):
            encoding.set()
            self.assertTrue(finish_encoding.wait(5))
            return optimize(*args)

        def create():
            try:
                results.append(self.create())
            except BaseException as exc:
                errors.append(exc)

        def close():
            self.engine.begin_shutdown()
            closed.set()

        starter, closer = threading.Thread(target=create), threading.Thread(target=close)
        with patch.object(self.engine, "save", side_effect=save_barrier), patch.object(media, "optimize", side_effect=encode):
            starter.start()
            try:
                self.assertTrue(admitting.wait(5))
                closer.start()
                self.assertFalse(closed.wait(.05))
                continue_admission.set()
                starter.join(5)
                closer.join(5)
                self.assertTrue(closed.is_set())
                self.assertEqual(errors, [])
            finally:
                continue_admission.set()
                finish_encoding.set()
                starter.join(5)
                if closer.ident is not None:
                    closer.join(5)
                self.assertTrue(self.engine.wait_shutdown(5))
        self.assertFalse(starter.is_alive())
        task = self.engine.get("task", results[0])
        self.assertEqual(task["status"], "cancelled")
        self.assertEqual(task["entries"][0]["status"], "cancelled")
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assert_clean()


if __name__ == "__main__":
    unittest.main()
