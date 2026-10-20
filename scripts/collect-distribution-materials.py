"""Collect pinned third-party materials with the *Windows build interpreter*.

This is a maintainer tool, never a runtime downloader. Official wheels/sdists
are saved separately from the portable application. Nothing is published.
Missing evidence remains a release blocker; a hash is not a legal opinion.
"""
import argparse
import hashlib
import importlib.metadata as metadata
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import sqlite3
import sys
import tarfile
import time
import urllib.request
import zipfile


# setuptools is retained: PyInstaller's runtime hook imports its bundled
# distutils shim in this build, so treating it as build-only loses a notice.
BUILD_ONLY = {"pip", "altgraph", "pefile", "pywin32-ctypes", "pyinstaller-hooks-contrib"}


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fetch(url, destination, expected=None):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file() and (expected is None or digest(destination) == expected):
        return destination
    part = destination.with_name(destination.name + ".part")
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "MediaSlimX-materials/1"})
            with urllib.request.urlopen(request, timeout=60) as response, part.open("wb") as target:
                shutil.copyfileobj(response, target)
            if expected and digest(part) != expected:
                raise ValueError(f"SHA-256 mismatch: {destination.name}")
            part.replace(destination)
            return destination
        except Exception:
            part.unlink(missing_ok=True)
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def file_record(root, path, role, **extra):
    return {"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size,
            "sha256": digest(path), "role": role, **extra}


def archive_notices(archive, destination):
    """Copy license text only, without extracting paths or executing source."""
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zipped:
            items = [(name, lambda name=name: zipped.read(name)) for name in zipped.namelist()]
            for name, read in items:
                path = Path(name)
                if path.is_absolute() or ".." in path.parts:
                    continue
                if re.search(r"(?i)(^|/)(licen[cs]e[^/]*|copying[^/]*|notice[^/]*|authors[^/]*|copyright[^/]*)$", name):
                    target = destination / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(read())
    else:
        with tarfile.open(archive) as tar:
            for member in tar:
                path = Path(member.name)
                if not member.isfile() or member.size > 4 * 1024 * 1024 or path.is_absolute() or ".." in path.parts:
                    continue
                if re.search(r"(?i)(^|/)(licen[cs]e[^/]*|copying[^/]*|notice[^/]*|authors[^/]*|copyright[^/]*)$", member.name):
                    target = destination / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(tar.extractfile(member).read())


