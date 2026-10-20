"""Conservative PDF handling uses generated documents, never user media."""
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zlib

from PIL import Image

from mediaslimx import pdf

try:
    import pikepdf
except ImportError:
    pikepdf = None

PARAMS = {"preset": "balanced", "max_width": 32, "max_height": 32}


@unittest.skipUnless(pikepdf is not None, "optional PDF dependency is not installed")
class PDFTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "源文档.pdf"
        self.result = self.root / "result.pdf"

    def tearDown(self):
        self.temporary.cleanup()

    def document(self, configure=None, compressed=False):
        document = pikepdf.Pdf.new()
        page = document.add_blank_page(page_size=(500, 700))
        content = b"q 0.2 0.5 0.8 rg 20 20 300 500 re f Q\n" * 1200
        page.Contents = document.make_stream(content)
        if configure:
            configure(document, page)
        document.save(self.source, compress_streams=compressed,
                      object_stream_mode=pikepdf.ObjectStreamMode.disable)
        document.close()
        return self.source

    def test_actual_lossless_stream_compression_keeps_original_and_ignores_image_limits(self):
        self.document()
        before = self.source.read_bytes()
        info = pdf.inspect(self.source)
        self.assertEqual((info["kind"], info["format"], info["pages"]), ("document", "PDF", 1))
        actual = pdf.optimize(self.source, self.result, info, PARAMS)
        validated = pdf.validate_result(self.result, info, PARAMS)
        self.assertLess(self.result.stat().st_size, self.source.stat().st_size)
        self.assertEqual(self.source.read_bytes(), before)
        self.assertEqual(validated["page_digest"], info["page_digest"])
        self.assertFalse(actual["page_resize"])
        self.assertFalse(actual["image_reencoding"])
        with pikepdf.open(self.result) as result:
            self.assertEqual(list(result.pages[0].mediabox), [0, 0, 500, 700])

    def test_existing_poor_flate_stream_is_recompressed_without_changing_payload(self):
        document = pikepdf.Pdf.new()
        page = document.add_blank_page()
        content = b"q 0.5 g 20 20 40 40 re f Q\n" * 8000
        stream = document.make_stream(zlib.compress(content, level=0))
        stream.Filter = pikepdf.Name.FlateDecode
        page.Contents = stream
        document.save(self.source, compress_streams=True, recompress_flate=False,
                      stream_decode_level=pikepdf.StreamDecodeLevel.none)
        document.close()
        info = pdf.inspect(self.source)
        pdf.optimize(self.source, self.result, info, PARAMS)
        pdf.validate_result(self.result, info, PARAMS)
        self.assertLess(self.result.stat().st_size, self.source.stat().st_size)

    def test_jpeg_stream_is_not_reencoded(self):
        data = io.BytesIO()
        Image.new("RGB", (12, 10), "green").save(data, format="JPEG", quality=98)
        original = data.getvalue()
        def add_image(document, page):
            image = document.make_stream(original)
            image.Type = pikepdf.Name.XObject
            image.Subtype = pikepdf.Name.Image
            image.Width = 12
            image.Height = 10
            image.ColorSpace = pikepdf.Name.DeviceRGB
            image.BitsPerComponent = 8
            image.Filter = pikepdf.Name.DCTDecode
            page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im1=image))
            page.Contents = document.make_stream(b"q 12 0 0 10 20 20 cm /Im1 Do Q")
        self.document(add_image)
        info = pdf.inspect(self.source)
        pdf.optimize(self.source, self.result, info, PARAMS)
        pdf.validate_result(self.result, info, PARAMS)
        with pikepdf.open(self.result) as result:
            self.assertEqual(result.pages[0].Resources.XObject.Im1.read_raw_bytes(), original)

    def test_invalid_result_does_not_pass_hash_validation(self):
        self.document()
        info = pdf.inspect(self.source)
        def change(document, page):
            page.Contents = document.make_stream(b"q 1 0 0 rg 20 20 50 50 re f Q")
        self.document(change)
        with self.assertRaisesRegex(ValueError, "验证不通过"):
            pdf.validate_result(self.source, info, PARAMS)

    def test_page_crop_rotation_order_and_multiple_streams_are_checked(self):
        def configure(document, page):
            page.CropBox = pikepdf.Array([1, 2, 499, 698])
            page.Rotate = 90
            page.Contents = pikepdf.Array([document.make_stream(b"q Q"), document.make_stream(b"q 0.5 g Q")])
            document.add_blank_page(page_size=(600, 800))
        self.document(configure)
        info = pdf.inspect(self.source)
        pdf.optimize(self.source, self.result, info, PARAMS)
        self.assertEqual(pdf.validate_result(self.result, info, PARAMS)["pages"], 2)
        with pikepdf.open(self.result) as document:
            document.pages[0].Rotate = 180
            document.save(self.root / "changed.pdf")
        with self.assertRaisesRegex(ValueError, "验证不通过"):
            pdf.validate_result(self.root / "changed.pdf", info, PARAMS)

    def test_encrypted_even_blank_user_password_is_skipped(self):
        self.document()
        with pikepdf.open(self.source) as document:
            document.save(self.result, encryption=pikepdf.Encryption(owner="owner", user=""))
        with self.assertRaisesRegex(ValueError, "加密"):
            pdf.inspect(self.result)
        with pikepdf.open(self.source) as document:
            document.save(self.result, encryption=pikepdf.Encryption(owner="owner", user="reader"))
        with self.assertRaisesRegex(ValueError, "加密"):
            pdf.inspect(self.result)

    def test_signatures_forms_scripts_actions_annotations_and_attachments_are_skipped(self):
        configurations = [
            lambda document, page: document.Root.__setitem__("/AcroForm", pikepdf.Dictionary()),
            lambda document, page: document.Root.__setitem__("/OpenAction", pikepdf.Array([page.obj, pikepdf.Name.Fit])),
            lambda document, page: page.obj.__setitem__("/Annots", pikepdf.Array([])),
            lambda document, page: document.Root.__setitem__("/Names", pikepdf.Dictionary(JavaScript=pikepdf.Dictionary())),
            lambda document, page: document.Root.__setitem__("/Names", pikepdf.Dictionary(EmbeddedFiles=pikepdf.Dictionary())),
            lambda document, page: document.Root.__setitem__("/Custom", document.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Sig, ByteRange=pikepdf.Array([0, 1])))),
            lambda document, page: document.Root.__setitem__("/Custom", pikepdf.Dictionary(S=pikepdf.Name.Launch)),
        ]
        for configure in configurations:
            with self.subTest(configure=configure):
                self.document(configure)
                with self.assertRaises(ValueError):
                    pdf.inspect(self.source)

    def test_damaged_and_wrong_format_are_skipped_without_repair(self):
        self.source.write_bytes(b"not pdf")
        with self.assertRaisesRegex(ValueError, "真实 PDF"):
            pdf.inspect(self.source)
        self.document()
        damaged = self.source.read_bytes().replace(b"startxref\n", b"startxref\n99999999\n%", 1)
        self.source.write_bytes(damaged)
        with self.assertRaises(ValueError):
            pdf.inspect(self.source)

    def test_resource_bounds_include_flate_expansion(self):
        self.document()
        with pikepdf.open(self.source) as document:
            with patch.object(pdf, "MAX_PAGES", 0), self.assertRaisesRegex(ValueError, "页数"):
                pdf._analyze(document, pikepdf)
            with patch.object(pdf, "MAX_OBJECTS", 1), self.assertRaisesRegex(ValueError, "对象数"):
                pdf._analyze(document, pikepdf)
        raw = zlib.compress(b"x" * 4096)
        with patch.object(pdf, "MAX_STREAM_BYTES", 64):
            with self.assertRaisesRegex(ValueError, "资源限制"):
                pdf._bounded_flate(raw, 128)
        with self.assertRaisesRegex(ValueError, "损坏"):
            pdf._bounded_flate(raw[:-2], 10000)
        with patch.object(pdf, "MAX_FILE_BYTES", 1), self.assertRaisesRegex(ValueError, "文件限制"):
            pdf._worker({"source": str(self.source), "operation": "inspect"})

    def test_unsupported_and_external_streams_are_skipped(self):
        def unsupported(document, page):
            stream = document.make_stream(b"ab")
            stream.Filter = pikepdf.Name.RunLengthDecode
            page.Contents = stream
        self.document(unsupported)
        with self.assertRaises(ValueError):
            pdf.inspect(self.source)
        def external(document, page):
            stream = document.make_stream(b"q Q")
            stream.F = pikepdf.String("do-not-open.txt")
            page.Contents = stream
        self.document(external)
        with self.assertRaisesRegex(ValueError, "外部"):
            pdf.inspect(self.source)

    def test_worker_timeout_and_dependency_errors_are_actionable_and_same_path_is_rejected(self):
        self.document()
        with patch.object(pdf, "available", return_value=False):
            with self.assertRaisesRegex(ValueError, "requirements-pdf"):
                pdf.inspect(self.source)
        with patch.object(pdf.subprocess, "run", side_effect=subprocess.TimeoutExpired("worker", 1)):
            with self.assertRaisesRegex(ValueError, "超时"):
                pdf.inspect(self.source)
        with self.assertRaisesRegex(ValueError, "原文件相同"):
            pdf.optimize(self.source, self.source, {}, {})


if __name__ == "__main__":
    unittest.main()
