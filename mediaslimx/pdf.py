"""Optional, conservative PDF structure compression in a bounded child process.

This preserves page content streams and embedded image bytes. It is not a PDF
renderer or sanitizer, and the validation hashes are not a proof of semantic or
visual equivalence. The normal engine still owns fingerprints and publication.
"""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import zlib

MAX_FILE_BYTES = 64 * 1024**2
MAX_PAGES = 1000
MAX_OBJECTS = 50_000
MAX_STREAM_BYTES = 32 * 1024**2
MAX_DECODED_BYTES = 128 * 1024**2
INSPECT_TIMEOUT = 30
OPTIMIZE_TIMEOUT = 90

MISSING_DEPENDENCY = "PDF 需要可选依赖 pikepdf：请在当前平台的虚拟环境运行 python -m pip install -r requirements-pdf.txt，然后重启"


def available():
    """Check the current interpreter only; never probe another platform's venv."""
    return importlib.util.find_spec("pikepdf") is not None


def _call(operation, path, destination=None):
    # The isolated worker executes this file directly; import the package-only
    # cancellation helper here, where this function runs in the parent process.
    from .process_control import run as run_process
    if not available():
        raise ValueError(MISSING_DEPENDENCY)
    request = {"operation": operation, "source": str(Path(path).absolute())}
    if destination is not None:
        if Path(path).resolve() == Path(destination).resolve():
            raise ValueError("PDF 临时结果不能与原文件相同")
        request["destination"] = str(Path(destination).absolute())
    try:
        result = run_process(
            ([sys.executable, "--mediaslimx-pdf-worker"] if getattr(sys, "frozen", False) else
             [sys.executable, "-I", "-X", "utf8", str(Path(__file__).resolve()), "--worker"]),
            input=json.dumps(request), text=True, encoding="utf-8", stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, check=False,
            timeout=OPTIMIZE_TIMEOUT if operation == "optimize" else INSPECT_TIMEOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except subprocess.TimeoutExpired:
        raise ValueError("PDF 处理超时，文件已跳过") from None
    if result.returncode or len(result.stdout) > 64 * 1024:
        raise ValueError("PDF 处理进程异常退出，文件已跳过（可能超出资源限制）")
    try:
        response = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise ValueError("PDF 处理进程未返回有效结果") from None
    if "error" in response:
        raise ValueError(response["error"])
    return response["result"]


def inspect(path):
    return _call("inspect", path)


def optimize(source, dest, info, params):
    # Quality presets and image/video size limits deliberately do not affect PDF.
    return _call("optimize", source, dest)


def validate_result(path, source_info, params):
    result = inspect(path)
    for key in ("pages", "page_digest", "stream_digest", "streams"):
        if result[key] != source_info[key]:
            raise ValueError("PDF 输出验证不通过：页数、页面框、页面内容或嵌入流发生变化")
    return result


def _digest(parts):
    return hashlib.sha256(json.dumps(parts, ensure_ascii=True, separators=(",", ":")).encode()).hexdigest()


def _bounded_flate(raw, remaining):
    """Bound zlib expansion before asking qpdf to rewrite the same stream."""
    decoder = zlib.decompressobj()
    maximum = min(MAX_STREAM_BYTES, remaining)
    content = bytearray()
    try:
        for offset in range(0, len(raw), 64 * 1024):
            chunk = decoder.decompress(raw[offset:offset + 64 * 1024], maximum - len(content) + 1)
            content.extend(chunk)
            if len(content) > maximum or decoder.unconsumed_tail:
                raise ValueError("PDF 解码数据超过首版资源限制")
        if not decoder.eof or decoder.unused_data:
            raise ValueError("PDF 含损坏或复杂的压缩流，已跳过")
    except zlib.error:
        raise ValueError("PDF 含损坏压缩流，已跳过") from None
    return bytes(content)


def _stream_payload(stream, budget, pikepdf):
    if any(key in stream for key in ("/F", "/FFilter", "/FDecodeParms")):
        raise ValueError("PDF 含外部文件流，暂不支持")
    raw = stream.read_raw_bytes()
    if len(raw) > MAX_STREAM_BYTES:
        raise ValueError("PDF 单个数据流超过 32 MiB 的首版限制")
    filters = stream.get("/Filter")
    if isinstance(filters, pikepdf.Array):
        if len(filters) != 1:
            raise ValueError("PDF 含复杂压缩过滤器，暂不支持")
        filters = filters[0]
    name = str(filters) if filters is not None else ""
    if name == "/FlateDecode":
        # PNG/TIFF predictor processing is intentionally left intact by qpdf;
        # hash the identical bytes before predictor application on both sides.
        data = _bounded_flate(raw, MAX_DECODED_BYTES - budget[0])
        category = "plain"
    elif not name:
        data, category = raw, "plain"
    elif name == "/DCTDecode":
        # JPEG is kept compressed, without decoding/re-encoding its pixels.
        data, category = raw, "jpeg"
    else:
        raise ValueError("PDF 含暂不支持的流编码（首版仅支持普通、Flate 与 JPEG 流）")
    budget[0] += len(data)
    if budget[0] > MAX_DECODED_BYTES:
        raise ValueError("PDF 解码数据超过 128 MiB 的首版限制")
    return category, hashlib.sha256(data).hexdigest()


def _check_dictionary(value, pikepdf):
    forbidden = {
        "/AcroForm", "/XFA", "/JavaScript", "/JS", "/AA", "/OpenAction",
        "/EmbeddedFiles", "/EF", "/AF", "/Collection", "/RichMediaContent",
        "/RichMediaSettings", "/ByteRange", "/SigFlags", "/Perms", "/Annots",
    }
    if any(key in value for key in forbidden):
        raise ValueError("PDF 含签名、表单、动作、注释或附件等复杂内容，暂不支持")
    if str(value.get("/Type", "")) in {"/Sig", "/EmbeddedFile", "/Filespec"} or str(value.get("/FT", "")) == "/Sig":
        raise ValueError("PDF 含签名或附件，暂不支持")
    if str(value.get("/S", "")) in {
        "/JavaScript", "/Launch", "/URI", "/GoTo", "/GoToR", "/GoToE",
        "/Named", "/SubmitForm", "/ResetForm", "/ImportData", "/Rendition",
        "/Movie", "/Sound", "/Hide", "/SetOCGState", "/Trans", "/GoTo3DView",
    }:
        raise ValueError("PDF 含交互或启动动作，暂不支持")


def _walk_direct(value, pikepdf, depth=0):
    """Inspect direct children; all indirect objects are checked separately."""
    if depth > 80:
        raise ValueError("PDF 对象嵌套过深，暂不支持")
    if isinstance(value, (pikepdf.Dictionary, pikepdf.Stream)):
        _check_dictionary(value, pikepdf)
        children = value.values()
    elif isinstance(value, pikepdf.Array):
        children = value
    else:
        return
    for item in children:
        if isinstance(item, (pikepdf.Dictionary, pikepdf.Stream, pikepdf.Array)) and not item.is_indirect:
            _walk_direct(item, pikepdf, depth + 1)


def _analyze(pdf, pikepdf):
    if pdf.is_encrypted:
        raise ValueError("加密或带权限限制的 PDF 暂不支持；本工具不解密，也不移除访问限制")
    count = len(pdf.pages)
    if not 1 <= count <= MAX_PAGES:
        raise ValueError("PDF 页数需为 1~1000 页")
    objects = pdf.objects
    if len(objects) > MAX_OBJECTS:
        raise ValueError("PDF 对象数超过 50000 的首版限制")
    # Decode supported streams with explicit bounds before qpdf syntax checks.
    budget, streams, stream_hashes = [0], {}, []
    for value in objects:
        _walk_direct(value, pikepdf)
        if isinstance(value, pikepdf.Stream):
            if str(value.get("/Type", "")) in {"/ObjStm", "/XRef"}:
                continue
            payload = _stream_payload(value, budget, pikepdf)
            streams[tuple(value.objgen)] = payload
            stream_hashes.append(payload)
    page_records = []
    for page in pdf.pages:
        boxes = {}
        for key in ("/MediaBox", "/CropBox", "/BleedBox", "/TrimBox", "/ArtBox"):
            value = page.obj.get(key)
            if value is not None:
                if not isinstance(value, pikepdf.Array) or len(value) != 4:
                    raise ValueError("PDF 页面框无效，已跳过")
                numbers = [float(number) for number in value]
                if not all(math.isfinite(number) for number in numbers):
                    raise ValueError("PDF 页面框无效，已跳过")
                boxes[key] = numbers
        if "/MediaBox" not in boxes:
            raise ValueError("PDF 缺少有效页面尺寸，已跳过")
        content = page.obj.get("/Contents")
        ordered = list(content) if isinstance(content, pikepdf.Array) else [content] if content is not None else []
        if any(not isinstance(stream, pikepdf.Stream) or tuple(stream.objgen) not in streams for stream in ordered):
            raise ValueError("PDF 页面内容流无效，已跳过")
        page_records.append([boxes, int(page.obj.get("/Rotate", 0)), float(page.obj.get("/UserUnit", 1)),
                             [streams[tuple(stream.objgen)] for stream in ordered]])
    if pdf.check_pdf_syntax() or pdf.get_warnings():
        raise ValueError("PDF 结构检查存在警告；首版不自动修复，已跳过")
    return {"kind": "document", "format": "PDF", "pages": count, "pdf_version": pdf.pdf_version,
            "objects": len(objects), "streams": len(stream_hashes), "decoded_bytes": budget[0],
            "page_digest": _digest(page_records), "stream_digest": _digest(sorted(stream_hashes)),
            "validation": "page boxes and ordered content hashes; embedded stream hashes; not rendering equivalence"}


def _worker(request):
    import pikepdf

    source = Path(request["source"])
    if not 0 < source.stat().st_size <= MAX_FILE_BYTES:
        raise ValueError("PDF 超过 64 MiB 的首版文件限制或文件为空")
    with source.open("rb") as stream:
        if stream.read(5) != b"%PDF-":
            raise ValueError("扩展名与真实 PDF 格式不一致")
    try:
        with pikepdf.open(source, attempt_recovery=False, suppress_warnings=True) as pdf:
            info = _analyze(pdf, pikepdf)
            if request["operation"] == "inspect":
                return info
            if request["operation"] != "optimize":
                raise ValueError("未知 PDF 处理操作")
            pdf.save(request["destination"], compress_streams=True, recompress_flate=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.preserve,
                     stream_decode_level=pikepdf.StreamDecodeLevel.none,
                     normalize_content=False, fix_metadata_version=False, linearize=False)
            if pdf.get_warnings():
                raise ValueError("PDF 保存时出现结构警告，已跳过")
            return {"encoder": "pikepdf/qpdf", "version": pikepdf.__version__, "quality": "lossless structure",
                    "compress_streams": True, "recompress_flate": True, "object_streams": "preserve",
                    "page_resize": False, "image_reencoding": False,
                    "validation": info["validation"]}
    except pikepdf.PasswordError:
        raise ValueError("加密或带权限限制的 PDF 暂不支持；本工具不解密，也不移除访问限制") from None
    except pikepdf.PdfError:
        raise ValueError("PDF 损坏或结构不受支持；首版不自动修复，已跳过") from None


def _windows_memory_limit():
    """Limit this worker's committed memory through a private Windows Job."""
    import ctypes
    from ctypes import wintypes

    class BasicLimits(ctypes.Structure):
        _fields_ = [("process_time", ctypes.c_int64), ("job_time", ctypes.c_int64),
                    ("flags", wintypes.DWORD), ("working_min", ctypes.c_size_t),
                    ("working_max", ctypes.c_size_t), ("active_processes", wintypes.DWORD),
                    ("affinity", ctypes.c_size_t), ("priority", wintypes.DWORD),
                    ("scheduling", wintypes.DWORD)]

    class IOCounters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_uint64) for name in (
            "read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]

    class ExtendedLimits(ctypes.Structure):
        _fields_ = [("basic", BasicLimits), ("io", IOCounters),
                    ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                    ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel.SetInformationJobObject.restype = wintypes.BOOL
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel.GetCurrentProcess.argtypes = []
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.CreateJobObjectW(None, None)
    limits = ExtendedLimits()
    limits.basic.flags = 0x00000100  # JOB_OBJECT_LIMIT_PROCESS_MEMORY
    limits.process_memory = 1024**3
    if not handle or not kernel.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not kernel.AssignProcessToJobObject(handle, kernel.GetCurrentProcess()):
        if handle:
            kernel.CloseHandle(handle)
        raise ValueError("无法建立 PDF 处理进程的内存限制，文件已跳过")
    # No KILL_ON_JOB_CLOSE flag: closing the handle leaves the worker alive and
    # its job limits in force until process exit; no other process is assigned.
    kernel.CloseHandle(handle)


def _resource_limit():
    if os.name == "nt":
        _windows_memory_limit()
    else:
        import resource
        # A child process failure is contained and never publishes its result.
        resource.setrlimit(resource.RLIMIT_AS, (1024**3, 1024**3))
        resource.setrlimit(resource.RLIMIT_CPU, (OPTIMIZE_TIMEOUT, OPTIMIZE_TIMEOUT))


def _main():
    try:
        _resource_limit()
        response = {"result": _worker(json.load(sys.stdin))}
    except ValueError as exc:
        response = {"error": str(exc)}
    except Exception:
        response = {"error": "PDF 无法可靠读取或处理，文件已跳过"}
    print(json.dumps(response, ensure_ascii=True))


if __name__ == "__main__":
    _main()
