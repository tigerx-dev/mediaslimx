# Windows 分发材料 / Windows distribution materials

便携程序与构建材料分开保存。运行 ZIP 只包含程序、必要依赖、许可证和材料索引；对应源代码、上游 wheel、源码快照和构建配方放在单独 companion ZIP，避免增加日常下载体积。本地准备不等于上传或发布；材料收集、许可核实与干净 Windows 验收分别记录。

The runtime ZIP contains the application, required dependencies, notices and a source index. The matching companion ZIP contains sources, upstream wheels and build recipes. Local preparation does not publish anything. Material collection, license review and clean-Windows acceptance are separate states.

## 可复现收集

使用项目内 Windows 构建虚拟环境，不能用 WSL Python 替代。当前官方 Python 3.13 候选使用隔离环境，并传入已核对的官方供应商材料目录：

```powershell
.mediaslimx\packaging\build-venv-official-313\Scripts\python.exe -X utf8 scripts\collect-distribution-materials.py --official-python-dir .mediaslimx\distribution --output .mediaslimx\distribution\python-runtime-official-313-r1
```

脚本只向官方 PyPI 与明确的上游来源下载构建材料，写入忽略的分发审计目录。实际官方 3.13 候选材料清单在 `.mediaslimx/distribution/python-runtime-official-313-r1/manifest.json`。不会安装到用户系统、扫描媒体、上传或在程序运行时下载组件。

每个 Python 组件记录准确版本、适配 Windows 解释器的 wheel、sdist、官方 PyPI SHA-256，以及 wheel 有效负载与实际安装文件的逐文件核对结果。保留完整许可证目录，包括 pikepdf wheel 的第三方库说明。源码归档只读取许可证文件，不执行 setup.py，也不按不可信归档路径直接解压。

Python itself and its native libraries are not represented by pip metadata. Their measured versions, available source archives and outstanding provenance questions are recorded separately. A locally measured hash confirms the saved bytes; it is not an independent signature verification.

## 当前核对范围

| 部分 | 本轮记录 |
|---|---|
| Python / PyInstaller | 当前新候选采用官方 CPython 3.13.16；旧 r10 是来源不同的 3.12.14。PyInstaller 6.16.0 的许可证、bootloader 源分发及准确 wheel 均收集 |
| 图片 | Pillow 12.3.0 的 wheel、源分发和完整合并许可证，包含 JPEG/WebP/AVIF/TIFF/FreeType 等所带库的说明；包含某编码库不代表界面支持该媒体格式 |
| PDF | pikepdf 10.17.0（MPL-2.0）、qpdf 12.4.2；保存 pikepdf 精确 sdists、qpdf 源归档与 wheel 自带第三方库许可映射 |
| XML | lxml 6.1.3；实际 libxml2 2.11.9、libxslt 1.1.45。准确 wheel 已对应上游构建记录；公开 Windows CI 已用固定源码重建 iconv、替换静态库并重新构建、导入 lxml。最终材料包与候选包仍待重生成和核对 |
| Python 外部库 | 新候选实测 OpenSSL 3.5.9、SQLite 3.50.4、Tcl/Tk 8.6.15、libffi 3.4.4；保存相应源归档、源许可证及官方供应商材料。旧 r10 数值另见历史候选清单 |
| Web/Python 组件 | FastAPI、Starlette、Uvicorn、Pydantic/pydantic-core、AnyIO、Click 等逐项版本和完整许可证；PyInstaller 实际引入 setuptools 84.0.0 及其 vendored 代码，也保留相应许可，准确清单以生成的 manifest 为准 |
| 视频 | 使用本项目精简 FFmpeg/x264 材料目录；详见 [FFmpeg 引擎](ffmpeg-engine.md) |

Pillow 的完整合并许可证和额外声明随包提供，保留 Independent JPEG Group 与 FreeType 的署名。pikepdf wheel 的许可映射包含 qpdf、libjpeg-turbo、OpenSSL、zlib、微软运行库及其随包数据；保留映射不意味着这些组件都被 MediaSlimX 实际调用。

## 明确保留的待核实项

下面第 1 项仍适用于**已冻结的**新候选材料清单；技术性重链接试验已通过，但该旧清单和候选包尚未重生成。第 2 项仅说明旧 r10 的历史阻塞，新候选已由官方 Python 输入解除此项。

