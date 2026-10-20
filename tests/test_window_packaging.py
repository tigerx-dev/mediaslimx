"""Window bundles reject mixed SDK/source inputs and browser-only acceptance."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("window_packaging", Path(__file__).resolve().parents[1] / "scripts" / "build-windows.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class WindowPackagingTests(unittest.TestCase):
    def materials(self, directory):
        project, root = Path(directory) / "project", Path(directory) / "materials"
        sdk = b"pinned SDK bytes"
        pin = {"package": "Microsoft.Web.WebView2", "version": "1.2.3.4",
               "sha256": hashlib.sha256(sdk).hexdigest()}
        originals = {"native/MediaSlimX.Window.cs": b"source", "scripts/build-window-host.ps1": b"recipe",
                     "assets/brand/app-icon.ico": b"icon", "scripts/window-host-sdk.json": json.dumps(pin).encode()}
        for name, content in originals.items():
            path = project / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        files = {f"bin/{name}": b"binary or notice" for name in build.WINDOW_BIN_FILES}
        files.update({f"materials/{Path(name).name}": content for name, content in originals.items()})
        files.update({"materials/microsoft.web.webview2.1.2.3.4.nupkg": sdk,
                      "materials/WebView2-LICENSE.txt": b"license", "materials/WebView2-NOTICE.txt": b"notice",
                      "materials/Microsoft.Web.WebView2.nuspec": b"metadata"})
        records = []
        for name, content in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            records.append({"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
        value = {"version": 1, "status": "LOCAL_WINDOW_HOST_NOT_A_RELEASE", "sdk": pin,
                 "files": records, "compiler_version": "synthetic", "command": ["csc.exe", "source.cs"]}
        (root / "manifest.json").write_text(json.dumps(value))
        return project, root, value

    def test_accepts_exact_whitelisted_source_and_sdk(self):
        with tempfile.TemporaryDirectory() as directory:
            project, root, value = self.materials(directory)
            self.assertEqual(build.checked_window_materials(root, project), value)

    def test_rejects_unlisted_private_data(self):
        with tempfile.TemporaryDirectory() as directory:
            project, root, _ = self.materials(directory)
            (root / "materials" / "private-server.json").write_text("do not package")
            with self.assertRaisesRegex(ValueError, "whitelist"):
                build.checked_window_materials(root, project)

    def test_copy_excludes_neighboring_webview_profiles(self):
        with tempfile.TemporaryDirectory() as directory:
            project, root, _ = self.materials(directory)
            cache = root / "protocol-test" / "webview" / "Preferences"
            cache.parent.mkdir(parents=True)
            cache.write_text("private protocol-test browser state")
            value = build.checked_window_materials(root, project)
            target = Path(directory) / "companion"
            build.copy_window_materials(root, target, value)
            self.assertEqual(build.checked_window_materials(target, project), value)
            self.assertFalse((target / "protocol-test").exists())

    def test_rejects_source_changed_after_host_compile(self):
        with tempfile.TemporaryDirectory() as directory:
            project, root, _ = self.materials(directory)
            (project / "native" / "MediaSlimX.Window.cs").write_text("new source")
            with self.assertRaisesRegex(ValueError, "rebuild host"):
                build.checked_window_materials(root, project)

    def test_rejects_different_pinned_sdk(self):
        with tempfile.TemporaryDirectory() as directory:
            project, root, _ = self.materials(directory)
            (project / "scripts" / "window-host-sdk.json").write_text('{"version":"different"}')
            with self.assertRaisesRegex(ValueError, "checked-in pin"):
                build.checked_window_materials(root, project)

    def test_window_clean_evidence_requires_window_checks(self):
        evidence = {"status": "passed", "environment": {"clean_windows": True, "virtualization": "WindowsSandbox"},
                    "bundle_payload_sha256": "exact", "checks": [{"status": "passed"}],
                    "manual_checks": [{"name": name, "status": "passed"} for name in
                                      ("default_browser", "native_directory_selection", "standard_user", "browser_survives_service_exit")]}
        self.assertTrue(build.clean_evidence_matches(evidence, "exact"))
        self.assertFalse(build.clean_evidence_matches(evidence, "exact", "window"))
        evidence["manual_checks"] = [{"name": name, "status": "passed"} for name in
                                     ("standalone_window", "native_directory_selection", "standard_user",
                                      "window_close_during_processing", "webview2_runtime_dependency", "external_browser_not_started")]
        self.assertTrue(build.clean_evidence_matches(evidence, "exact", "window"))
        self.assertFalse(build.clean_evidence_matches(evidence, "other", "window"))

    def test_snapshot_adds_only_named_sdk_json_and_csharp(self):
        with tempfile.TemporaryDirectory() as directory:
            project, _, _ = self.materials(directory)
            (project / "scripts" / "local-data.json").write_text("private")
            snapshot = build.project_source_snapshot(project, Path(directory) / "snapshot")
            paths = {record["path"] for record in snapshot["files"]}
            self.assertIn("native/MediaSlimX.Window.cs", paths)
            self.assertIn("scripts/window-host-sdk.json", paths)
            self.assertNotIn("scripts/local-data.json", paths)


if __name__ == "__main__":
    unittest.main()
