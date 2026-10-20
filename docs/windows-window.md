# Windows 独立窗口 / Windows standalone window

Windows 窗口沿用现有 HTML/CSS/JavaScript 界面和 Python 媒体核心，用本机 WebView2 显示工具，不启动外部浏览器。首版对外以 Windows 本地使用为主；其他环境的源码运行记录见[平台状态](platforms.md)，不作为首版发行承诺。

源码窗口现有轻量双语启动遮罩：实际等待时显示、工作台数据就绪即进入、失败可重试或退出；Windows 原生实测、截图与 TX 素材交接见 [启动状态](startup-window.md)。本节历史 r7/r10 及便携包验收不自动涵盖该源码改动。

The Windows window hosts the existing interface and Python processing core in WebView2. It does not launch an external browser. The first public version focuses on local Windows use; source-run notes for other environments are tracked in [platform status](platforms.md), not presented as a release promise.

## 使用与退出

完整解压窗口便携 ZIP，双击 `MediaSlimX.exe`。窗口版包含 Python、Pillow、FFmpeg 和 PDF 依赖，但**不捆绑 WebView2 Runtime**，需要 Windows 已安装微软 WebView2 Evergreen Runtime。缺少组件时给出说明，不自动下载安装、不暗中启动浏览器。源码首次准备、微软 Runtime 的人工安装与便携包运行是不同环节。

Extract the entire portable ZIP and double-click `MediaSlimX.exe`. Python, Pillow, FFmpeg and PDF libraries are included. **An installed Microsoft WebView2 Evergreen Runtime is required**; it is not bundled. Missing components produce instructions rather than an automatic install or browser fallback.

当前源码：空闲点击标题栏X直接退出。繁忙关闭显示当前主题、当前语言的工作台退出层，默认聚焦“继续处理”；继续、Escape和右上角叉号均保留任务并回到原有效控件。点击“保留进度并退出”仅提交一次，停止剩余任务、等待自己的媒体事务安全结束并清理未完成临时文件，再退出该窗口所属服务与助手；已完成导出、未完成清单、备份、任务和报告保留。下次启动显示最近暂停/中断任务，用户主动点击才续做。不会按进程名称批量关闭Python、FFmpeg、Edge或其他实例。异常退出的进程边界由本实例Windows Job保护，强制终止不等同于正常完成或取消。冻结 r7 便携包仍使用旧“安全退出”文案且没有显式续做入口。

In current source, idle close exits directly. Busy close opens a same-theme, single-language dialog with Keep processing focused; its X, Escape and Keep processing retain the running task and restore meaningful focus. Save progress and quit submits once, stops remaining work and drains owned transactions/service/helpers. Completed results, unfinished-file records, backups and reports remain. The next launch shows the latest paused/interrupted task; processing resumes only after an explicit click. The frozen r7 ZIP has the older dialog and no continuation button. Other processes are not targeted by name. Forced termination is not reported as a successful task.

仅独立窗口页脚提供“退出工具”，调用同一个原生OnClosing流程；浏览器/服务器不显示此入口，不增加公开HTTP关机接口。host只接受所属顶层页面、严格字段和当前nonce的关闭回应，错误/旧nonce或无pending回应不退出；主题/语言消息仅影响显示，不授目录或关闭权限。3秒未收到已显示回应才撤销nonce并使用当前语言、默认No的系统回退，没有超时自动退出。

便携版数据为 `%LOCALAPPDATA%\MediaSlimX\portable`；源码窗口为项目内 `.mediaslimx\windows-window`，源码网页仍为 `.mediaslimx\windows`，WSL 数据保持独立。同一数据目录二次启动只尝试激活原有窗口，不接管正在运行的网页服务，也不关闭其他实例。端口默认在 8767–8866 选择可用本机回环端口。

Portable data lives in `%LOCALAPPDATA%\MediaSlimX\portable`; source-window data uses `.mediaslimx\windows-window`, separate from source-browser and WSL data. A second launch activates the existing window when ownership can be verified. It does not adopt or stop another service.

## 最新官方 Python 3.13 窗口本机候选

`official-python313-r1` 的完整 ZIP 在本机实际解压，使用独立 Windows 数据目录、私有端口和全部合成素材运行。WebView2 自动化通过 12 项流程：真实文件导入、超过 200 文件时保留待处理设置、目录浏览确认后扫描 201 文件、201 项导出完成、JPG/PNG/WebP/MP4/PDF 五格式结果、CSV 下载、图片放大和视频播放、中英/深浅主题、系统目录选择器启动与工具内取消。原件 SHA-256 保持；空闲点击工具内退出后页面关闭、窗口记录移除、临时工作区为空。报告为 `.mediaslimx/window-tests/window 中文 space d62b5f2d9b784b9e9b2bb28fb6aa595e/window-ui-report.json`。解压 EXE 的 PDF worker 另有四组通过。系统选择器人工点选、繁忙时物理标题栏 X、缺 WebView2 Runtime、普通账户和真实干净 Windows 仍待新候选单独验收；旧候选人工证据不迁移。

