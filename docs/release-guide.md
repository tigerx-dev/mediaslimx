# 开源发布准备 / Release preparation

状态：**仅源码公开，暂无 Windows 便携包或其他二进制下载**。源码位于 [tigerx-dev/mediaslimx](https://github.com/tigerx-dev/mediaslimx)；本页其余便携包步骤是未来发行计划，不是当前可用下载。便携包仍需许可材料与干净 Windows 验收，本页不会触发系统重启。未来发布文案见 [中文草稿](release-notes.zh-CN.md) / [English draft](release-notes.en.md)；项目介绍见 [展示文案](showcase-copy.md)，给 TX 的本地案例内容见 [TX 官网案例交接稿](tx-case-handoff.md)。

## 下载与托管怎么安排

**当前方案**：先公开源码；待验收后再从对应 tag 发布 Windows 独立窗口便携包与材料附件。个人站以后只做介绍与跳转；不做在线引导包。其他环境保留现有开发入口，但不纳入首版发行范围。不把候选便携包当作下载附件，也不预先创建指向未完成包的 Release。

| 入口 | 面向谁 | 获得什么 | 是否需要安装环境 |
| --- | --- | --- | --- |
| GitHub Releases 中手动附加的 Windows 窗口便携 ZIP | 直接使用工具的人 | EXE、Python、图片/PDF 引擎、精简 FFmpeg、窗口助手与许可材料索引 | 完整解压；无需 Python，需已安装 WebView2 Evergreen Runtime；不自动下载 Runtime |
| 仓库 Code → Download ZIP，或 Release 自动生成的 Source code (zip/tar.gz) | 阅读、修改、源码启动的人 | 仓库源码快照 | 按 README 准备当前平台的 Python、依赖和 FFmpeg |
| 与便携 ZIP 匹配的 third-party-materials ZIP | 检查、研究和重新构建的人 | 对应源码、依赖来源、构建步骤与许可材料 | 运行工具不需要解压这一包 |

GitHub 将发行说明和二进制附件放在 Releases，并自动提供 tag 对应的仓库源码归档。**下载仓库源码不等于下载已封装程序。** 发布后，个人站只需提供项目介绍、截图和“Windows 下载”跳转，文件可由 GitHub Releases 托管，不必放在个人站服务器上。[GitHub：About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)、[源码归档下载](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)。

网站主按钮建议指向具体 Release 页面，让用户同时看见说明、版本、许可材料和校验文件。GitHub 也支持 `/releases/latest` 和 `/releases/latest/download/文件名`，但带版本的文件名会变化，直链应随版本更新；初期采用 Release 页面链接更容易维护。仓库地址已确定，真实 Release 尚不存在，本项目不生成可点击的虚构下载地址。[GitHub：Linking to releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)。

English: the currently available **Code → Download ZIP** contains source, not a ready-to-run Windows app. After the portable build passes acceptance and is actually published, end users will be able to download its attached Windows runtime ZIP from Releases. A project website can host the description and link to that future Release without serving the binaries itself.

## 已采用哪种小包方案

当前选择是**自带精简媒体引擎的便携包**，不引入 Python/FFmpeg 在线安装器。2026-10-17 的旧浏览器 r3 候选 ZIP 实测 37,469,902 字节 / **35.73 MiB**，完整解压 83,923,023 字节 / **80.04 MiB**；旧包保持不动。这两个数字不代表新窗口包体积。窗口 payload 的下载、解压大小、哈希和验收证据单独生成。

197 MiB 原型的大部分体积来自通用 FFmpeg；精简其未使用能力后，保留 Python、图片、支持范围内的 MP4 与普通 PDF 功能。**未实现在线引导安装器、自动更新运行库或首次启动 pip 安装。** 不能把当前包介绍成“先下载小启动器，再联网安装环境”。源码启动器首次安装依赖是另一条面向开发者的使用路径。

窗口依赖已安装的 WebView2 Evergreen Runtime，未随包捆绑完整 Runtime；缺少时给出人工安装说明，不自动下载安装，不静默回退外部浏览器。源码首次准备可能下载 Python 依赖与锁定 SDK，这不等于便携首次在线装库。后续若有实际需求，再评估可选引擎下载、来源校验和失败恢复；当前维护人工获取完整版本的流程，见 [升级与更新策略](updates.md) 和 [便携包说明](packaging.md)。

The new window bundle includes its Python/media environment and requires an already installed WebView2 Evergreen Runtime. No online bootstrapper, automatic Runtime installation or library updater is implemented. **35.73 MiB is the old browser-based r3 ZIP**, not the new window payload's size.

## 界面形态与安装包不是一回事

Windows 独立窗口源码与 WebView2 助手已实现，复用现有工作台与 Python 核心。窗口版双击进入自己的窗口，不启动外部浏览器；繁忙时关窗先确认，取消剩余工作后等待媒体事务与已接纳请求安全结束，再停止自己的后台。选择继续使用则不退出，不按名称终止其他 Python、FFmpeg 或浏览器进程。

源码默认入口 `Start-MediaSlimX.cmd` 使用 Windows `pythonw.exe`、`.mediaslimx/windows-window` 与 8767–8866 中可用端口；网页兼容入口 `Start-MediaSlimX-Browser.cmd` 保留 8766 / `.mediaslimx/windows`。其他环境的源码入口不纳入本次发行介绍。PWA 与 Chrome 扩展未实现，不作为本次发行内容。窗口详细边界见 [windows-window.md](windows-window.md)。

Windows standalone-window source is implemented; its own service drains safely on close. Local WebView2 interactions have been tested on the developer machine, while the final window payload and clean-Windows acceptance remain distinct verification gates. PWA and Chrome extensions are not implemented.

## 当前发行阻塞

截至 2026-10-19，最新 `official-python313-r1` 窗口候选仍为 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`，ZIP 为 38,123,090 字节（36.36 MiB），并非下载发行版。旧 r10 独立保留。现有 Windows/WSL 服务和其他项目不受测试影响；用户计划稍后手动重启，本阶段不重启。

1. **真实干净 Windows 验收**：新候选已完成本机实际解压 EXE 的隔离 WebView2 流程：浏览器导入 200 文件限制、目录扫描 201 项并实际导出、JPG/PNG/WebP/MP4/PDF、CSV、图片与视频预览、语言和主题、原件指纹及空闲退出；PDF worker 四组另行通过。原生目录选择器已验证打开后从工具取消，尚未在新候选中验证人工点选具体目录或繁忙物理标题栏叉号。Sandbox 已启用，但 Windows 需用户方便时手动重启，尚未运行客体。最终套件必须绑定新 payload，覆盖普通账户、有/无 Runtime、离线及处理关窗。本机隔离测试不能代替干净环境。
2. **lxml 静态 iconv 的来源与重链接材料**：现已定位轮子发布前的 Windows 库 2026.05.17 标签及 6.1.3 构建配方，但配方动态选择最新发布，仍需把实际 wheel 绑定到对应输入并核对 LGPL 重建/重链接材料。先前 2026.10.05 标签发布得更晚，不能当作来源证明。

旧 r10 的 Python 3.12 libffi 来源仍不明，因此旧包也不能发行。新候选改用 CPython 官方 3.13.16 NuGet 与 Python.org 对应 ZIP/SPDX，实际 libffi DLL 与官方 `cpython-bin-deps` 匹配，材料清单仅剩 lxml 项；不能把新候选的结论倒推给旧包。

窗口 SDK 的固定来源、哈希、通知、源码/配方和纳入包的组件已随当前候选核对；若最终 payload 或 SDK 改变，仍须重新绑定相应材料，不能直接沿用旧候选证据。

材料的准确状态以 [分发材料](distribution-materials.md) 为准；干净环境进度见 [clean-windows.md](clean-windows.md)，完整测试范围见 [platforms.md](platforms.md)。当前未签名，不宣称通过 SmartScreen。若核实导致依赖或构建变化，应生成新候选，按实际受影响范围重测并重新绑定验收证据。

The extracted official-Python 3.13.16 candidate passed an isolated native WebView2 scan/export/result flow with synthetic media. Exact lxml/iconv provenance and LGPL relinking materials, plus clean-Windows acceptance after a user-controlled restart, remain open. The old Python 3.12 bundle retains its separate libffi provenance blocker. Developer-machine tests do not replace clean-Windows acceptance.

## 建议的首发版本与文件

版本尚未最终确定。当前程序版本为 `v0.2.0`，公开测试版的版本号应在完成上述事项后确定，与最终代码、包内版本、文件名、文案和校验记录保持一致；不预先创建 tag。

下列均为命名模板，`VERSION` 必须替换为最终值：

| 建议名称 | 内容 |
| --- | --- |
| `MediaSlimX-VERSION-windows-x64.zip` | 给普通 Windows 用户的完整便携目录 |
| `MediaSlimX-VERSION-windows-x64-third-party-materials.zip` | 与程序一一匹配的源码及构建材料 |
| `MediaSlimX-VERSION-SHA256SUMS.txt` | 上述最终文件的 SHA-256 |

只对已完成状态门槛的最终包设置发行文件名；不能仅去掉当前 `validation-candidate` 后缀就对外发布。若修改附件名，必须同步包内 `THIRD-PARTY-SOURCES.json` 等来源索引，重新生成包与校验，并核对与验收 payload 的绑定；不要手工改 ZIP 内容后沿用旧哈希。每个版本使用独立名称，不覆盖同名历史附件。

源码仓库不提交便携二进制、虚拟环境、`.mediaslimx`、本地日志、访问令牌、任务或用户素材；这些材料按既有明确白名单构建。不能把个人站、TigerX、FIRANO 或 OpenSource 其他目录带入仓库。未来二进制发行的源码 tag 应指向真实最终代码，不能套用本次源码首发的提交号作为未来便携包验收证据。

## 发布操作前最后核对

- 清除上述实际阻塞，按构建器接受的证据重新核对最终窗口 payload、Runtime 前提和材料状态；若仍为本机候选，就继续留在本机。
- 最终文案填入真实版本、附件名、下载体积、验证系统与已知问题；所有 `VERSION`、`填写`、`待完成` 等占位须逐项处理，不删掉尚未解决的限制。
- 检查每个附件 SHA-256、许可证和配套源码索引；普通用户只需下载 runtime ZIP。SHA-256 用于核对完整性，不等于代码签名或安全认证。
- 检查 Git 白名单与公开截图，移除私有绝对路径、用户名、访问令牌、实际任务记录和 FIRANO 私有素材；展示使用合成素材。
- 源码提交使用本仓库 `tigerx-dev` 和 GitHub noreply 地址，不改全局 Git 身份；便携包后续另行核对实际 tag、材料和附件，不从本机候选文件名推断公开版本。
- 现有 40 秒中文演示来自本机 WSL 浏览器工作台与合成素材，不冒充 Windows 独立窗口实拍；上线时替换片尾“尚未发布”并检查视频及链接。最终下载页写明 Runtime 前提和当前未实现自动更新。
- 源码首次提交与推送不包含任何二进制附件；便携包仍等待完整发行门槛，后续在实际 tag 上单独创建 Release。GitHub 官方支持先存草稿、附加二进制、标记 pre-release，再显式发布。[GitHub：Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

## 校验示例

发布说明中的文件名与哈希必须来自同一次最终构建。用户下载后可在 Windows PowerShell 运行：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\MediaSlimX-VERSION-windows-x64.zip"
```

将输出与同一 Release 的 `SHA256SUMS.txt` 逐字比较；不一致时停止使用并重新下载或反馈。`VERSION` 为示例占位，实际复制发布附件名。重要文件先用“导出至新目录”检查效果。未签名程序如出现系统提示，核对真实项目来源和校验，不要求用户关闭安全保护。

## 反馈模板 / Feedback template

```text
版本 / Version:
下载附件名 / Downloaded asset:
Windows 版本及架构（或 Linux 发行版）/ OS and architecture:
使用方式：便携 / Windows 源码 / WSL / Linux
Mode: portable / Windows source / WSL / Linux
媒体类型及普通元信息（不需要原文件）/ Media type and basic metadata:
复现步骤 / Steps:
预期结果 / Expected:
实际结果、逐文件原因 / Actual result and per-file reason:
是否默认导出，能否用合成文件复现 / Export mode? Reproducible with synthetic files?
截图或日志：请先隐藏用户名、绝对路径、令牌和敏感媒体
Screenshots/logs: remove usernames, absolute paths, tokens and sensitive media first.
```

不默认索要完整项目目录、数据库或私人媒体；没有可公开样本也可以先提供上述信息。反馈入口只在真实仓库建立后填写，不编造维护邮箱或支持响应时效。
