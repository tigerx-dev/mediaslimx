"""Directory selection has the same boundary as media scanning."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from mediaslimx.engine import Engine
from mediaslimx.folders import FolderBrowser
from mediaslimx.paths import absolute
from mediaslimx.launch import _verify


class FolderTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.base=Path(self.tmp.name)
        self.root=self.base/"media";self.root.mkdir()
        (self.root/"photos").mkdir();(self.root/".hidden").mkdir();(self.root/"node_modules").mkdir()
        (self.root/"private.py").write_text("do not read")
        self.engine=Engine(self.base/"data",[self.root])
        self.browser=FolderBrowser(self.engine)

    def tearDown(self):
        self.tmp.cleanup()

    def test_browse_only_directories_and_stops_at_root(self):
        data=self.browser.browse(str(self.root))
        self.assertEqual([d["name"] for d in data["directories"]],["photos"])
        self.assertIsNone(data["parent"])
        self.assertEqual(data["skipped"],2)
        self.assertEqual(self.browser.browse()["roots"],[str(self.root)])
        self.assertEqual(self.browser.browse(str(self.root/"photos"))["parent"],str(self.root))

    def test_escape_files_and_exclusions_rejected(self):
        with self.assertRaises(ValueError):self.browser.browse(str(self.base))
        with self.assertRaises(ValueError):self.browser.browse(str(self.root/"private.py"))
        with self.engine.db() as db:db.execute("INSERT INTO exclusions VALUES (?)",(str(self.root/"photos"),))
        self.assertEqual(self.browser.browse(str(self.root))["directories"],[])
        with self.assertRaises(ValueError):self.browser.browse(str(self.root/"photos"))
        self.assertEqual(self.browser.browse(str(self.root/"photos"),"output")["path"],str(self.root/"photos"))

    def test_native_not_exposed_in_server_mode(self):
        with patch("mediaslimx.folders.choose_native_folder") as picker:
            with self.assertRaises(ValueError):self.browser.native()
            picker.assert_not_called()

    def test_native_selected_directory_is_explicitly_authorized_and_saved(self):
        external=self.base/"chosen";external.mkdir()
        self.browser.desktop=True
        with patch("mediaslimx.folders.choose_native_folder",return_value=str(external)):
            result=self.browser.native("media")
        self.assertEqual(result["path"],str(external))
        self.assertIn(external,self.engine.roots)
        self.assertIn(str(external),json.loads(self.browser.settings.read_text(encoding="utf-8")))

    def test_cancel_native_does_not_grant_scope(self):
        self.browser.desktop=True
        before=list(self.engine.roots)
        with patch("mediaslimx.folders.choose_native_folder",return_value=None):
            self.assertIsNone(self.browser.native()["path"])
        self.assertEqual(self.engine.roots,before)

    def test_cross_platform_paths_are_actionable_errors(self):
        invalid="/mnt/d/media" if os.name=="nt" else r"D:\media"
        with self.assertRaisesRegex(ValueError,"Windows|WSL"):
            absolute(invalid)

    def test_reuse_descriptor_cannot_open_external_url(self):
        for url in ["https://example.com/","file:///etc/passwd","http://evil.example/#token="+"a"*40]:
            with self.assertRaises(ValueError):_verify(url,self.engine.data_dir)

    def test_cancel_requires_desktop_and_passes_only_request_id(self):
        with patch("mediaslimx.folders.cancel_native_folder") as cancel:
            with self.assertRaises(ValueError):self.browser.cancel_native("request-1")
            cancel.assert_not_called()
            self.browser.desktop=True
            self.assertTrue(self.browser.cancel_native("request-1")["cancelled"])
            cancel.assert_called_once_with("request-1")

    def test_late_picker_result_after_stop_never_authorizes_a_directory(self):
        external = self.base / "late selection"
        external.mkdir()
        self.browser.desktop = True
        before = list(self.engine.roots)

        def late_selection(*args, **kwargs):
            self.browser.close_native()
            return str(external)

        with patch("mediaslimx.folders.choose_native_folder", side_effect=late_selection):
            self.assertIsNone(self.browser.native("media")["path"])
        self.assertEqual(self.engine.roots, before)
        self.assertFalse(self.browser.settings.exists())

    def test_closing_one_browser_does_not_close_another_app_instance(self):
        external = self.base / "other selection"
        external.mkdir()
        another = FolderBrowser(self.engine)
        self.browser.desktop = another.desktop = True
        self.browser.close_native()
        self.browser.close_native()  # A finally cleanup may close it again.
        self.assertTrue(self.browser._closing.is_set())
        self.assertFalse(another._closing.is_set())
        with patch("mediaslimx.folders.choose_native_folder", return_value=str(external)):
            self.assertIsNone(self.browser.native("media")["path"])
            self.assertNotIn(external, self.engine.roots)
            self.assertEqual(another.native("media")["path"], str(external))
        self.assertIn(external, self.engine.roots)


if __name__=="__main__":
    unittest.main()
