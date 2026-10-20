"""Shutdown ordering: a waiting native request must release before HTTP drain."""
import unittest
from unittest.mock import Mock, patch

import uvicorn

from mediaslimx.server import LocalServer, run_server


class ShutdownTests(unittest.IsolatedAsyncioTestCase):
    async def test_owned_picker_is_stopped_before_uvicorn_waits_for_http_workers(self):
        events = []
        server = LocalServer(uvicorn.Config(Mock()), lambda: events.append("picker stopped"))
        sockets = [Mock()]

        async def drain(instance, sockets=None):
            self.assertEqual(events, ["picker stopped"])
            self.assertIs(instance, server)
            self.assertEqual(sockets, saved_sockets)
            events.append("HTTP drained")

        saved_sockets = sockets
        with patch.object(uvicorn.Server, "shutdown", new=drain):
            await server.shutdown(sockets=sockets)
        self.assertEqual(events, ["picker stopped", "HTTP drained"])


class ServerFailureTests(unittest.TestCase):
    def test_ctrl_c_returns_normally_and_still_closes_owned_picker(self):
        app = Mock()
        with patch("mediaslimx.server.uvicorn.Config"), patch("mediaslimx.server.LocalServer") as server:
            server.return_value.run.side_effect = KeyboardInterrupt
            self.assertIsNone(run_server(app, 8765))
        server.return_value.stop_native_picker.assert_called_once_with()

    def test_startup_failure_still_closes_owned_picker_with_bounded_http_grace(self):
        app = Mock()
        with patch("mediaslimx.server.uvicorn.Config") as config, patch("mediaslimx.server.LocalServer") as server:
            server.return_value.run.side_effect = OSError("bind failed")
            with self.assertRaisesRegex(OSError, "bind failed"):
                run_server(app, 8765)
        config.assert_called_once_with(app, host="127.0.0.1", port=8765, access_log=False,
                                       timeout_graceful_shutdown=5)
        server.assert_called_once_with(config.return_value, app.state.stop_native_picker)
        server.return_value.stop_native_picker.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
