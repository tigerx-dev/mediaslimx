# Windows 与 WSL：运行、路径和实测
## 实际运行结果
截至2026-10-20，源码网页已验证Windows原生Python 3.12.14 + FFmpeg 9.0 + Windows Chrome，以及WSL2 Python 3.10.12 + FFmpeg 4.4.2 + Linux Chrome；Windows便携候选另用官方Python 3.13.16在本机实际WebView2中完成合成素材的五格式扫描、导出和结果检查。WSL结果不能当作独立Linux服务器、所有发行版或实体手机验收。

源码运行需要相应平台Python 3.10+，Windows创建 `.venv-win`、Linux/WSL创建 `.venv`；虚拟环境依赖基础Python，不是可直接搬走的便携包。窗口源码首次准备还需要锁定SDK和Windows .NET Framework编译器；源码环境的 PDF 依赖按 README 单独安装。

以上安装要求针对源码启动。Windows x64便携包自带Python、Pillow、PDF、FFmpeg/ffprobe，使用独立数据与端口；最新本机候选 `refresh-20261020-r2` 为 38,160,897B（36.39MiB），要求**已安装 WebView2 Evergreen Runtime**，不捆绑或自动安装 Runtime，不打开外部浏览器。便携用户无需运行 pip。旧候选各自保留原产物与证据，不把旧包的人工物理关窗结果转记新包。当前候选仍需最终材料重新封装与真实干净 Windows 验收，仅供本机验证、未公开分发。见 [便携构建](packaging.md) 与 [Windows窗口](windows-window.md)。

## 已完成验证快照（2026-10-17）

表内各行表示对应阶段实际执行结果；定向测试可能与全量快照重叠，不相加计算总数。旧r3、当前源码窗口和新窗口ZIP的验收范围分别保留。

