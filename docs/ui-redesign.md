# v0.2 桌面工作台：设计、实现与验收
## 原界面审视
原页面保留了媒体可靠性流程，但目录只能输入文本；设置为长表单；浅色表面层次单一；原生下拉箭头缺乏可控间距；任务选择缺少即时反馈。
本次采用既有 HTML/CSS/JS 和 Python，不重写媒体处理架构，不增加前端构建依赖。

## Host inspection
| Concern | Observed host evidence |
| --- | --- |
| Framework | FastAPI 0.143.2 + 原生网页，requirements-lock.txt、mediaslimx/app.py |
| Route | GET /，mediaslimx/app.py → mediaslimx/static/index.html |
| Component system | 原生语义 DOM；app.js 的 enhanceSelect、目录 dialog 与既有媒体详情 |
| Tokens / theme | style.css 的语义变量，theme.js 在首绘前读取本地主题偏好 |
| Tailwind | 未安装、未编译；没有产品 package.json 或前端构建链 |
| Dependencies | 保留 FastAPI/Uvicorn/Pillow；Windows 句柄用标准库 ctypes，系统选择用 Windows Python 标准库 Tk 独立进程 |

## Page Plan
Job：在运行设备选择媒体，了解处理范围，完成可追溯的优化和恢复。
Scene：Product Mono，石墨深色工作台，薄荷色用于选择、主操作和实际成功状态。
Archetype：本地媒体工作台，保持一个主文件面板与相邻参数区。
Primary action：选择目录 → 扫描 → 勾选与设置 → 开始优化。
Primary state：idle → pending → files/settings → running → results/error/recovery。
| Region | Product purpose | Published component | State or motion |
| --- | --- | --- | --- |
| 应用栏/侧栏 | 定位平台、主题和真实历史 | none | 当前任务选中反馈，主题偏好重载保持 |
| 目录入口 | 在允许范围内找到文件夹 | none | 网页浏览、上下级、真实系统选择；打开/关闭与焦点返回 |
| 文件/参数面板 | 在保留文件上下文时配置任务 | none | 宽屏并排、窄屏纵排；统一下拉、勾选和参数反馈 |
| 进度/结果/详情 | 呈现真实状态与恢复结果 | none | 真实文件数进度、详情展开、恢复冲突、取消 |

Registry：所有区域为 none。当前宿主没有 Tailwind；按用户少依赖要求不增加构建链，不安装/模仿 Registry 组件源代码。
Responsive：320、390 窄屏；768 单列参数；1440 文件与参数并排。
Theme：默认 dark，可切 light；语义角色一致，页面不混用两种主题。
Motion：弹窗/菜单 240ms，cubic-bezier(.23,1,.32,1)，仅 opacity/transform；按钮反馈 140ms。真实进度直接来自任务，不能用动画制造完成百分比。
Reduced motion：位移/动画降至 1ms，保留状态、键盘、焦点和操作。

## 组件规则
- 所有交互节点至少 44×44px，包含真实 checkbox/radio，而不只是外部标签。
- 下拉保留原 select 作数据源，定制按钮/listbox 作展示；统一箭头内距、列表高亮、选中标记与焦点环。
- 下拉支持方向键、Home/End、Enter/Space、Escape、Tab 和外部点击。不能用只可鼠标点击的 div 模拟。
- 每个目录字段提供选择按钮。网页目录浏览不使用 file input 或浏览器上传；浏览的是运行设备。
- 异步扫描与历史读取有 intent 版本，目录浏览有独立版本；较旧响应不能覆写新的用户意图。
- 静态空状态不含样例指标，扫描/结果都是合成素材真实执行产生的记录。
- 没有照片装饰、外部字体、CDN、账号或广告。保留统一 SVG 线条图标与真实 favicon。

