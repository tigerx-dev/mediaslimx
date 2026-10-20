"""Native-window ownership and shutdown tests; no GUI or shared service used."""
import asyncio
import io
import json
from pathlib import Path
import queue
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from mediaslimx import window
from mediaslimx.app import create_app
from mediaslimx.engine import Engine


class QueueReader:
    def __init__(self):
        self.lines = queue.Queue()
        self.closed = False

    def put(self, value):
        self.lines.put(json.dumps(value) + "\n" if isinstance(value, dict) else value)

    def readline(self, limit):
        try:
            return self.lines.get(timeout=5)
        except queue.Empty:
            return ""

    def close(self):
        self.closed = True


class FakeHost:
    pid = 98765

    def __init__(self, order, engine, after_start=None, after_confirm=None, after_error=None):
        self.order, self.engine = order, engine
        self.stdout = QueueReader()
        self.stdin = SimpleNamespace(write=self.write, flush=lambda: None, close=lambda: None)
        self.after_start, self.after_confirm = after_start, after_confirm
        self.after_error = after_error
        self.operations = []
        self.returncode = None
        self.killed = False

    def write(self, line):
        value = json.loads(line)
        self.operations.append(value)
        op = value["op"]
        self.order.append("host:" + op)
        if op == "start":
            self.stdout.put({"event": "ready", "pid": self.pid, "hwnd": 123456})
            if self.after_start:
                self.after_start(self)
        elif op == "confirm_close" and self.after_confirm:
            self.after_confirm(self)
        elif op == "error" and self.after_error:
            self.after_error(self)
        elif op == "close":
            if not self.engine.drained:
                raise AssertionError("Display closed before file work drained")
            self.returncode = 0
            self.stdout.put("")

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        if self.returncode is None:
            raise AssertionError("Owner waited for a host without sending close")
        return self.returncode

    def kill(self):
        self.killed = True
        self.returncode = -1
        self.stdout.put("")


class FakeEngine:
    def __init__(self, order, busy=False):
        self.order = order
        self.busy = busy
        self.worker_lock = SimpleNamespace(locked=lambda: self.busy)
        self.closing = threading.Event()
        self.drained = False

    def begin_shutdown(self):
        self.order.append("engine:begin")
        self.closing.set()

    def wait_shutdown(self):
        self.order.append("engine:wait")
        self.drained = True
        return True


class FakeServer:
    def __init__(self, order, fail=False):
        self.order, self.fail = order, fail
        self.started = threading.Event()
        self.stopped = threading.Event()
        self.stop = threading.Event()

    def run(self):
        self.order.append("server:run")
        self.started.set()
        try:
            if self.fail:
                raise OSError("synthetic bind failure")
            if not self.stop.wait(5):
                raise AssertionError("Window owner leaked its local server thread")
        finally:
            self.order.append("server:ended")
            self.stopped.set()

    @property
    def should_exit(self):
        return self.stop.is_set()

    @should_exit.setter
    def should_exit(self, value):
        if value:
            self.order.append("server:exit")
            self.stop.set()


class WindowCoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = Path(self.tmp.name)
        self.host_dir = self.data / "host"
        self.host_dir.mkdir()
        (self.host_dir / "MediaSlimX.Window.exe").touch()
        self.order = []
        self.engine = FakeEngine(self.order)
        self.server = FakeServer(self.order)
        self.app = SimpleNamespace(state=SimpleNamespace(
            token="synthetic-window-token-not-a-real-secret",
            stop_native_picker=lambda: self.order.append("picker:stop")))

    def tearDown(self):
        self.server.stop.set()
        self.tmp.cleanup()

    def run_owner(self, host=None, verify=None, popen_error=None):
        host = host or FakeHost(self.order, self.engine, after_start=lambda h: h.stdout.put({"event": "close_requested"}))

        def ready(url, data):
            if not self.server.started.wait(2):
                raise AssertionError("Fake server never started")
            if self.server.fail:
                raise OSError("not listening")
            return {}

        with patch("uvicorn.Config"), patch("mediaslimx.server.LocalServer", return_value=self.server), \
                patch("mediaslimx.launch._verify", side_effect=verify or ready), \
                patch.object(window.subprocess, "Popen", side_effect=popen_error, return_value=host) as launch:
            window.run_window(self.engine, self.app, 18888, self.host_dir, self.data)
        self.assertTrue(self.server.stopped.is_set())
        self.assertTrue(self.engine.drained)
        self.assertFalse((self.data / "window.json").exists())
        return host, launch

    def test_idle_close_drains_own_backend_before_closing_display(self):
        host, _ = self.run_owner()
        for first, second in (("engine:begin", "picker:stop"), ("picker:stop", "server:exit"),
                              ("server:ended", "engine:wait"), ("engine:wait", "host:close")):
            self.assertLess(self.order.index(first), self.order.index(second), self.order)
        self.assertFalse(host.killed)
        self.assertNotIn("confirm_close", [op["op"] for op in host.operations])
        self.assertFalse(any(t.is_alive() and t.name.startswith("MediaSlimX-") for t in threading.enumerate()))

    def test_busy_no_keeps_running_then_yes_drains_without_a_second_owner(self):
        self.engine.busy = True
        confirmations = []

        def confirm(host):
            confirmations.append(host.operations[-1])
            self.assertFalse(self.engine.closing.is_set())
            self.assertFalse(self.server.should_exit)
            if len(confirmations) == 1:
                host.stdout.put({"event": "close_cancelled"})
                host.stdout.put({"event": "close_requested"})
            else:
                host.stdout.put({"event": "close_confirmed"})

        host = FakeHost(self.order, self.engine,
                        after_start=lambda h: h.stdout.put({"event": "close_requested"}), after_confirm=confirm)
        _, launch = self.run_owner(host)
        self.assertEqual(len(confirmations), 2)
        self.assertTrue(all(value["busy"] is True for value in confirmations))
        launch.assert_called_once()
        self.assertEqual(self.order.count("engine:begin"), 1)
        self.assertFalse(host.killed)

    def test_host_error_uses_same_drain_and_does_not_launch_a_browser_fallback(self):
        host = FakeHost(self.order, self.engine,
                        after_start=lambda h: h.stdout.put({"event": "error", "message": "synthetic renderer error"}))
        with self.assertLogs("mediaslimx.window", level="ERROR"), patch("webbrowser.open") as browser:
            self.run_owner(host)
        browser.assert_not_called()
        self.assertLess(self.order.index("engine:wait"), self.order.index("host:close"))

    def test_abrupt_host_eof_still_drains_server_and_engine(self):
        def ended(host):
            host.returncode = 1
            host.stdout.put("")
        self.run_owner(FakeHost(self.order, self.engine, after_start=ended))
        self.assertEqual(self.order.count("engine:begin"), 1)
        self.assertLess(self.order.index("server:ended"), self.order.index("engine:wait"))

    def test_native_identity_mismatch_fails_closed_and_drains(self):
        host = FakeHost(self.order, self.engine)

        def start(value):
            value.stdout.put({"event": "ready", "pid": value.pid + 1, "hwnd": 123456})
        host.after_start = start
        with self.assertRaisesRegex(ValueError, "身份"):
            self.run_owner(host)
        self.assertTrue(self.engine.drained)
        self.assertTrue(self.server.stopped.is_set())

    def test_service_readiness_failure_never_spawns_display_and_leaks_no_http_thread(self):
        with patch("uvicorn.Config"), patch("mediaslimx.server.LocalServer", return_value=self.server), \
                patch("mediaslimx.launch._verify", side_effect=OSError("synthetic not ready")), \
                patch.object(window.time, "sleep"), patch.object(window.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(RuntimeError, "就绪"):
                window.run_window(self.engine, self.app, 18888, self.host_dir, self.data)
        launch.assert_not_called()
        self.assertTrue(self.server.stopped.is_set())
        self.assertTrue(self.engine.drained)

    def test_bind_failure_never_leaks_non_daemon_http_thread(self):
        self.server.fail = True
        with self.assertLogs("mediaslimx.window", level="ERROR"), patch.object(window.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "启动失败|未能就绪"):
                self.run_owner()
        self.assertTrue(self.server.stopped.is_set())
        self.assertTrue(self.engine.drained)

    def test_display_spawn_failure_also_drains_backend(self):
        with self.assertRaisesRegex(OSError, "synthetic launch denied"):
            self.run_owner(popen_error=OSError("synthetic launch denied"))
        self.assertTrue(self.server.stopped.is_set())
        self.assertTrue(self.engine.drained)

    def test_drain_exception_keeps_display_owned_until_close_retry_succeeds(self):
        failed, may_finish = threading.Event(), threading.Event()
        errors, attempts = [], []
        normal_wait = self.engine.wait_shutdown

        def wait():
            attempts.append(True)
            if not may_finish.is_set():
                raise RuntimeError("synthetic drain failure")
            return normal_wait()

        self.engine.wait_shutdown = wait
        host = FakeHost(self.order, self.engine,
                        after_start=lambda h: h.stdout.put({"event": "close_requested"}),
                        after_error=lambda h: failed.set())

        def owner():
            try:
                self.run_owner(host)
            except BaseException as exc:
                errors.append(exc)

        runner = threading.Thread(target=owner)
        with self.assertLogs("mediaslimx.window", level="ERROR"):
            runner.start()
            try:
                self.assertTrue(failed.wait(5))
                self.assertTrue(runner.is_alive())
                self.assertFalse(self.engine.drained)
                self.assertIsNone(host.poll())
                self.assertFalse(host.killed)
                self.assertNotIn("host:close", self.order)
                self.assertTrue(self.engine.closing.is_set())
            finally:
                may_finish.set()
                host.stdout.put({"event": "close_requested"})
                runner.join(5)
        self.assertFalse(runner.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(len(attempts), 2)
        self.assertEqual(self.order.count("engine:begin"), 1)
        self.assertLess(self.order.index("host:error"), self.order.index("engine:wait"))
        self.assertFalse(host.killed)

    def test_unconfirmed_drain_is_not_treated_as_success(self):
        normal_wait = self.engine.wait_shutdown
        responses = [False]

        def wait():
            return responses.pop() if responses else normal_wait()

        self.engine.wait_shutdown = wait

        def retry(host):
            self.assertFalse(self.engine.drained)
            self.assertNotIn("host:close", self.order)
            host.stdout.put({"event": "close_requested"})

        host = FakeHost(self.order, self.engine,
                        after_start=lambda h: h.stdout.put({"event": "close_requested"}), after_error=retry)
        with self.assertLogs("mediaslimx.window", level="ERROR"):
            self.run_owner(host)
        self.assertLess(self.order.index("host:error"), self.order.index("engine:wait"))
        self.assertFalse(host.killed)

    def test_coordinator_exception_finally_retries_failed_drain_before_closing(self):
        normal_wait = self.engine.wait_shutdown
        attempts = []

        def wait():
            attempts.append(True)
            if len(attempts) == 1:
                raise RuntimeError("synthetic drain failure during identity error")
            return normal_wait()

        self.engine.wait_shutdown = wait
        host = FakeHost(self.order, self.engine,
                        after_start=lambda h: h.stdout.put({"event": "ready", "pid": h.pid + 1, "hwnd": 123456}))
        with self.assertLogs("mediaslimx.window", level="ERROR"), self.assertRaisesRegex(ValueError, "身份"):
            self.run_owner(host)
        self.assertEqual(len(attempts), 2)
        self.assertTrue(self.engine.drained)
        self.assertLess(self.order.index("engine:wait"), self.order.index("host:close"))
        self.assertFalse(host.killed)

    def test_drain_thread_exhaustion_waits_in_owner_without_killing_file_work(self):
        make_thread = threading.Thread

        def thread_factory(*args, **kwargs):
            thread = make_thread(*args, **kwargs)
            if kwargs.get("name") == "MediaSlimX-safe-exit":
                thread.start = Mock(side_effect=RuntimeError("synthetic thread exhaustion"))
            return thread

        with patch.object(window.threading, "Thread", side_effect=thread_factory):
            host, _ = self.run_owner()
        self.assertTrue(self.engine.drained)
        self.assertFalse(host.killed)
        self.assertLess(self.order.index("engine:wait"), self.order.index("host:close"))


class WindowProtocolTests(unittest.TestCase):
    def consume(self, text):
        events = queue.Queue()
        window.read_events(io.StringIO(text), events)
        values = []
        while not events.empty():
            values.append(events.get_nowait())
        return values

    def test_known_messages_and_eof_have_explicit_end_event(self):
        values = self.consume('{"event":"close_requested"}\n{"event":"close_cancelled"}\n')
        self.assertEqual([v["event"] for v in values], ["close_requested", "close_cancelled", "host_ended"])
        self.assertEqual(self.consume(""), [{"event": "host_ended"}])

    def test_unknown_invalid_oversized_and_unterminated_messages_fail_closed(self):
        for text in ('{"event":"shutdown_any_process"}\n', 'not json\n', '[]\n',
                     '{"event": []}\n', '{"event": {}}\n', '{"event":"ready"}',
                     '{"event":"ready","value":"' + "x" * 65536 + '"}\n'):
            with self.subTest(text=text[:60]):
                values = self.consume(text)
                self.assertEqual([v["event"] for v in values], ["error", "host_ended"])


class WindowDefaultRootTests(unittest.TestCase):
    def test_missing_pictures_uses_exe_directory_for_frozen_and_project_for_source(self):
        with tempfile.TemporaryDirectory() as value:
            base = Path(value)
            home, source, bundle = base / "home", base / "project", base / "bundle"
            for path in (home, source, bundle):
                path.mkdir()
            executable = bundle / "MediaSlimX.exe"
            executable.touch()
            with patch.object(window.Path, "home", return_value=home), \
                    patch.object(window.sys, "executable", str(executable)):
                with patch.object(window.sys, "frozen", True, create=True):
                    self.assertEqual(window.default_media_root(source), bundle.resolve())
                with patch.object(window.sys, "frozen", False, create=True):
                    self.assertEqual(window.default_media_root(source), source)
                pictures = home / "Pictures"
                pictures.mkdir()
                with patch.object(window.sys, "frozen", True, create=True):
                    self.assertEqual(window.default_media_root(source), pictures)


class ClosingGuardTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = Path(self.tmp.name)
        self.media = self.data / "media"
        self.media.mkdir()
        self.engine = Engine(self.data / "data", [self.media])
        self.token = "synthetic-closing-guard-token"
        self.port = 18889
        self.app = create_app(self.engine, self.token, self.port)

    async def asyncTearDown(self):
        self.engine.begin_shutdown()
        self.assertTrue(self.engine.wait_shutdown(5))
        self.tmp.cleanup()

    async def request(self, path, method="GET", headers=None, auth=True):
        request_headers = {"host": f"127.0.0.1:{self.port}"}
        if auth:
            request_headers["x-mediaslimx-token"] = self.token
        if method != "GET":
            request_headers["content-type"] = "application/json"
        request_headers.update(headers or {})
        scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
                 "http_version": "1.1", "method": method, "scheme": "http", "path": path,
                 "raw_path": path.encode(), "query_string": b"", "root_path": "",
                 "headers": [(k.encode(), v.encode()) for k, v in request_headers.items()],
                 "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", self.port)}
        messages, received = [], False

        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": b"{}", "more_body": False}
            await asyncio.Event().wait()

        async def send(value):
            messages.append(value)

        await asyncio.wait_for(self.app(scope, receive, send), timeout=5)
        return next(m for m in messages if m["type"] == "http.response.start")["status"]

    async def test_closing_refuses_mutations_keeps_authenticated_reads_and_csrf_checks(self):
        self.assertEqual(await self.request("/api/environment"), 200)
        self.engine.begin_shutdown()
        self.assertEqual(await self.request("/api/scans", "POST"), 503)
        self.assertEqual(await self.request("/api/environment"), 200)
        self.assertEqual(await self.request("/api/environment", auth=False), 401)
        for headers in ({"origin": "https://evil.example"}, {"sec-fetch-site": "cross-site"}, {"host": "evil.example"}):
            self.assertEqual(await self.request("/api/scans", "POST", headers), 403)

    async def test_no_http_shutdown_bridge_is_exposed(self):
        paths = {getattr(route, "path", "") for route in self.app.routes}
        self.assertFalse(any("shutdown" in path or "window/close" in path for path in paths))
        self.assertEqual(await self.request("/api/shutdown", "POST"), 404)


if __name__ == "__main__":
    unittest.main()