def wheel_matches_installed(distribution, wheel):
    """Check wheel payload against installed files (generated metadata excluded)."""
    mismatches, checked = [], 0
    with zipfile.ZipFile(wheel) as zipped:
        for item in zipped.infolist():
            if item.is_dir() or ".dist-info/" in item.filename or ".data/" in item.filename:
                continue
            installed = Path(distribution.locate_file(item.filename))
            if not installed.is_file():
                mismatches.append(item.filename)
                continue
            expected = hashlib.sha256(zipped.read(item)).hexdigest()
            if digest(installed) != expected:
                mismatches.append(item.filename)
            checked += 1
    return {"checked_files": checked, "matches": not mismatches, "mismatches": mismatches}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--official-python-dir", type=Path,
                        help="Optional verified Python.org 3.13.16/NuGet/Tcl-Tk inputs; no system install")
    args = parser.parse_args()
    if os.name != "nt" or sys.version_info < (3, 11):
        parser.error("Use the native Windows Python 3.11+ build venv.")
    project = Path(__file__).resolve().parent.parent
    root = (args.output or project / ".mediaslimx" / "distribution" / "python-runtime").resolve()
    root.mkdir(parents=True, exist_ok=True)
    from packaging.tags import sys_tags
    from packaging.utils import parse_wheel_filename
    tag_rank = {tag: index for index, tag in enumerate(sys_tags())}
    notices = root / "notices"
    packages, files, blockers = [], [], []
    for dist in sorted(metadata.distributions(), key=lambda value: value.metadata["Name"].lower()):
        name, version = dist.metadata["Name"], dist.version
        if name.lower() in BUILD_ONLY:
            continue
        print(f"Collecting {name}=={version}", flush=True)
        component = {"name": name, "version": version,
                     "role": "bootloader/runtime" if name.lower() == "pyinstaller" else "installed-runtime-dependency",
                     "license_expression": dist.metadata.get("License-Expression"),
                     "project_urls": dist.metadata.get_all("Project-URL", []), "artifacts": []}
        component_notices = notices / name
        component_notices.mkdir(parents=True, exist_ok=True)
        (component_notices / "METADATA").write_text(dist.read_text("METADATA") or "", encoding="utf-8")
        for item in dist.files or ():
            item_text = str(item).replace("\\", "/")
            if ".dist-info/" not in item_text:
                continue
            relative = item_text.split(".dist-info/", 1)[1]
            if relative.startswith("licenses/") or re.search(r"(?i)(license|copying|notice)", relative):
                source = Path(dist.locate_file(item))
                if source.is_file():
                    target = component_notices / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
        try:
            metadata_path = fetch(f"https://pypi.org/pypi/{name}/{version}/json", root / "upstream-metadata" / f"{name}-{version}.json")
            release = json.loads(metadata_path.read_text(encoding="utf-8"))
            candidates = []
            for artifact in release["urls"]:
                if artifact["packagetype"] != "bdist_wheel":
                    continue
                _, _, _, tags = parse_wheel_filename(artifact["filename"])
                ranks = [tag_rank[tag] for tag in tags if tag in tag_rank]
                if ranks:
                    candidates.append((min(ranks), artifact))
            selected = ([min(candidates, key=lambda item: item[0])[1]] if candidates else [])
            selected += [item for item in release["urls"] if item["packagetype"] == "sdist"]
            if not candidates or not any(item["packagetype"] == "sdist" for item in selected):
                blockers.append(f"{name}=={version}: missing matching wheel or source distribution")
            for artifact in selected:
                role = "wheel" if artifact["packagetype"] == "bdist_wheel" else "source"
                path = fetch(artifact["url"], root / ("wheels" if role == "wheel" else "sources") / artifact["filename"], artifact["digests"]["sha256"])
                record = file_record(root, path, role, url=artifact["url"], hash_authority="official-pypi-release-json")
                if role == "wheel":
                    record["installed_payload"] = wheel_matches_installed(dist, path)
                    if not record["installed_payload"]["matches"]:
                        blockers.append(f"{name}=={version}: installed files differ from official wheel")
                component["artifacts"].append(record)
                archive_notices(path, component_notices / "upstream")
        except Exception as error:
            blockers.append(f"{name}=={version}: {type(error).__name__}: {error}")
        packages.append(component)
    import tkinter
    from PIL import features
    import pikepdf
    from lxml import etree
    runtime = {"python": sys.version.split()[0], "openssl": ssl.OPENSSL_VERSION,
               "sqlite": sqlite3.sqlite_version, "tcl": tkinter.Tcl().eval("info patchlevel"),
               "qpdf": pikepdf.__libqpdf_version__, "lxml_libxml": list(etree.LIBXML_VERSION),
               "lxml_libxslt": list(etree.LIBXSLT_VERSION),
               "pillow_features": {key: features.version(key) for key in features.get_supported()}}
    official_python_verified = False
    provider_records = []
    if args.official_python_dir:
        if runtime["python"] != "3.13.16" or runtime["tcl"] != "8.6.15":
            raise ValueError("Official Python input recipe is pinned to Python 3.13.16 and Tcl/Tk 8.6.15")
        provider = args.official_python_dir.resolve()
        archive_names = ("python-3.13.16-embed-amd64.zip",
                         "python-3.13.16-embed-amd64.zip.spdx.json",
                         "python.3.13.16.nupkg", "python-3.13.16-tcltk.msi")
        archives = {name: provider / name for name in archive_names}
        if any(not path.is_file() for path in archives.values()):
            raise ValueError("Missing official Python provider archive or SPDX file")
        embed, sbom, nuget, tcltk_msi = (archives[name] for name in archive_names)
        if digest(embed) != "97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297":
            raise ValueError("Python.org 3.13.16 embeddable ZIP does not match published SHA-256")
        if digest(nuget) != "95fad176338f1d6a799e45946488063f4aa61764e6cff2f132ddeffbf7a04c34":
            raise ValueError("Isolated CPython NuGet archive changed")
        if digest(tcltk_msi) != "968fc0acb37c42439ae4cf96181ee2e8148a89a22707414d980f7a2a84c2e67b":
            raise ValueError("Python.org Tcl/Tk MSI changed")
        bill = json.loads(sbom.read_text(encoding="utf-8"))
        bill_packages = {item["name"]: item for item in bill["packages"]}
        published = bill_packages["CPython"]["checksums"]
        if (bill_packages["CPython"]["versionInfo"] != "3.13.16"
                or not any(item["algorithm"] == "SHA256" and item["checksumValue"] == digest(embed)
                           for item in published)
                or bill_packages["libffi"]["versionInfo"] != "3.4.4"
                or bill_packages["libffi"]["downloadLocation"] !=
                "https://github.com/python/cpython-source-deps/archive/refs/tags/libffi-3.4.4.tar.gz"):
            raise ValueError("Official Python SPDX does not identify the expected CPython/libffi sources")
        interpreter_root = Path(sys.base_prefix).resolve()
        with zipfile.ZipFile(embed) as official, zipfile.ZipFile(nuget) as supplied:
            for relative in ("python.exe", "python313.dll", "LICENSE.txt", "DLLs/libffi-8.dll"):
                # The embed ZIP is flat; NuGet and the build layout use DLLs/.
                original = official.read(Path(relative).name)
                if supplied.read("tools/" + relative) != original or (interpreter_root / relative).read_bytes() != original:
                    raise ValueError(f"Python provider/runtime bytes differ: {relative}")
        if digest(interpreter_root / "DLLs" / "libffi-8.dll") != "eff52743773eb550fcc6ce3efc37c85724502233b6b002a35496d828bd7b280a":
            raise ValueError("Official CPython libffi binary mismatch")
        admin = provider / "tcltk-admin-3.13.16"
        for relative in ("DLLs/_tkinter.pyd", "DLLs/tcl86t.dll", "DLLs/tk86t.dll",
                         "DLLs/zlib1.dll", "tcl/tcl8.6/init.tcl", "Lib/tkinter/__init__.py"):
            if digest(interpreter_root / relative) != digest(admin / relative):
                raise ValueError(f"Tcl/Tk runtime differs from official MSI administrative image: {relative}")
        output_provider = root / "python-provider"
        output_provider.mkdir(exist_ok=True)
        for name, source in archives.items():
            target = output_provider / name
            shutil.copy2(source, target)
            provider_records.append(file_record(root, target, "python-provider-audit"))
        official_python_verified = True
    binary_provenance = []
    import pefile
    interpreter_root = Path(sys.base_prefix).resolve()
    for binary in sorted(list(interpreter_root.glob("*.dll")) + list((interpreter_root / "DLLs").glob("*.dll"))):
        versions = []
        pe = pefile.PE(str(binary), fast_load=False)
        for group in getattr(pe, "FileInfo", []):
            for entry in group:
                if entry.Key == b"StringFileInfo":
                    for table in entry.StringTable:
                        versions.append({key.decode(errors="replace"): value.decode(errors="replace") for key, value in table.entries.items()})
        pe.close()
        binary_provenance.append({"path": "CPython/" + binary.relative_to(interpreter_root).as_posix(),
                                  "bytes": binary.stat().st_size, "sha256": digest(binary), "pe_version_information": versions})
    provenance_path = root / "runtime-binaries.json"
    provenance_path.write_text(json.dumps({"version": 1, "files": binary_provenance,
                                           "note": "Measured identities, not an upstream provenance certification"}, ensure_ascii=False, indent=2), encoding="utf-8")
    files.append(file_record(root, provenance_path, "binary-provenance"))
    python_license = Path(sys.base_prefix) / "LICENSE.txt"
    if python_license.is_file():
        (notices / "Python").mkdir(exist_ok=True)
        shutil.copy2(python_license, notices / "Python" / "LICENSE.txt")
    python_version = runtime["python"]
    # Preserve exact corresponding source for interpreter/stdlib and MPL pikepdf.
    # Sources for permissive linked libraries are useful evidence, but versions
    # without authoritative provenance must never be guessed from a latest URL.
    openssl_version = ssl.OPENSSL_VERSION.split()[1]
    sqlite_source_tag = f"sqlite-{sqlite3.sqlite_version}.0"
    upstream = [
        ("CPython", f"https://www.python.org/ftp/python/{python_version}/Python-{python_version}.tgz"),
        ("qpdf", f"https://github.com/qpdf/qpdf/releases/download/v{runtime['qpdf']}/qpdf-{runtime['qpdf']}.tar.gz"),
        ("Tcl", f"https://prdownloads.sourceforge.net/tcl/tcl{runtime['tcl']}-src.tar.gz"),
        ("Tk", f"https://prdownloads.sourceforge.net/tcl/tk{runtime['tcl']}-src.tar.gz"),
        ("OpenSSL-CPython", f"https://github.com/openssl/openssl/releases/download/openssl-{openssl_version}/openssl-{openssl_version}.tar.gz"),
        ("SQLite-CPython", f"https://github.com/python/cpython-source-deps/archive/refs/tags/{sqlite_source_tag}.tar.gz"),
        ("lxml-wheel-recipe", "https://github.com/lxml/lxml/archive/refs/tags/lxml-6.1.3-1.tar.gz"),
        # This was the latest Windows-library release when lxml 6.1.3 was
        # published. The release recipe selects the latest library release at
        # build time, but this alone does NOT prove the PyPI wheel used it.
        ("lxml-Windows-build", "https://github.com/lxml/libxml2-win-binaries/archive/refs/tags/2026.05.17.tar.gz"),
        # Exact gitlinks in the official lxml Windows build tag 2026.05.17.
        # The fork includes the actual MSVC projects and source, unlike a
        # similarly numbered plain GNU tarball.
        ("lxml-winlibs-libiconv", "https://github.com/winlibs/libiconv/archive/880a1fa8b5581e37e136a7b051947d3ea39097b6.tar.gz"),
        ("lxml-winlibs-libxml2", "https://github.com/winlibs/libxml2/archive/bb84678855e3407fc88180295c992f9c984e28e0.tar.gz"),
        ("lxml-winlibs-libxslt", "https://github.com/winlibs/libxslt/archive/c0076eaa6e0d1f99e01107e8db225a308eb1e543.tar.gz"),
        ("lxml-winlibs-zlib", "https://github.com/winlibs/zlib/archive/0089522e62e6b5d4950e62bd20f0cb06a9288413.tar.gz"),
        ("libxml2", "https://download.gnome.org/sources/libxml2/2.11/libxml2-2.11.9.tar.xz"),
        ("libxslt", "https://download.gnome.org/sources/libxslt/1.1/libxslt-1.1.45.tar.xz"),
        ("zlib-lxml-audit", "https://zlib.net/fossils/zlib-1.3.2.tar.gz"),
    ]
    if official_python_verified:
        upstream.append(("libffi-CPython", "https://github.com/python/cpython-source-deps/archive/refs/tags/libffi-3.4.4.tar.gz"))
    other_sources = []
    for name, url in upstream:
        try:
            filename = url.rsplit("/", 1)[1]
            if name == "lxml-Windows-build":
                filename = "lxml-libxml2-win-binaries-2026.05.17.tar.gz"
            elif name.startswith("lxml-winlibs-"):
                filename = name + "-" + filename
            path = fetch(url, root / "sources" / filename)
            if name == "libffi-CPython" and digest(path) != "9d802681adfea27d84cae0487a785fb9caa925bdad44c401b364c59ab2b8edda":
                raise ValueError("libffi source does not match official Python SPDX SHA-256")
            archive_notices(path, notices / name / "source-notices")
            other_sources.append(file_record(root, path, "source", component=name, url=url,
                                             hash_authority="locally-measured-from-official-https-source"))
        except Exception as error:
            blockers.append(f"{name} source/audit material: {type(error).__name__}: {error}")
    # Keep the four prebuilt static libraries and headers separate from their
    # source trees. They are plausible 6.1.3 Windows inputs, not proof that
    # the particular PyPI wheel was linked against them.
    for filename in ("iconv-1.17.1.win64.zip", "libxml2-2.11.9.win64.zip",
                     "libxslt-1.1.45.win64.zip", "zlib-1.3.2.win64.zip"):
        url = ("https://github.com/lxml/libxml2-win-binaries/releases/download/"
               "2026.05.17/" + filename)
        try:
            path = fetch(url, root / "prebuilt-lxml-win64" / filename)
            other_sources.append(file_record(root, path, "upstream-prebuilt-audit",
                                             component="lxml-Windows-build", url=url,
                                             hash_authority="locally-measured-from-official-https-source"))
        except Exception as error:
            blockers.append(f"lxml prebuilt {filename}: {type(error).__name__}: {error}")
    for name, url in (
        ("Microsoft-VC-runtime-terms.html", "https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/"),
        ("Microsoft-VC-redistribution.html", "https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170"),
    ):
        try:
            path = fetch(url, notices / "Microsoft" / name)
            other_sources.append(file_record(root, path, "upstream-license-reference", url=url,
                                             hash_authority="locally-measured-from-official-https-source"))
        except Exception as error:
            blockers.append(f"Microsoft terms/reference: {type(error).__name__}: {error}")
    # These cannot be cleared by downloading an arbitrary similarly named tar.
    blockers.append("Confirm exact lxml wheel provenance against the pinned Windows build tag and assess its LGPL rebuild/relink material completeness")
    if not official_python_verified:
        blockers.append("CPython supplier license includes Microsoft/Tcl/Tk terms and OpenSSL source notices are retained; libffi DLL exact provenance/applicable notice remains independently unconfirmed")
    credits = ("MediaSlim X third-party materials / 第三方材料\n\n"
               "MediaSlimX source is MIT licensed. Dependencies retain their own licenses.\n"
               "Python is redistributed unmodified except freezing/selection of runtime modules.\n"
               "This software is based in part on the work of the Independent JPEG Group.\n"
               "This software is based in part on the work of the FreeType Team.\n"
               "Portions of this software are copyright The FreeType Project (https://freetype.org).\n"
               "pikepdf is MPL-2.0; its exact source distribution is included in the companion source materials.\n"
               "The source archive must accompany a future binary release; no hosting URL is invented here.\n"
               "No files have been uploaded or published by this collector.\n")
    (root / "THIRD-PARTY-NOTICES.txt").write_text(credits, encoding="utf-8")
    for path in sorted(notices.rglob("*")):
        if path.is_file():
            files.append(file_record(root, path, "license-or-notice"))
    files.append(file_record(root, root / "THIRD-PARTY-NOTICES.txt", "notice-index"))
    for component in packages:
        files.extend(component["artifacts"])
    files.extend(other_sources)
    files.extend(provider_records)
    files = list({item["path"]: item for item in files}.values())
    document = {"version": 1, "status": "materials-collected-review-pending" if blockers else "materials-verified",
                "platform": "windows-x64", "runtime": runtime, "components": packages,
                "files": files, "release_blockers": blockers,
                "scope": "Pinned artifacts and notices; no independent legal certification, no clean-OS claim"}
    (root / "manifest.json").write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(root), "components": len(packages), "files": len(files), "blockers": blockers}, ensure_ascii=False))


if __name__ == "__main__":
    main()
