"""Source-level gates for the small C# close capability.

The real WebView2/window interaction is exercised separately with the Windows
acceptance driver; these platform-independent checks pin its security contract.
"""
from pathlib import Path
import unittest


class WindowCloseHostContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (Path(__file__).resolve().parents[1] / "native/MediaSlimX.Window.cs").read_text(encoding="utf-8")

    def method(self, name):
        marker = "\n    private void " + name + "("
        start = self.source.index(marker)
        end = self.source.find("\n    private ", start + len(marker))
        return self.source[start:] if end < 0 else self.source[start:end]

    def web_branch(self, name, following):
        start = self.source.index('if ((string)operation == "' + name + '")')
        end = self.source.index(following, start)
        return self.source[start:end]

    def test_all_web_controls_require_current_top_origin_and_bounded_json(self):
        handler = self.method("OnWebMessage")
        self.assertIn("TopDocumentAddress(e.Source)", handler)
        self.assertIn("TopDocumentAddress(browser.CoreWebView2.Source)", handler)
        self.assertIn("raw.Length > 512", handler)
        self.assertIn("MaxJsonLength = 512", handler)
        self.assertIn("e.AdditionalObjects.Count == 0", handler)
        self.assertIn("core.Settings.AreHostObjectsAllowed = false", self.source)

    def test_language_theme_handshake_grants_no_exit_authority(self):
        branch = self.web_branch("window_ui_ready", 'if ((string)operation == "request_close")')
        for gate in ('message.Count != 3', '!noObjects', '(string)language != "zh-CN"',
                     '(string)language != "en"', '(string)theme != "dark"', '(string)theme != "light"'):
            self.assertIn(gate, branch)
        self.assertNotIn("Emit(", branch)
        self.assertNotIn("Close();", branch)

    def test_normal_quit_action_uses_formclosing_instead_of_confirming_exit(self):
        branch = self.web_branch("request_close", 'if ((string)operation == "close_response")')
        self.assertIn("message.Count != 1", branch)
        self.assertIn("!noObjects", branch)
        self.assertIn("Close();", branch)
        self.assertNotIn('Emit("close_confirmed"', branch)
        closing = self.method("OnClosing")
        self.assertIn('Emit("close_requested", null)', closing)
        self.assertIn("if (closePending) { PostPendingClosePrompt(); return; }", closing)

    def test_response_requires_the_single_outstanding_host_nonce(self):
        branch = self.web_branch("close_response", "// AdditionalObjects supplies a browser-backed File")
        for gate in ('message.Count != 3', '!noObjects', '!closePending', 'shuttingDown',
                     'closeRequestId == null', '(string)identifier != closeRequestId'):
            self.assertIn(gate, branch)
        self.assertIn('(string)decision == "shown"', branch)
        self.assertIn('(string)decision == "stay"', branch)
        self.assertIn('(string)decision == "exit"', branch)
        self.assertIn('Emit("close_cancelled", null)', branch)
        self.assertLess(branch.rindex("InvalidateClosePrompt(false)"), branch.index('Emit("close_confirmed", null)'))

    def test_ack_timeout_requests_default_no_fallback_and_never_implies_consent(self):
        confirm = self.method("ConfirmClose")
        self.assertIn('Guid.NewGuid().ToString("N")', confirm)
        self.assertIn("Interval = 3000", confirm)
        timer = confirm[confirm.index("closeUiTimer.Tick +="):]
        self.assertIn("!closeUiShown", timer)
        self.assertIn("NativeCloseConfirmation()", timer)
        self.assertNotIn('Emit("close_confirmed"', timer)
        native = self.method("NativeCloseConfirmation")
        self.assertIn("MessageBoxDefaultButton.Button2", native)
        self.assertIn("LocalText(", native)
        self.assertIn("InvalidateClosePrompt(true)", native)

    def test_dismiss_revokes_before_notifying_and_stops_the_timer(self):
        invalidate = self.method("InvalidateClosePrompt")
        self.assertLess(invalidate.index("closeRequestId = null"), invalidate.index('"mediaslimx-close-dismiss"'))
        self.assertIn("StopCloseTimer()", invalidate)
        response = self.web_branch("close_response", "// AdditionalObjects supplies a browser-backed File")
        self.assertIn('"shown") { closeUiShown = true; StopCloseTimer(); }', response)

    def test_navigation_renderer_failure_and_owner_end_revoke_the_prompt(self):
        navigation = self.source[self.source.index("core.NavigationStarting +="):self.source.index("core.FrameNavigationStarting +=")]
        self.assertIn("webUiReady = false", navigation)
        self.assertIn("InvalidateClosePrompt(true)", navigation)
        self.assertIn('Emit("close_cancelled", null)', navigation)
        for method in ("Fail", "OwnerEnded"):
            self.assertIn("InvalidateClosePrompt(true)", self.method(method))

    def test_backend_closing_cannot_reuse_web_confirmation_or_localized_cover(self):
        command = self.method("HandleCommand")
        closing = command[command.index('else if (op == "closing")'):command.index('else if (op == "close")')]
        self.assertIn("shuttingDown = true", closing)
        self.assertIn("InvalidateClosePrompt(true)", closing)
        self.assertIn("ShowStatus(LocalText(", closing)
        self.assertNotIn('Emit("close_confirmed"', closing)


if __name__ == "__main__":
    unittest.main()
