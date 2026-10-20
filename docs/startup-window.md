# Windows 启动状态 / Windows startup states

Windows 独立窗口在原有 Python 服务就绪后打开 WebView2。原生窗口先遮住网页，等本机网页完成会话、运行环境、任务列表、导入副本状态以及最近中断任务的恢复展示后，才揭开遮罩并登记窗口为可用。服务端与 WebView2 均在本机运行；这里没有上传、进度百分比或固定停留时间。服务启动前的准备阶段沿用现有源码启动器；Linux/WSL 和浏览器入口不增加覆盖层。

当前封面以居中紧凑卡片呈现产品名、用途和真实启动状态，名称中的 X 使用 TX 原向标记。深色使用石墨底，浅色使用浅灰底；卡片背后只有很淡的光感，不显示照片、底纹或悬浮文件卡片。产品名下用一句“图片 · MP4 · PDF 批量压缩工具”（英文 “Images · MP4 · PDF batch compressor”）直接说明用途。封面简写 PDF 类别，实际仅处理符合条件的常规非加密静态文件；加密、签名和表单等跳过条件见[第一版规格](v1-spec.md)。真实等待时短活动线循环移动，底部约四分之一画面还有一层低对比薄荷光影缓慢横移；两者只表示程序仍在响应，不表示已完成百分比，也不延长启动时间。工作台就绪或启动失败时光影停止；系统关闭客户端区域动画时保留静态光影与文字状态。等待／失败文案随界面语言切换。版本号由 Python 核心 `__version__` 传给窗口；左下角是版本及独立 GitHub 仓库入口，右下角只保留 `by` 加完整 TIGERX 署名。GitHub 只有用户点击才打开源码仓库，不是现成的便携包下载入口。TIGERX 官网真实地址未确定前，署名不提供空链接。封面既是起始画面，也是**窗口创建后**真实初始化状态的承载面；失败直接在这张画面中显示原因、重试和退出。封面只在需要等待时出现，工作台就绪便移除。

The Windows standalone window covers WebView2 until the local page has loaded its session, environment, task history, import-copy state, and most recent interrupted task when applicable. It reveals the workbench as soon as those steps finish. There is no progress percentage or minimum display duration. Linux/WSL and browser startup stay unchanged.

The compact central card presents the name, an “Images · MP4 · PDF batch compressor” purpose line, and the actual startup state. PDF support remains limited to eligible ordinary, unencrypted static files as documented in the v1 specification. Dark mode uses the graphite background; light mode uses pale gray. There are no file tiles or background images. A short indeterminate activity line and a faint mint glow along the lower portion move only while initialization is still waiting; neither is a percentage or adds delay. The glow stops at readiness or failure and stays static when Windows client-area animations are disabled. Version and a separate user-activated GitHub entry sit at bottom left; small `by` plus the full TIGERX mark sit at bottom right. The GitHub entry opens the source repository, not a portable download. The personal site has no link until its actual address is available.

- 不足 240 ms 已就绪时直接呈现工作台；超过该可见阈值才展示封面及“正在启动本地工作台…”（英文为 “Starting the local workspace…”）。240 ms 是避免闪屏的**显示阈值**，不是人为延时或超时。
- 网页初始化失败、WebView2 Runtime 缺失、配置目录不可访问或工作台 30 秒未响应等情况保留错误界面，说明可处理的原因，并提供“重试 / Retry”和“退出 / Exit”。重试重新载入本地网页或重新初始化 WebView2；退出沿用原有 Python 安全关闭协调。原生错误页可切换中英文。原生窗口出现前的服务启动失败使用 Windows“重试/取消”提示，并在本机 `window.log` 留日志。
- 宿主只接受当前回环服务顶层页面的有界就绪/失败消息，不开放新的 HTTP 关闭或路径接口。源码双击启动会在原生源文件变化时重建窗口助手；若已有同数据目录窗口运行，先由 Python 校验并复用它，待下次全新启动再重建。既有便携验证包不会被原地修改，后续正式包需单独重构建与验收。
- 便携包已内含 Python、图片/PDF 库和 FFmpeg，启动时**不会下载或安装环境**；需要已安装 WebView2 Runtime，缺失时给出可操作说明。源码双击入口的首次虚拟环境、依赖和窗口组件准备发生在这个原生封面创建之前，目前沿用原有引导与错误提示，不能称作由封面覆盖。若要把源码首次安装也纳入同一张画面，需要一个先于 Python 的独立引导宿主，属于后续架构工作。
- 当前只展示本机真实版本，不检查 GitHub、不显示“已是最新”、不自动下载或更新。将来若接入用户主动触发的版本检查，可复用封面版本位置或工作台的非阻断入口，在拿到可信发行信息后才显示更新状态；离线或检查失败不能阻塞本地工作台。具体边界见[版本更新方式](updates.md)。