## Acceptance
命令：
- .venv-win/Scripts/python.exe -m unittest discover -s tests -q：45/45，exit 0。
- .venv/bin/python -m unittest discover -s tests -q：38 pass + 7 Windows-only skip，exit 0。
- 两平台 compileall、pip check、node --check：exit 0；bash -n start-wsl.sh：exit 0。
- 原生 Windows Node+Chrome 和 Linux Node+Chrome 分别执行 tests/browser-smoke.cjs、tests/ui-audit.cjs：exit 0。
- Windows 执行 tests/windows_launcher_smoke.py：中文/空格项目目录、C:\Windows 工作目录、再次启动复用均通过，exit 0。
| Check | Observed evidence（Windows 与 WSL 均已观察） |
| --- | --- |
| Build | Python 编译和 JS 检查退出 0；无需前端构建 |
| 320 | viewport/document 均 320；最小目标 44×44；offenders 0 |
| 390 | viewport/document 均 390；最小目标 44×44；offenders 0 |
| 768 | viewport/document 均 768；最小目标 44×44；offenders 0 |
| 1440 | viewport/document 均 1440；最小目标 44×44；offenders 0 |
| Light / dark | 点击主题按钮切换并截图；重载保持；截图等待颜色过渡完成 |
| Keyboard / focus | Alt+O 进入 close-folder；Escape 返回 browse-media。下拉 Enter/方向键/Home/Escape，返回 mode-trigger |
| Reduced motion | emulate reduce，弹窗 computed animationDuration 为 0.001s |
| Targets | 每平台 5 阶段 × 4 屏宽，共 20 组；所有可见按钮/链接/输入/下拉/summary 实测最小 44×44 |
| Primary state | pending 禁用、错误与重试、导出完成、关闭读取后拒绝过期响应 |
| Runtime | pageErrors 0、非预期 HTTP 0；纯原生页面不涉及 hydration |

5 阶段：空状态、目录 dialog、扫描/设置、展开下拉菜单、结果。完整数值在对应运行目录 ui-audit.json。
图片前后加载、双视频播放、CSV、历史重载、备份及恢复另外通过 browser-smoke。
系统文件夹的真实人工点选未自动验收。新版辅助窗口真实创建、取消与重试已经验证；不能把协议夹具中的返回路径当作人工选择结果。

## 文件与证据
- 界面：mediaslimx/static/index.html、style.css、app.js、theme.js、icons.svg、favicon.svg。
- 目录能力：mediaslimx/folders.py、desktop.py、app.py。
- Windows 保护：mediaslimx/winpaths.py、paths.py。
- 启动：Start-MediaSlimX.cmd、scripts/start-windows.ps1、start-wsl.sh、mediaslimx/launch.py、__main__.py。
- .mediaslimx/validation-windows/ 和 validation-wsl/ 各保存 ui-audit.json、深浅主题、参数工作台、菜单和结果截图。
- 截图和原生任务数据都被 Git 忽略；不包含 FIRANO 素材或案例数据。

## 自适应高度修正（2026-10-16）
问题：原工作台按参数表单自然高度撑开页面，固定表格高度与顶部介绍叠加，造成高窗口也需要整页滚动。

实现：保留既有配色、控件和后端。桌面断点为内容区宽度 ≥1001px、可用高度 ≥640px；使用 100dvh 应用框架和 min-height:0 的可收缩区域。历史、文件表格、参数内容和结果表格独立滚动，开始操作固定在参数面板底部。扫描后压缩介绍区，处理中优先显示进度与逐文件状态。展开环境说明有高度上限，长路径、错误和说明可滚动阅读。

低于断点保留自然文档滚动，所有尺寸下应用栏 sticky 置顶；没有硬性的最小窗口高度。建议内容区 1280×720px 以上，不把显示器分辨率当作浏览器视口。浏览器放大后按实际 CSS 视口选择布局。

菜单移到 body 层，按触发按钮定位并限制在视口内，防止被参数滚动区裁切。只在锚点实际移动或窗口 resize 时关闭，避免程序焦点产生的排队 scroll 事件误关菜单；键盘 Home/End、方向键与 Escape 保持正常。

验收：原生 Windows Chrome 和 WSL Linux Chrome 各执行 tests/viewport-height.cjs，50 组/平台通过。空状态、设置、结果、处理中布局覆盖 1440×640/720/900/1080/1400，以及 1001×640、1024×768、1280×720、1920×1080、2560×1440；桌面 document 高度等于视口、主区额外滚动量为 0，开始与取消操作处于视口内。短窗口/窄屏另覆盖 1440×500/639、1000×700、768×700、390×640、320×568、844×390、960×540，主操作可滚动到达且应用栏保持顶部。

同时检查参数滚动后开始按钮位置不变、最后一行可到达、菜单真实命中不被截断、缩放对应的小视口布局、展开说明、键盘焦点排队事件。处理中只对真实任务响应作只读状态模拟以验布局，不改任务数据；扫描和导出使用真实合成素材。