| 验证 | Windows 原生 | WSL |
| --- | --- | --- |
| 窗口生命周期阶段 unittest 全量快照 | 166 | 166 |
| 该次通过 / 跳过 | 165 / 1（本机会话无文件符号链接权限） | 151 / 15（Windows 专用进程、便携及窗口测试） |
| 后续材料/构建定向检查 | 14项通过 | 14项通过 |
| 新空间清理风险测试 | 完成，符号链接用例按权限跳过 | 完成，含符号链接与硬链接 |
| 空间管理实际浏览器流程 / 布局 | 7 / 48，页面错误0 | 7 / 48，页面错误0 |
| 原有双语工作区布局回归 | 226组，错误0 | 226组，错误0 |
| 浏览器r3实际解压便携EXE | 8组流程通过，历史记录 | 不适用 |
| 窗口r1 ZIP解压/GUI子系统/PDF worker | GUI子系统确认；PDF 4组通过 | 不适用 |
| 窗口r2 ZIP解压/GUI子系统/PDF worker | 1397项文件、GUI子系统确认；PDF 4组通过，历史记录 | 不适用 |
| 窗口r3 ZIP解压/GUI子系统/PDF worker | 1397项文件、GUI子系统确认；PDF 4组通过，历史记录 | 不适用 |
| 窗口r4 ZIP解压/GUI子系统/PDF worker | 1397项文件、GUI子系统确认；PDF 4组通过，历史记录 | 不适用 |
| 当前窗口r10实际解压EXE / PDF worker / 静态资源 | 合成异常任务启动、手动续做与桌面/窄窗卡片边距4项，旧结果及原件哈希保持、自有进程/端口退出；PDF 4组、静态6项三方一致 | 不适用 |
| 官方 Python 3.13 窗口 r1 实际解压 EXE | 独立 WebView2 12 项流程通过；201 文件导出、五格式、CSV、预览与原件 SHA；PDF worker 4 组，213 项单元测试通过/2 跳过 | 不适用 |
| 历史窗口r7 ZIP解压/GUI子系统/PDF worker | 1341项文件、GUI子系统2；PDF 4组通过 | 不适用 |
| r7十二项静态资源源码/ZIP/解压字节 | 全部一致 | 不适用 |
| r7实际主窗/目录对象/关闭UI/布局/重开 | 12项/9项/7项/21组/3项通过 | 不适用 |
| r7实际产品Quit与安全退出终态 | running时退出，2success/18cancelled；231原件/409既有文件及2结果SHA保持，所属PID/端口自然退出 | 不适用 |
| 窗口r5 ZIP解压/GUI子系统/PDF worker | 1397项文件、GUI子系统确认；PDF 4组通过，历史记录 | 不适用 |
| r5八项静态资源源码/ZIP/解压字节 | 全部一致，打包验证未启动主窗 | 不适用 |
| r5实际ZIP主窗/真实目录对象/重开 | 12项/9项/3项通过，含旧busy提示隐藏 | 不适用 |
| r5活动编码显示故障收尾 | 11个所属进程及两私有端口退出；212原件/409文件hash保持 | 不适用 |
| r4实际主窗/真实目录对象/重开 | 12项/9项/3项通过，历史范围 | 不适用 |
| r4八项静态资源源码/ZIP/解压字节 | 全部一致，打包验证未启动主窗 | 不适用 |
| 新目录窄通道风险检查 | 旧27项与新17项通过 | 44项通过 |
| 默认目录名排除修复Engine检查 | 25项通过 | 25项通过 |
| r3八项静态资源源码/ZIP/解压字节 | SHA与实际字节全部一致，未启动主窗 | 不适用 |
| 新导入引导源码浏览器验证 | 14行为/20panel/24helper/5workbench通过 | 14行为/20panel/24helper/5workbench通过 |
| 本轮原有导入流程回归 | 本轮未重复执行 | 6项通过；首轮超时后复跑，详见下文 |
| r2实际ZIP主窗/媒体/CSV/目录取消 | 五格式4成功/WebP无收益；原件SHA保持；布局/交互0错误 | 不适用 |
| r2备份覆盖/恢复/重启持久化 | 真实JPEG恢复，备份保留，重启任务可读；二次EXE同实例 | 不适用 |
| r2实际显示进程故障退出 | 活动FFmpeg期间取消1项；10个所属进程结束，原件/历史保留 | 不适用 |
| r2修复受影响后端风险检查 | 56项通过；最后窗口模块17项通过 | 56项通过；最后窗口模块17项通过 |
| 页面内图片放大布局/交互 | 20组布局及完整交互通过，0错误/0外部弹窗 | 20组布局及完整交互通过，0错误/0外部弹窗 |
| 源码实际WebView2窗口 | 两张合成图片扫描导出2项成功；二次启动复用 | 不适用，保留网页 |
| 源码显示进程异常退出 | 62张合成图处理中安全取消；8个所属进程结束，既有服务保留 | 不适用 |
| r5物理标题栏关闭协作 | 空闲X、繁忙X后选否通过；最后Yes证词撤回，未验剩余取消 | 不适用 |
| r7人工物理标题栏X | 繁忙X后继续使用仍running；再点X选安全退出，19成功/41取消，原件/结果SHA及自有后台收尾通过 | 不适用 |
| r7 Explorer手拖、目录人工点选、缺Runtime/干净Windows | 尚未验收，和物理标题栏X结果分开 | 不适用 |
| DESIGN.md 离线校验 | 共用规范0 errors / 0 warnings | 共用规范0 errors / 0 warnings |

空间清理验证使用独立合成JPEG、独立任务库/服务，核对原文件、导出、备份、CSV、ZIP、结果预览与处理指纹保留；确认前取消不删、确认变化拒绝、清理后旧扫描失效、重启不自动续删。普通文件夹扫描/优化原行为继续保留。浏览器短窄尺寸仅为视口模拟，不代表实体手机实测。

浏览器r3便携EXE测试从ZIP真正解压到中文带空格目录，在仅含System32的PATH下处理图片、MP4、PDF和导入副本；不是干净Windows机器测试。自动浏览器打开验证发起动作，原生选择器验证窗口显示和取消，未宣称人工点选目录或实际默认浏览器UI验收。这些记录不转记到新的窗口payload。

窗口r1阶段已实际构建、ZIP完整解压并确认PE GUI子系统；真实GUI-subsystem EXE在受限PATH下完成PDF检查、实际压缩及页面/流摘要一致、坏JSON/未知操作拒绝、原件SHA保持四组检查。源码实际WebView2两张合成图片导出成功，重复pythonw启动与不同工作目录的 `start-window.ps1` 启动均复用同一窗口实例。这些测试不等于实体系统叉号关闭、原生目录人工点选或干净Windows验收；当前CUA在WSL工作目录初始化失败，未把无法执行的系统UI点击标成通过。r2真实ZIP结果见下文及 [窗口验证边界](windows-window.md)。

