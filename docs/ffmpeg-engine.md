# Windows 视频引擎 / Windows media engine

MediaSlim X 的 Windows 便携包使用本项目从固定上游源码构建的精简 FFmpeg/ffprobe。图片仍由 Pillow 处理，PDF 仍由 pikepdf 处理；视频支持范围没有扩大。首次启动不下载 Python、pip 包或视频组件。

The Windows portable bundle uses a deliberately narrow FFmpeg/ffprobe build from pinned upstream sources. Pillow handles images and pikepdf handles PDF. Supported media formats are unchanged; startup does not download Python, pip packages, or video components.

## 体积实测 / Measured size

2026-10-17，同一套 Windows x64 原型与精简引擎的对比：

| 组件 / Component | 原全量引擎 / Previous full build | 本项目精简引擎 / Narrow build |
| --- | ---: | ---: |
| ffmpeg.exe | 222,248,960 bytes | 4,513,792 bytes |
| ffprobe.exe | 222,044,160 bytes | 4,338,688 bytes |
| 两者合计 / Combined | 423.71 MiB | 8.44 MiB |
| ZIP 内组件压缩体积 / Component DEFLATE size | 164.96 MiB | 约 / approximately 3.42 MiB |

旧便携 ZIP 为 206,531,521 bytes（196.96 MiB），其中 83.8% 来自两个全量视频程序。新便携包的完整体积以实际构建清单为准；这里仅记录引擎组件，不把估算当作整包结果。改用 ZIP 最高压缩等级对精简引擎仅再减少约 8 KiB，因此主要收益来自裁剪无关功能。

The previous 196.96 MiB ZIP spent 83.8% of its compressed payload on the two full video programs. The release build manifest records the complete new bundle size; the figures above describe engine components only.

## 能力与边界 / Capabilities and boundaries

- MP4/MOV 解析、MP4 写入、H.264 8 位解码与 libx264 8 位 4:2:0 编码、AAC 解码与音轨原样复制。
- 保留 `scale`、像素格式协商及必要音频过滤器；保留 `null` 输出及对应编码器，供输出后完整解码验证。
- 文件与管道协议；禁用网络协议、设备、硬件加速和非本工具所需的格式与编解码器。
- 不包含 `lavfi`/`testsrc2`/`sine` 测试素材生成器。测试素材由隔离的外部生成器创建；该生成器不进入分发包。

The build retains MP4 parsing/writing, H.264 decode and libx264 encoding, AAC decoding/copying, resizing and full post-encode decoding. Network protocols and unrelated media engines are disabled. Runtime format validation remains in `mediaslimx/media.py`; having a demuxer does not imply support for every file it can parse.

## 固定来源与重建 / Pinned sources and rebuilding

完整版本、URL 与 SHA-256 集中记录在 [media-engine-sources.json](../scripts/media-engine-sources.json)：

- FFmpeg 9.0.2 官方源码归档；官方发布签名已实际验证，公钥指纹 `FCF986EA15E6E293A5644F10B4322F04D67658D8`。
- x264 提交 `b35605ace3ddf7c1a5d67a2eb553f034aef41d55`，从 VideoLAN 官方 Git 仓库取得，通过 `git archive` 保存完整提交源码；无源码补丁。
- LLVM-MinGW `20260908`，LLVM `23.1.1`，UCRT x64 交叉工具链；NASM `2.15.05-1`。
- 工具链实际使用的 MinGW-w64 提交 `9f55f4a2d3b9783dab76d9808be3d6279b99ec2a`；源码和运行库许可随材料保留。

在 Linux/WSL 准备 Bash、Python 3、GNU make、pkg-config、tar/xz、NASM 和上述 LLVM-MinGW 后执行。构建脚本不联网、不安装全局组件，要求新建的输出目录：

```bash
bash scripts/build-media-engine.sh \
  PATH_TO/ffmpeg-9.0.2.tar.xz \
  PATH_TO/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.xz \
  PATH_TO/llvm-mingw-20260908-ucrt-ubuntu-22.04-x86_64 \
  FRESH_OUTPUT_DIRECTORY \
  PATH_TO_NASM_BIN
```

源码归档会校验固定 SHA-256。建议把临时编译区放在 Linux 文件系统，最终材料保存在项目忽略目录；这能减少 Windows 挂载盘的编译探测开销。配置中的安装前缀固定为 `/opt/mediaslimx-media-engine`，分发日志使用占位符替换实际构建路径。重建配方记录来源和参数，不承诺不同主机逐字节产生相同 PE 文件。

The build verifies source archive SHA-256 values and records configuration and tool versions. It installs nothing globally. Build logs normalize private paths. The recipe documents a reproducible process, not a promise of bit-identical executables across different hosts.

## 验证范围 / Verification scope

原生 Windows 已使用只有新引擎与 System32 的 PATH 完成 14 项检查：AAC 与无音轨分别覆盖三种预设和保尺寸/缩放；实际执行项目的 `inspect`、`optimize`、`validate_result`，包括完整解码；逐包比对 AAC SHA-256 与长度、时长；拒绝损坏 MP4；确认没有 HTTP/HTTPS/TCP 协议。

PE 导入表仅含 Windows 系统/UCRT DLL（KERNEL32、SHELL32、bcrypt 及 `api-ms-win-crt-*`），无 LLVM、MSYS、MinGW 或 pthread DLL。验证脚本为 [build-media-engine-verify.py](../scripts/build-media-engine-verify.py)，实际引擎哈希与结果随 `verification.json` 保存。

These are native Windows engine checks with an isolated PATH. They are not a clean Windows virtual-machine acceptance, SmartScreen result, or a phone test. Complete portable-app acceptance is tracked separately in [packaging.md](packaging.md).

## 分发材料 / Distribution materials

`build-media-engine-materials.py` 汇集以下内容，并为每个文件记录相对路径、大小及 SHA-256：

- `bin/`：经验证的 Windows 引擎；其哈希必须与 Windows 测试记录匹配。
- `sources/`：确切 FFmpeg、x264 源码归档、FFmpeg 签名与公钥，以及 MinGW-w64 上游源码。
- `build/`：实际配方、配置、归一化日志、工具链来源、空的无补丁记录、DLL 导入清单。
- `notices/`：FFmpeg、x264、LLVM 和 MinGW-w64 的原始许可与版权材料。
- `verification.json`、`manifest.json`：实际 Windows 结果及材料清单。

本引擎启用了 GPL 与 libx264，按 **GPL-2.0-or-later** 保存相应许可和源码材料，不能只标为 LGPL。分发时将对应源码材料包与二进制下载一起提供；单独附一份许可证、上游主页或泛化的“FFmpeg 源码链接”不能替代确切对应源码。本轮只在本机准备这些材料，未上传发布。

This FFmpeg + x264 engine is a GPL-enabled build, not an LGPL-only build. Ship its corresponding-source materials alongside binary downloads and retain notices. The source materials are separate from the runtime ZIP, so users do not need development tools to run the app. See the upstream [FFmpeg licensing information](https://ffmpeg.org/legal.html) and the actual license files in the materials bundle.
