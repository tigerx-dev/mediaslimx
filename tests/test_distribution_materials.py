"""Release gates must reject corrupted materials and host-only test evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("windows_build", Path(__file__).resolve().parents[1] / "scripts" / "build-windows.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class DistributionMaterialTests(unittest.TestCase):
    def manifest(self, root, **changes):
        (root / "source.txt").write_bytes(b"exact source")
        record = {"path": "source.txt", "bytes": 12, "sha256": hashlib.sha256(b"exact source").hexdigest(), "role": "source"}
        value = {"version": 1, "status": "locally_verified", "files": [record]}
        value.update(changes)
        (root / "manifest.json").write_text(json.dumps(value))
        return value

    def test_accepts_exact_materials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.manifest(root)
            self.assertEqual(build.checked_manifest(root, "locally_verified")["version"], 1)

    def test_rejects_tampered_material(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.manifest(root)
            (root / "source.txt").write_bytes(b"changed text")
            with self.assertRaisesRegex(ValueError, "hash/size"):
                build.checked_manifest(root)

    def test_rejects_parent_windows_and_absolute_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path in ("../source.txt", "C:/source.txt", "notices\\outside.txt", "/etc/passwd"):
                self.manifest(root, files=[{"path": path, "bytes": 0, "sha256": "0" * 64}])
                with self.subTest(path=path), self.assertRaisesRegex(ValueError, "Unsafe"):
                    build.checked_manifest(root)

    def test_rejects_duplicate_records_and_unverified_status(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            value = self.manifest(root)
            self.manifest(root, files=value["files"] * 2)
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                build.checked_manifest(root)
            self.manifest(root, status="pending")
            with self.assertRaisesRegex(ValueError, "status"):
                build.checked_manifest(root, "locally_verified")

    def clean(self):
        return {"status": "passed", "environment": {"clean_windows": True, "virtualization": "WindowsSandbox"},
                "bundle_payload_sha256": "exact", "checks": [{"name": "flow", "status": "passed"}],
                "manual_checks": [{"name": name, "status": "passed"} for name in
                                  ("default_browser", "native_directory_selection", "standard_user", "browser_survives_service_exit")]}

    def test_clean_acceptance_is_bound_to_payload_and_manual_checks(self):
        evidence = self.clean()
        self.assertTrue(build.clean_evidence_matches(evidence, "exact"))
        self.assertFalse(build.clean_evidence_matches(evidence, "different"))
        evidence["manual_checks"][0]["status"] = "not_run"
        self.assertFalse(build.clean_evidence_matches(evidence, "exact"))

    def test_host_simulation_and_partial_results_never_pass(self):
        for change in ({"environment": {"clean_windows": False, "virtualization": "host-self-test"}},
                       {"status": "partial"}, {"checks": [{"status": "failed"}]}, {"checks": []}):
            evidence = self.clean()
            evidence.update(change)
            self.assertFalse(build.clean_evidence_matches(evidence, "exact"))

    def test_source_snapshot_excludes_runtime_data_and_media(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project, target = root / "project", root / "snapshot"
            for name in ("LICENSE", "README.md", "mediaslimx/app.py", "mediaslimx/static/app.js",
                         "assets/brand/app-icon.ico", "scripts/build-windows.py",
                         ".mediaslimx/windows/server.json", "private.jpg", ".git/config"):
                file = project / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(name)
            manifest = build.project_source_snapshot(project, target)
            paths = {item["path"] for item in manifest["files"]}
            self.assertIn("mediaslimx/app.py", paths)
            self.assertIn("assets/brand/app-icon.ico", paths)
            self.assertFalse(any("server.json" in path or ".git/" in path or path == "private.jpg" for path in paths))
            self.assertIsNone(manifest["git_commit"])
            self.assertEqual(len(manifest["tree_sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