源码显示进程故障另有实测：处理62张合成图片时，通过临时CDP `Browser.close` 结束显示端，后台任务安全取消（1成功/61取消），work空、窗口记录移除，登记的8个所属进程均退出，原件SHA保持；已有8765/8766服务仍可用。CSV导出、结果图片HTTP预览与英文切换通过。该方式模拟显示进程异常，不能记作物理X点击。证据：`.mediaslimx/window-tests/window space aa143e38c90b46318f463d0147b70390/source-close-validation.json`。

窗口r1及166项回归保留为阶段快照。随后发现的线程启动/停止异常、无Pictures默认范围和图片放大边界已经修复，原生host显示后按当前屏幕工作区夹紧窗口；按稳定源码和新host材料重新构建了r2，不复用r1指纹。受影响56项风险检查与最后17项窗口检查在两平台通过，页面内放大各20组布局/交互通过，不将不同执行相加为全量总数。

r2运行ZIP SHA-256为 `1b34983bd5fcbc0af95b4ccb6fcc1dac015c34e14a6207d7bae1a7ce729bd77f`，完整解压84,943,748B（81.01MiB）。r2真实解压EXE的PDF四组已通过，证据 `.mediaslimx/packaging/window-workers-e81157c470794664af32757a3c8b2819/report.json`。

r2实际ZIP主窗在受限PATH、不同CWD、中文空格目录中，通过JPG/PNG/WebP/MP4/PDF五格式真实扫描导出（4成功/WebP无收益，原件SHA保持），页面内100%放大/Esc/回焦、CSV按钮实际下载、视频播放、系统picker取消、英文与主题切换均通过，无溢出、页面错误或外部新窗口。二次EXE保持同owner/host；真实JPEG备份覆盖与恢复后备份保留，同数据重启后任务持久可读。

在自有FFmpeg活动且任务running时，以临时CDP `Browser.close` 模拟显示进程故障，任务cancelled（1项取消），10个登记所属进程全部结束、work空、window.json移除；完成任务/CSV/备份与6项原件SHA保持，8765/8766原服务仍可用。证据 `.mediaslimx/window-tests/portable 中文 space 150fdca05ea34439880d001fdcc9c058/portable-ui-report.json` 与 `portable-close-report.json`，另有实际英文主窗截图。物理X与繁忙确认、目录人工点选、缺Runtime和干净Windows仍未实测；实际显示端故障收尾不替代这些边界。

窗口r3历史ZIP SHA-256为 `9d386acc2684dbf26d6b62418e38a34c3705e42e8fbb8e7321d028a23d413b00`，完整解压84,956,067B（81.02MiB）。实际解压EXE的PDF四组通过，证据 `.mediaslimx/packaging/window-workers-dc9f2647258347279c7bc4ebb7be91bf/report.json`；8项静态资源与源码/ZIP/解压字节一致，证据 `.mediaslimx/packaging/window-zip-r3-755b85c7d6c043fda595307c17d4f048/static-assets-report.json`。打包阶段未启动r3主窗；后续实际前置检查暴露默认目录名排除缺陷，并在r4修复，不能称r3完整主窗验收通过。

窗口r4历史ZIP SHA-256为 `32cfbd14aac7703d6fd4e7dbf7e074ffaa23895b67e5ecee423be162a472fde4`，完整解压84,967,872B（81.03MiB）。实际解压PDF worker四组通过，证据 `.mediaslimx/packaging/window-workers-0ed1c0339b25484381f8a761502d5328/report.json`；8静态三方字节/hash一致，证据 `.mediaslimx/packaging/window-zip-r4-08682eb958c6469ea1e1218db8c7b86a/static-assets-report.json`。

r4后续实际主窗12项、真实目录对象9项、重开3项通过；活动FFmpeg时模拟显示故障，11个所属进程与HTTP/CDP端口结束、work空，212原件SHA及409保留文件不变，8765/8766前后可达。重开后任务和精确目录授权保留、不自动启动任务、二次EXE复用；空闲显示故障后8个所属进程/两端口退出。证据目录 `.mediaslimx/window-tests/r4 中文 space 524a2e69ea79473496a38fb7c5bd0f12/`。随后发现忙碌提示残留并在r5修复，不称当时检查发现零问题，也不冒充物理X/YesNo/Explorer手拖。

