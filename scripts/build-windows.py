"""Build an isolated Windows portable bundle; never publish or claim unrun tests."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata as metadata
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import runpy
import shutil
import subprocess
import struct
import sys
import uuid
import zipfile


WINDOW_BIN_FILES = frozenset({
    "MediaSlimX.Window.exe", "MediaSlimX.Window.exe.config",
    "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll",
    "WebView2Loader.dll", "WebView2-LICENSE.txt", "WebView2-NOTICE.txt",
})
# The notice review applies to these exact SDK archive bytes, not future pins.
REVIEWED_WINDOW_SDK_SHA256 = "56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9"


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def checked_manifest(root, expected_status=None):
    root = root.resolve()
    value = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if value.get("version") != 1 or not value.get("files"):
        raise ValueError("Missing/unsupported material manifest")
    if expected_status and value.get("status") != expected_status:
        raise ValueError(f"Material status must be {expected_status}")
    seen = set()
    for record in value["files"]:
        relative = PurePosixPath(record["path"])
        if relative.is_absolute() or ".." in relative.parts or "\\" in str(relative) or ":" in str(relative):
            raise ValueError(f"Unsafe material path: {relative}")
        if str(relative) in seen:
            raise ValueError(f"Duplicate material path: {relative}")
        seen.add(str(relative))
        path = root.joinpath(*relative.parts)
        if path.is_symlink() or not path.resolve().is_relative_to(root) or not path.is_file():
            raise ValueError(f"Missing/unsafe material: {relative}")
        if path.stat().st_size != record["bytes"] or digest(path) != record["sha256"]:
            raise ValueError(f"Material hash/size mismatch: {relative}")
    return value


def checked_window_materials(root, project):
    """Accept the pinned host only, never arbitrary local helper binaries/data."""
    root, project = root.resolve(), project.resolve()
    value = checked_manifest(root, "LOCAL_WINDOW_HOST_NOT_A_RELEASE")
    pin = json.loads((project / "scripts" / "window-host-sdk.json").read_text(encoding="utf-8"))
    if value.get("sdk") != pin:
        raise ValueError("Window host SDK differs from the checked-in pin")
    package = f"microsoft.web.webview2.{pin['version']}.nupkg"
    material_files = {package, "MediaSlimX.Window.cs", "app-icon.ico", "build-window-host.ps1",
                      "window-host-sdk.json", "WebView2-LICENSE.txt", "WebView2-NOTICE.txt",
                      "Microsoft.Web.WebView2.nuspec"}
    expected = {f"bin/{name}" for name in WINDOW_BIN_FILES}
    expected.update(f"materials/{name}" for name in material_files)
    listed = {record["path"] for record in value["files"]}
    actual = {path.relative_to(root).as_posix() for name in ("bin", "materials")
              for path in (root / name).rglob("*") if path.is_file()}
    if listed != expected or actual != expected:
        raise ValueError("Window host materials must match the exact public file whitelist")
    if digest(root / "materials" / package) != pin["sha256"]:
        raise ValueError("Window SDK package does not match its pinned SHA-256")
    for relative, original in (("MediaSlimX.Window.cs", project / "native" / "MediaSlimX.Window.cs"),
                               ("build-window-host.ps1", project / "scripts" / "build-window-host.ps1"),
                               ("window-host-sdk.json", project / "scripts" / "window-host-sdk.json"),
                               ("app-icon.ico", project / "assets" / "brand" / "app-icon.ico")):
        if digest(root / "materials" / relative) != digest(original):
            raise ValueError(f"Window build input changed; rebuild host: {relative}")
    if not value.get("compiler_version") or not value.get("command"):
        raise ValueError("Window host lacks compiler/build-command evidence")
    return value


def copy_window_materials(root, destination, manifest):
    """Copy reviewed entries, excluding neighboring protocol/WebView profiles."""
    destination.mkdir()
    for record in manifest["files"]:
        relative = PurePosixPath(record["path"])
        target = destination.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root.joinpath(*relative.parts), target)
    shutil.copy2(root / "manifest.json", destination / "manifest.json")


def zip_tree(root, destination, prefix):
    temporary = destination.with_name(destination.name + ".part")
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for file in sorted(root.rglob("*")):
                if file.is_file():
                    if file.is_symlink() or not file.resolve().is_relative_to(root.resolve()):
                        raise ValueError(f"Unsafe archive input: {file}")
                    archive.write(file, f"{prefix}/{file.relative_to(root).as_posix()}")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def size_group(relative):
    name = relative.lower()
    if "/window-host/" in name:
        return "window-host"
    if "/bin/ffmpeg" in name or "/bin/ffprobe" in name:
        return "ffmpeg"
    if "/pikepdf" in name or "/lxml" in name:
        return "pdf"
    if "/pil/" in name or "/pillow" in name:
        return "images"
    if "third-party" in name:
        return "notices"
    if "mediaslimx/static/" in name:
        return "interface"
    return "python-and-app"


def inventory(bundle, archive):
    groups, records = {}, []
    with zipfile.ZipFile(archive) as zipped:
        compressed = {item.filename: item.compress_size for item in zipped.infolist()}
    for path in sorted(bundle.rglob("*")):
        if path.is_file():
            relative = path.relative_to(bundle).as_posix()
            group = size_group(relative)
            record = {"path": relative, "bytes": path.stat().st_size, "sha256": digest(path),
                      "zip_deflate_bytes": compressed.get(f"MediaSlimX/{relative}", 0), "group": group}
            records.append(record)
            values = groups.setdefault(group, {"files": 0, "bytes": 0, "zip_deflate_bytes": 0})
            values["files"] += 1
            values["bytes"] += record["bytes"]
            values["zip_deflate_bytes"] += record["zip_deflate_bytes"]
    return {"version": 1, "archive": archive.name, "archive_bytes": archive.stat().st_size,
            "archive_sha256": digest(archive), "groups": groups, "files": records,
            "note": "Per-file compressed sizes exclude ZIP headers; archive_bytes is actual download size."}


def clean_evidence_matches(evidence, payload_sha, interface="browser"):
    environment = evidence.get("environment", {})
    checks = evidence.get("checks", [])
    manual = {item.get("name"): item.get("status") for item in evidence.get("manual_checks", [])}
    if interface == "window":
        required = {"standalone_window", "native_directory_selection", "standard_user",
                    "window_close_during_processing", "webview2_runtime_dependency",
                    "external_browser_not_started"}
    else:
        required = {"default_browser", "native_directory_selection", "standard_user", "browser_survives_service_exit"}
    return (evidence.get("status") == "passed" and environment.get("clean_windows") is True
            and environment.get("virtualization") in {"WindowsSandbox", "Hyper-V", "fresh-machine"}
            and evidence.get("bundle_payload_sha256") == payload_sha
            and bool(checks) and all(item.get("status") == "passed" for item in checks)
            and required.issubset(manual) and all(manual[name] == "passed" for name in required))


def project_source_snapshot(project, destination):
    """Public source whitelist only; never archive the workspace/data tree."""
    # Windows temporary paths can arrive in 8.3 form (ADMINI~1); compare the
    # canonical root against canonical children rather than mixing spellings.
    project = project.resolve()
    destination = destination.resolve()
    selected = set()
    for pattern in ("LICENSE", "README*.md", "DESIGN.md", "requirements*.txt",
                    "Start-MediaSlimX.cmd", "Start-MediaSlimX-Browser.cmd", "start-wsl.sh", "mediaslimx/**/*.py",
                    "mediaslimx/static/**/*", "assets/brand/**/*", "docs/**/*.md",
                    "scripts/*.py", "scripts/*.ps1", "scripts/*.sh", "scripts/media-engine-sources.json",
                    "scripts/window-host-sdk.json", "native/**/*.cs",
                    "tests/*.py", "tests/*.cjs"):
        selected.update(file for file in project.glob(pattern) if file.is_file())
    records = []
    for file in sorted(selected):
        if file.is_symlink() or not file.resolve().is_relative_to(project):
            raise ValueError(f"Unsafe source snapshot file: {file}")
        relative = file.relative_to(project)
        if any(part.startswith(".") or part == "__pycache__" for part in relative.parts):
            raise ValueError(f"Private/generated source path excluded: {relative}")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
        records.append({"path": relative.as_posix(), "bytes": target.stat().st_size, "sha256": digest(target)})
    if not records:
        raise ValueError("Empty project source snapshot")
    tree_hash = hashlib.sha256(json.dumps(records, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    manifest = {"version": 1, "tree_sha256": tree_hash, "files": records,
                "git_commit": None, "scope": "Explicit public-source whitelist, no runtime data or private media"}
    (destination / "SOURCE-SNAPSHOT.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main():
    if os.name != "nt" or sys.version_info < (3, 11):
        raise SystemExit("Use Windows Python 3.11+; never freeze a WSL interpreter for Windows.")
    if struct.calcsize("P") != 8 or platform.machine().lower() not in {"amd64", "x86_64"}:
        raise SystemExit("This portable target requires native Windows x64 Python, not x86 or ARM64.")
    os.environ.update(PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--ffmpeg-dir", type=Path, help="Legacy local prototype only")
    group.add_argument("--ffmpeg-materials", type=Path, help="Verified media-engine material directory")
    parser.add_argument("--python-materials", type=Path)
    parser.add_argument("--window-host-materials", type=Path,
                        help="Pinned native window material root; omitted preserves console/browser mode")
    parser.add_argument("--clean-windows-evidence", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--build-id", help="Optional immutable candidate label, e.g. materials-r2")
    args = parser.parse_args()
    if args.build_id and not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", args.build_id):
        parser.error("--build-id accepts lowercase letters, digits and hyphens only")
    project = Path(__file__).resolve().parent.parent
    output = (args.output_dir or project / ".mediaslimx" / "packaging").resolve()
    output.mkdir(parents=True, exist_ok=True)
    blockers, sources = [], {}
    source_manifests = {}
    ffmpeg_materials = args.ffmpeg_materials.resolve() if args.ffmpeg_materials else None
    if ffmpeg_materials:
        try:
            engine = checked_manifest(ffmpeg_materials, "locally_verified")
            tools = {}
            for name in ("ffmpeg.exe", "ffprobe.exe"):
                entry = engine["binaries"][name]
                path = (ffmpeg_materials / entry["path"]).resolve()
                if not path.is_relative_to(ffmpeg_materials) or digest(path) != entry["sha256"]:
                    raise ValueError(f"Binary does not match materials: {name}")
                tools[name] = path
            roles = {item["role"] for item in engine["files"]}
            if not {"corresponding-source", "license", "build-material", "verification"}.issubset(roles):
                raise ValueError("Media materials lack source, license, build or verification records")
            sources["media-engine"] = ffmpeg_materials
            source_manifests["media-engine"] = engine
        except (ValueError, KeyError, OSError) as error:
            parser.error(str(error))
    else:
        tools = {name: args.ffmpeg_dir.resolve() / name for name in ("ffmpeg.exe", "ffprobe.exe")}
        blockers.append("FFmpeg corresponding-source/build materials were not supplied")
    for name, path in tools.items():
        if not path.is_file():
            parser.error(f"Missing {name}: {path}")
    python_materials = args.python_materials.resolve() if args.python_materials else None
    if python_materials:
        try:
            materials = checked_manifest(python_materials)
            if materials["runtime"]["python"] != sys.version.split()[0]:
                raise ValueError("Python materials belong to another interpreter version")
            for component in materials["components"]:
                if metadata.version(component["name"]) != component["version"]:
                    raise ValueError(f"Installed dependency mismatch: {component['name']}")
            collector = runpy.run_path(str(project / "scripts" / "collect-distribution-materials.py"))
            for component in materials["components"]:
                for artifact in component["artifacts"]:
                    if artifact["role"] == "wheel":
                        match = collector["wheel_matches_installed"](metadata.distribution(component["name"]), python_materials / artifact["path"])
                        if not match["matches"]:
                            raise ValueError(f"Installed dependency payload changed: {component['name']}")
            provenance = json.loads((python_materials / "runtime-binaries.json").read_text(encoding="utf-8"))
            for binary in provenance["files"]:
                parts = PurePosixPath(binary["path"]).parts
                if (not parts or parts[0] != "CPython" or ".." in parts
                        or "\\" in binary["path"] or ":" in binary["path"]):
                    raise ValueError("Unsafe interpreter provenance path")
                actual = Path(sys.base_prefix).joinpath(*parts[1:])
                if (not actual.resolve().is_relative_to(Path(sys.base_prefix).resolve())
                        or not actual.is_file() or digest(actual) != binary["sha256"]):
                    raise ValueError(f"Interpreter binary differs from collected materials: {binary['path']}")
            blockers.extend(materials.get("release_blockers", []))
            sources["python-runtime"] = python_materials
            source_manifests["python-runtime"] = materials
        except (ValueError, KeyError, OSError, metadata.PackageNotFoundError) as error:
            parser.error(str(error))
    else:
        blockers.append("Exact Python/runtime notices and source materials were not supplied")
    window_materials = args.window_host_materials.resolve() if args.window_host_materials else None
    interface = "window" if window_materials else "browser"
    if window_materials:
        try:
            window_host = checked_window_materials(window_materials, project)
            sources["window-host"] = window_materials
            source_manifests["window-host"] = window_host
            blockers.extend(window_host.get("release_blockers", []))
            sdk_reviewed = window_host["sdk"]["sha256"] == REVIEWED_WINDOW_SDK_SHA256
            if not sdk_reviewed:
                blockers.append("Window SDK archive changed; review its exact LICENSE/NOTICE before distribution")
        except (ValueError, KeyError, OSError) as error:
            parser.error(str(error))
    icon = project / "assets" / "brand" / "app-icon.ico"
    if not icon.is_file():
        parser.error("Missing app-icon.ico")
    stage = output / "staging" / uuid.uuid4().hex
    stage.mkdir(parents=True)
    companion = stage / "third-party-materials"
    companion.mkdir()
    frozen_sources = {}
    for material_label, root in sources.items():
        destination = companion / material_label
        if material_label == "window-host":
            # SDK validation may keep WebView test profiles beside bin/materials.
            # Copy only manifest entries; never include those local browser caches.
            copy_window_materials(root, destination, source_manifests[material_label])
        else:
            shutil.copytree(root, destination)
        copied = checked_manifest(destination)
        expected = source_manifests[material_label]
        if copied != expected:
            raise ValueError(f"Materials changed during preparation: {material_label}")
        frozen_sources[material_label] = destination
    sources = frozen_sources
    python_materials = sources.get("python-runtime")
    if ffmpeg_materials:
        tools = {name: sources["media-engine"] / engine["binaries"][name]["path"] for name in tools}
    build_source = companion / "MediaSlimX-source"
    source_snapshot = project_source_snapshot(project, build_source)
    icon = build_source / "assets" / "brand" / "app-icon.ico"
    command = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
               "--windowed" if window_materials else "--console",
               "--name", "MediaSlimX", "--distpath", str(stage / "dist"), "--workpath", str(stage / "work"),
               "--specpath", str(stage), "--paths", str(build_source), "--icon", str(icon),
               "--add-data", f"{build_source / 'mediaslimx' / 'static'};mediaslimx/static",
               "--hidden-import", "tkinter", "--hidden-import", "tkinter.filedialog",
               "--hidden-import", "uvicorn.logging", "--hidden-import", "uvicorn.loops.auto",
               "--hidden-import", "uvicorn.protocols.http.auto", "--hidden-import", "uvicorn.protocols.websockets.auto",
               "--hidden-import", "uvicorn.lifespan.on", "--collect-all", "pikepdf"]
    for path in tools.values():
        command += ["--add-binary", f"{path};bin"]
    if window_materials:
        checked_window_materials(sources["window-host"], build_source)
        for name in sorted(WINDOW_BIN_FILES):
            command += ["--add-binary" if name.lower().endswith((".dll", ".exe")) else "--add-data",
                        f"{sources['window-host'] / 'bin' / name};window-host"]
    command.append(str(build_source / "scripts" / ("window-entry.py" if window_materials else "portable-entry.py")))
    subprocess.run(command, cwd=build_source, check=True)
    bundle = stage / "dist" / "MediaSlimX"
    # Payload identity can bind future clean-guest acceptance without circular hashes.
    payload = [{"path": file.relative_to(bundle).as_posix(), "bytes": file.stat().st_size, "sha256": digest(file)}
               for file in sorted(bundle.rglob("*")) if file.is_file()]
    payload_sha = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    clean = {"status": "pending", "reason": "No real clean Windows acceptance evidence supplied"}
    if args.clean_windows_evidence:
        evidence = json.loads(args.clean_windows_evidence.read_text(encoding="utf-8"))
        if clean_evidence_matches(evidence, payload_sha, interface):
            clean = evidence
        else:
            clean = {"status": "pending", "reason": "Incomplete, non-clean or different-payload evidence"}
    materials_ready = not blockers
    if clean["status"] != "passed":
        blockers.append("Real clean Windows acceptance remains pending")
    status = "RELEASE_CANDIDATE_NOT_PUBLISHED" if not blockers else "LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION"
    suffix = "release-candidate" if not blockers else "validation-candidate" if ffmpeg_materials else "local-prototype"
    notices = bundle / "third-party-notices"
    notices.mkdir(exist_ok=True)
    shutil.copy2(build_source / "LICENSE", bundle / "LICENSE-MediaSlimX.txt")
    for label, root in sources.items():
        if label == "window-host":
            (notices / label).mkdir()
            for name in ("WebView2-LICENSE.txt", "WebView2-NOTICE.txt"):
                shutil.copy2(root / "materials" / name, notices / label / name)
        else:
            shutil.copytree(root / "notices", notices / label)
        shutil.copy2(root / "manifest.json", notices / f"{label}-material-manifest.json")
    if python_materials:
        shutil.copy2(python_materials / "THIRD-PARTY-NOTICES.txt", bundle / "THIRD-PARTY-NOTICES.txt")
    else:
        for dist in metadata.distributions():
            for item in dist.files or ():
                text = str(item).replace("\\", "/")
                if ".dist-info/" in text:
                    relative = text.split(".dist-info/", 1)[1]
                    if relative.startswith("licenses/") or relative == "METADATA":
                        source = Path(dist.locate_file(item))
                        if source.is_file():
                            target = notices / dist.metadata["Name"] / relative
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(source, target)
        shutil.copy2(Path(sys.base_prefix) / "LICENSE.txt", notices / "Python-LICENSE.txt")
    if not ffmpeg_materials:
        for name in ("LICENSE", "README.txt"):
            source = next(iter(tools.values())).parent.parent / name
            if source.is_file():
                shutil.copy2(source, notices / f"FFmpeg-{name}")
    for root in sources.values():
        checked_manifest(root)
    # Never overwrite an archive already supplied to a validation run.
    build_label = f"{suffix}-{args.build_id}" if args.build_id else suffix
    if any(path.exists() for path in (
            output / f"MediaSlimX-windows-x64-{build_label}.zip",
            output / f"MediaSlimX-windows-x64-{build_label}-third-party-materials.zip",
            output / "candidates" / build_label)):
        build_label += "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    source_archive = output / f"MediaSlimX-windows-x64-{build_label}-third-party-materials.zip"
    zip_tree(companion, source_archive, "MediaSlimX-third-party-materials")
    source_notice = {"version": 1, "status": "local-preparation-only-not-published",
                     "companion_archive": source_archive.name, "bytes": source_archive.stat().st_size,
                     "sha256": digest(source_archive),
                     "instruction": "Distribute this matching companion archive beside the runtime ZIP; preserve licenses/source paths.",
                     "project_source_tree_sha256": source_snapshot["tree_sha256"],
                     "materials": {label: {"manifest_sha256": digest(root / "manifest.json"),
                                           "status": json.loads((root / "manifest.json").read_text(encoding="utf-8"))["status"]}
                                   for label, root in sources.items()}}
    (bundle / "THIRD-PARTY-SOURCES.json").write_text(json.dumps(source_notice, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest = {"version": 2, "status": status, "platform": sys.platform, "python": sys.version.split()[0],
                "pyinstaller": metadata.version("pyinstaller"), "bundle_payload_sha256": payload_sha,
                "project_source_tree_sha256": source_snapshot["tree_sha256"],
                "interface": {"mode": interface,
                              "entry": "scripts/window-entry.py" if window_materials else "scripts/portable-entry.py",
                              "opens_external_browser": not bool(window_materials),
                              "window_host_material_manifest_sha256": digest(sources["window-host"] / "manifest.json") if window_materials else None,
                              "webview2": {"sdk": window_host["sdk"], "runtime_bundled": False,
                                           "requires": "Installed Microsoft Edge WebView2 Evergreen Runtime (x64)",
                                           "sdk_notices": {"status": "reviewed-for-exact-archive" if sdk_reviewed else "review-pending",
                                                           "preserved_in_runtime_and_companion": True,
                                                           "scope": "Exact pinned SDK LICENSE/NOTICE, not a whole-bundle legal certification"},
                                           "automatic_runtime_install": False} if window_materials else None},
                "materials_status": "ready" if materials_ready else "review-pending", "clean_windows": clean,
                "dependencies": {dist.metadata["Name"]: dist.version for dist in metadata.distributions()},
                "ffmpeg": {name: {"bytes": path.stat().st_size, "sha256": digest(path)} for name, path in tools.items()},
                "third_party_sources": source_notice, "release_blockers": blockers,
                "signature": {"status": "unsigned", "smart_screen_acceptance": "not-claimed"}, "published": False}
    (bundle / "BUILD-MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    instructions = (
        "完整解压后双击 MediaSlimX.exe，打开独立工具窗口，不启动外部浏览器。\n"
        "Extract the entire folder and double-click MediaSlimX.exe to open its own window.\n"
        "关闭窗口时安全取消剩余任务并退出该窗口自己的后台，已完成结果保留。\n"
        "Closing the window safely cancels remaining work and stops its own background service. Completed results remain.\n"
        "已包含 Python/FFmpeg/PDF 库；需要机器已安装 WebView2 Runtime（不含在包内）。\n"
        "Python/FFmpeg/PDF libraries are included. An installed WebView2 Runtime is required and is not bundled.\n"
        "缺少 WebView2 时显示说明，不自动下载安装或改开浏览器。\n"
        "If WebView2 is absent, setup instructions are shown; no automatic install or browser fallback.\n"
        if window_materials else
        "完整解压后双击 MediaSlimX.exe，自动打开网页；无需另装 Python、FFmpeg 或 pip。\n"
        "Extract the entire folder and double-click MediaSlimX.exe. No separate runtime installation needed.\n"
        "保留控制台；完成或取消任务后按 Ctrl+C 停止，关闭网页不会退出服务。\n"
        "Keep the console open. Finish/cancel work, then press Ctrl+C to stop.\n")
    (bundle / "READ-ME-FIRST.txt").write_text(
        "MediaSlim X / MediaSlimX\n" + status + "\n\n" + instructions +
        "任务数据 / Data: %LOCALAPPDATA%\\MediaSlimX\\portable\n"
        "仅本机回环 / Loopback only. Starts at port 8767, isolated from source and WSL.\n"
        "Unsigned binary. Do not disable system security protections.\n"
        "See BUILD-MANIFEST.json for actual validation status and outstanding checks.\n"
        "See THIRD-PARTY-SOURCES.json and third-party-notices for matching sources/licenses.\n",
        encoding="utf-8-sig")
    archive = output / f"MediaSlimX-windows-x64-{build_label}.zip"
    zip_tree(bundle, archive, "MediaSlimX")
    (output / f"{build_label}-size-inventory.json").write_text(json.dumps(inventory(bundle, archive), ensure_ascii=False, indent=2), encoding="utf-8")
    (output / f"{build_label}.sha256").write_text(digest(archive) + "  " + archive.name + "\n" + digest(source_archive) + "  " + source_archive.name + "\n", encoding="utf-8")
    # New candidates coexist with the old working prototype. No user service/data changes.
    destination = output / "candidates" / build_label / "MediaSlimX"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.rename(destination.parent / f"previous-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}")
    shutil.move(str(bundle), str(destination))
    result = {"bundle": str(destination), "archive": str(archive), "bytes": archive.stat().st_size,
              "source_archive": str(source_archive), "status": status, "release_blockers": blockers}
    (output / "latest-build.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