两平台重新执行 ui-audit 各 20 组，44px 交互目标、深浅主题、键盘、错误重试和导出均通过，pageErrors 和非预期 HTTP 均为 0。高度证据：.mediaslimx/validation-windows/viewport-height.json、validation-wsl/viewport-height.json；对应目录保存 1440×900 的设置与结果截图，均不提交 Git。

## 路径控件与系统选择修正（2026-10-16）
根据截图定位：输入元素自带 focus-visible 只围住路径区，max-width:1150px 的 flex:1 又单独拉伸扫描按钮。改为组合框整体焦点边界，桌面 minmax(0,1fr)+112px+112px，窄屏路径独占一行、按钮等分下一行；输出/备份路径框采用相同焦点原则。

旧系统选择使用 PowerShell 的透明 WinForms 父窗口，用户观察到一直等待。新版以当前 Windows Python 的基础解释器直接运行 mediaslimx.desktop，使用标准库 Tk、隐藏父窗口和正常消息循环（已移除额外提示窗）；不改变压缩架构或引入第三方依赖。系统目录窗口有可识别标题；缺少 Tcl/Tk 时显示替代方式。取消按随机请求 ID 匹配，支持取消先于 spawn、网页取消、关闭面板、回到网页浏览、超时回收、错误重试和旧响应保护。Windows venv 转发器会多创建一层进程，因此仅该标准库辅助窗口直接使用同一基础解释器，以准确跟踪窗口 PID 和回收。

tests/windows_picker_smoke.py 在真实 Windows 桌面连续两次枚举到唯一可见的系统目录窗口，隐藏提示父窗口不显示，取消后进程退出且锁释放；不注入鼠标键盘，不验证人工点击目录。tests/directory-interaction.cjs 在 Windows Chrome 真实请求原生接口后取消与关闭均通过；错误与选择返回、迟到返回采用协议夹具。两平台各 12 档宽度 + 输出框焦点，共 13 组通过；按钮几何等宽等高、最小高 44px、无横向溢出。Windows 新增 7 项进程测试，完整 45 项通过；WSL 38 pass + 7 skip。两平台原有 50 组高度检查通过；Windows 再跑 20 组主题/键盘/导出检查通过。

证据保存在平台验证目录 directory-interaction.json、path-focus-1100.png。截图、运行绝对路径和服务重启记录不纳入 Git。当前 Computer Use 仍报 sandboxCwd 不是本地文件 URI，因此原生文件夹实际点选仍待人工验证，不把窗口创建或协议夹具当作完整人工点选结果。

## 环境信息、处理引导与主题反馈
修正旧的环境详情限高滚动：宽屏展开后，标题与两行概览同行，完整信息进入独立可滚动弹层；手机直接弹层。侧栏处理范围入口指向同一详情，保留焦点返回。全局滚动条使用三项语义色，覆盖历史、文件、参数、菜单和弹层。

尺寸通过两个明确选项区分原尺寸压缩与可选等比缩小。上限为边界框，可只填一边；显示真实选中文件的尺寸示例，不提供裁切或强制拉伸。无收益策略仍可能保留原尺寸，界面明确说明。输出预览描述复制/覆盖关系、保留命名和相对结构；结果位置弹层提供本次真实目录。

连接只表达是否连通，平台只展示一次，页脚展示版本。深色下太阳表示可切浅色，浅色下月亮表示可切深色；title/aria-label 与图标一致。settings-guidance 两平台通过原尺寸参数隔离、真实等比导出、原件指纹、输出位置和环境弹层/主题滚动条检查；Windows ui-audit 另验证图标点击与重载一致性。不同场景的截图等待弹层动效结束后采集。

## 低频列表管理
不为低频清理增加醒目主操作；采用“清空未固定”“已清空”次级文字按钮，单项用 44px 固定按钮。固定状态有 aria-pressed，与行的打开行为分离，避免嵌套 button。清空需确认，固定与活动项保留，确认后新固定也在服务端保护。通过可找回的隐藏整理列表，不删除媒体与备份。目录快捷入口清理明确不改变允许范围。

状态持久化在独立表，避免与压缩线程相互覆盖。两平台独立测试服务通过交互、权限和移动几何检查，没有清空用户现有数据；Windows 55 项单测通过，WSL 48 pass + 7 skip。运行证据位于 .mediaslimx/library-tests/，不提交 Git。