当前r10 ZIP SHA-256为 `6ebb5366cca8c5aa7789f1401d3e6e3530cf0d622adcd6810f283fb5b110c5a1`；实际解压窗口的异常任务/续做及结果卡片间距证据 `.mediaslimx/window-tests/r10 中文 space ff4259563e834e2ea54ae62f68ac1ba9/window-resume-report.json` 与 `window-resume-terminal.json`。此测试以合成任务记录构造异常现场后重启，不能视为真实强杀进程实测；空闲页脚退出后的所属进程/端口关闭已独立只读核验。PDF四组和六静态三方hash报告见 [便携构建](packaging.md)。历史r7 ZIP SHA-256为 `5b0662dfab79f67a630a05de1f19528e647d20d16539ee1b0338108150588e34`，旧验收范围保持。r6仅内部过渡构建，未进入交互验收。

r7实际主窗12项、真实目录对象9项、新关闭UI7项/21组布局、重开3项通过。真实running任务由产品Quit触发native Close/OnClosing→协调器→HTML层安全退出，终态2success/18cancelled，231原件、409保留文件及2项成功结果SHA保持；自有PID/HTTP53359/CDP53358自然退出，window.json移除、work空，8765=false/8766=true与基线不变。重开保留任务/精确授权且不自动续跑，二次启动复用；空闲CDP显示故障后8个所属进程/两私有端口退出。自动化证据 `.mediaslimx/window-tests/r7 中文 space bcb26c69f0534989a26d1abde9664177/` 中五份报告见 [窗口记录](windows-window.md)。随后人工物理标题栏X在独立的60项合成任务上确认继续使用仍running，以及安全退出后19success/41cancelled、271原件和19结果SHA保持、自有后台及端口收尾；证据另在 `r7 中文 space 5d2bb4a7d9194771b7b7e12da5aa5dbb/`。Explorer手拖和干净Windows等边界仍保留。

r5历史ZIP SHA-256为 `86878fa51eb9d55eea9b004198a4f08044a885849a4223a1a8af1d8fd4a6be77`，完整解压84,967,885B（81.03MiB）；PDF四组和8静态三方hash证据保持原配套关系。

r5最终真实ZIP主窗12项、native目录对象9项、重开3项全部通过，含201项真实目录压缩、五格式/CSV/预览、中英明暗/系统picker启动取消、成功后旧busy提示隐藏、精确新root授权且不扩父、直扫无副本上传/任务。实际FFmpeg running后模拟显示故障，11个所属进程及两私有端口关闭、work空、任务cancelled，212原件/409文件hash保持；重开持久化及空闲故障8个所属进程退出通过。报告 `.mediaslimx/window-tests/r5 中文 space 3fef68a559c64429a5888d6f26db6c1e/` 下四份window报告。

无关服务操作前/后基线均为8765=false、8766=true，不将8765本轮不可达解释为被本测试关闭，也不声称其被保持运行；未向其他实例发停止命令。WSL普通浏览器最新回归14行为/20panel/24helper/5workbench通过，证据 `.mediaslimx/import-tests/wsl-guidance-94929069-d598-4a13-8f92-cfd7de2784bb/report.json`，所属41434服务已关闭。r5后续人工协作确认空闲X与繁忙X后选否；最后关闭时任务已完成，用户撤回Yes说法，报告 `yes_confirmed=false/remaining_cancel_observed=false`。231原件/426保留文件/20结果保持，所属后台退出；不计作繁忙Yes或队列取消通过，详见 [人工范围与更正](windows-window.md)。Explorer手拖、目录人工点选、缺Runtime与干净Windows仍未验，r5包hash未变。

本轮新导入引导的源码浏览器测试在Windows与WSL各14行为、20panel、24helper、5workbench全部通过，collector单元16项、旧备份引导4组通过。另对WSL原 `tests/import-browser.cjs` 复验，最终6项通过、页面错误0，涵盖JPG/MP4拖入、同名追加、压缩预览、ZIP、取消、清空及孤儿副本清理。首轮曾出现一次30秒XHR等待超时，诊断同流程及原脚本复跑连续通过，尚未定位原因，不能称全过程无失败；产品/测试未因此修改，r3指纹保持。证据 `.mediaslimx/import-tests/wsl-73e5bee1-ee9f-4de0-bbfd-83a932b231b7/report.json`。

历史阶段记录位于 [development-plan.md](development-plan.md)，其中121、128、136等旧测试数量保留当时的执行范围，不与窗口阶段快照混写。

新增7项分发材料测试验证SHA/大小/路径/版本、来源快照仅包含公开白名单、宿主自测不能通过干净环境门槛及证据绑定具体payload。Windows全量运行发现的8.3短路径/长路径比较问题已修复；受影响的7项在Windows和WSL分别复验通过，其余全量结果保留。干净验收准备工具另有3项ZIP路径检查，不能计作真实客体执行。

