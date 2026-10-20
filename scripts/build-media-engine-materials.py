"""Collect exact FFmpeg engine sources, recipes, notices and Windows evidence.

This packages local materials only. It neither publishes nor claims clean-OS
acceptance; the Windows portable release has its own, separate acceptance gate.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    for name in ("build-dir", "download-dir", "toolchain", "toolchain-source", "mingw-source", "verification-dir", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parent.parent
    build = args.build_dir.resolve()
    output = args.output.resolve()
    source = args.download_dir.resolve()
    toolchain = args.toolchain.resolve()
    verification = json.loads((args.verification_dir / "verification.json").read_text(encoding="utf-8"))
    if not verification.get("passed") or len(verification.get("checks", [])) < 14:
        raise SystemExit("Windows engine acceptance must pass before material assembly.")
    pins_path = project / "scripts/media-engine-sources.json"
    pins = json.loads(pins_path.read_text(encoding="utf-8"))
    normalize_paths = {str(project): "${PROJECT_ROOT}", str(build): "${ENGINE_BUILD_ROOT}",
                       str(toolchain): "${LLVM_MINGW_ROOT}", str(toolchain.parent): "${TOOLCHAIN_WORK_ROOT}"}

    def text_copy(path, destination):
        text = path.read_text(encoding="utf-8", errors="replace")
        for old, replacement in sorted(normalize_paths.items(), key=lambda pair: len(pair[0]), reverse=True):
            text = text.replace(old, replacement)
        text = re.sub(r"/tmp/ffconf\.[A-Za-z0-9]+", "${CONFIG_TEST_ROOT}", text)
        target = output / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def copy(path, destination):
        target = output / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

    for component, filename in (("ffmpeg", "ffmpeg-9.0.2.tar.xz"),
                                ("x264", "x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.xz")):
        archive = source / filename
        if digest(archive) != pins[component]["sha256"]:
            raise SystemExit("Source hash mismatch: " + filename)
        copy(archive, "sources/" + filename)
    for filename in ("ffmpeg-9.0.2.tar.xz.asc", "ffmpeg-devel.asc"):
        copy(source / filename, "sources/" + filename)
    for filename in ("build-media-engine.sh", "build-media-engine-verify.py", "build-media-engine-materials.py", "media-engine-sources.json"):
        copy(project / "scripts" / filename, "build/" + filename)
    for path in sorted((build / "build").iterdir()):
        if path.is_file():
            text_copy(path, "build/" + path.name)
    for filename in ("ffmpeg.exe", "ffprobe.exe"):
        binary = build / "bin" / filename
        if digest(binary) != verification["binaries"][filename]["sha256"]:
            raise SystemExit("Windows evidence is for another binary: " + filename)
        copy(binary, "bin/" + filename)
        copy(args.verification_dir / (filename + "-version.txt"), "notices/" + filename + "-version.txt")
    copy(args.verification_dir / "verification.json", "verification.json")
    ffmpeg = build / "work/ffmpeg"
    for path in ffmpeg.glob("COPYING*"):
        copy(path, "notices/FFmpeg/" + path.name)
    copy(ffmpeg / "LICENSE.md", "notices/FFmpeg/LICENSE.md")
    copy(build / "work/x264/COPYING", "notices/x264/COPYING")
    copy(toolchain / "LICENSE.TXT", "notices/LLVM/LICENSE.TXT")
    mingw = args.mingw_source.resolve()
    for path in (mingw / "COPYING", mingw / "AUTHORS"):
        copy(path, "notices/MinGW-w64/" + path.name)
    for directory in ("COPYING.MinGW-w64", "COPYING.MinGW-w64-runtime"):
        for path in (mingw / directory).rglob("*"):
            if path.is_file():
                copy(path, "notices/MinGW-w64/" + str(path.relative_to(mingw)).replace("\\", "/"))
    archive = output / "sources/mingw-w64-runtime-upstream.tar.xz"
    with archive.open("wb") as stream:
        archived = subprocess.Popen(["git", "-C", str(mingw), "archive", "--format=tar", "--prefix=mingw-w64/", "HEAD"], stdout=subprocess.PIPE)
        subprocess.run(["xz", "-9"], stdin=archived.stdout, stdout=stream, check=True)
        archived.stdout.close()
        if archived.wait():
            raise SystemExit("MinGW source archive failed")
    for filename in ("build-mingw-w64.sh", "build-llvm.sh", "build-compiler-rt.sh", "COPYING"):
        path = args.toolchain_source / filename
        if path.is_file():
            text_copy(path, "build/toolchain-recipe/" + filename)
    imports = {}
    allowed = {"kernel32.dll", "advapi32.dll", "bcrypt.dll", "user32.dll", "msvcrt.dll", "ucrtbase.dll", "shell32.dll", "ole32.dll", "ws2_32.dll"}
    readobj = toolchain / "bin/llvm-readobj"
    for filename in ("ffmpeg.exe", "ffprobe.exe"):
        text = subprocess.check_output([str(readobj), "--coff-imports", str(build / "bin" / filename)], text=True)
        dlls = sorted(set(re.findall(r"^  Name: (.+)$", text, re.M)), key=str.lower)
        if not dlls or any(dll.lower() not in allowed and not dll.lower().startswith("api-ms-win-") for dll in dlls):
            raise SystemExit("Unexpected external DLL dependency: " + repr(dlls))
        imports[filename] = dlls
    (output / "build/dll-imports.json").write_text(json.dumps(imports, indent=2), encoding="utf-8")
    (output / "build/changes.diff").write_text("", encoding="utf-8")
    (output / "build/BUILD-NOTES.md").write_text(
        "# MediaSlim X Windows MP4 engine\n\n"
        "FFmpeg and x264 source files are unmodified. The empty changes.diff records no source patches.\n"
        "Build log paths use placeholders; build-media-engine.sh is the actual portable recipe.\n"
        "Run on Linux/WSL with Bash, Python 3, GNU make, pkg-config, tar/xz, NASM and LLVM-MinGW.\n"
        "Verify each archive against media-engine-sources.json before extracting the toolchain.\n\n"
        "```sh\nbash build/build-media-engine.sh sources/ffmpeg-9.0.2.tar.xz "
        "sources/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.xz "
        "PATH_TO_LLVM_MINGW FRESH_BUILD_DIRECTORY PATH_TO_NASM_BIN\n```\n\n"
        "FFmpeg + x264: GPL-2.0-or-later, not an LGPL-only build. Keep all copyright/license notices.\n"
        "The exact upstream FFmpeg and x264 archives, recipe, configuration and no-patches record accompany these executables.\n"
        "Redistribute the corresponding-source archive alongside every binary download, at no additional charge; do not substitute a license text or upstream homepage for these sources.\n"
        "LLVM compiler-rt/builtins: Apache-2.0 WITH LLVM-exception; full toolchain license included.\n"
        "MinGW-w64 CRT: runtime licenses and exact upstream source included. Windows UCRT/system DLLs remain OS components.\n"
        "Toolchain source recipe is from llvm-mingw tag 20260908 (030097eeee87fcfd0f3bfe536b21cbd6e5d3b324); "
        "LLVM llvmorg-23.1.1, MinGW-w64 9f55f4a2d3b9783dab76d9808be3d6279b99ec2a.\n"
        "Compiler/system runtime treatment does not remove FFmpeg/x264 source obligations.\n\n"
        "verification.json records native Windows execution with PATH restricted to engine plus System32. "
        "This is not a clean Windows VM acceptance or a code-signing/SmartScreen result.\n",
        encoding="utf-8")
    manifest = {"schema_version": 1, "version": 1, "status": "locally_verified", "target": "windows-x86_64-ucrt",
                "components": pins, "binaries": {}, "files": [], "clean_windows_verified": False}
    for path in sorted(output.rglob("*")):
        if not path.is_file() or path.name == "manifest.json":
            continue
        relative = path.relative_to(output).as_posix()
        role = "binary" if relative.startswith("bin/") else "corresponding-source" if relative.startswith("sources/") else "license" if relative.startswith("notices/") else "verification" if relative == "verification.json" else "build-material"
        item = {"path": relative, "sha256": digest(path), "bytes": path.stat().st_size, "role": role}
        manifest["files"].append(item)
        if role == "binary":
            manifest["binaries"][path.name] = {key: item[key] for key in ("path", "sha256", "bytes")}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "files": len(manifest["files"]), "status": manifest["status"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
