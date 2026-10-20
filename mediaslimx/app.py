"""Loopback API with explicit origin, host and bearer-capability checks."""
import hashlib
import hmac
import mimetypes
import os
import platform
import re
import secrets
import shutil
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from .engine import Engine, task_folder_name
from . import pdf
from .folders import FolderBrowser
from .imports import ImportManager, MAX_FILES, MAX_FILE_BYTES, MAX_BATCH_BYTES
from starlette.background import BackgroundTask
from .paths import absolute, open_read


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ScanRequest(Model):
    path: str = Field(min_length=1, max_length=4096)


class TaskRequest(Model):
    scan_id: str
    selected: list[str] = Field(min_length=1)
    preset: str = "balanced"
    max_width: int | None = None
    max_height: int | None = None
    mode: str = "export"
    output: str | None = None
    backup: str | None = None
    confirm: bool = False


class RestoreRequest(Model):
    entry_id: str | None = None


class DirectoryRequest(Model):
    path: str | None = None
    purpose: str = "media"


class NativeDirectoryRequest(Model):
    purpose: str = "media"
    request_id: str | None = Field(default=None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class CancelNativeRequest(Model):
    request_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class PinRequest(Model):
    pinned: bool


class ClearTasksRequest(Model):
    task_ids: list[str] = Field(min_length=1, max_length=5000)


class DeleteRecordRequest(Model):
    confirm: bool = Field(strict=True)
    record_version: str = Field(pattern=r"^[0-9a-f]{64}$")


class DirectoryShortcutRequest(Model):
    path: str = Field(min_length=1, max_length=4096)


class PinDirectoryRequest(DirectoryShortcutRequest):
    pinned: bool


class ClearDirectoriesRequest(Model):
    paths: list[str] = Field(min_length=1, max_length=5000)


class ImportFile(Model):
    name: str = Field(min_length=1, max_length=240)
    size: int = Field(gt=0, le=MAX_FILE_BYTES, strict=True)
    relative_path: str | None = Field(default=None, min_length=1, max_length=2048)


class ImportRequest(Model):
    files: list[ImportFile] = Field(min_length=1, max_length=MAX_FILES)
    import_id: str | None = Field(default=None, pattern=r"^[0-9a-f]{32}$")


class ClearImportsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    import_ids: list[str] = Field(min_length=1, max_length=200)


def result_directory(engine: Engine, task_id: str) -> Path:
    """Resolve a task-owned result folder; never accept a path from the page."""
    if not re.fullmatch(r"[0-9a-f]{32}", task_id):
        raise ValueError("无效任务编号")
    task = engine.get("task", task_id)
    if task.get("id") != task_id:
        raise ValueError("任务记录不匹配")
    if not any(entry.get("result_fp") for entry in task["entries"]):
        raise ValueError("此任务尚无可查看的结果文件")
    if task["mode"] == "export":
        root = task.get("output_root")
        if not root:
            raise ValueError("此任务没有输出目录记录")
        folder = absolute(Path(root) / task_folder_name(task))
    elif task["mode"] in {"backup", "overwrite"}:
        folder = absolute(task["root"])
    else:
        raise ValueError("未知输出方式")
    if not folder.is_dir():
        raise ValueError("结果目录已移动或删除，请检查页面列出的路径")
    return folder


def task_directory(engine: Engine, task_id: str, slot: str) -> Path:
    """Choose only recorded task directories; the page never supplies a path."""
    if slot == "result":
        return result_directory(engine, task_id)
    if not re.fullmatch(r"[0-9a-f]{32}", task_id):
        raise ValueError("无效任务编号")
    task = engine.get("task", task_id)
    if task.get("id") != task_id:
        raise ValueError("任务记录不匹配")
    if slot == "source":
        folder = engine._source_root(task)
    elif slot == "backup" and task.get("mode") == "backup":
        if not any(entry.get("backup_fp") for entry in task["entries"]):
            raise ValueError("此任务尚无可查看的备份文件")
        root = task.get("backup_root")
        if not root:
            raise ValueError("此任务没有备份目录记录")
        folder = absolute(Path(root) / task_folder_name(task))
    else:
        raise ValueError("此任务没有所选目录")
    if not folder.is_dir():
        raise ValueError("目录已移动或删除，请检查页面列出的路径")
    return folder


def create_app(engine: Engine, token=None, port=8765, desktop=False):
    folders = FolderBrowser(engine, desktop)
    imports = ImportManager(engine)
    preview_cookie = f"mediaslimx-preview-{port}"
    token = token or secrets.token_urlsafe(32)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.state.engine, app.state.token = engine, token
    app.state.stop_native_picker = folders.close_native
    # Only run_window enables this capability; there is no HTTP grant endpoint.
    app.state.window_directory_drop = False
    app.state.authorize_window_directory_drop = folders.dropped_directory
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
    assets = Path(__file__).parent / "static"

    @app.middleware("http")
    async def guard(request, call_next):
        host = request.headers.get("host", "")
        origin = request.headers.get("origin")
        if host not in hosts:
            response = JSONResponse({"detail": "仅允许配置端口的本机 Host"}, status_code=403)
        elif origin and origin != f"http://{host}":
            response = JSONResponse({"detail": "拒绝跨站请求"}, status_code=403)
        elif request.headers.get("sec-fetch-site") == "cross-site":
            response = JSONResponse({"detail": "拒绝跨站请求"}, status_code=403)
        elif request.url.path.startswith("/api/") and not hmac.compare_digest((request.headers.get("x-mediaslimx-token", "") or (request.cookies.get(preview_cookie, "") if "/preview/" in request.url.path or re.fullmatch(r"/api/tasks/[0-9a-f]{32}/download\.zip", request.url.path) else "")), token):
            response = JSONResponse({"detail": "访问令牌无效，请从启动终端打开完整 URL"}, status_code=401)
        elif getattr(engine, "closing", None) is not None and engine.closing.is_set() and request.method not in {"GET", "HEAD"}:
            response = JSONResponse({"detail": "正在安全退出，暂不接受新的操作 / Shutting down; new operations are disabled"}, status_code=503)
        elif request.method == "POST" and request.headers.get("content-type", "").split(";")[0] != "application/json":
            response = JSONResponse({"detail": "只接受 JSON 请求"}, status_code=415)
        else:
            response = await call_next(request)
        response.headers.update({
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        })
        return response

    @app.exception_handler(ValueError)
    async def value_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.exception_handler(OSError)
    async def os_error(request, exc):
        return JSONResponse({"detail": "文件操作失败，请检查权限、路径或磁盘空间：" + str(exc)}, status_code=400)

    @app.get("/")
    def index():
        return FileResponse(assets / "index.html")

    @app.get("/static/{name}")
    def static(name: str):
        if name not in {"app.js", "storage.js", "style.css", "favicon.svg", "icons.svg", "theme.js", "import-tree.js", "i18n.js", "i18n-catalog.js"}:
            return Response(status_code=404)
        return FileResponse(assets / name)

    @app.get("/static/brand/{name}")
    def brand_asset(name: str):
        # A fixed asset list, never an arbitrary path or media-file endpoint.
        if name not in {"favicon.svg", "mark.svg"}:
            return Response(status_code=404)
        return FileResponse(assets / "brand" / name)

    @app.post("/api/session")
    def session():
        response = JSONResponse({"ok": True})
        response.set_cookie(preview_cookie, token, httponly=True, samesite="strict", path="/api/tasks/")
        return response

    @app.get("/api/environment")
    def environment():
        import PIL
        return {"platform": platform.platform(), "python": platform.python_version(), "pillow": PIL.__version__,
                "pdf": pdf.available(),
                "ffmpeg": bool(shutil.which("ffmpeg")), "ffprobe": bool(shutil.which("ffprobe")),
                "import_limits": {"files": MAX_FILES, "file_bytes": MAX_FILE_BYTES, "batch_bytes": MAX_BATCH_BYTES},
                "import_default_output": str(imports.default_output), "roots": [str(r) for r in engine.roots], "cwd": str(Path.cwd()), "data_dir": str(engine.data_dir),
                "pid": os.getpid(), "port": port, "version": "0.2.0", "native_picker": folders.desktop,
                "window_directory_drop": app.state.window_directory_drop,
                "open_result_folder": os.name == "nt" and app.state.window_directory_drop,
                "open_task_folder": os.name == "nt" and app.state.window_directory_drop,
                "runtime": "Windows 本地" if platform.system() == "Windows" else "Linux / WSL"}

    @app.post("/api/directories/browse")
    def browse(body: DirectoryRequest):
        return folders.browse(body.path, body.purpose)

    @app.post("/api/directories/native")
    def native(body: NativeDirectoryRequest):
        return folders.native(body.purpose, body.request_id)

    @app.post("/api/directories/native/cancel")
    def cancel_native(body: CancelNativeRequest):
        return folders.cancel_native(body.request_id)

    @app.post("/api/scans")
    def scan(body: ScanRequest):
        return engine.scan(body.path)

    @app.get("/api/imports/policy")
    def import_policy():
        return imports.policy()

    @app.get("/api/imports/storage")
    def import_storage():
        return imports.storage()

    @app.get("/api/imports/{import_id}/release-preview")
    def import_release_preview(import_id: str):
        return imports.release_preview(import_id)

    @app.post("/api/imports/{import_id}/release")
    def import_release(import_id: str, body: DeleteRecordRequest):
        return imports.release(import_id, body.confirm, body.record_version)

    @app.get("/api/imports/unused")
    def unused_imports():
        return imports.unused()

    @app.post("/api/imports/clear-unused")
    def clear_unused_imports(body: ClearImportsRequest):
        return imports.clear_unused(body.import_ids)

    @app.post("/api/imports")
    def allocate_import(body: ImportRequest):
        return imports.allocate([f.model_dump() for f in body.files], body.import_id)

    @app.put("/api/imports/{import_id}/files/{file_id}")
    async def receive_import(import_id: str, file_id: str, request: Request):
        if request.headers.get("content-type", "").split(";")[0] != "application/octet-stream":
            return JSONResponse({"detail": "媒体文件请使用二进制传输"}, status_code=415)
        return await imports.receive(import_id, file_id, request.stream())

    @app.post("/api/imports/{import_id}/scan")
    def scan_import(import_id: str):
        return imports.scan(import_id)

    @app.post("/api/imports/{import_id}/discard")
    def discard_import(import_id: str):
        return imports.discard(import_id)

    @app.get("/api/tasks/{task_id}/download.zip")
    def download_import(task_id: str):
        path = imports.archive(task_id)
        return FileResponse(path, media_type="application/zip", filename=f"mediaslimx-{task_id}.zip",
                            background=BackgroundTask(path.unlink, missing_ok=True))

    @app.get("/api/tasks")
    def tasks(hidden: bool = False):
        return folders.library.tasks(hidden)

    @app.post("/api/tasks/clear-history")
    def clear_history(body: ClearTasksRequest):
        return folders.library.clear_tasks(body.task_ids)

    @app.post("/api/tasks/{task_id}/pin")
    def pin_task(task_id: str, body: PinRequest):
        return folders.library.pin_task(task_id, body.pinned)

    @app.post("/api/tasks/{task_id}/restore-history")
    def restore_history(task_id: str):
        return folders.library.restore_task(task_id)

    @app.get("/api/tasks/{task_id}/deletion-preview")
    def deletion_preview(task_id: str):
        return folders.library.deletion_preview(task_id)

    @app.post("/api/tasks/{task_id}/delete-record")
    def delete_record(task_id: str, body: DeleteRecordRequest):
        return folders.library.delete_record(task_id, body.confirm, body.record_version)

    @app.get("/api/directories/shortcuts")
    def shortcuts(hidden: bool = False):
        return folders.library.directories(engine.roots, hidden)

    @app.post("/api/directories/shortcuts/pin")
    def pin_shortcut(body: PinDirectoryRequest):
        return folders.library.pin_directory(body.path, body.pinned)

    @app.post("/api/directories/shortcuts/clear")
    def clear_shortcuts(body: ClearDirectoriesRequest):
        return folders.library.clear_directories(body.paths)

    @app.post("/api/directories/shortcuts/restore")
    def restore_shortcut(body: DirectoryShortcutRequest):
        return folders.library.restore_directory(body.path)

    @app.post("/api/tasks")
    def create(body: TaskRequest):
        values = body.model_dump()
        params = {k: values.pop(k) for k in ("preset", "max_width", "max_height")}
        return {"id": engine.create(params=params, **values)}

    @app.get("/api/tasks/{task_id}")
    def task(task_id: str):
        record = engine.get("task", task_id)
        if record.get("source_kind") == "import":
            batch = engine.get("import", record["import_id"])
            record["import_copies_released"] = batch.get("state") in {"released", "releasing", "release_failed"}
        return record

    @app.post("/api/tasks/{task_id}/open-result-folder")
    def open_result_folder(task_id: str):
        if os.name != "nt" or not app.state.window_directory_drop:
            raise ValueError("仅 Windows 独立窗口可直接打开运行设备上的目录；服务器请按页面路径查看")
        folder = result_directory(engine, task_id)
        os.startfile(folder)  # ShellExecute on the validated task-owned directory.
        return {"ok": True}

    @app.post("/api/tasks/{task_id}/open-folder/{slot}")
    def open_task_folder(task_id: str, slot: str):
        if os.name != "nt" or not app.state.window_directory_drop:
            raise ValueError("仅 Windows 独立窗口可直接打开运行设备上的目录；服务器请按页面路径查看")
        folder = task_directory(engine, task_id, slot)
        os.startfile(folder)
        return {"ok": True}

    @app.post("/api/tasks/{task_id}/cancel")
    def cancel(task_id: str):
        engine.cancel(task_id)
        return {"ok": True}

    @app.post("/api/tasks/{task_id}/resume")
    def resume(task_id: str):
        return {"id": engine.resume(task_id)}

    @app.post("/api/tasks/{task_id}/restore")
    def restore(task_id: str, body: RestoreRequest):
        return engine.restore(task_id, body.entry_id)

    @app.get("/api/tasks/{task_id}/report.csv")
    def report(task_id: str):
        return Response(engine.report(task_id), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="mediaslimx-{task_id}.csv"'})

    @app.get("/api/tasks/{task_id}/preview/{entry_id}/{slot}")
    def preview(task_id: str, entry_id: str, slot: str, request: Request):
        path, expected = engine.preview(task_id, entry_id, slot)
        f = open_read(path)
        try:
            h = hashlib.sha256()
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
            size = f.tell()
            if h.hexdigest() != expected["sha256"] or size != expected["size"]:
                raise ValueError("预览文件已修改")
            start, end, status = 0, size - 1, 200
            ranges = request.headers.get("range")
            if ranges:
                try:
                    unit, interval = ranges.split("=", 1)
                    left, right = interval.split("-", 1)
                    if unit != "bytes" or "," in interval:
                        raise ValueError()
                    if left:
                        start, end = int(left), min(int(right), size - 1) if right else size - 1
                    else:
                        if int(right) <= 0:
                            raise ValueError()
                        start = max(0, size - int(right))
                    if start < 0 or start >= size or end < start:
                        raise ValueError()
                    status = 206
                except ValueError:
                    f.close()
                    return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
            f.seek(start)
            def chunks():
                remaining = end - start + 1
                try:
                    while remaining:
                        data = f.read(min(1024 * 256, remaining))
                        if not data:
                            break
                        remaining -= len(data)
                        yield data
                finally:
                    f.close()
            headers = {"Accept-Ranges": "bytes", "Content-Length": str(end - start + 1)}
            if status == 206:
                headers["Content-Range"] = f"bytes {start}-{end}/{size}"
            if path.suffix.lower() == ".pdf":
                # Treat PDFs as downloads rather than executable content in the app origin.
                headers["Content-Disposition"] = 'attachment; filename="mediaslimx-' + slot + '.pdf"'
            return StreamingResponse(chunks(), status_code=status, headers=headers,
                                     media_type=mimetypes.guess_type(path)[0] or "application/octet-stream")
        except Exception:
            f.close()
            raise

    return app