## 本机实测 / Local verification

2026-10-20 再次用独立编译的 Windows 宿主验证原生系统标题栏：暗色与浅色分别匹配工作台主题，最小化、最大化和关闭仍由 Windows 提供；工作台发送主题变更消息后，宿主也会重新应用标题栏颜色。实现使用系统 DWM 属性，不改为无边框自绘窗。精确标题栏色值依赖 Windows 11 的 DWM 支持；较旧系统保留可用的标准系统标题栏。隔离测试覆盖快速进入、正常等待、中英双语、深浅主题、900×600 窄窗、失败重试、退出、超时和真实 Python 工作台启动，全部通过；实际工作台在本机约 3.28 秒就绪，不代表其他电脑的启动时长。原始报告位于被 Git 忽略的 `.mediaslimx/window-tests/titlebar-final-verified/`。下表公开截图直接复制该轮真实窗口捕获，**未裁切或修饰**，因此边缘保留窗口捕获带入的约 8px 未绘制外框。便携包尚未基于此源码重建或在干净 Windows 验收。

The Windows system caption now follows the dark/light workbench theme while retaining standard window controls. A separate compiled host passed the isolated startup matrix and a real Python workbench launch. The screenshots below are direct, unedited window captures; the narrow exterior black edge comes from the capture API. This source change has not yet been rebuilt into or accepted as a clean-Windows portable package.

2026-10-20 对原生启动卡片再次收紧布局：品牌标记、产品名和简短用途为上组；失败标题、具体原因和紧随其后的“重试 / 退出”为下组，卡片底部保留留白。等待态沿用同一品牌与用途位置，状态线和状态说明在下组区域。主次按钮均为 44px 高、8px 圆角，保留键盘焦点边界，深浅主题分别使用对应语义色。当时使用**独立编译的 Windows 测试宿主**完整重跑快速就绪、约 5 秒等待、中英失败、浅色失败、900×600 中英失败、30 秒超时和实际 Python 工作台启动；测试全部通过，真实工作台就绪约 3.36 秒，正常退出码 0。该轮原始报告和截图在忽略目录 `.mediaslimx/window-tests/startup-layout/captures-final/`，已由上方标题栏主题测试取代为最新交接图。现有正在运行的宿主文件被系统占用，因此这轮没有原地改写它；正式便携包仍需用新源码单独重建和验收。

On 2026-10-20 the native cover was tightened into a brand/purpose group and a nearby failure/reason/action group, with clear space below. Loading keeps the same brand placement. Both action styles use 44px height, 8px corners and visible keyboard focus. An independently compiled Windows host passed the full isolated quick/wait/failure/retry/exit/timeout/900×600 and real-workbench matrix. The current running host and portable package were not replaced; rebuild and validate a future package from this source before distribution.

2026-10-19 在 Windows 的**独立测试宿主**和私有回环页面完成收敛版封面实测；页面只发送受限的就绪/失败信号，未读取任务库或媒体。快速场景约 1.2 秒进入测试页面，无强制停留；延迟场景约 4.8–4.9 秒才就绪，封面真实显示到收到就绪信号；失败场景分别显示中英错误，中文“重试”在服务恢复后进入页面，英文“退出”触发原有关闭请求；完全无回应的页面在 30 秒后进入可重试的超时态。独立窗口在 900×600 的最小尺寸下也检查了英文等待和失败态，修复了版本号换行，正文、按钮与页脚互不遮盖。另用实际 Python 服务、真实网页和空的合成媒体目录启动一次，约 2.8 秒后进入工作台，正常关闭的 owner 返回码为 0、私有媒体计数为 0。原始 JSON 报告保存在被 Git 忽略的 `.mediaslimx/window-tests/startup-host/compact-v3/startup-smoke-report.json`，修正页脚后的定向截图在 `compact-v3-final/`。以上时间仅记录该测试主机，非产品启动承诺。

