# Windows 便携包与启动方式

当前 Windows 独立窗口候选完整解压后双击 `MediaSlimX.exe`，在自己的窗口中打开工作台，不启动外部浏览器；关闭时由该实例安全收尾自己的任务、助手与服务。窗口复用现有网页界面和 Python 核心，通过 WebView2 显示，不重写媒体处理逻辑。Linux/WSL 服务器继续使用网页与 SSH 隧道。

Windows x64 `onedir` 包提供 Python、图片/PDF 引擎、FFmpeg 与 ffprobe；**窗口版需要机器已安装 WebView2 Evergreen Runtime，该 Runtime 不捆绑在包内**。缺少时显示说明，不自动下载安装或退回浏览器。旧控制台/浏览器 r3 候选和构建方式继续保留，两种包的体积、指纹和验证证据分别记录。详情见 [Windows 独立窗口](windows-window.md)。

最新 **official-python313-r1 本机候选** 使用可核对的官方 CPython 3.13.16 供应商包。实际解压 EXE 的独立 WebView2 合成测试通过 200 文件导入上限、201 文件目录扫描与导出、五种格式结果、CSV、预览、中英主题、原件指纹及空闲退出。旧 r10 的暂停续做与卡片间距证据独立保留；本次没有替换用户实例或改写其数据。

## 状态与分发边界

当前产物是 **本机验证候选，尚不可对外分发**。旧 `local-prototype` 保留，新包与之分开生成。构建会把来源材料状态、真实干净 Windows 验收、未解决项目和源码指纹写入 `BUILD-MANIFEST.json`；缺项时固定为 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`，不会因开发机测试通过而自动变成发行版。

新候选清单有两条阻塞：确认 lxml Windows wheel 的实际静态 iconv 输入及 LGPL 重建/重链接材料；完成绑定同一 payload 的真实干净 Windows 验收。旧 r10 还保留其自身 libffi 来源阻塞，不把旧包的状态合并到新包。构建清单仍为 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`。

旧原型使用 WinGet 的 Gyan.FFmpeg `9.0-full_build-www.gyan.dev`，含大量本工具不使用的能力。新候选改用固定 FFmpeg 9.0.2 与 x264 源码自行构建的 Windows x64 精简引擎，仅保留普通 MP4 所需解复用、H.264 解码、libx264 编码、AAC 解码/复制、缩放和完整解码验证。源包、签名、构建配置、工具链版本、许可证、二进制指纹与原生 Windows 实测随单独的材料包保存，见 [精简引擎](ffmpeg-engine.md)。不将其宣传为通用 FFmpeg。

便携包也包含 Python、Pillow、pikepdf/qpdf、lxml、Tcl/Tk、FastAPI 等第三方组件。新候选已收集固定版本 wheel、sdist、许可证和安装内容匹配证据，并将其 Python/libffi 与官方供应商文件核对；仍需复核 lxml wheel 与已收集静态 iconv 源码/重链接材料的实际对应。这项缺口记录在材料清单中，不能用一个总许可文件代替核实。MediaSlimX 自身 MIT 许可不替代组件各自条件，详见 [分发材料](distribution-materials.md)。

