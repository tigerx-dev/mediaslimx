"""PDF integration uses private generated documents and isolated loopback service."""
import csv
import hashlib
import http.cookiejar
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import zipfile
from unittest.mock import patch

from PIL import Image
from mediaslimx.engine import Engine
from mediaslimx.imports import ImportManager
from mediaslimx import pdf

try:
    import pikepdf
except ImportError:
    pikepdf = None

PARAMS = {"preset": "balanced", "max_width": None, "max_height": None}


def synthetic_pdf(path, text=b"q 0.2 0.5 0.8 rg 20 20 300 500 re f Q\n"):
    path.parent.mkdir(parents=True, exist_ok=True)
    with pikepdf.Pdf.new() as document:
        page = document.add_blank_page(page_size=(500, 700))
        page.Contents = document.make_stream(text * 1500)
        document.save(path, compress_streams=False, object_stream_mode=pikepdf.ObjectStreamMode.disable)
    return path


@unittest.skipUnless(pikepdf is not None, "optional PDF dependency is not installed")
class PDFWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.root = self.base / "source"
        self.root.mkdir()
        self.engine = Engine(self.base / "data", [self.root])

    def tearDown(self):
        self.temporary.cleanup()

    def create(self, mode="export", selected=None, scan=None):
        scan = scan or self.engine.scan(str(self.root))
        ids = selected or [entry["id"] for entry in scan["entries"] if entry["status"] == "ready"]
        key = self.engine.create(scan["id"], ids, PARAMS, mode,
                                 output=str(self.base / "exports"), backup=str(self.base / "backups"), confirm=True)
        return self.engine.wait(key)

    def test_export_preserves_original_relative_names_and_report(self):
        source = synthetic_pdf(self.root / "downloads" / "产品手册.pdf")
        before = source.read_bytes()
        task = self.create()
        entry = task["entries"][0]
        self.assertEqual(task["status"], "completed")
        self.assertEqual(entry["status"], "success", entry["reason"])
        self.assertEqual(entry["kind"], "document")
        self.assertEqual(entry["relative"], "downloads/产品手册.pdf")
        self.assertLess(entry["result_size"], entry["size"])
        self.assertEqual(source.read_bytes(), before)
        self.assertEqual(Path(entry["destination"]).relative_to(Path(task["output_root"]) / task["folder_name"]).as_posix(), entry["relative"])
        pdf.validate_result(entry["destination"], entry["info"], PARAMS)
        rows = list(csv.DictReader(io.StringIO(self.engine.report(task["id"]).lstrip("\ufeff"))))
        self.assertEqual(rows[0]["relative_path"], entry["relative"])
        self.assertEqual(rows[0]["type"], "document")
        self.assertNotIn(str(self.root), self.engine.report(task["id"]))
        self.assertEqual(self.engine.preview(task["id"], entry["id"], "original")[0], source)
        self.assertEqual(self.engine.preview(task["id"], entry["id"], "result")[0], Path(entry["destination"]))

    def test_backup_retains_original_and_batch_restore_skips_modified_result(self):
        first = synthetic_pdf(self.root / "downloads" / "first.pdf")
        second = synthetic_pdf(self.root / "downloads" / "second.pdf", b"q 0.3 g 10 10 30 30 re f Q\n")
        originals = {path.name: path.read_bytes() for path in (first, second)}
        task = self.create("backup")
        self.assertEqual({entry["status"] for entry in task["entries"]}, {"success"})
        for entry in task["entries"]:
            self.assertEqual(Path(entry["backup"]).read_bytes(), originals[Path(entry["source"]).name])
            self.assertEqual(Path(entry["destination"]), Path(entry["source"]))
        edited = first.read_bytes() + b"\n% new private test version\n"
        first.write_bytes(edited)
        restored = self.engine.restore(task["id"])
        by_name = {Path(entry["source"]).name: entry for entry in restored["entries"]}
        self.assertEqual(by_name["first.pdf"]["status"], "restore_conflict")
        self.assertEqual(first.read_bytes(), edited)
        self.assertEqual(by_name["second.pdf"]["status"], "restored")
        self.assertEqual(second.read_bytes(), originals["second.pdf"])
        for entry in restored["entries"]:
            self.assertEqual(Path(entry["backup"]).read_bytes(), originals[Path(entry["source"]).name])
        restart = Engine(self.base / "data", [self.root])
        self.assertEqual(restart.get("task", task["id"])["entries"], restored["entries"])

    def test_pdf_overwrite_is_rejected_even_confirmed_but_jpg_selection_remains_compatible(self):
        source = synthetic_pdf(self.root / "guide.pdf")
        jpg = self.root / "photo.jpg"
        Image.new("RGB", (640, 480), "red").save(jpg, quality=100)
        before = source.read_bytes()
        scan = self.engine.scan(str(self.root))
        document = next(entry for entry in scan["entries"] if entry["kind"] == "document")
        for selected in [[document["id"]], [entry["id"] for entry in scan["entries"]]]:
            with self.subTest(selected=selected), self.assertRaisesRegex(ValueError, "PDF"):
                self.engine.create(scan["id"], selected, PARAMS, "overwrite", confirm=True)
        self.assertEqual(source.read_bytes(), before)
        image = next(entry for entry in scan["entries"] if entry["kind"] == "image")
        task = self.create("overwrite", [image["id"]], scan)
        self.assertEqual(task["entries"][0]["status"], "success")
        self.assertEqual(source.read_bytes(), before)

    def test_repeat_and_no_gain_keep_unchanged_pdf_bytes(self):
        source = synthetic_pdf(self.root / "guide.pdf")
        first = self.create()
        entry = first["entries"][0]
        self.assertEqual(entry["status"], "success")
        optimized = Path(entry["destination"]).read_bytes()
        repeated = self.root / "already-optimized.pdf"
        repeated.write_bytes(optimized)
        scan = self.engine.scan(str(self.root))
        selected = [item["id"] for item in scan["entries"] if item["relative"] == repeated.name]
        duplicate = self.create(selected=selected, scan=scan)["entries"][0]
        self.assertEqual(duplicate["status"], "duplicate")
        self.assertEqual(Path(duplicate["destination"]).read_bytes(), optimized)
        # A fresh store has no processed-history shortcut, so no-gain is real.
        isolated = self.base / "fresh-source"
        isolated.mkdir()
        target = isolated / "already-optimized.pdf"
        target.write_bytes(optimized)
        engine = Engine(self.base / "fresh-data", [isolated])
        scan = engine.scan(str(isolated))
        key = engine.create(scan["id"], [scan["entries"][0]["id"]], PARAMS, "export", output=str(self.base / "fresh-exports"))
        no_gain = engine.wait(key)["entries"][0]
        self.assertEqual(no_gain["status"], "no_gain", no_gain["reason"])
        self.assertEqual(Path(no_gain["destination"]).read_bytes(), optimized)
        self.assertEqual(target.read_bytes(), optimized)
        self.assertTrue(source.exists())

    def test_pdf_import_limit_and_missing_dependency_are_actionable(self):
        imports = ImportManager(self.engine)
        with self.assertRaisesRegex(ValueError, "64"):
            imports.allocate([{"name": "large.pdf", "size": 64 * 1024**2 + 1}])
        self.assertEqual(self.engine.all("import"), [])
        synthetic_pdf(self.root / "guide.pdf")
        with patch.object(pdf, "available", return_value=False):
            entry = self.engine.scan(str(self.root))["entries"][0]
        self.assertEqual(entry["status"], "unsupported")
        self.assertIn("requirements-pdf.txt", entry["reason"])