1. **lxml 静态 iconv 的材料封装。** Windows wheel 的许可证说明列出 iconv 为 LGPL 2.1；实测 libxml2 的头文件启用 iconv，`.pyd` 含相关符号。PyPI wheel SHA-256 `e477aca0bc0d19f3b4ae9e4f2a1cfd687c31bf772d78734910658186b40b2477` 已与 [上游 6.1.3-1 Release 的同名 wheel](https://github.com/lxml/lxml/releases/tag/lxml-6.1.3-1) 逐字节哈希匹配。[上游 Windows x64 Python 3.13 构建任务](https://github.com/lxml/lxml/actions/runs/33619264082/job/100212452171)确认使用 2026.05.17 的 libxml2 2.11.9、libxslt 1.1.45、zlib 1.3.2 和 iconv 1.17.1 静态库；[预取任务](https://github.com/lxml/lxml/actions/runs/33619264082/job/100212324598)给出准确下载 URL。已保存对应标签、库与源提交。进一步的[公开 Windows 重链接检查](https://github.com/tigerx-dev/mediaslimx/actions/runs/39452293147)成功从固定源码重建 `iconv_a.lib`，替换上游静态库，再从 lxml 6.1.3 源码构建 Windows cp313 wheel 并成功导入、解析 XML；该检查不产出发行附件。**旧候选材料清单与包仍含先前阻塞，须重生成并核对对应源码、步骤和通知后才能发行。**该技术验证不构成法律意见。
2. **构建解释器的 libffi 具体来源及适用通知。** 当前便携候选实际取自 Codex 本机缓存的 Python 3.12.14。其 `libffi-8.dll` 没有可用 PE 版本字段，SHA-256 为 `adf7d8e3413209755f75a7c69cec9e5eac84a1a6f1c8b60c22cd15e2f1732380`。[CPython 3.12.14 Windows 配方](https://github.com/python/cpython/blob/v3.12.14/PCbuild/get_externals.bat)指定 libffi 3.4.4，但官方 `cpython-bin-deps/libffi-3.4.4/amd64/libffi-8.dll` 的 SHA-256 实测为 `eff52743773eb550fcc6ce3efc37c85724502233b6b002a35496d828bd7b280a`，与候选不符，因此不能直接归为该官方二进制。保留候选 DLL 指纹和 CPython 文档中的 libffi 许可，仍需确认它的实际来源及适用通知。其余已收集部分：Python 原供应商 LICENSE 本身包含 Microsoft Distributable Code 条件与 Tcl/Tk 完整许可；微软运行库实测 14.44.35211.0，OpenSSL 3.5.8 原许可从其精确源归档保存。当前解释器的外部库版本与 CPython 默认配方不同，不能靠默认配方推定实际供应链。

The frozen material/build manifests still list the lxml `release_blocker`. A public Windows CI run has now rebuilt iconv, replaced the archive, rebuilt lxml and imported the result; regenerate and review the final materials and candidate rather than editing frozen manifests. The old r10 manifest retains its separate libffi blocker. Neither candidate is ready to publish. No claim of legal certification is made.

下一步将已通过的公开重链接配方与来源、许可证通知纳入最终材料包，重生成材料清单和候选包，并核对实际附件与源码提交一致。当前主机没有 Windows C++ 构建工具；上述试验是在 GitHub 托管 Windows 构建机运行，不能写成本机干净 Windows 验收。以上是发行证据门槛，不替代法律意见。

The exact PyPI wheel matches the upstream GitHub Release asset. A public Windows CI run verified rebuilding iconv from pinned source, replacing its static archive and rebuilding/importing lxml. The current host lacks Windows C++ build tools; the CI result is distinct from clean-Windows acceptance. Regenerate and review the final materials manifest and candidate; do not silently edit frozen manifests. This is an evidence gate, not legal advice.

## 官方 Python 3.13.16 窗口候选（已构建，本机验证中）

为避免将 Codex 缓存中的解释器来源问题带到正式包，已在 Git 忽略的审计目录单独下载 [Python.org 3.13.16 Windows x64 embeddable ZIP](https://www.python.org/downloads/release/python-31316/) 及同名 SPDX 清单。ZIP 的 SHA-256 实测为 `97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297`，与 Python.org 发布页和该 SPDX 中的值一致。ZIP 内 `libffi-8.dll` 的 SHA-256 为 `eff52743773eb550fcc6ce3efc37c85724502233b6b002a35496d828bd7b280a`，与 CPython 官方 `cpython-bin-deps/libffi-3.4.4/amd64` 文件相同；SPDX 指向 libffi 3.4.4 对应源。此比较只建立**官方替代输入**的来源，不反向证明旧候选 DLL。

另取 CPython 官方 NuGet `python 3.13.16` 作为可安装依赖的原始供应商包，其解释器、运行 DLL、许可证和 libffi 与 Python.org embeddable ZIP 逐字节匹配；从 Python.org 签名有效的 Tcl/Tk MSI 做管理映像提取，仅装配到忽略的候选目录。隔离 Windows 虚拟环境重装了锁定依赖，213 项 Windows 单元测试通过、2 项跳过，`pip check` 通过。材料脚本核对官方 ZIP/SPDX、NuGet 选定二进制、Tcl/Tk 管理映像、libffi 3.4.4 源与许可后，生成的新清单仅留 lxml 一项材料阻塞。

实际冻结的 `official-python313-r1` 窗口 ZIP 为 38,123,090 字节（36.36 MiB），SHA-256 `3433bb9ff6c9281bb748e87b19a194fe1a33efbadf004ddf743b0717443ab3f3`；配套材料 ZIP 为 307,721,642 字节，SHA-256 `73c8e1339af43c3ba311454fb5fb6758b582cb54567fc29f31836a416fc6d6a8`。实际解压 EXE 的 PDF worker 四组通过；独立 Windows WebView2 窗口用合成素材验证了导入上限、201 文件目录扫描与导出、JPG/PNG/WebP/MP4/PDF 结果、CSV、预览、原件指纹、两种语言/主题和本机目录选择器取消。空闲退出后私有窗口记录与临时工作区消失。证据在 `.mediaslimx/window-tests/window 中文 space d62b5f2d9b784b9e9b2bb28fb6aa595e/window-ui-report.json`。真实干净 Windows 验收仍待用户方便时手动重启之后进行；当前窗口不替换用户实例。

2026-10-20 从当前源码另建 `refresh-20261020-r2` 本机候选，运行 ZIP 为 38,160,897 字节，SHA-256 `6a188384632f2715b53746de03f92f27bd93f4981c27673ee09440c5eee080f2`；对应材料 ZIP SHA-256 `ce45d2db925725178bff41420b0845295fdc8915dc5642277309036240d871d3`。构建器仍记录 lxml 来源/重链接材料和真实干净 Windows 两项阻塞，状态为 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`。实际解压 EXE 的合成 PDF worker 四项、隔离 Windows WebView2 主流程 12 项通过，空闲退出后自有进程、端口和工作目录清理；报告在 `.mediaslimx/window-tests/window 中文 space 0743e7273bb448548b036187b8b4d4f0/window-ui-report.json`。源码材料快照已纳入 Windows 双击入口 `Start-MediaSlimX.vbs`，仍排除工作数据与私有媒体。

## 构建与状态门槛

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-windows.ps1 `
  -FFmpegMaterials ".mediaslimx\distribution\media-engine\release" `
  -PythonMaterials ".mediaslimx\distribution\python-runtime"
```

`requirements-windows-portable.txt` 固定本轮构建依赖版本。构建器验证材料清单的相对路径边界、大小与 SHA-256，确认 FFmpeg 二进制和解释器版本匹配；损坏、不完整的材料不会继续构建。许可来源待核实会保留到候选包的清单中。

构建先从明确白名单复制 MediaSlimX 源快照，再以该快照构建。因此 `project_source_tree_sha256` 绑定实际输入，未建立 Git 提交时不捏造 commit。白名单包含本工具 Python/static、构建脚本与配方、requirements、公开文档、品牌资产和测试代码，不打包 `.mediaslimx`、`.git` 或用户媒体。

- `local-prototype`：使用传统 FFmpeg 二进制目录，没有核实过的对应视频源材料。
- `validation-candidate`：接受核实过的视频材料，仍有许可核实或干净系统验收事项。
- `release-candidate`：所有材料阻塞已消除，并且有绑定此 payload 的真实干净 Windows 自动检查和人工检查通过记录；仍不自动上传或发布。

`--clean-windows-evidence` 只接受真正干净环境、同一 bundle payload、自动步骤全部通过，以及默认浏览器、原生目录选择、普通账户和浏览器退出存活检查均通过的记录。清空宿主 PATH、宿主隔离数据目录或仅视口模拟均不能满足此门槛。代码未签名及 SmartScreen 结果单独记录，不宣称通过未执行的检查。

新候选保存到 `.mediaslimx/packaging/candidates/`，现有可运行原型保留。生成 `*-size-inventory.json`，按 FFmpeg、PDF、图片、Python、界面与通知列出实际解压字节、每文件 ZIP 压缩字节与 SHA-256；总下载体积以 ZIP 文件实测为准。

## 分发时的来源说明

将匹配的 runtime ZIP、companion ZIP 和校验文件放在同一下载位置，runtime 内 `THIRD-PARTY-SOURCES.json` 给出 companion 的准确文件名与 SHA-256。当前未发布，因此不编造下载地址或未来源码承诺。MediaSlimX 本身采用 MIT；依赖保留各自条款，不用项目 LICENSE 覆盖第三方许可证。

官方参考：[pikepdf 第三方许可](https://github.com/pikepdf/pikepdf/tree/main/third-party-licenses)、[lxml Windows 构建](https://lxml.de/installation.html)、[PyInstaller 许可及 bootloader exception](https://github.com/pyinstaller/pyinstaller/blob/v6.16.0/COPYING.txt)、[Python 许可](https://docs.python.org/3.12/license.html)、[微软运行库再分发](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files)、[GNU LGPL 2.1](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html)。