浏览器r3阶段另增8项停止生命周期测试：开始停止时先取消所属系统目录窗口，覆盖关闭前后spawn竞态、实例隔离、迟到目录结果不授权、HTTP等待顺序、正常Ctrl+C及启动失败清理。该阶段两平台136项全量：Windows135通过/1跳过，WSL122通过/14跳过。HTTP宽限期5秒不等于强制终止任意媒体事务的完成保证。

窗口阶段新增协调器、管道协议、繁忙关闭确认、错误/EOF安全排空、关闭期间变更拒绝与访问校验测试。Windows实际进程测试修复venv redirector下真实worker可能遗留的问题：仅对本实例仍存活的自有Popen PID树收尾，不按进程名称查杀；无关进程保持。该次完整回归为上表166项快照。后续构建门槛14项另外验证SDK源输入、固定文件名单、哈希和私有WebView测试缓存排除，不据此宣称完成干净系统或系统窗口点击。

WSL另以真实 `python -m mediaslimx` 启动LocalServer，实际合成JPEG扫描导出/CSV/原件指纹、SIGINT关闭端口/释放实例锁、同数据同端口复启与报告持久化均通过；两次SIGINT退出码0、没有异常堆栈，约0.27秒。证据 `.mediaslimx/validation-wsl/real-cli-r3-204ad2ec188948028d336a7b034f4be7/report.json`，不把自建uvicorn测试入口当成新CLI本身验证。

2026-10-17 10:58（Asia/Shanghai），在用户明确批准后，经Windows UAC运行Sandbox启用脚本，保留 `-NoRestart`：功能由Disabled变为Enabled，Windows明确返回 `RestartNeeded=true`，此时 `WindowsSandbox.exe` 仍不存在。没有自动重启或启动客体，真实干净Windows验收仍待用户手动重启后执行。启用与只读复查证据位于 `.mediaslimx/clean-windows/enable-sandbox-20261017-105555/`；这个系统功能只用于开发验收，不是便携用户依赖。

## 启动

Windows默认双击 `Start-MediaSlimX.cmd`，经 `scripts/start-window.ps1` 打开独立工具窗口；路径取自 `%~dp0` 与 `$PSScriptRoot`，不依赖调用终端的当前目录。

- 使用 `.venv-win`，数据 `.mediaslimx/windows-window`；从8767–8866选择可用回环端口。
- 首次准备Windows Python依赖与锁定WebView2 SDK，可能联网；已缓存后复用，不混用WSL环境。
- 使用已安装WebView2 Runtime。缺少时提示，不静默下载、不回退到外部浏览器。
- 同数据目录再次启动验证所属窗口后激活，不接管已运行网页服务，不修改原实例的根目录或端口。
- 关闭窗口按所属关系安全取消剩余处理、等待事务与服务退出；运行结果、备份与任务记录保留。实际系统UI关闭的观察状态见上方快照。

需要旧浏览器方式时，双击 `Start-MediaSlimX-Browser.cmd` 或显式运行 `scripts/start-windows.ps1`：

- 使用同一 `.venv-win`，数据仍为 `.mediaslimx/windows`，默认8766、`--desktop --open-browser`。
- 服务完成带令牌的就绪校验后才打开浏览器，不抢先打开无法连接的页面。
- .mediaslimx/windows/server.json 是本机访问能力记录，按允许的回环 URL 与令牌验证，不能引导打开外站。
- 同一数据目录再双击会复用已有服务。要更改根目录或端口，请先停止原实例；已有实例的启动参数不会被第二次命令静默改写。
- PowerShell 执行策略参数仅用于该启动进程，不修改系统全局策略。
- Windows 本地模式才开放系统目录窗口，服务器/WSL 默认不会远程弹出窗口。窗口使用 Windows Python 自带 Tcl/Tk（当前实测 8.6.12）；安装 Python 时需包含 Tcl/Tk，缺少时仍可使用网页目录浏览器。
- 选择器使用独立标准库辅助进程、隐藏的 Tk 父窗口及正常消息循环；基础解释器必须来自同一 Windows Python，不调用 WSL Python。只有窗口辅助进程绕过 venv 转发，压缩服务仍在 .venv-win 内运行。网页取消或关闭面板只终止匹配请求，300 秒超时也会回收。

两种Windows源码入口都只使用本机Windows环境；便携窗口直接双击解压目录的 `MediaSlimX.exe`，使用自带解释器与 `%LOCALAPPDATA%\MediaSlimX\portable`。PowerShell执行策略参数只作用于该启动进程，不改系统全局策略。Windows本地系统选择器要求同一环境的Tcl/Tk，缺少时仍可使用工具内目录浏览器。