## 历史 r10 本机候选：续做与结果提示间距

r10完整ZIP解压后，独立合成任务在实际Windows WebView2中完成启动识别中断、手动续做、旧结果和原件SHA保持；桌面及390px窄视口的绿色续做提示与结果面板留出内距。PDF worker四组、六项界面资源的源码/ZIP/解压字节核对通过。隔离测试窗口退出后，其owner/host、HTTP/CDP私有端口均关闭，工作临时目录为空。证据为 `.mediaslimx/window-tests/r10 中文 space ff4259563e834e2ea54ae62f68ac1ba9/window-resume-report.json`、`window-resume-terminal.json`，以及 `.mediaslimx/packaging/window-zip-r10-resume/static-assets-report.json`。测试人为构造中断现场，尚未验证r10真实强杀、繁忙物理X或干净Windows环境。测试脚本在退出前恢复原始窗口大小与语言，避免隔离验收造成可见的窄窗/英文跳变；这项修正不改变产品关闭逻辑。

## 历史 r8 本机候选：启动识别与显式续做

从 r8 ZIP 完整解压到独立目录后，使用另一个隔离数据目录及合成媒体启动实际 Windows WebView2 窗口。启动核对一个构造的异常任务现场：主区自动打开“已中断”记录，但状态仍未运行；英文按钮和窄视口可见。点击“继续剩余文件”后，仅未完成的合成图片得到结果，前一项结果及两项原件 SHA-256 保持。随后从此测试窗口页脚空闲退出，所属owner/host进程、HTTP/CDP私有端口均结束，window.json删除，work空；无关8765=false/8766=true与前置基线一致。报告为 `.mediaslimx/window-tests/r8 中文 space 16bba0fbf78648098d618af2ae43e5fe/window-resume-report.json` 与 `window-resume-terminal.json`。此测试的异常现场由合成已结束任务记录重置构造，不宣称完成真实强杀、r8繁忙物理标题栏点击或干净Windows验收。r8仍为 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`，没有上传、发布或重启。

窗口初始内容区为1280×820，显示缩放完成后会把完整外框限制在当前屏幕可用工作区内并居中，避免短屏初次打开时底部落到屏幕外。通常最小外框为900×600，屏幕可用区更小时相应降低；内部网页继续响应式换行和滚动，不靠缩小字号容纳。这里只记录布局规则，没有宣称已在不同实体屏幕/DPI设置逐项验收。

拖入单个真实本机文件夹时，窗口通过受限目录通道授权并扫描该目录，默认准备导出，不创建上传副本，也不自动优化或覆盖；仍需Start。空状态“选择本机目录”使用受控系统目录选择器，选定后也直接扫描，页面可取消选择；不调用浏览器文件夹上传输入，因此没有浏览器的“上传到此站点”确认。散文件、多文件夹、普通浏览器/远程连接的“导入文件夹副本”，以及导入列表中的“添加文件夹副本”仍保持副本导入与200项/2GiB限制；FileList不推导父目录。拖入目录的窄通道只接受所属顶层页面的固定操作与真实WebView2目录对象，host/Python再次验证，closing后拒绝，不是任意路径HTTP API。

## 从源码启动

日常双击项目根目录的 `Start-MediaSlimX.vbs`：它使用无控制台的 Windows Script Host 启动隐藏的 PowerShell 准备流程，再由原有 `pythonw.exe` 打开独立窗口。仅隐藏启动终端，不改变实例锁、任务目录、验证或安全退出。若准备失败，弹窗引导运行下面保留的控制台入口查看详细错误。需要指定已有数据目录时，给 `.vbs` 快捷方式添加 `-DataDir "完整 Windows 路径"`；切换目录不会自动迁移任务。不能用 WSL Python 创建 Windows 虚拟环境。

诊断时在原生 Windows PowerShell 中运行：

```powershell
.\Start-MediaSlimX.cmd
```

或显式运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-window.ps1
```

源码启动脚本首次准备 `.venv-win` 和锁定的 WebView2 SDK，可能需要联网；后续使用已缓存依赖。源码构建需要 Windows 自带的 .NET Framework C# 编译器。用户下载完整便携包不需要自行编译窗口组件。

