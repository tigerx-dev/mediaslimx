"""Browser lifetime boundary for the Windows frozen launcher; no real browser."""
import os
import subprocess
import unittest
from unittest.mock import Mock, patch

from mediaslimx import launch


@unittest.skipUnless(os.name == "nt", "Windows frozen browser launch")
class PortableLaunchTests(unittest.TestCase):
    url = "http://127.0.0.1:8767/#token=" + "a" * 43

    def test_browser_uses_explicit_breakaway_and_no_shell(self):
        with patch.object(launch.sys, "frozen", True, create=True), patch.object(launch.subprocess, "run", return_value=Mock(returncode=0)) as run:
            self.assertTrue(launch._open_browser(self.url))
        args, kwargs = run.call_args
        self.assertEqual(args[0], [launch.sys.executable, "--mediaslimx-browser-worker"])
        self.assertEqual(kwargs["creationflags"], subprocess.CREATE_NO_WINDOW | subprocess.CREATE_BREAKAWAY_FROM_JOB)
        self.assertEqual(kwargs["env"]["MEDIASLIMX_BROWSER_URL"], self.url)
        self.assertNotIn("shell", kwargs)

    def test_breakaway_denied_or_helper_timeout_never_retries_inside_the_job(self):
        for error in (OSError("outer Job denied breakaway"), subprocess.TimeoutExpired("helper", 10)):
            with self.subTest(error=type(error).__name__), patch.object(launch.sys, "frozen", True, create=True), patch.object(launch.subprocess, "run", side_effect=error) as run, patch.object(launch.webbrowser, "open") as browser:
                self.assertFalse(launch._open_browser(self.url))
                run.assert_called_once()
                browser.assert_not_called()

    def test_browser_worker_rejects_nonlocal_or_invalid_urls_without_opening_them(self):
        for url in ("file:///C:/private.txt", "http://example.org/#token=" + "a" * 43,
                    "http://127.0.0.1:8767/?x=1#token=" + "a" * 43, "http://127.0.0.1:8767/#token=short"):
            with self.subTest(url=url), patch.dict(os.environ, {"MEDIASLIMX_BROWSER_URL": url}), patch.object(launch.webbrowser, "open") as browser:
                self.assertEqual(launch._browser_worker(), 1)
                browser.assert_not_called()

    def test_browser_worker_accepts_only_its_local_url_and_removes_environment_secret(self):
        with patch.dict(os.environ, {"MEDIASLIMX_BROWSER_URL": self.url}), patch.object(launch.webbrowser, "open", return_value=True) as browser:
            self.assertEqual(launch._browser_worker(), 0)
            browser.assert_called_once_with(self.url)
            self.assertNotIn("MEDIASLIMX_BROWSER_URL", os.environ)


if __name__ == "__main__":
    unittest.main()