The local matrix exercised fast, delayed and failed starts through the real Windows host and WebView2, with an isolated loopback test page. A separate run exercised the real Python service and workbench with an empty synthetic media root. This is not a clean-Windows portable-package acceptance result.

底部光影加入后，以相同隔离方式重新编译并完成最终矩阵：快速启动约 0.98 秒进入工作台；中英深色、中文浅色及 900×600 英文等待态均在约 4.8 秒就绪；失败重试、退出和 30 秒超时处理通过；实际 Python 服务在空合成媒体目录下约 2.8 秒就绪，正常关闭返回码 0。最终报告与未裁切截图在 `.mediaslimx/window-tests/startup-host/bottom-ambient-final/`。检查截图时还发现透明子控件可能让产品 X 偶发显示为空方块，现改为直接随卡片绘制并在最终截图确认。`assets/launch/startup/` 的六张实际截图已用这轮结果更新。测试机的 Windows 客户端区域动画开关处于启用状态；关闭动画的静态分支已实现，但尚未在系统开关关闭的机器上目视验收。

The final isolated Windows matrix passed quick start, bilingual dark and light waiting states, the 900×600 layout, retry, exit, timeout, and a real Python workbench launch with an empty synthetic media root. The actual screenshots were refreshed from that run. The non-animated Windows accessibility branch is implemented but has not been visually checked with the OS animation setting disabled.

The portable build already includes Python and its media engines, so the cover does not imply an online environment download. Source-launcher dependency preparation currently precedes the native window. The version is supplied by the Python core; update availability is neither checked nor claimed in this build.

测试脚本为 `tests/windows-startup-smoke.py`；最新一轮原始报告和完整产品界面截图留在被 Git 忽略的 `.mediaslimx/window-tests/titlebar-final-verified/`。截图工具使用 Windows 的窗口绘制抓取并锁定测试进程窗口，避免把其他前台窗口误当成产品画面。本次供审阅的**实际原生窗口截图**在 `assets/launch/startup/`：

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `loading-zh-CN.png` | 中文真实等待态 | TX 案例辅助图 |
| `loading-en.png` | 英文真实等待态 | 双语说明/对照 |
| `loading-light-zh-CN.png` | 浅色主题中文等待态 | 主题对照 |
| `loading-small-en.png` | 最小 900×600 窗口英文等待态 | 小窗口可读性证明 |
| `error-zh-CN.png` | 中文失败与重试/退出 | 功能说明，不作为首图 |
| `error-en.png` | 英文失败与重试/退出 | 双语功能说明 |
| `error-light-zh-CN.png`、`error-light-en.png` | 浅色主题中英失败态 | 深浅主题对照 |
| `error-small-zh-CN.png`、`error-small-en.png` | 900×600 窄窗口中英失败态 | 文字换行与操作可达性 |

另存的 `concept-review.html` 与 `concept-dark/light-zh/en.png` 是修改前确认视觉主次用的静态稿，不作为实际运行或验证证据；上表截图来自编译后的 WinForms 宿主。

这些截图来自**受控延迟或失败的隔离测试**，是实际 Windows 窗口，不代表产品每次启动都会出现加载态或发生错误。TX 案例页首图与本启动状态素材是两类资产；建议仅把等待截图作为小型流程补图，勿替换案例主视觉、勿把错误态当成常规界面。图片无用户任务、FIRANO 素材或访问令牌。完整工作台画面应使用现有产品截图资产另行选取。

**交接给 TX：**从项目目录复制 `assets/launch/startup/loading-zh-CN.png`（需要英文时配 `loading-en.png`），说明文字可用“Windows 独立窗口仅在实际等待时显示本地工作台加载状态；就绪后直接进入。” 发布前按 TX 自己的素材策略决定放置位置；本轮没有修改 TX，也没有上传。