## 文件导入与轻量固定图标
保留当前工作台布局，拖入时才显示覆盖边框，传输时才显示真实进度，避免常驻大块拖拽装饰挤占主列表。文件导入使用同高度的来源条和原有设置栏、结果表；小屏按钮可换行。原生 file input 作为移动设备/键盘替代入口，不假设浏览器能取得原始绝对路径。

固定采用 14px 线条图标：未固定 35° 倾斜，固定竖直并填充、强调色，无固定的大绿色方块。命中范围保持 44px，动画服从全局减少动效设置；两平台浏览器检查计算样式、透明背景与命中范围。

标题“让媒体变轻”去掉句末句号，英文使用 Make media lighter。中英切换复用原工作台，不增加框架；英文控件允许换行，窄屏保持 44px 命中区域。文件夹导入多一个次级入口，手机采用两列操作按钮，保持主列表优先。

## 中英文排版与窄窗口复查（2026-10-16）
针对实际截图中侧栏“保留”和英文“parties”单独一行的问题，调整空态说明的可用宽度，短提示采用平衡换行，普通说明优先避免孤词；标题、参数及按钮保留自然伸展，不靠整体缩小字体解决。

同时修正 320px 英文导航按钮文字越界、平板参数网格中输出说明只占半栏、下拉完整选项被截断的问题。英文目录操作给予足够内距；预设列数按实际可用宽度收缩。文件表格使用可横向滚动的最小宽度，大小、状态和操作不再被挤成竖排，横向滚动仅发生在表格内。

弹窗关闭区在内容滚动时保持可用；详情中的超长相对路径最多显示三行，可键盘聚焦并滚动完整阅读，不遮住预览与参数。拖拽覆盖层的中英文提示也允许平衡换行。

新增 tests/bilingual-layout.cjs：各自启动独立端口和数据目录，只读取合成源媒体、导出到测试目录，不清空正在使用的任务库。清理提示与超长路径使用只读 DOM 展示夹具。覆盖两语言、11 档视口、空态/目录/设置/尺寸/菜单/结果/详情/文件位置/环境/清空确认，以及孤行、长标题、表格末列、弹窗关闭命中和键盘菜单操作。移动尺寸为桌面 Chrome 视口模拟，不冒充实体手机或 Safari 验证。

验收：Windows 原生 Chrome 与 WSL Chrome 各 208 组通过，页面异常为 0；原主题/键盘/高度检查各 20 + 50 组通过。两平台当前服务的样式哈希均与最终工作区一致，刷新即可生效。详见 development-plan.md 的最终证据目录。

## 现行设计规范与原位优化入口
当前字号与对齐以根目录 DESIGN.md 为准，替代历史 8–11px 的紧凑文字方案。中文、英文均最低 12px，正文/输入 14px，控件 13px；宽度不足时换行或滚动。原配色、44px 命中范围和本机系统字体保持，目录弹窗采用固定头尾与可滚动中区。

侧栏清理按钮不再各自居中文字，采用与标题和任务名一致的 12px 内容内距。备份用主动勾选表达，与处理方式同步；浏览器导入不能原位写入，提供选择真实原目录的引导。选择取消不丢列表，确认选择只触发扫描，媒体写入仍须开始按钮。细节与最终两平台验证见 development-plan.md。

## 维护操作与来源操作分层
截图中空态把两个导入按钮与清理文字混排，造成重心偏移。按 DESIGN.md 将来源操作保留为一组，副本清理放到下方独立次级行，隐藏时整行收起。短窗口空态允许安全滚动，保留文字下限和点击区域。双语检查使用真实存在未使用副本的状态，修复动态数量标签英文漏译；最终两平台各 226 组与清理取消/确认检查通过，详见开发计划。

## 按真实类型选择与锚点连续性
选择动作复用工具栏下拉，避免增加常驻整排格式按钮。格式以真实检查信息为准，选中状态与数量同步，选类型不隐藏列表；原生 select 继续作数据源，缺失类型禁用，键盘跳过。

选择列以同一中心线对齐表头与 checkbox。旧的“宽屏标题与概览同行”在展开时把 summary 缩成窄列，造成箭头横向跳位；现在 summary 始终一整行，概览在下方展开。实际同坐标点击、键盘和尺寸变化通过验证。

动效主对象是新步骤的内容区，说明展开为另一个独立事件。采用 180ms opacity 过渡，不对表格每次刷新、逐文件进度或勾选重播入场动画；新步骤可取消旧动画，减少动态效果保留状态和操作。具体时间和未来约束在 DESIGN.md，验证命令/结果见 development-plan.md。