源码测试时，任务栏里运行中的 `MediaSlimX.Window.exe` 只是 WebView2 窗口组件，单独固定它不能启动 Python 后台。需要固定时，应创建指向 `Start-MediaSlimX.vbs` 的快捷方式；若原来用 `-DataDir` 指定了记录目录，快捷方式也须保留相同参数。旧 `.cmd` 或 PowerShell 快捷方式会显示或闪现控制台，可保留作为诊断入口。正式便携包的入口是解压目录中的 `MediaSlimX.exe`，不要把源码窗口组件当作发行入口。

## 构建与材料

先准备精简 FFmpeg 与 Python 对应材料（参见 [便携构建](packaging.md)），再构建锁定 SDK 的窗口助手：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-window-host.ps1

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-windows.ps1 `
  -FFmpegMaterials ".mediaslimx\distribution\media-engine\release" `
  -PythonMaterials ".mediaslimx\distribution\python-runtime" `
  -WindowHostMaterials ".mediaslimx\window-host\1.0.4258.31" `
  -BuildId "windows-window-r7"
```

已缓存 SDK 后可用 `build-window-host.ps1 -Offline`，避免构建期间联网。SDK 版本、官方来源与固定 SHA-256/SHA-512 记录在 `scripts/window-host-sdk.json`。构建器拒绝 SDK pin 不符、源代码或配方已变化、文件哈希不符，以及白名单外材料。

`-WindowHostMaterials` 是可选参数。省略时仍构建旧控制台与浏览器版本；提供时使用 `scripts/window-entry.py` 和 PyInstaller `--windowed`。窗口 EXE、配置、两项 .NET SDK DLL、原生 Loader 与许可证按固定文件名单纳入 `window-host` 资源目录。SDK nupkg、许可证、源码、配方、编译命令与编译器信息进入对应 companion 材料包；SDK 包不是 WebView2 Runtime。

The optional `-WindowHostMaterials` selects the window build. Omitting it preserves the console/browser bundle. The exact SDK binaries are included in the runtime ZIP; matching SDK package, notices, source, recipe and build evidence live in its companion ZIP. The SDK package is not the WebView2 Runtime.

固定官方 SDK nupkg 的 LICENSE/NOTICE 已核对：采用 BSD 3-Clause 条款，允许保留版权、条件和免责声明的源/二进制再分发，不能借微软名义背书；NOTICE 中 Antlr/StringTemplate 的相应通知也完整保留。该事实核对不代替整包许可来源和干净系统验收。未分发 Runtime，不能把 SDK 许可当作 Runtime 分发材料。

`BUILD-MANIFEST.json` 记录界面形态、是否启动外部浏览器、窗口材料清单 hash 和未捆绑的 Runtime 依赖。窗口包是新 payload，不能复用旧 r3 的体积、SHA-256 或干净环境验收结果。已有 ZIP 和候选目录不会覆盖。

## 验证边界

窗口专属验收需要实际确认：独立窗口显示、未启动外部浏览器、系统目录选择、普通账户、处理期间关窗后的安全收尾，以及 WebView2 Runtime 已装/缺失时的行为。自动化协议或宿主测试不是干净 Windows 验收。

当前r7完整解压、PDF worker四组、12静态资源，以及实际主窗12项、目录9项、关闭UI7项/21布局与终态、重开3项均在下述范围通过，不沿用r5验收。产品Quit自动化与随后人工物理标题栏X分别记录；r7人工繁忙X→继续使用→再次X→安全退出及终态已通过。重开闲置退出仍是CDP显示故障。r5人工协作与撤回Yes证词见历史节。物理Explorer手拖、目录人工点选、缺Runtime观察、普通账户与真实干净Windows仍未验；用户暂缓重启，不为验证而重启系统。r7清单四条阻塞见 [便携分发边界](packaging.md)，不因窗口可打开就宣称可以发布。

This local candidate is not a published release. Clean-Windows acceptance and outstanding third-party material reviews remain separate gates. No reboot, upload or publication is performed by the build.

## 当前本地窗口r7候选（2026-10-17）

r7使用同主题、单语言HTML退出层并保留默认继续与系统安全回退。撤销等待状态时统一恢复按钮；底层Python取消与事务排空机制沿用原实现。r6仅内部构建过渡，未进入交互验收。

| 项目 | 实测 |
|---|---|
| 运行ZIP | 37,688,174 bytes / 35.94 MiB |
| 完整解压 | 84,710,640 bytes / 80.79 MiB，1341项文件，GUI子系统2 |
| ZIP SHA-256 | `5b0662dfab79f67a630a05de1f19528e647d20d16539ee1b0338108150588e34` |
| Payload SHA-256 | `44ed904a53b86fc99f6db0cd16389763346b6ac5e3a767ae0f507edec1c859be` |
| 冻结源码树 SHA-256 | `c44eeb3527a30217e165858823b0c45c68b8c1d67ba30439ac0ff15a042b0076` |
| 窗口材料清单 SHA-256 | `5e91796ee6ab1b8f661fda9f75431f9078cff6051c927d254a51ca968e8e7a87` |
| 对应源材料ZIP | 262,718,093 bytes，独立于运行包 |
| 材料ZIP SHA-256 | `560527a22ae1a2e832f7f079448dc9a11a2b7159cb52fd6f9408c8cc119c5480` |

12项静态资源源码/ZIP/解压字节与SHA一致，证据 `.mediaslimx/packaging/window-zip-r7-9357f33bb3c5445fa445b36d12d7ce2c/static-assets-report.json`；实际解压EXE的PDF worker四组通过，证据 `.mediaslimx/packaging/window-workers-5b472bd236df43359d4b900fdd5fd604/report.json`。

| r7实际窗口验收 | 实测结果 |
|---|---|
| 主窗12项 | 200/201导入引导、201JPG真实压缩全success、五格式实际压缩/CSV/预览、中英明暗与系统picker启动后网页取消通过 |
| 真实目录对象9项 | 精确root授权、201目录直扫无副本/任务、错误收尾及既有边界通过 |
| 新关闭UI7项、21组布局 | 无pending/坏nonce/旧nonce退出拒绝；重复单层、默认继续、Escape/叉/继续和焦点恢复、中英深浅/小窗/reduced-motion通过 |
| 安全退出终态 | Quit触发真实native Close/OnClosing，在running任务中点安全退出；2success/18cancelled，231原件、409既有文件及2成功结果SHA保持；自有PID/HTTP53359/CDP53358自然退出、window.json移除、work空 |
| 重开3项 | 完成任务/精确目录授权保留，不自动续跑，重复启动同owner/host；随后空闲CDP显示故障收尾8个所属进程和两私有端口 |

证据目录 `.mediaslimx/window-tests/r7 中文 space bcb26c69f0534989a26d1abde9664177/`，依次为 `window-ui-report.json`、`window-native-directory-drop.json`、`window-close-ui-report.json`、`window-close-ui-exit-report.json` 与 `window-reopen-report.json`。Quit共用原生标题栏关闭处理器，但不是本轮人工X/Yes点击；重开的闲置关闭明确为CDP显示端故障。无关8765=false/8766=true前后基线一致，8765开始已不可达，不是本轮关闭；未给其他实例发送停止命令。

### r7人工标题栏关闭（2026-10-18）

另用同一r7解压EXE、新建隔离数据目录和60个合成视频硬链接启动导出任务。只对该测试owner设单核、低优先级；窗口显示运行时绿色测试标识 `AA5DBB`。人工第一次点真实标题栏X，看到同主题确认层并选择“继续使用”；机器核对同一owner/host、任务仍running（16/60完成）且无关8766服务可达。人工第二次点真实标题栏X，看到“安全退出”并选择，窗口关闭。随后只读核验任务为cancelled（19success/41cancelled），271份合成原件、2份已保留导出/备份及本次19份成功结果SHA一致；自有进程和私有HTTP49956/CDP49955端口自然结束、window.json移除、work空。无关8765=false/8766=true与启动前相同。没有把人工陈述当成屏幕录像；按钮选择来自用户反馈，终态来自本机文件、进程和数据库核验。

证据在 `.mediaslimx/window-tests/r7 中文 space 5d2bb4a7d9194771b7b7e12da5aa5dbb/`：`manual-close-ready.png`、`manual-close-ready.json`、`window-close-ui-baseline.json`、`window-close-ui-exit-report.json`。运行包及冻结源码指纹未因这次人工验收改变。

运行包 `.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r7.zip`；实际解压程序 `.mediaslimx/packaging/window-zip-r7-9357f33bb3c5445fa445b36d12d7ce2c/MediaSlimX/MediaSlimX.exe`。后续纯文档更新不重建或追补该冻结源码指纹，未发布、上传或重启。

## 窗口r5历史候选与实际验收（2026-10-17）

`windows-window-r5` 仅在native目录扫描成功分支补充收起旧错误提示，防止重复拖入忙碌时的提示残留。原生host材料复用r4的fc090清单，没有重新编译；r4产物和当时验收保留。

| 项目 | 实测 |
|---|---|
| 运行 ZIP | 37,802,628 bytes / 36.05 MiB |
| 完整解压 | 84,967,885 bytes / 81.03 MiB |
| ZIP SHA-256 | `86878fa51eb9d55eea9b004198a4f08044a885849a4223a1a8af1d8fd4a6be77` |
| Payload SHA-256 | `feef68252dcfd9db12c66f6f98299295031169d4e428c2a6567a92474c84dbf3` |
| 源码树 SHA-256 | `024652eba6285319b4a300e317eff9bed50ab693b2c0d3fb65aba2c69890696f` |
| 复用窗口材料清单 SHA-256 | `fc09045c7bf7b61df38403ac5de6dd197eafbd7e5c7a349c76c614c6025ec24e` |
| 对应源材料 ZIP | 278,245,129 bytes，独立于运行包 |
| 材料 ZIP SHA-256 | `87d04818eec6060b41139981e4e84267610d5d985838e0e593cd90687674effe` |

真实ZIP独立解压，1397项文件、PE GUI子系统确认；8静态资源源码/ZIP/解压字节及SHA一致，报告 `.mediaslimx/packaging/window-zip-r5-da674dacb4244efd92087969df5d8294/static-assets-report.json`。随后直接使用该解压EXE完成下列实际窗口复验，未因补充记录重建或改动冻结包。

从r5实际解压EXE执行受限PATH下PDF worker四组全部通过，涵盖合成PDF检查、真实压缩及页面/流摘要、坏JSON/未知操作拒绝、原件SHA保持；报告 `.mediaslimx/packaging/window-workers-1811f1d9c9ee4878b038d149e2d34bd7/report.json`。此检查没有启动主窗或服务。

| r5实际窗口验收 | 结果 |
|---|---|
| 主窗12项 | 200/201导入引导、取消/失败保留、201项目录真实压缩、五格式/CSV/预览、中英明暗、系统picker实际启动后网页取消通过 |
| 真实目录对象9项 | 201项目录直扫无副本上传/任务，仅授权精确新root；成功后旧busy错误收起，隐藏目录和回退拒绝通过 |
| 活跃处理后的显示端故障 | 观察实际自有FFmpeg后模拟故障，11个所属进程退出、私有HTTP/CDP端口关闭、work空、任务cancelled；212项原件与409项保留文件hash不变 |
| 重开3项 | 任务与精确授权保留且不自动启动任务，重复启动复用同owner/host；空闲显示故障后8个所属进程及两端口退出 |

实际证据 `.mediaslimx/window-tests/r5 中文 space 3fef68a559c64429a5888d6f26db6c1e/` 中的 `window-ui-report.json`、`window-native-directory-drop.json`、`window-close-report.json` 和 `window-reopen-report.json`。此次无关服务基线与结束时均为8765不可达、8766可达；没有向其他实例发送停止命令，不将8765的既有状态解释为本轮关闭。显示故障由CDP触发，目录测试使用真实WebView2目录对象，均不冒充物理X/YesNo或Explorer手拖。

普通浏览器的WSL兼容回归14行为、20panel、24helper、5workbench通过，证据 `.mediaslimx/import-tests/wsl-guidance-94929069-d598-4a13-8f92-cfd7de2784bb/report.json`，自有41434端口已关闭。引擎25项双平台及窄桥44项WSL/Windows27+17项风险检查另行保留；不将其当作干净Windows验收。

### r5人工协作关闭与证词更正

用户实际点空闲标题栏X，机器核对当时13项任务已完成、所属进程与私有端口退出，224原件及既有结果保持；空闲无需确认，证据 `manual-idle-close-report.json`。另一次繁忙X后用户选择“否”，机器确认同owner/host存活、任务running且实际FFmpeg继续，此分支通过。

最后一次X关闭后用户两次更正，未看到或确认点击Yes，先前Yes说法撤回。只读核验得到20项success、任务completed，`yes_confirmed=false`、`remaining_cancel_observed=false`；231原件、426保留文件与20结果hash保持，所属后台/私有端口已退，8765=false/8766=true基线不变。不能将其写成繁忙Yes确认或剩余队列取消验收。证据均在上述r5测试根，最终记录 `manual-busy-close-report.json`。20合成硬链接视频与单核/低优先级仅限隔离测试owner，不是产品设置，也未改变其他进程。

运行包 `.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r5.zip`，候选目录 `.mediaslimx/packaging/candidates/validation-candidate-windows-window-r5/MediaSlimX/`；真实解压目录 `.mediaslimx/packaging/window-zip-r5-da674dacb4244efd92087969df5d8294/MediaSlimX/`。三项原分发阻塞不变，未发布、上传或重启。

## 窗口r4历史候选与实际主窗检查（2026-10-17）

`windows-window-r4` 增加单个真实本机目录拖入直扫的窄通道，并修复未登记默认输出/备份目录被扫描的问题。原生host已离线重编并保存与新C#匹配的材料，构建器15项复核通过后生成新候选，不覆盖r3或更早产物。

| 项目 | 实测 |
|---|---|
| 运行 ZIP | 37,801,460 bytes / 36.05 MiB |
| 完整解压 | 84,967,872 bytes / 81.03 MiB |
| ZIP SHA-256 | `32cfbd14aac7703d6fd4e7dbf7e074ffaa23895b67e5ecee423be162a472fde4` |
| Payload SHA-256 | `e0a1917e029de6c9ab5d365ed74bdf0419ec01f7fd20084c7da18b7ea5a65e9a` |
| 源码树 SHA-256 | `21c4a407adb22fb1274ab12b0d42c3655c9ec9c86de4d92756fa34d51304e36d` |
| 新窗口材料清单 SHA-256 | `fc09045c7bf7b61df38403ac5de6dd197eafbd7e5c7a349c76c614c6025ec24e` |
| 对应源材料 ZIP | 278,241,630 bytes，独立于运行包 |
| 材料 ZIP SHA-256 | `93436981b54edc329cec562bc933554287763d176a67ca5e8e5834bde41b6784` |

r4真实ZIP已独立完整解压，1397项文件、PE GUI子系统确认；8项静态资源的源码/ZIP/解压字节与SHA全部一致。证据 `.mediaslimx/packaging/window-zip-r4-08682eb958c6469ea1e1218db8c7b86a/static-assets-report.json`。新窄桥风险检查WSL44项通过、Windows旧27项与新17项通过，Engine25项两平台通过，前端语法与collector单元16项通过；后续实际主窗范围如下，与这些风险检查分开记录。

### r4实际窗口与真实目录对象

独立真实ZIP主窗12项通过：200/201导入引导，目录选择取消/400失败保留状态；合成目录扫描201项并排除4个目录，201项真实压缩全部success及CSV；五格式逐项success与CSV/原件hash；100%图片放大、视频、中英/明暗4组布局、系统picker真实启动后网页取消，以及两项任务持久化。

真实WebView2目录对象专测9项通过，含201项目录自动扫描、未授权新目录只新增精确root授权、无额外上传/任务，以及隐藏目录和回退路径拒绝。随后复核发现重复拖入忙碌错误会残留至扫描成功，r5仅修复这一提示收尾，并增加成功后错误区隐藏断言。未把当时9项检查扩大为没有发现任何问题。

观察自有FFmpeg实际running后经CDP模拟显示端故障，11个所属进程（含bootloader）全部退出，HTTP/CDP端口关闭、work空、任务cancelled；212项合成原件hash及409项保留文件不变，8765/8766前后可达。同一测试数据重开3项通过：任务与精确新目录授权保留、不自动启动任务、二次启动复用同owner/host；空闲显示端故障后8个所属进程及两端口退出。

证据目录 `.mediaslimx/window-tests/r4 中文 space 524a2e69ea79473496a38fb7c5bd0f12/`，包括 `window-ui-report.json`、`window-native-directory-drop.json`、`window-close-report.json` 与 `window-reopen-report.json`。这些是实际WebView2/目录对象及显示端故障验证，不冒充物理X/YesNo点击或Explorer手拖；CUA初始化问题仍使物理点击未验，用户协助尚未获得结果。

从r4实际解压EXE在受限PATH中运行PDF worker四组全部通过：合成PDF检查、实际压缩及页面/流摘要一致、坏JSON/未知操作拒绝、原件SHA保持。报告 `.mediaslimx/packaging/window-workers-0ed1c0339b25484381f8a761502d5328/report.json`。打包验证只启动自己的无界面worker，没有开启r4主窗或服务。

运行包 `.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r4.zip`；候选程序目录 `.mediaslimx/packaging/candidates/validation-candidate-windows-window-r4/MediaSlimX/`，真实ZIP解压目录 `.mediaslimx/packaging/window-zip-r4-08682eb958c6469ea1e1218db8c7b86a/MediaSlimX/`。开发没有向用户默认实例发送停止命令或改写其数据；不根据事后旧PID记录断言它此前或此时存活。三项原分发阻塞保留，未上传、发布或重启。

## 窗口r3历史候选与前置检查（2026-10-17）

`windows-window-r3` 更新导入限制与大批量目录扫描引导、取消/失败保留状态、独立配额管理及短桌面操作可达；后端限制不变。复用r2相同的FFmpeg、Python review-r2和WebView2 host材料，不重编原生组件或更新用户正在运行的实例。

| 项目 | 实测 |
|---|---|
| 运行 ZIP | 37,797,147 bytes / 36.05 MiB |
| 完整解压 | 84,956,067 bytes / 81.02 MiB |
| ZIP SHA-256 | `9d386acc2684dbf26d6b62418e38a34c3705e42e8fbb8e7321d028a23d413b00` |
| Payload SHA-256 | `9824370c280ed18fd7c52861ca34d31e269e3019501270551813d538f58bf9c8` |
| 源码树 SHA-256 | `077ec12faee75b3a2116b79dfdcadf7b9015aea91a9395c73f2dcf4868fbbf4a` |
| 复用窗口材料清单 SHA-256 | `8a127528eb034be24b48b7402879429936a735640261db3763abd522500787c3` |
| 对应源材料 ZIP | 278,206,332 bytes，独立于运行包 |
| 材料 ZIP SHA-256 | `5d910303e2de2b55fd0f62db5ba42500859697d51d84af157b379873d295e139` |

真实ZIP已完整解压，1397项文件、PE subsystem=2（GUI）。从r3实际解压EXE在受限PATH运行PDF worker四组通过；`app.js`、`index.html`、`style.css`、`storage.js`、`import-tree.js`、`i18n.js`、`i18n-catalog.js`、`theme.js`八项源码/ZIP/解压字节及SHA全部一致。打包检查阶段没有启动r3主窗；后续实际WebView2验证了导入200/201与取消/失败引导，但扫描得到203而非201，暴露默认目录名排除缺陷，已在r4修复，不称r3完整窗口验收通过。

导入引导源码在Windows原生Chrome与WSL/Linux Chrome分别通过14行为、20panel、24helper、5workbench检查；collector单元16项和旧备份引导4组通过。它们是独立源码服务/浏览器检查，不是r3原生主窗、实体手机或干净Windows验收。原有WSL导入回归最终6项通过，但首轮30秒XHR等待超时尚未定位，诊断与原脚本复跑后通过；详见 [平台记录](platforms.md)。

运行包为 `.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r3.zip`，候选程序目录 `.mediaslimx/packaging/candidates/validation-candidate-windows-window-r3/MediaSlimX/`。独立解压为 `.mediaslimx/packaging/window-zip-r3-755b85c7d6c043fda595307c17d4f048/MediaSlimX/`；静态证据在该解压根旁 `static-assets-report.json`，PDF证据 `.mediaslimx/packaging/window-workers-dc9f2647258347279c7bc4ebb7be91bf/report.json`。

需要换包时由用户自行结束旧实例后使用新包，开发验收没有停止、替换用户r2或操作其任务数据。三项原发布阻塞保持，未上传、发布或重启。

## 窗口r2历史候选与原生主窗实测（2026-10-17）

`windows-window-r2` 包含线程启动/停止异常收尾、无Pictures目录时默认范围、页面内图片放大，以及窗口显示后按当前屏幕工作区夹紧尺寸和位置的修复。已重新离线编译原生host、校验最新材料并冻结构建，不覆盖r1或浏览器r3。

| 项目 | 实测 |
|---|---|
| 运行 ZIP | 37,792,731 bytes / 36.04 MiB |
| 完整解压 | 84,943,748 bytes / 81.01 MiB |
| ZIP SHA-256 | `1b34983bd5fcbc0af95b4ccb6fcc1dac015c34e14a6207d7bae1a7ce729bd77f` |
| Payload SHA-256 | `cb021caceb892ade31ec06f690ce52b6c78bd432a0a17246d7b3d81d566504f0` |
| 源码树 SHA-256 | `1f76580d63ce0095d621a62987140e96c73b2a89d542cc0877311fbfcb85ad31` |
| 窗口材料清单 SHA-256 | `8a127528eb034be24b48b7402879429936a735640261db3763abd522500787c3` |
| 对应源材料 ZIP | 278,183,586 bytes，独立于运行包 |
| 材料 ZIP SHA-256 | `564a8b9f5d2be7018e9c1c80bc9fc02d5c1400187d4e298b0da78e6b962e7d9d` |

新ZIP已实际完整解压到独立测试目录，共1397项文件；确认EXE为PE subsystem=2（GUI，无控制台）。受影响的后端风险检查在Windows、WSL各56项通过，最后窗口模块17项各通过；两平台页面图片放大均完成20组布局及完整交互，页面错误0、外部弹窗0。这些是各自执行快照，不能相加当作新的全量测试总数，也不是实体手机或干净Windows验收。

从r2实际解压EXE，在不含Python/FFmpeg的PATH下运行PDF worker四组全部通过：普通合成PDF检查、真实压缩与页面/流摘要一致、坏JSON/未知操作拒绝、源文件SHA-256保持。证据：`.mediaslimx/packaging/window-workers-e81157c470794664af32757a3c8b2819/report.json`。仅启动测试自己的无界面worker，没有用它替代完整主窗交互、关闭确认或原生目录人工点选验收。

### 实际解压窗口验证

在原生 Windows 当前主机上，从真实ZIP独立解压目录启动EXE，使用中文带空格的合成素材目录、独立任务数据、不同工作目录，以及不含Python/FFmpeg的PATH。通过仅对测试进程设置的临时回环CDP检查真实WebView2页面；产品默认不启用调试端口。

| 检查 | 实际结果 |
|---|---|
| JPG、PNG、静态WebP、普通MP4、普通PDF扫描与默认导出 | 4成功、WebP 1无收益；原件SHA-256保持 |
| 图片原件/结果与应用内放大 | 100%查看、嵌套Esc和返回焦点通过，无外部新窗口 |
| 视频与报告 | 实际播放通过；点击CSV按钮下载到测试指定目录，逐项相对路径核对通过 |
| 中文/English、主题与布局 | 实际窗口切换正常，无横向溢出、页面错误或应用发起的外部窗口 |
| 系统目录窗口 | 冻结助手实际启动，认证API取消后返回空选择；没有声称人工点选目录通过 |
| 二次启动 | 同一数据目录激活同一owner/host；未额外创建后台 |
| 备份覆盖与恢复 | 合成JPG先备份再原位优化，实际恢复原件SHA-256，备份保留 |
| 重开窗口 | 同一测试数据中的已完成任务仍可读取 |
| 活动编码时显示进程故障 | CIM确认所属FFmpeg正在运行，API任务为running后，经同一测试脚本发出CDP Browser.close；最终任务cancelled、该文件取消 |
| 故障后的收尾 | 登记的10个所属进程全部结束、work空、window.json移除；6项合成原件指纹、已完成任务、CSV和备份保留，原有8765/8766服务可用 |

完整证据位于忽略目录 `.mediaslimx/window-tests/portable 中文 space 150fdca05ea34439880d001fdcc9c058/`，包括 `portable-ui-report.json`、`portable-close-report.json` 和 `portable-webview-english.png`。关闭测试是实际显示进程故障后的安全排空，不是物理标题栏叉号点击。叉号事件/繁忙确认分支另有协调器测试；其原生人工点击、缺Runtime提示的人工观察、普通账户和干净Windows仍未完成，不以本机已有依赖代替这些验收。本轮没有重启、启动Sandbox、发布或上传。

The actual unpacked r2 window passed five-format scanning/export, in-app image zoom, video playback, CSV-button download, picker cancellation, language/theme switching, repeat activation and JPEG backup/restore on the current Windows host. After an observed active FFmpeg encode, simulated display-process loss drained the owned service: the task was cancelled, all ten observed owned processes exited, scratch files were removed, and originals/results/reports/backups remained. Physical titlebar/confirmation clicks, missing-Runtime observation and clean-Windows acceptance remain separate pending checks. CDP was enabled only for these isolated tests.

运行包位于 `.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r2.zip`，对应可执行目录为 `.mediaslimx/packaging/candidates/validation-candidate-windows-window-r2/MediaSlimX/`；ZIP独立解压验证目录为 `.mediaslimx/packaging/window-zip-r2-60817caa6b3f4350ac9a50943698b0cd/MediaSlimX/`。未捆绑WebView2 Runtime，仍有原三项分发阻塞，状态保持 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`，未上传、签名或发布。