官方参考：[PyInstaller 运行时信息](https://pyinstaller.org/en/stable/runtime-information.html)、[PyInstaller 使用方式](https://pyinstaller.org/en/stable/operating-mode.html)、[FFmpeg 许可说明](https://ffmpeg.org/legal.html)。冻结后的 `sys.executable` 指向 EXE，不能当成 Python 解释器传入脚本；启用 GPL 组件会改变 FFmpeg 构建的许可条件。源码材料与验证状态应与实际二进制匹配，不以同名库的最新下载代替。

## 下载体积与离线使用

旧原型 ZIP 为 206,531,521 字节（196.96 MiB），其中两个通用 FFmpeg 程序占压缩数据约 164.96 MiB、约 84%；其余应用、Python、图片和 PDF 运行时合计约 32 MiB。新引擎的两个 EXE 合计 8,852,480 字节（8.44 MiB），ZIP 压缩后约 3.42 MiB。完整新包的实测值以对应候选生成的 `*-size-inventory.json` 为准。

当前采用精简的便携包，Python、媒体依赖与处理过程均无需首次联网安装；便携用户不需要 Python 或 pip。窗口版以**已安装 WebView2 Runtime**为前提，缺少 Runtime 的机器不能承诺仅凭这个 ZIP 就可完全离线运行。旧浏览器 r3 包使用系统浏览器，不要求 WebView2。源码启动脚本的首次依赖准备可能联网，服务于开发者。没有引入在线引导安装器、自更新或首次启动静默下载。

运行 ZIP 只包含执行必需文件、许可证、材料索引和启动说明；对应源码、构建步骤及校验记录另放 `third-party-materials.zip`，未来分发时必须提供与运行 ZIP 匹配的材料。运行应用不需要解压该源码包。构建脚本按明确白名单保存本项目源码快照，不包含用户任务、媒体、日志、访问令牌或其他项目。

### 运行包实测，按界面形态分开

| 项目 | 实际值 |
| --- | ---: |
| 旧原型 ZIP | 206,531,521 字节 / 196.96 MiB |
| 浏览器 r3 ZIP | 37,469,902 字节 / 35.73 MiB |
| 浏览器 r3 相对旧原型下载体积减少 | 81.9% |
| 浏览器 r3 完整解压 | 83,923,023 字节 / 80.04 MiB |
| 独立窗口 r1 ZIP | 37,788,573 字节 / 36.04 MiB |
| 独立窗口 r1 完整解压 | 84,931,564 字节 / 81.00 MiB |
| 独立窗口 r2 ZIP | 37,792,731 字节 / 36.04 MiB |
| 独立窗口 r2 完整解压 | 84,943,748 字节 / 81.01 MiB |
| 独立窗口 r3 ZIP | 37,797,147 字节 / 36.05 MiB |
| 独立窗口 r3 完整解压 | 84,956,067 字节 / 81.02 MiB |
| 独立窗口 r4 ZIP | 37,801,460 字节 / 36.05 MiB |
| 独立窗口 r4 完整解压 | 84,967,872 字节 / 81.03 MiB |
| 独立窗口 r5 ZIP | 37,802,628 字节 / 36.05 MiB |
| 独立窗口 r5 完整解压 | 84,967,885 字节 / 81.03 MiB |
| 最新官方 Python 3.13 窗口 r1 ZIP | 38,123,090 字节 / 36.36 MiB |
| 历史独立窗口 r10 ZIP | 37,806,296 字节 / 36.05 MiB |
| 历史独立窗口 r8 ZIP | 37,808,279 字节 / 36.06 MiB |
| 历史独立窗口 r7 ZIP | 37,688,174 字节 / 35.94 MiB |
| 历史独立窗口 r7 完整解压 | 84,710,640 字节 / 80.79 MiB |

最新文件：`.mediaslimx/packaging/official-313-candidates/MediaSlimX-windows-x64-validation-candidate-official-python313-r1.zip`，SHA-256 `3433bb9ff6c9281bb748e87b19a194fe1a33efbadf004ddf743b0717443ab3f3`；对应材料 ZIP 为 307,721,642 字节，SHA-256 `73c8e1339af43c3ba311454fb5fb6758b582cb54567fc29f31836a416fc6d6a8`。材料独立保存，普通运行不需解压；两者都未发布。合成窗口流程报告见 `.mediaslimx/window-tests/window 中文 space d62b5f2d9b784b9e9b2bb28fb6aa595e/window-ui-report.json`。

历史 r10 文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r10.zip`，SHA-256 `6ebb5366cca8c5aa7789f1401d3e6e3530cf0d622adcd6810f283fb5b110c5a1`；对应材料 ZIP 为 278,303,903 字节，SHA-256 `e90d328565be134aad37fe2fffe8b6a2d74c615977577f7924607c175b8153ce`。旧证据在 `.mediaslimx/packaging/window-zip-r10-resume/static-assets-report.json` 和 `.mediaslimx/packaging/window-workers-6fa019c804eb49e8a54e5a8ad0a37ce0/report.json`，不转记新候选。

历史r8文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r8.zip`，SHA-256 `39486b8e3d115aa6f74b3591d8e043c911bef1b5cce4f29850b5d51b1c81542a`；对应材料ZIP为278,297,270字节，SHA-256 `6e1a6f2e3cbb3d8f78793f660d99ed373089c2f774932ccf82887d03214a09b0`。两者均未发布。

历史窗口r7文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r7.zip`，SHA-256 `5b0662dfab79f67a630a05de1f19528e647d20d16539ee1b0338108150588e34`。对应 `-third-party-materials.zip` 为262,718,093字节，SHA-256 `560527a22ae1a2e832f7f079448dc9a11a2b7159cb52fd6f9408c8cc119c5480`；材料独立于35.94MiB运行下载，用户无需安装。

窗口r5历史文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r5.zip`，SHA-256 `86878fa51eb9d55eea9b004198a4f08044a885849a4223a1a8af1d8fd4a6be77`；对应材料278,245,129字节，SHA-256 `87d04818eec6060b41139981e4e84267610d5d985838e0e593cd90687674effe`。

窗口r4历史文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r4.zip`，SHA-256 `32cfbd14aac7703d6fd4e7dbf7e074ffaa23895b67e5ecee423be162a472fde4`。配套材料278,241,630字节，SHA-256 `93436981b54edc329cec562bc933554287763d176a67ca5e8e5834bde41b6784`；原主窗与目录通道证据仅绑定该候选。

窗口r3历史文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r3.zip`，SHA-256 `9d386acc2684dbf26d6b62418e38a34c3705e42e8fbb8e7321d028a23d413b00`。对应材料278,206,332字节，SHA-256 `5d910303e2de2b55fd0f62db5ba42500859697d51d84af157b379873d295e139`，保留原配套关系。

窗口r2历史文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r2.zip`，SHA-256 `1b34983bd5fcbc0af95b4ccb6fcc1dac015c34e14a6207d7bae1a7ce729bd77f`。对应材料为278,183,586字节，SHA-256 `564a8b9f5d2be7018e9c1c80bc9fc02d5c1400187d4e298b0da78e6b962e7d9d`，与原主窗验证匹配。

窗口r1历史文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r1.zip`，SHA-256 `3a811c75b83045ea3f0adbff91b6067919bdcef6949da8afb293d562ca1fe502`。对应材料为278,164,208字节，SHA-256 `6711770a3f20a202ebfa7143f728ae24c3e2a318e21f42acbde583c093baf1b4`，保留原配套关系。

浏览器r3历史文件：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-packaging-r3.zip`，SHA-256 `c631fdbc5fdba90576005ec1b653e85ddd428d60b9610f16aadef1fcc99395b9`；其同名 `-third-party-materials.zip` 仍与原包配套。各包完整分项分别见同目录各自的 `*-size-inventory.json`；已有产物不覆盖，仍为带待核实项目的本机候选。

The latest local official-Python-3.13 window candidate is 36.36 MiB compressed. It requires an installed WebView2 Runtime. Its extracted EXE passed an isolated synthetic native-window scan/export, preview and CSV flow; its PDF worker passed separately. Exact lxml/iconv provenance and clean-Windows acceptance remain open. No public release has been made.

## 数据、端口与退出

- 源码 Windows 窗口：项目内 `.venv-win`，数据 `.mediaslimx/windows-window`，从8767起选择空闲端口。
- 源码 Windows 网页：同一 Windows 虚拟环境，数据 `.mediaslimx/windows`，默认端口8766；使用 `Start-MediaSlimX-Browser.cmd` 保留旧入口。
- 源码 WSL 实例：项目内 `.venv`，数据 `.mediaslimx/wsl`，默认端口 8765。
- Windows 便携实例：自带运行时，数据 `%LOCALAPPDATA%\MediaSlimX\portable`；从 8767 起选择空闲端口。只绑定 `127.0.0.1`，不开放局域网或公网。

便携数据不随 ZIP 移动，也不会因删除解压目录而自动删除。任务、导入副本和数据库可能包含媒体内容及本机路径，应按个人数据管理。输出和备份仍写到用户明确选择的位置。

首次允许范围默认是当前 Windows 用户的 Pictures 目录（不存在时使用 EXE 所在目录）。通过原生目录选择器选择其他媒体目录时，沿用既有明确授权与持久记录机制，不自动授权整个磁盘。

窗口再次双击会验证同一数据目录及窗口所属进程并激活原有窗口；无法确认所属关系时给出提示，不接管网页服务或结束其他实例。源码窗口、源码网页、WSL和便携默认数据隔离。窗口入口支持 `--data-dir`、`--port`、`--allow-root`；旧浏览器入口仍支持原有 `--no-browser` 等参数。

更新便携包前先完成或取消任务并关闭旧窗口；旧浏览器包则先停止控制台服务，再完整解压新包。不要只替换单个EXE；运行数据保存在独立LocalAppData内，解压新版本不会自动迁移或删除它。没有把便携更新实现为自动 `git pull`。

窗口空闲关闭直接退出；有进行中工作时使用当前主题、单语言退出层，默认继续，Escape/叉号/继续保持工作与合理焦点。安全退出仅提交一次，停止新变更、取消剩余处理并等待自己的媒体事务结束，再退出服务和窗口。3秒未确认显示才撤销nonce并回退为单语言、默认No的系统确认，不超时自动退出。页脚“退出工具”只在窗口显示，复用同一OnClosing而非HTTP关闭接口。不会按进程名称批量关闭Python、FFmpeg、Edge或其他MediaSlimX实例；异常退出仍由该实例的Windows Job约束所属子进程。物理点击、实际DOM/协议与协调器测试分开记录。

### 保留的浏览器包退出方式

控制台必须保持运行，关闭网页不会停止服务。完成任务或取消剩余任务后，在控制台按 Ctrl+C 退出。关闭控制台会终止该服务进程树，包括它自己的 FFmpeg、PDF 和目录选择子进程；正在处理的任务可能中断，重启后使用既有指纹和备份机制检查状态。不要在覆盖或恢复执行中直接关闭窗口。

正常停止先关闭本实例登记的系统目录窗口，阻止停止后重新弹窗或将迟到的选择结果添加为允许范围，再由HTTP服务完成退出。HTTP请求宽限期为5秒；这不是媒体事务的完成期限，也不承诺任意时刻强制退出都能完成正在写入的工作。窗口与请求按实例拥有，不按进程名批量结束；默认浏览器沿用独立生命周期。

打开默认浏览器使用专用短命助手，显式脱离本工具的 Windows Job；媒体、PDF 和选择器助手继续留在 Job 中。外层系统 Job 如果禁止脱离，工具不会冒险在自己的进程组里重试打开浏览器，而是提示复制完整 URL 手动打开。这避免服务退出时结束用户浏览器。机制依据 [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) 与 [Job limit flags](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information)。

## 源码构建

在 Windows 原生 PowerShell 中进入项目目录，使用 Windows Python 3.11+，不能使用 WSL Python。构建虚拟环境与产物均在已忽略的 `.mediaslimx/packaging/` 内，不污染 `.venv-win`。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-window-host.ps1

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-windows.ps1 `
  -Python "C:\path\python.exe" `
  -FFmpegMaterials ".mediaslimx\distribution\media-engine\release" `
  -PythonMaterials ".mediaslimx\distribution\python-runtime" `
  -WindowHostMaterials ".mediaslimx\window-host\1.0.4258.31" `
  -BuildId "windows-window-r10"
```

先依 [精简引擎](ffmpeg-engine.md) 准备引擎材料，使用构建虚拟环境运行 `scripts/collect-distribution-materials.py` 准备 Python 材料；构建入口校验路径、大小、SHA-256、版本与状态。`requirements-windows-portable.txt` 固定本轮 Windows 构建依赖，不改变源码平台的虚拟环境。首次下载源码、工具链和构建依赖需要联网；窗口Runtime前提已满足时，成品运行与媒体处理不需要联网。所有下载属于维护者构建，不在用户启动时执行。

旧 `-FFmpegDir "C:\path\ffmpeg-build\bin"` 入口仅用于本机原型，无法满足材料门槛。构建不上传产物。可用 `-CleanWindowsEvidence` 提供已完成的真实客体验收报告；脚本核对 payload 指纹、干净环境、自动步骤和人工检查，不接受宿主自测或缺项报告。

提供 `-WindowHostMaterials` 时使用 `scripts/window-entry.py` 与 `--windowed`；省略时仍使用 `scripts/portable-entry.py` 构建控制台/浏览器版本。锁定SDK版本及源包hash见 `scripts/window-host-sdk.json`，窗口材料只复制固定清单中的源码、许可证、SDK包和编译证据，邻近WebView测试缓存不会进入companion。本机窗口r1至r4均使用已复核的 `.mediaslimx/distribution/python-runtime-review-r2`；r4已更新离线重编的目录窄通道host材料，不能用r3旧host清单代替。

冻结时，PDF与原生目录选择通过同一个EXE的专用子进程入口运行，不把EXE当作可执行任意Python脚本的解释器。窗口GUI子系统没有控制台，专用worker会复制父进程继承的标准管道以返回JSON，不新开控制台。源码模式的隔离PDF子进程和Windows base Python选择器调用保持原行为。

输出位置：

- `OutputDir/candidates/validation-candidate-windows-window-r7/MediaSlimX/MediaSlimX.exe`
- `OutputDir/MediaSlimX-windows-x64-validation-candidate-windows-window-r7.zip`
- `OutputDir/MediaSlimX-windows-x64-validation-candidate-windows-window-r7-third-party-materials.zip`
- 对应的 `.sha256`、`-size-inventory.json` 与 `latest-build.json`

只有材料与真实干净环境均符合门槛时才使用 `release-candidate` 后缀；这仍不执行上传。旧 `.mediaslimx/packaging/MediaSlimX-windows-x64-local-prototype.zip` 不覆盖。

可用 `-BuildId packaging-r3`（Python入口为 `--build-id`）给独立候选命名；输出路径的后缀随之增加。相同名称已存在时自动追加时间戳，避免覆盖已绑定验收指纹的包。后续复验应采用 `latest-build.json` 返回的真实路径。

`_internal` 与 EXE 必须完整保留，不能只复制单个 EXE。构建未签名，不应宣称已通过 SmartScreen 或杀毒白名单。不要指导用户关闭系统安全保护。

## 验证方式

### 最新独立窗口 official-python313-r1

新候选的 ZIP、材料 ZIP 指纹及实测范围见上方“运行包实测”和 [窗口验证记录](windows-window.md)。201 文件目录实际导出与五格式、CSV、预览、两种语言/主题通过；空闲退出后本实例窗口记录、端口、所属进程与临时工作区清理完成。缺 WebView2 Runtime、繁忙物理标题栏 X 和干净 Windows 尚未验证。

### 历史独立窗口 r10

r10 ZIP为37,806,296B，SHA-256 `6ebb5366cca8c5aa7789f1401d3e6e3530cf0d622adcd6810f283fb5b110c5a1`。实际解压EXE的六项静态资源与源码/ZIP逐字节一致，PDF worker四组通过。隔离WebView2窗口启动时显示合成异常任务，桌面与390px结果卡片边距检查通过，手动继续后另一张图片完成，旧结果及原件SHA保持；页脚空闲退出后所属进程、私有端口和临时工作区收尾。证据见 [窗口验证记录](windows-window.md)。尚未进行r10完整主窗/目录、繁忙物理X或干净Windows验收；旧候选证据不转记。

### 历史独立窗口 r8

r8 ZIP为37,808,279B，SHA-256 `39486b8e3d115aa6f74b3591d8e043c911bef1b5cce4f29850b5d51b1c81542a`。实际解压EXE的六项静态资源与源码/ZIP逐字节一致，PDF worker四组通过。隔离WebView2窗口启动时显示合成异常任务，手动继续后另一张图片完成，旧结果及原件SHA保持；页脚空闲退出后所属进程、私有端口和临时工作区收尾。详见 [窗口验证记录](windows-window.md)。尚未进行r8完整主窗/目录、繁忙物理X或干净Windows验收；旧候选证据不转记。

### 历史独立窗口 r7

r7完整解压1341项文件、PE GUI子系统2确认。12项静态资源的源码/ZIP/解压字节及SHA一致，报告 `.mediaslimx/packaging/window-zip-r7-9357f33bb3c5445fa445b36d12d7ce2c/static-assets-report.json`；实际解压EXE的PDF worker四组通过，报告 `.mediaslimx/packaging/window-workers-5b472bd236df43359d4b900fdd5fd604/report.json`。文档更新不追补或重建冻结源码快照。

实际主窗12项、目录对象9项、新关闭UI7项/21组布局及重开3项通过。通过产品Quit→真实native Close/OnClosing→协调器→HTML层安全退出，退出前任务running，最终2success/18cancelled；231原件、409既有导出/备份/报告/导入副本及本次2项成功结果SHA保持，自有PID和HTTP53359/CDP53358自然退出，window.json移除、work空。8765=false/8766=true与基线相同，不把8765既有不可达解释为本轮关闭。

重开保留完成任务与精确目录授权、不自动续跑，二次启动同owner/host；空闲CDP显示故障后8个所属进程和两私有端口退出。自动化证据在 `.mediaslimx/window-tests/r7 中文 space bcb26c69f0534989a26d1abde9664177/` 的五份实际报告，详见 [窗口记录](windows-window.md)。Quit共用标题栏处理器，但该次自动化不是人工X；随后独立的人工物理X验收确认繁忙时继续使用仍运行，再点X安全退出后19项完成、41项取消且自有后台退出，证据在 `r7 中文 space 5d2bb4a7d9194771b7b7e12da5aa5dbb/`。重开后的闲置关闭仍明确为显示端故障。Explorer手拖、目录人工点选、缺Runtime、普通账户及干净Windows未验，四条发布阻塞保持。

### 独立窗口 r5 历史验证

r5复用r4的fc090窗口材料，未重编原生host。真实ZIP独立完整解压，1397项文件、PE GUI子系统确认；8静态资源源码/ZIP/解压字节及SHA一致，报告 `.mediaslimx/packaging/window-zip-r5-da674dacb4244efd92087969df5d8294/static-assets-report.json`。PDF worker四组通过，报告 `.mediaslimx/packaging/window-workers-1811f1d9c9ee4878b038d149e2d34bd7/report.json`。打包阶段没有开启主窗，后续独立实际主窗验证如下。

最终实际ZIP主窗12项、真实目录对象9项、重开3项通过，含200/201导入引导、201项目录压缩、五格式/CSV/预览、中英明暗、系统picker启动后网页取消；未授权新目录只新增精确root、不扩父目录，直扫不创建上传副本或任务，成功后旧busy提示隐藏。活动FFmpeg实际running后模拟显示故障，11个所属进程/两私有端口关闭、work空、任务cancelled，212原件及409文件hash保持。重开保留任务/目录授权、不自动启动任务、二次启动复用；空闲故障后8个所属进程退出。证据 `.mediaslimx/window-tests/r5 中文 space 3fef68a559c64429a5888d6f26db6c1e/` 中四份window报告。

无关服务探测在操作前后均为8765不可达、8766可达，不声称本轮保持8765运行或关闭了它；没有向其他实例发停止命令。WSL普通浏览器回归14行为/20panel/24helper/5workbench通过，独立41434服务已收尾。后续用户协作确认空闲物理X关闭、繁忙X后选否继续；最后关闭时20项已完成，用户撤回Yes说法，不能记为繁忙Yes或剩余取消通过。人工证据见 [窗口记录](windows-window.md)。物理Explorer手拖、目录人工点选、缺Runtime与干净机仍未验。纯验证文档没有重建或改变r5指纹。

### 独立窗口 r4 历史验证

r4实际ZIP独立解压通过，1397项文件、PE GUI子系统确认，8静态资源源码/ZIP/解压字节及SHA一致。证据 `.mediaslimx/packaging/window-zip-r4-08682eb958c6469ea1e1218db8c7b86a/static-assets-report.json`。从该解压EXE执行PDF worker四组通过，证据 `.mediaslimx/packaging/window-workers-0ed1c0339b25484381f8a761502d5328/report.json`；打包验证没有启动主窗或修改用户任务。

目录窄桥检查WSL44项、Windows旧27项与新17项通过；默认目录名排除修复的25项Engine测试两平台通过，前端语法及collector单元16项通过。r4实际ZIP后续12项主窗与9项真实目录对象检查通过，观察活动编码后模拟显示故障的11个所属进程退出、文件保留，以及重开3项通过；不是物理X/YesNo或Explorer手拖验收。随后发现忙碌提示残留，在r5独立修复与重建，详细历史见 [窗口记录](windows-window.md)。

### 独立窗口 r3 历史构建检查

r3真实ZIP已完整独立解压，1397项文件、PE GUI子系统确认。8个静态资源app/index/style/storage/import-tree/i18n/catalog/theme的源码、ZIP成员与真实解压文件字节及SHA全部一致，报告 `.mediaslimx/packaging/window-zip-r3-755b85c7d6c043fda595307c17d4f048/static-assets-report.json`。从这份解压EXE执行PDF worker四组全部通过，报告 `.mediaslimx/packaging/window-workers-dc9f2647258347279c7bc4ebb7be91bf/report.json`。

新导入引导在Windows原生Chrome与WSL/Linux Chrome的独立源码服务上，各完成14行为、20panel、24helper、5workbench可达检查；原有backup快捷流程4组通过，collector单元16项通过。打包阶段未启动r3主窗或操作用户默认实例。后续r3实际WebView2前置检查暴露未登记默认目录名被扫描的问题，r4已修复，不称r3完整主窗验收通过。详细历史见 [开发计划](development-plan.md) 和 [窗口记录](windows-window.md)。

### 独立窗口 r2 历史验收，保留 r1 阶段证据

材料边界与旧模式兼容测试在Windows、WSL各14项通过。新r2 ZIP已真实解压到独立目录，1397项文件，确认EXE为PE GUI子系统；无Python/FFmpeg的PATH下，r2真实解压EXE的PDF管道、合成PDF压缩及页面/流摘要、错误请求拒绝与原件SHA保持共4组通过：

```powershell
.mediaslimx\packaging\build-venv\Scripts\python.exe -X utf8 tests\windows_window_workers_smoke.py `
  --executable ".mediaslimx\packaging\candidates\validation-candidate-windows-window-r2\MediaSlimX\MediaSlimX.exe"
```

源码窗口已在本机真实WebView2中完成两张自制图片扫描与导出（2项成功），原件保留；同数据目录的第二次pythonw启动，以及不同工作目录调用 `start-window.ps1`，均复用原实例。窗口阶段166项全量快照为Windows165通过/1权限跳过、WSL151通过/15平台跳过；材料14项是另外一次定向执行，不将不同快照数量简单相加。物理叉号/繁忙关闭确认、原生目录人工点选、缺Runtime与干净Windows验证仍需实际观察；详情见 [Windows窗口记录](windows-window.md)。

另以62张合成图处理期间的临时CDP `Browser.close` 模拟显示进程故障，源码后台安全排空：任务取消（1项成功/61项取消）、work清空、窗口记录移除、8个登记所属进程全部结束，原件SHA保持，已有8765/8766服务仍可用。CSV、结果图片HTTP预览及英文切换也通过。此项是实际显示进程异常的收尾验证，**不是物理叉号点击**，不替代正常关闭确认链路或干净系统验收。证据：`.mediaslimx/window-tests/window space aa143e38c90b46318f463d0147b70390/source-close-validation.json`。

线程启动/停止异常与默认范围修复后，受影响后端风险检查两平台各56项通过、最后窗口模块各17项通过；页面内图片放大两平台各20组布局与完整交互通过，错误0、外部弹窗0。r2原生host已离线重编，显示后按当前屏幕工作区夹紧尺寸与位置，不把定向检查当作全量或干净系统验收。

r2实际ZIP主窗在受限PATH、不同工作目录与中文空格解压路径中通过本机验证：JPG/PNG/WebP/MP4/PDF五格式真实扫描导出，4项成功、WebP无收益，原件SHA全部保持；页面内图片100%放大、Esc及焦点返回、CSV按钮实际下载、视频播放、系统目录窗口取消、英文与主题切换均通过，无溢出、页面错误或外部新窗口。重复EXE复用同一owner/host；真实JPEG备份覆盖、恢复及备份保留通过，同一测试数据重启后已完成任务仍可读。

在实际自有FFmpeg仍活动、API任务为running时，同一验收脚本经临时CDP `Browser.close` 模拟显示进程故障：任务变cancelled（1项取消），登记的10个所属进程全部结束，work空、window.json移除；已完成任务、CSV与备份仍可用，6项原件SHA保持，既有8765/8766服务继续可用。此项验证实际显示端故障的安全收尾，**不冒充物理X点击或繁忙确认交互**。证据目录 `.mediaslimx/window-tests/portable 中文 space 150fdca05ea34439880d001fdcc9c058/` 中的 `portable-ui-report.json`、`portable-close-report.json` 与 `portable-webview-english.png`。

r2 PDF解压包证据：`.mediaslimx/packaging/window-workers-e81157c470794664af32757a3c8b2819/report.json`。r1的四组证据仍保留 `.mediaslimx/packaging/window-workers-dfa39a2c09994c32972517a7a04a3a9e/report.json`。旧r3 Sandbox套件绑定旧payload，不能用来宣称新窗口包已通过干净验收。用户暂缓重启，本轮不启用新系统功能、不重启或启动Sandbox。

### 浏览器 r3 与旧控制台包

```powershell
.venv-win\Scripts\python.exe -X utf8 tests\windows_portable_smoke.py `
  --package .mediaslimx\packaging\minimal\MediaSlimX-windows-x64-validation-candidate.zip `
  --fixture-ffmpeg "C:\path\to\full-fixture-encoder\ffmpeg.exe"
```

测试从真实 ZIP 解压到独立的中文与空格目录，使用无 Python/FFmpeg 条目的 PATH、独立 LocalAppData 和合成 JPG/PNG/WebP/MP4/PDF，检查本机服务就绪、静态资源、二次启动、真实媒体扫描与导出、原件不变、CSV 和预览、原生目录窗口及取消；退出时实际正在处理的 FFmpeg 与选择器助手必须结束，长命浏览器记录控制器必须继续存活。自动打开网页使用记录型浏览器控制器验证发起动作，不能替代真实默认浏览器 UI 观察。

`fixture-ffmpeg` 只在宿主生成合成视频，不传入产品 PATH，也不随包提供；精简运行引擎无需 `lavfi/testsrc`。本机测试通过不能代替干净 Windows 虚拟机验收。已准备禁网、仅映射合成媒体与待测包的 Sandbox 工具、只读目录与恢复/取消检查，见 [干净 Windows 验收](clean-windows.md)。2026-10-17获用户明确批准后，宿主已通过UAC启用Sandbox，Windows实际返回需要重启，尚未手动重启或启动客体。未完成中文用户名、标准账户及真实默认浏览器/系统点选的干净客体验收。下载标记、SmartScreen 和签名状态据实记录，不宣称通过。暂不构建手机客户端或增加媒体格式。

## 旧原型验收快照

2026-10-17 在当前 Windows 11 x64 主机上完成实际构建与解压 EXE 验证：Python 3.12.14、PyInstaller 6.16.0、Pillow 12.3.0、pikepdf 10.17.0、自带 FFmpeg 9.0 full_build。包约 197 MiB，完整解压约 496 MiB；全量 FFmpeg 构建是主要体积来源，后续公开发行可评估更精简、来源与许可材料完整的构建。

该阶段源码 Windows 后端回归共 121 项：120 项通过、1 项因当前会话无法创建符号链接跳过。其中 4 项浏览器启动边界测试覆盖显式脱离、外层 Job 拒绝/超时安全回退与本机 URL 限制。此处为旧原型历史快照；当前后端基线统一见 [平台状态](platforms.md)。

`tests/windows_portable_smoke.py` 的 8 组检查全部通过，包括新存储接口的真实导入、导出与副本释放；实际正在处理的 FFmpeg 和选择器助手随服务退出结束，两个长命浏览器控制器继续存活；释放后实际占用下降，原始设备文件、导出结果和报告保持可用。存储清理按钮的浏览器交互由独立界面测试覆盖，这份 EXE 验证主要检查完整包与 HTTP 功能。

本轮测试未使用实体手机、干净 Windows 虚拟机或无 Python 安装的第二台电脑；“PATH 没有 Python”不是“干净系统验证”。自动打开浏览器已验证其带令牌的发起动作，使用本地记录控制器防止测试打开用户浏览器；原生选择器验证了真实窗口显示、取消和子进程退出，未声称模拟了人工点选目录。

本轮私有证据位于 `.mediaslimx/packaging/验证 space 4936a77638b74c5cb48019c917153276/report.json`，不提交到仓库，不包含用户素材或任务。公开产物尚未准备，不上传发布。

## 最终精简 r3 验收记录

2026-10-17，最终35.73MiB候选从实际ZIP解压到独立中文空格目录，`tests/windows_portable_smoke.py` **8组全部通过**。报告绑定上方最终SHA-256，`success=true`：自带运行时、静态资源、自动浏览器打开动作、二次启动复用、五类媒体真实扫描/导出、CSV/预览、原件不变、导入副本释放、真实系统目录窗口显示/取消均验证。最后在实际FFmpeg编码和目录窗口同时进行时发送Ctrl+Break，服务自己的编码器和选择器子进程结束，两个长命浏览器记录控制器继续运行。

该检查曾在第一次小包发现退出等待未完成目录窗口的问题。现由LocalServer在HTTP等待前关闭所属窗口，按实例保护spawn及迟到选择结果；随后恢复原Uvicorn包装对KeyboardInterrupt的正常处理。新增8项风险单测，最终Windows与WSL各136项全量分别135通过/1权限跳过、122通过/14平台跳过。WSL还完成真实CLI导出、SIGINT退出码0且无堆栈、端口/锁释放、同数据重启及任务/报告保留。

最终EXE证据：`.mediaslimx/packaging/验证 space 511bbb05f03543feb7cf6d4116ca5de5/report.json`。当前重启后可用的干净环境验收套件：`.mediaslimx/clean-windows/1e87942f0bb64a1f9213c543721ccb68/MediaSlimX-offline.wsb`；包含观察JSON握手与客体重新打开当前会话的维护改进，仍绑定同一r3 ZIP。其开发机harness的8组也通过，包含真实只读程序目录、备份恢复/冲突、取消和空闲服务强制停止后重启，但明确为 `host_self_test_passed`、`clean_windows=false`。两份报告范围不同，不相互替代，旧验收套件与证据保留。

真实Sandbox尚未运行。2026-10-17 10:58（Asia/Shanghai）已获明确授权、通过UAC启用系统功能，实际返回 `RestartNeeded=true`，全程 `-NoRestart`，未自动重启；当前等待用户手动重启后生效。普通账户、真实中文profile、真实默认浏览器与系统目录人工点选、下载标记/SmartScreen未宣称通过。第三方材料仍有两项来源/适用通知复核，当前仍为本机候选，不上传发布。详细边界见 [干净Windows验收](clean-windows.md) 和 [分发材料](distribution-materials.md)。