普通 Linux 与 WSL 均用 ./start-linux.sh；旧 ./start-wsl.sh 继续转发到同一入口。路径取脚本实际目录，不依赖用户终端的当前目录。
- .venv、8765、.mediaslimx/wsl。
- 默认不自动开浏览器；可加 --open-browser。首版按本机访问说明，不将远程部署作为已验收使用方式。
- 自动创建时只调用 Linux python3，不调用 Windows Python 或复用 .venv-win。

## 明确的路径规则
- Windows：D:\media 或 D:/media；WSL：/mnt/d/media。错误平台会给出解释，不自动转换。
- 两平台数据库、允许目录设置和按端口命名的预览 Cookie 各自独立。
- Windows 本地只支持本地盘符，不接受 UNC/设备路径，避免隐式网络读取。
- 服务器 CLI 默认允许启动目录，源码双击脚本明确授权本项目目录；便携窗口默认用户图片目录，不存在时使用 EXE 所在目录。网页浏览只列出允许范围内目录名和元信息，不读取项目文件内容。
- Windows 系统窗口由用户实际选择后才将该目录授权；授权持久化在该平台的运行数据内。网页请求不能直接提交一个新根目录来扩大权限。
- 默认跳过点号目录、Windows Hidden/System 属性、依赖、输出、备份和重解析点。
- 旧版 .mediaslimx/app 数据没有删除或迁移。WSL 可在停止现有服务后用 --data-dir "$PWD/.mediaslimx/app" 查看旧记录；不要用 Windows 原生解释器操作里面的 WSL 路径记录。

## 原生文件操作
Windows 使用 OPEN_REPARSE_POINT 拒绝重解析文件，并持有目录链的句柄，避免提交期间父目录被重命名或替换。测试用不需要管理员权限的 junction 验证目录边界与置换。
Linux 使用目录描述符、O_NOFOLLOW 和相对描述符原子替换。
文件内容变化仍采用 SHA-256、大小、mtime 校验。两者都不等于完整隔离，处理期间应停止其他写入程序。

## 原有网页与文件操作验收记录
| 行为 | Windows 原生 | WSL |
| --- | --- | --- |
| JPG/PNG/WebP/MP4、AAC 内容一致 | 通过 | 通过 |
| 备份覆盖、冲突跳过、恢复、取消、重复处理 | 通过 | 通过 |
| 真实 HTTP 与鉴权、范围、CSV | 通过 | 通过 |
| 真实 Chrome 目录选择、下拉、预览、视频、恢复 | 通过 | 通过 |
| 320/390/768/1440、深浅主题、44px 目标 | 通过 | 通过 |
| 双击入口中文与空格路径、其他 CWD、实例复用 | 通过 | 不适用 |
| 系统选择器固定参数与授权返回 | 通过 | 按预期禁用 |
| 仅一个系统目录窗口可见、取消回收与两次重试 | 通过 | 不适用 |
| 网页系统选择取消、关闭、错误重试与过期返回 | 通过（返回字段使用协议夹具） | 原生入口隐藏 |
| Windows 系统窗口人工点选 | 未自动验收 | 不适用 |

Windows 浏览器证据：.mediaslimx/validation-windows/；WSL：.mediaslimx/validation-wsl/。
两种测试先后运行，避免同时覆盖共享合成素材。

## 文件导入实测补充
2026-10-16：Windows 原生与 WSL 各自的 Chrome 和独立临时 Python 服务均完成实际 JPG/MP4 字节导入、追加、处理、预览和 ZIP 下载验证。API 拒绝未鉴权、跨源、错误类型、不完整上传及导入覆盖请求；取消/清空保留原素材。后端原始副本和预览在重建 Engine/ImportManager 后仍可用。

两平台默认启动器的 imports、exports-windows / exports-wsl 各自独立；手动 --data-dir 的默认输出位于其父目录的 exports-数据目录名，仍不可与运行数据重叠。不混用两平台数据库。当前数量统一以上方基线为准。

## 文件夹与语言补充
两平台 Chrome 的文件夹拖入与选择、相对结构、超过 100 条目录项、多目录同名、ZIP 和中英切换已分别验证。运行证据使用独立服务，不操作当前任务库。原生系统窗口标题/控件和 OS 诊断不保证随网页语言变化。其他浏览器与 macOS 尚未验证。