## 窗口r1历史快照（2026-10-17）

`windows-window-r1` 在本机原生 Windows x64、Python 3.12.14、PyInstaller 6.16.0 环境构建，使用 `--windowed` 和锁定的 WebView2 SDK 1.0.4258.31。已有浏览器 r3 候选及其验证证据保留。

| 项目 | 实测 |
|---|---|
| 运行 ZIP | 37,788,573 bytes / 36.04 MiB |
| 完整解压 | 84,931,564 bytes / 81.00 MiB |
| ZIP SHA-256 | `3a811c75b83045ea3f0adbff91b6067919bdcef6949da8afb293d562ca1fe502` |
| Payload SHA-256 | `f5f4fa15f2030af356489c3aaec04cb581f7eb434c087418270443a5a64640c8` |
| 对应源材料 ZIP | 278,164,208 bytes，独立于日常运行包 |
| 材料 ZIP SHA-256 | `6711770a3f20a202ebfa7143f728ae24c3e2a318e21f42acbde583c093baf1b4` |

材料及兼容门槛测试在 Windows、WSL 各 14 项通过，涵盖损坏/越界材料、SDK 与源输入不符、私有 WebView 测试缓存排除、源码白名单，以及旧浏览器验收不能代替窗口验收。真实 GUI 子系统 EXE 的 PDF worker 在无 Python/FFmpeg 的 PATH 中通过四组检查：合成普通 PDF 检查、实际压缩与页面/流摘要校验、无效操作及坏 JSON 拒绝、原件 SHA-256 保持。没有用这些 worker 检查替代窗口显示、系统目录交互或干净 Windows 验收。

运行包位于忽略目录 `.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r1.zip`；对应可执行目录为 `.mediaslimx/packaging/candidates/validation-candidate-windows-window-r1/MediaSlimX/`。文件名带 `validation-candidate`，状态仍为 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`，未上传发布。