@unittest.skipUnless(pikepdf is not None, "optional PDF dependency is not installed")
class PDFHTTPWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.base = Path(cls.temporary.name)
        cls.root = cls.base / "source"
        cls.root.mkdir()
        cls.source = synthetic_pdf(cls.root / "产品手册.pdf")
        cls.original = cls.source.read_bytes()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.url = f"http://127.0.0.1:{cls.port}"
        cls.token = "isolated-pdf-test-token"
        code = "from mediaslimx.engine import Engine; from mediaslimx.app import create_app; import uvicorn,sys; e=Engine(sys.argv[1],[sys.argv[2]]); uvicorn.run(create_app(e,sys.argv[3],int(sys.argv[4])),host='127.0.0.1',port=int(sys.argv[4]),log_level='error',access_log=False)"
        cls.process = subprocess.Popen([sys.executable, "-c", code, str(cls.base / "data"), str(cls.root), cls.token, str(cls.port)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        def stop():
            if cls.process.poll() is None:
                cls.process.terminate()
                cls.process.wait(timeout=10)
            cls.process.stderr.close()
        cls.addClassCleanup(stop)
        cls.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        for _ in range(150):
            try:
                cls.request("/api/environment")
                break
            except (urllib.error.URLError, ConnectionError):
                if cls.process.poll() is not None:
                    raise RuntimeError(cls.process.stderr.read().decode("utf-8", "replace"))
                time.sleep(.05)
        else:
            raise RuntimeError("isolated PDF HTTP service did not start")

    @classmethod
    def request(cls, route, body=None, method=None, auth=True, binary=None, headers=None):
        request_headers = {"X-MediaSlimX-Token": cls.token} if auth else {}
        if binary is not None:
            data = binary
            request_headers["Content-Type"] = "application/octet-stream"
        elif body is not None:
            data = json.dumps(body).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        else:
            data = None
        request_headers.update(headers or {})
        request = urllib.request.Request(cls.url + route, data=data, headers=request_headers, method=method)
        with cls.opener.open(request, timeout=30) as response:
            return response.status, {key.lower(): value for key, value in response.headers.items()}, response.read()

    def test_pdf_http_import_export_safe_download_report_archive_and_scope(self):
        _, _, raw = self.request("/api/environment")
        self.assertTrue(json.loads(raw)["pdf"])
        self.request("/api/session", {})
        _, _, raw = self.request("/api/imports", {"files": [{"name": self.source.name, "relative_path": "downloads/" + self.source.name, "size": len(self.original)}]})
        allocation = json.loads(raw)
        upload = f"/api/imports/{allocation['id']}/files/{allocation['files'][0]['id']}"
        self.assertEqual(self.request(upload, method="PUT", binary=self.original)[0], 200)
        _, _, raw = self.request(f"/api/imports/{allocation['id']}/scan", {})
        scan = json.loads(raw)
        self.assertEqual(scan["entries"][0]["status"], "ready")
        self.assertEqual(scan["entries"][0]["kind"], "document")
        _, _, raw = self.request("/api/tasks", {"scan_id": scan["id"], "selected": [scan["entries"][0]["id"]], "output": str(self.base / "exports")})
        task_id = json.loads(raw)["id"]
        for _ in range(300):
            _, _, raw = self.request("/api/tasks/" + task_id)
            task = json.loads(raw)
            if task["status"] not in {"running", "cancelling"}:
                break
            time.sleep(.05)
        self.assertEqual(task["status"], "completed")
        entry = task["entries"][0]
        self.assertEqual(entry["status"], "success", entry["reason"])
        for slot, expected in [("original", self.original), ("result", Path(entry["destination"]).read_bytes())]:
            route = f"/api/tasks/{task_id}/preview/{entry['id']}/{slot}"
            status, headers, body = self.request(route, auth=False)
            self.assertEqual(status, 200)
            self.assertTrue(headers["content-disposition"].lower().startswith("attachment"))
            self.assertEqual(headers["x-content-type-options"], "nosniff")
            self.assertEqual(hashlib.sha256(body).digest(), hashlib.sha256(expected).digest())
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(self.url + route, timeout=10)
            self.assertEqual(error.exception.code, 401)
        _, _, report = self.request(f"/api/tasks/{task_id}/report.csv")
        self.assertIn("downloads/产品手册.pdf", report.decode("utf-8"))
        self.assertIn("document", report.decode("utf-8"))
        self.assertNotIn(str(self.root), report.decode("utf-8"))
        _, _, archive = self.request(f"/api/tasks/{task_id}/download.zip")
        with zipfile.ZipFile(io.BytesIO(archive)) as package:
            self.assertIn("downloads/产品手册.pdf", package.namelist())
            self.assertEqual(package.read("downloads/产品手册.pdf"), Path(entry["destination"]).read_bytes())
        self.assertEqual(self.source.read_bytes(), self.original)
        Path(entry["destination"]).write_bytes(b"new edited result")
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request(f"/api/tasks/{task_id}/preview/{entry['id']}/result")
        self.assertEqual(error.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
