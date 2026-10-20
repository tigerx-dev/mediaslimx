#!/usr/bin/env bash
# Build the deliberately narrow Windows x64 MP4 engine from supplied sources.
# Run on Linux/WSL. Nothing is installed globally and nothing is downloaded.
set -euo pipefail

if [ "$#" -lt 4 ] || [ "$#" -gt 5 ]; then
  echo "Usage: bash build-media-engine.sh FFMPEG_TAR_XZ X264_TAR_XZ LLVM_MINGW_ROOT OUTPUT_ROOT [NASM_BIN]" >&2
  exit 2
fi
ffmpeg_archive=$(realpath "$1")
x264_archive=$(realpath "$2")
recipe_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
python3 - "$recipe_directory/media-engine-sources.json" "$ffmpeg_archive" "$x264_archive" <<'PY'
import hashlib, json, pathlib, sys
pins = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
for component, filename in zip(("ffmpeg", "x264"), sys.argv[2:]):
    path = pathlib.Path(filename)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != pins[component]["sha256"]:
        raise SystemExit(f"Unexpected {component} source SHA-256: {digest}")
PY
toolchain=$(realpath "$3")
mkdir -p "$4"
output=$(realpath "$4")
nasm_bin=${5:-}
if [ -n "$nasm_bin" ]; then
  nasm_bin=$(realpath "$nasm_bin")
  export PATH="$nasm_bin:$PATH"
fi
export PATH="$toolchain/bin:$PATH"
export LC_ALL=C
cross=x86_64-w64-mingw32
export CC="$cross-clang"
export AR="$cross-ar"
export RANLIB="$cross-ranlib"
export STRIP="$cross-strip"
for command in "$CC" "$AR" "$STRIP" nasm pkg-config make tar; do
  command -v "$command" >/dev/null || { echo "Missing build tool: $command" >&2; exit 2; }
done
for directory in "$output/work" "$output/prefix" "$output/bin" "$output/build"; do
  if [ -e "$directory" ]; then
    echo "Output exists; choose a fresh output directory: $directory" >&2
    exit 2
  fi
done
mkdir -p "$output/work/ffmpeg" "$output/work/x264" "$output/prefix" "$output/bin" "$output/build"
tar -xJf "$ffmpeg_archive" --strip-components=1 -C "$output/work/ffmpeg"
tar -xJf "$x264_archive" --strip-components=1 -C "$output/work/x264"
jobs=${MSX_BUILD_JOBS:-8}
{
  "$CC" --version
  nasm -v
  make --version | head -n 1
  pkg-config --version
} > "$output/build/tool-versions.txt"

# x264's native Windows threads avoid a separately distributed pthread DLL.
cd "$output/work/x264"
./configure --host="$cross" --cross-prefix="$cross-" --prefix="$output/prefix" \
  --enable-static --disable-cli --disable-opencl --disable-avs \
  --bit-depth=8 --chroma-format=420 --extra-cflags=-Os \
  2>&1 | tee "$output/build/x264-configure.log"
make -j "$jobs" 2>&1 | tee "$output/build/x264-build.log"
make install 2>&1 | tee "$output/build/x264-install.log"
cp config.mak "$output/build/x264-config.mak"
cp config.h "$output/build/x264-config.h"
export PKG_CONFIG_LIBDIR="$output/prefix/lib/pkgconfig"

# No network, devices, hardware, image codecs, or unrelated containers/codecs.
# null + wrapped_avframe + pcm_s16le are required for full post-encode decoding.
cd "$output/work/ffmpeg"
./configure --target-os=mingw32 --arch=x86_64 --enable-cross-compile \
  --cross-prefix="$cross-" --cc="$CC" --cxx="$cross-clang++" \
  --ar="$AR" --ranlib="$RANLIB" --strip="$STRIP" --nm="$cross-nm" \
  --pkg-config=pkg-config --pkg-config-flags=--static --prefix=/opt/mediaslimx-media-engine \
  --disable-autodetect --disable-everything --disable-shared --enable-static \
  --disable-network --disable-doc --disable-debug --disable-avdevice \
  --disable-programs --enable-ffmpeg --enable-ffprobe --enable-small \
  --enable-gpl --enable-libx264 --enable-protocol=file,pipe \
  --enable-demuxer=mov --enable-muxer=mp4,null \
  --enable-parser=h264,aac --enable-decoder=h264,aac \
  --enable-encoder=libx264,wrapped_avframe,pcm_s16le \
  --enable-filter=scale,null,format,anull,aresample \
  --enable-bsf=h264_mp4toannexb,aac_adtstoasc,extract_extradata \
  --extra-cflags=-Os --extra-ldflags=-static \
  2>&1 | tee "$output/build/ffmpeg-configure.log"
make -j "$jobs" ffmpeg.exe ffprobe.exe 2>&1 | tee "$output/build/ffmpeg-build.log"
cp ffmpeg.exe ffprobe.exe "$output/bin/"
"$STRIP" "$output/bin/ffmpeg.exe" "$output/bin/ffprobe.exe"
cp config.h config_components.h ffbuild/config.mak "$output/build/"
cp ffbuild/config.log "$output/build/ffmpeg-config.log"
printf '\nBuilt video engine (Windows execution/fixture verification still required):\n'
ls -l "$output/bin/ffmpeg.exe" "$output/bin/ffprobe.exe"
