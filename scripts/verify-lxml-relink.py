"""Manual Windows CI check of LGPL iconv source replacement and lxml relinking.

All inputs are public, pinned by SHA-256, and unpacked in the runner's temporary
directory. This produces no distributable asset and does not certify licensing.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import Request, urlopen
import zipfile


INPUTS = {
    "lxml-6.1.3.tar.gz": (
        "https://files.pythonhosted.org/packages/23/ad/28ecd7cb894d172f3c9c80a075eeeb2017ac62e3632cee05a5f9493547eb/lxml-6.1.3.tar.gz",
        "45222d94ddd511536f3b2f7d9deae3b2339b4ce0f075f1ca25703b07cad9dd21",
    ),
    "libiconv-source.tar.gz": (
        "https://github.com/winlibs/libiconv/archive/880a1fa8b5581e37e136a7b051947d3ea39097b6.tar.gz",
        "89dd45d7f074ddae04dcd25cc4ceace3432c04b72dc36a6508854aac713f3eb6",
    ),
    "iconv-1.17.1.win64.zip": (
        "https://github.com/lxml/libxml2-win-binaries/releases/download/2026.05.17/iconv-1.17.1.win64.zip",
        "090225898fc0b37fe1f0d3ecc3938c926de77cd7f8c3636a5c9712b61e7af849",
    ),
    "libxml2-2.11.9.win64.zip": (
        "https://github.com/lxml/libxml2-win-binaries/releases/download/2026.05.17/libxml2-2.11.9.win64.zip",
        "ff23c75d4b3991042f9bbe7fd38ccc50616349a3c1b583c328d996be22e52b64",
    ),
    "libxslt-1.1.45.win64.zip": (
        "https://github.com/lxml/libxml2-win-binaries/releases/download/2026.05.17/libxslt-1.1.45.win64.zip",
        "e6fcfa1cf6719630e83c39a5448687db65084b0a375af366c9a857b62c3e4bf7",
    ),
    "zlib-1.3.2.win64.zip": (
        "https://github.com/lxml/libxml2-win-binaries/releases/download/2026.05.17/zlib-1.3.2.win64.zip",
        "e1c1bcaa1dea202057f96614565c5773ee9c9be7033b470f2b746ab8a9070f01",
    ),
}


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fetch(root: Path, name: str) -> Path:
    url, expected = INPUTS[name]
    path = root / name
    with urlopen(Request(url, headers={"User-Agent": "MediaSlimX-distribution-audit"}), timeout=90) as source:
        with path.open("wb") as output:
            shutil.copyfileobj(source, output)
    actual = sha256(path)
    if actual != expected:
        raise ValueError(f"{name}: upstream SHA-256 changed ({actual})")
    print(f"verified {name}: {actual}", flush=True)
    return path


def extract_tar(path: Path, destination: Path) -> Path:
    destination.mkdir()
    with tarfile.open(path) as archive:
        archive.extractall(destination, filter="data")
    roots = list(destination.iterdir())
    if len(roots) != 1 or not roots[0].is_dir():
        raise ValueError(f"{path.name}: unexpected source layout")
    return roots[0]


def extract_zip(path: Path, destination: Path) -> Path:
    with zipfile.ZipFile(path) as archive:
        for member in archive.namelist():
            parts = Path(member.replace("\\", "/")).parts
            if not parts or ".." in parts or ":" in member or member.startswith(("/", "\\")):
                raise ValueError(f"{path.name}: unsafe archive member")
        archive.extractall(destination)
    name = path.name.removesuffix(".zip")
    root = destination / name
    if not root.is_dir():
        raise ValueError(f"{path.name}: unexpected library layout")
    return root


def main() -> None:
    if sys.platform != "win32" or "GITHUB_ACTIONS" not in os.environ:
        raise SystemExit("Run manually on the repository's Windows GitHub Actions runner.")
    with tempfile.TemporaryDirectory(prefix="msx-lxml-relink-") as temporary:
        root = Path(temporary)
        downloads = root / "downloads"
        downloads.mkdir()
        paths = {name: fetch(downloads, name) for name in INPUTS}
        lxml = extract_tar(paths["lxml-6.1.3.tar.gz"], root / "lxml-source")
        iconv = extract_tar(paths["libiconv-source.tar.gz"], root / "iconv-source")
        libs = lxml / "libs"
        libs.mkdir()
        lib_dirs = [extract_zip(paths[name], libs) for name in INPUTS if name.endswith(".win64.zip")]

        # Rebuild the LGPL library from the exact fork source linked in the
        # upstream 2026.05.17 recipe. The SDK is runner-provided, not shipped.
        kits = Path(os.environ["ProgramFiles(x86)"]) / "Windows Kits" / "10" / "Lib"
        versions = sorted(kits.glob("10.0.*"), key=lambda p: tuple(map(int, p.name.split("."))))
        if not versions:
            raise RuntimeError("Windows SDK missing on CI runner")
        msbuild = shutil.which("msbuild.exe")
        if not msbuild:
            visual_studio = Path(os.environ["ProgramFiles"]) / "Microsoft Visual Studio"
            matches = sorted(visual_studio.glob("2022/*/MSBuild/Current/Bin/MSBuild.exe"))
            if not matches:
                raise RuntimeError("Visual Studio MSBuild missing on CI runner")
            msbuild = str(matches[-1])
        project = iconv / "MSVC17" / "libiconv_static" / "libiconv_static.vcxproj"
        subprocess.run([msbuild, str(project), "/m", "/v:minimal",
                        "/p:Configuration=Release", "/p:Platform=x64",
                        f"/p:WindowsTargetPlatformVersion={versions[-1].name}"], check=True)
        rebuilt = iconv / "MSVC17" / "x64" / "lib" / "libiconv_a.lib"
        if not rebuilt.is_file():
            raise FileNotFoundError(rebuilt)
        stock = libs / "iconv-1.17.1.win64" / "lib" / "iconv_a.lib"
        stock_hash = sha256(stock)
        rebuilt_hash = sha256(rebuilt)
        if stock_hash == rebuilt_hash:
            raise RuntimeError("Rebuilt iconv archive is identical; replacement was not established")
        shutil.copy2(rebuilt, stock)
        print(f"replaced iconv_a.lib: original={stock_hash} rebuilt={rebuilt_hash}", flush=True)

        env = os.environ.copy()
        env["INCLUDE"] = ";".join(str(directory / "include") for directory in lib_dirs)
        env["LIBRARY"] = ";".join(str(directory / "lib") for directory in lib_dirs)
        env["WITHOUT_CYTHON"] = "true"
        subprocess.run([sys.executable, "-m", "pip", "install", "setuptools==84.0.0", "wheel==0.45.1"], check=True)
        subprocess.run([sys.executable, "setup.py", "bdist_wheel", "--static"], cwd=lxml, env=env, check=True)
        wheels = list((lxml / "dist").glob("lxml-6.1.3-cp313-cp313-win_amd64.whl"))
        if len(wheels) != 1:
            raise RuntimeError("Expected one rebuilt Windows cp313 lxml wheel")
        subprocess.run([sys.executable, "-m", "pip", "install", "--no-deps", str(wheels[0])], check=True)
        subprocess.run([sys.executable, "-c", "from lxml import etree; assert etree.fromstring(b'<ok/>').tag == 'ok'; print('Rebuilt static iconv relink import: PASS')"], check=True)
        print(f"relinked wheel SHA-256: {sha256(wheels[0])}", flush=True)


if __name__ == "__main__":
    main()
