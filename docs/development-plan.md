# 实现阶段与完成记录

## 当前交付状态

当前为 v0.2 早期可用版本。最新测试基线统一维护在 [platforms.md](platforms.md)，以下按日期保留实施历史。功能已包含普通PDF、双语界面、归档/删除记录、导入副本安全清理及品牌资产；Windows免Python安装的便携包仅作本机验证，不将其称为已发布下载。

手机和新格式继续延后；FIRANO 真实案例仍待素材路径。`tigerx-dev/mediaslimx` 源码已公开，Windows 便携包和其他二进制下载继续等待；仓库与构建包是两个交付物。本仓库提交署名使用 `tigerx-dev` 与 GitHub noreply 邮箱，不修改全局 Git 身份。精简 FFmpeg 对应源码与构建材料已准备；lxml/iconv 的准确 wheel 构建输入已追溯，公开完整二进制包前仍需验证 LGPL 重建/重链接材料并完成真实干净 Windows 验收。最新体积收尾记录见本文末尾。

## 2026-10-20 源码首次公开范围

- [x] 核对中英文 README、MIT 许可证、运行与可选依赖、Windows/WSL/Linux 启动步骤、媒体支持范围及 Windows 便携版发行阻塞。
- [x] Windows 源码宿主的系统标题栏跟随深浅主题，保留标准窗口控制；隔离实际窗口完成快速、等待、双语、失败、窄窗和真实工作台启动测试，更新公开截图。[验证细节](startup-window.md)
- [x] Git 忽略本机任务数据、虚拟环境、缓存、内部视频与构建产物；公开清单只保留源码、测试、文档和可公开的合成素材。
- [x] 本次源码首发只提交源码、测试、文档及合成展示素材；便携包、Release 与 TX 下载入口继续保持未发布。公开分支与提交号以 GitHub 实际推送结果为准。

## 2026-10-19 仓库与发布演示复核

- [x] Windows 源码窗口增加中英石墨／薄荷居中启动封面，展示 Python 核心真实版本与当前初始化状态：240 ms 仅作显示阈值，实际初始化完成即进入；等待活动线与底部低对比薄荷光影不冒充完成比例，失败或30秒无回应留可重试/退出的同页界面。标记改为随卡片直接绘制，避免偶发空方块。独立回环测试完成快速、延迟、中英失败/恢复/退出、最小窗口和无回应超时，实际 Python 服务与空合成媒体目录的工作台启动和关闭通过。封面不声称下载环境或检查更新；源码首次依赖准备仍早于原生窗口。真实截图与交接见 [startup-window.md](startup-window.md)；既有便携候选未重构建，干净 Windows 验收仍待办。

- [x] 保留 MediaSlim X / mediaslimx 名称；目标空仓库已创建并作为本地 `origin`，远端 `HEAD` 尚无引用。用户选择等源码与 Windows 便携包都就绪后一起发布，现阶段不推送。
- [x] 本仓库单独设置 GitHub noreply 提交邮箱，不改全局 Git 身份；仍无首次提交。发布前再核对作者显示名、提交文件和授权连接。
- [x] 40 秒中文初剪以当日当前界面重新录制，实际画面覆盖目录扫描、勾选、默认导出、处理进度、结果/对照/CSV。复核静态资源时间与逐镜画面，暂无重录主段必要；正式上线时替换第 06 镜“尚未发布”片尾并重验播放。备份恢复、异常续做与 Windows 独立窗口由 README 和验证记录说明，不冒充已在这段 WSL 演示中出现。
- [x] 核心功能免费；没有真实赞助地址，界面与视频不显示空入口。暂无收费功能规划，后续若开通赞助再添加低干扰链接。
- [ ] 最新官方 Python 3.13 窗口候选的发行阻塞：lxml/iconv 的 LGPL 重建/重链接材料、真实干净 Windows 验收。准确 wheel 来源现已对应上游构建日志；旧 r10 另有 libffi 来源问题，不作为新候选的阻塞。用户暂不重启；门槛完成前不上传二进制。

## 2026-10-17 收尾、空间管理与便携原型

- [x] 中英README统一功能/依赖/平台限制；平台当前基线集中在platforms，旧数字明确为历史阶段；更新spec、ui-flow、privacy、localization和DESIGN。
- [x] 独立导入副本空间面板：实际占用/配额、文件名辨认批次、最多三项文件示例、关联任务和清理影响。确认后重验快照，不修改拖入原件、结果、备份、任务、报告与处理指纹。
- [x] 已用/已删记录副本可显式释放；旧unused仍保护sealed，释放后旧扫描失效，详情只展示真实结果，CSV/ZIP保留。部分失败保留配额/剩余文件，重启不自动续删。
- [x] 新16项清理风险测试、静态资源白名单回归；两平台各7组实际浏览器流程+48组布局；真实760字节UTF-8中文相对路径和双语原名保持。原有bilingual-layout两平台各226组通过。全部使用私有合成数据，没有清理用户现有副本。
- [x] 新Logo、双主题字标、favicon、Windows ICO及中英1200×630封面，SVG维护源与开发导出脚本随项目保存。新顶栏品牌和页脚空间入口已接入，无真实链接的赞助占位不显示。
- [x] Windows x64 onedir构建：捆绑Python、Pillow、PDF、FFmpeg/ffprobe，独立LocalAppData、8767起空闲端口，解压双击打开网页，冻结PDF/系统选择器正常。该阶段旧原型约197MiB，后续精简结果见本文末尾；均未上传分发。
- [x] 真实EXE验证8组，含清空开发PATH、中文空格解压、五类媒体实际导出、CSV/预览、导入释放及实例复用；浏览器专用helper显式脱离自建Job，关闭服务后长命浏览器保留，自己的FFmpeg/Tk助手退出。另补4项Windows启动边界测试。
- [ ] 干净Windows系统验收与实际默认浏览器UI/人工点选目录；其余第三方来源/许可核实；FIRANO真实案例。精简FFmpeg材料已完成，手机和新格式延后。

最终空间管理证据：`.mediaslimx/import-tests/windows-storage-58d3c691-33a7-4f7e-ab66-f63530e81357/` 与 `wsl-storage-9c974d75-2483-4421-9deb-5839f4243030/`。双语原页面回归：`windows-bilingual-60371d03-a5a4-4d09-a6e3-d422356c3c7f/` 与 `wsl-bilingual-ccf0ef5d-5334-4f2b-9514-2b1bf11ef8c9/`。便携最终证据见packaging.md。所有证据/日志/下载/运行数据Git忽略；源代码与资产尚未提交或发布到远端。

本轮自动权限审核曾超时，受限沙箱也无法创建测试临时目录；这些环境失败未计为业务测试通过。之后在授权环境完成了最终121项完整回归：Windows120通过/1权限跳过，WSL110通过/11 Windows专用跳过，实际基线统一见platforms。

当前Windows源码8766原先已停止，经只读确认端口空闲后，使用正常实例锁恢复服务，保留原访问会话；只读验证新storage API与HTML、JS、CSS、词典、favicon SHA均与工作区一致。没有对用户任务执行清理、删除、归档或媒体处理。

## 2026-10-16 / v0.2
- [x] 六份首版文档，独立 Git、MIT、默认只监听回环地址；未配置远端、未上传。
- [x] 真实扫描、三项预设、尺寸限制、同格式导出、无收益、备份/直接覆盖、指纹和恢复冲突。
- [x] SQLite 历史、单个写任务、取消、真实进度、前后预览、CSV。
- [x] Windows 原生环境和 FFmpeg 测试，不把 WSL 当作 Windows。
- [x] Windows 双击入口、脚本自身路径定位、首次依赖安装、就绪后开浏览器、再次启动复用。
- [x] Windows/WSL 独立虚拟环境、数据目录、默认端口与预览 Cookie。
- [x] 网页目录浏览器、Windows 系统选择入口、真实用户选择后授权，跨平台路径误用提示。
- [x] 石墨深色/薄荷色桌面工作台、浅色切换、统一下拉菜单、按事件动效。
- [x] 四档屏宽、44px 点击目标、键盘/焦点、减少动效、错误重试与过期响应防护。
- [x] 自适应视口高度、固定应用栏/开始操作、面板独立滚动、短窗口自然滚动和菜单防截断。
- [x] 原尺寸/等比缩小显式选择、输出预览、真实任务目录、环境信息响应式弹层、统一滚动条与主题图标反馈。
- [x] 任务/目录快捷入口固定、次级文字清空、确认快照、提交时保护与可恢复列表整理。
- [x] 说明与实现同步，运行数据、私有路径、媒体和截图全部忽略。

## 历史验证（2026-10-16，迭代记录）
- Windows 原生：72 项 unittest 通过；Python 3.12.14、FFmpeg/ffprobe 9.0、Windows Chrome。
- WSL2：72 项中 65 项通过、7 项 Windows-only 进程测试按预期跳过；Python 3.10.12、FFmpeg 4.4.2、Linux Chrome。
- 两个平台真实浏览器分别完成 7 候选/5 支持的合成素材扫描、目录上下级、菜单选择、导出、图像加载、双视频播放、CSV、历史和备份恢复。
- 恢复后 JPG 与原件字节完全一致。合成结果不作对外收益宣称。
- 两个平台 ui-audit 均完成空状态/目录弹窗/扫描设置/展开菜单/结果五阶段 × 320/390/768/1440px。documentWidth 等于 viewport；最小点击区域 44×44；0 个不合规目标；0 个页面异常、0 个非预期 HTTP 错误。
- 深浅主题、主题重载保持、Alt+O/Escape、下拉 Enter/方向键/Home/Escape、减少动效 0.001s 均通过。
- 两个平台各通过 50 组高度布局检查，覆盖 640–1440px 高的桌面、短窗口、窄屏及缩放对应视口；开始操作固定、应用栏置顶、列表末行可达、菜单无截断。处理中布局使用只读状态模拟；扫描及导出为合成素材真实执行。
- 从 C:\Windows 启动真实 .cmd 成功；新的中文带空格项目副本启动和实例复用成功，测试自己的子进程和目录已清理。
- 两平台 pip check、Python 编译与 JS 语法检查通过。
- Windows 选择器已替换为标准库 Tk 辅助进程；实际系统目录窗口可见且没有额外提示窗口，连续两次取消/回收/重试通过。浏览器实际调用原生接口后取消及关闭也通过；失败重试与迟到成功返回用协议夹具验证。系统文件夹实际人工点选仍未自动验收，node_repl 当前 WSL 工作目录 URI 错误未解决。
- 路径输入、浏览与扫描共用焦点边界，按钮桌面等宽、窄屏等分；两平台各通过 12 档宽度及输出框焦点检查。

## 复跑
~~~bash
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m pip check
~~~
Windows：
~~~powershell
.\.venv-win\Scripts\python.exe -m unittest discover -s tests -v
.\.venv-win\Scripts\python.exe -m pip check
.\.venv-win\Scripts\python.exe tests\windows_launcher_smoke.py
.\.venv-win\Scripts\python.exe tests\windows_picker_smoke.py
~~~
可选浏览器测试，产品不要求 Node：
~~~bash
npm install --prefix .mediaslimx/browser-tools --no-audit --no-fund playwright
MSX_URL='启动终端给出的完整本机URL' \
MSX_PLAYWRIGHT="$PWD/.mediaslimx/browser-tools/node_modules/playwright" \
node tests/browser-smoke.cjs
MSX_URL='启动终端给出的完整本机URL' \
MSX_PLAYWRIGHT="$PWD/.mediaslimx/browser-tools/node_modules/playwright" \
node tests/ui-audit.cjs
MSX_URL='启动终端给出的完整本机URL' \
MSX_PLAYWRIGHT="$PWD/.mediaslimx/browser-tools/node_modules/playwright" \
node tests/viewport-height.cjs
MSX_URL='启动终端给出的完整本机URL' \
MSX_PLAYWRIGHT="$PWD/.mediaslimx/browser-tools/node_modules/playwright" \
node tests/directory-interaction.cjs
MSX_URL='启动终端给出的完整本机URL' \
MSX_PLAYWRIGHT="$PWD/.mediaslimx/browser-tools/node_modules/playwright" \
node tests/settings-guidance.cjs
~~~
需要本机 Chrome；可用 MSX_CHROME 指定路径。Windows 使用原生 Node 执行相同脚本，并设置 Windows 路径环境变量。
素材不存在时先运行 python tests/create_fixtures.py；生成器拒绝覆盖已有目录。
不要同时运行两平台的备份覆盖测试，双方共享合成源文件但不共享数据库。

## 已知限制
- 尚无 FIRANO 路径与实测结果，未读取其项目。
- 界面继续使用本机网页；已增加自带运行时的 Windows 便携包构建与本地验证流程，不需要原生桌面壳。当前包尚未公开分发，依赖材料与干净系统验收见 [packaging.md](packaging.md)。
- 普通 MP4 范围保守，图片限 5000 万像素；不保证所有私有元信息、ACL、所有者及扩展属性保留。
- 单实例内只有一个写任务；多个平台或不同数据目录实例不要同时覆盖同一媒体。
- 取消到安全边界才生效；编码和完整解码分别有 30 分钟上限。
- 没有大目录分页、缩略图缓存或断点续跑；完整哈希及大视频预览可能较慢。
- 正常失败/取消清理临时文件；突然断电仍可能留下隐藏临时文件。
- 当前 Windows 账号不能直接创建文件符号链接（WinError 1314），未提高系统权限；用 junction 测试目录边界和竞态，文件读取仍实现重解析点拒绝。

## 本次交互细化验收
- Windows 系统选择进程的可见窗口枚举：两次均只有“MediaSlim X — 选择文件夹”，没有额外提示父窗口；取消后进程回收，锁释放。
- Windows 与 WSL 的 settings-guidance：真实 JPG 1280×800 在 640×640 上限内导出 640×400，原件 SHA-256 不变；默认模式忽略隐藏的旧尺寸参数；备份/导出/直接覆盖解释及实际任务位置一致。
- 两平台环境信息：宽屏紧凑两行、完整弹层可滚到范围说明；390px 手机直接打开弹层、关闭返回焦点；主面板不因详情展开被限高裁切。滚动条色在各区域一致且随主题变化。
- 页面连接、平台和版本信息去重；太阳/月亮图标、提示与已保存主题一致，Windows ui-audit 检查点击与重载。
- 对应证据为平台运行目录 settings-guidance.json 与环境/输出截图，全部被 Git 忽略。

## 列表管理实现与验证
新增 mediaslimx/library.py 和独立 list_state 表，不改媒体任务记录结构或处理算法。任务与目录快捷入口支持固定、清空未固定、查看和找回；目录清理不更改允许范围，固定项及活动任务默认保护。

新增 tests/test_library.py 的 10 个风险场景：Windows 55/55 通过；WSL 48 pass + 7 Windows-only skip。测试覆盖确认后固定、活动任务、确认快照外新任务、处理线程保存、重启、备份和源文件保持、权限不扩大等。

tests/library-browser.cjs 在两平台分别启动独立端口、数据目录和真实合成素材导出任务；通过固定排序、取消确认、清空找回、报告仍可取、确认期间另一请求固定、目录权限保持、鉴权/Origin 拒绝、320/390/768/1440px 与 44px 控件检查。没有清空当前用户的任何任务或目录入口。证据在 .mediaslimx/library-tests/平台-随机ID/report.json 和 library.png，均不纳入 Git。

2026-10-18 源码界面收尾：目录快捷入口选中底色延伸至图钉，桌面左列加宽；长目录名与最近任务名保持单行省略号，悬停可见完整路径，读屏可取得完整路径；恢复最后一条归档后自动关闭归档层。目录空路径占位按语言显示。WSL 隔离浏览器实测中英文 320/390/768/1440px、长目录名、焦点、44px 命中区与原件字节不变均通过；证据在 `.mediaslimx/library-tests/wsl-*/`。这批最新源码调整尚未重新打入当前打开的 Windows r10 冻结便携包，Windows 原生复验待下一版构建。

复跑（使用本机 Chrome，产品运行无需 Node）：
~~~bash
MSX_PLAYWRIGHT="$PWD/.mediaslimx/browser-tools/node_modules/playwright" node tests/library-browser.cjs
~~~
Windows 使用原生 Node，设置 MSX_PLAYWRIGHT、MSX_CHROME 为 Windows 路径，可用 MSX_PYTHON 指定 Windows Python。脚本会管理自己的测试服务，不需要 MSX_URL，不会操作正在使用的任务库。

拖拽文件导入已补齐，见下方实际验证记录。

## 文件导入与固定图标细化（2026-10-16）
新增轻量 imports.py：JSON 声明 + 流式 PUT，无 multipart 新依赖；复用原有检查/编码/结果流程。平台隔离导入区和默认导出区，导入任务只允许 export。追加/重名区分、取消、临时文件清理、过期扫描拒绝、任务锁定、持久原始副本、ZIP 下载和未使用副本清理已实现。文档明确本机/远程数据流及保留边界。

固定图标缩至 14px，去掉显眼方形底色，倾斜/竖直区分状态；点击范围仍 44px。

新增 tests/test_imports.py 的 13 项风险测试。完整单测：Windows 68 项通过；WSL 61 项通过、7 项 Windows 专用按预期跳过。tests/import-browser.cjs 使用各自独立服务与合成 JPG/MP4，通过二进制鉴权/Origin/大小校验、真实拖入与选择、重名追加、仅导出限制、预览、ZIP/CSV、页面重载、原件不变、无第三方请求、取消、清空及 320/390/768/1440px 几何检查。导入原始副本的后端重启可预览由单测实际验证；浏览器只覆盖重载，不冒充系统文件管理器拖拽硬件测试。

复跑：与 library-browser 相同环境变量运行 node tests/import-browser.cjs。证据存于 .mediaslimx/import-tests/平台-随机ID/，不纳入 Git。Windows 原生与 WSL 的依赖和服务分开，不混用路径。

该阶段限制（目录递归已在下一阶段补齐）：无断点续传、历史原始副本删除界面；200 文件/1 GiB 单文件/2 GiB 单批/8 GiB 平台声明总量限制。文件多时顺序传输与完整媒体检查可能耗时，界面不预估压缩收益。

最终两平台 ui-audit 各 20 组和 viewport-height 各 50 组均通过：空态/设置/结果无横向溢出、主题与键盘可用、所有可见控件至少 44px、短窗口和缩放保持滚动及顶栏；页面异常和非预期 HTTP 错误均为 0。当前 Windows 8766 与 WSL 8765 已确认加载导入 API 和前端，使用各自独立运行目录。

## 整个文件夹导入与中英文界面（2026-10-16）
- [x] 原生拖入目录与浏览器文件夹选择，保留最外层目录及内部相对结构；目录读取至空批次，实测超过 100 项后仍收集到媒体。
- [x] 传输前过滤隐藏名称、依赖、输出/备份及非媒体；服务端独立相对路径和排除校验，收件区仍用随机平铺物理文件。
- [x] 相对目录大小写统一、同一相对文件重名编号、不同目录同名保留、文件/目录前缀冲突拒绝、ZIP 结构和 CSV 验证、旧平铺记录兼容。
- [x] 固定图标增加填充，固定竖直/未固定倾斜，透明背景，44px 命中面积。
- [x] 中文标题去掉句号；中文默认与 English 即时切换、本机记忆、动态文案和访问标签；不刷新或改变文件路径、任务值、选择。
- [x] README.en.md 与 localization.md，说明同步浏览器隐藏属性和链接元信息边界。

新增 4 项导入后端风险测试，完整 Windows 72/72；WSL 65 pass + 7 Windows-only skip。原 ui-audit 两平台各 20 组、viewport-height 各 50 组通过。tests/folder-language-browser.cjs 用 Chrome Input.dispatchDragEvent 携带真实目录路径生成原生目录条目，另用文件夹 input 验证选择；不冒充手工资源管理器拖拽的硬件输入验证。目录元信息夹具证明排除目录不枚举、非媒体不请求 File 对象，并测试收集取消与数量边界。

独立链接探测：当前 Windows Chrome 的 junction 与 WSL Chrome 的目录 symlink 在拖入与文件夹选择中均未出现在收集结果。不能据此承诺其他浏览器或所有原生属性的行为；严格 no-follow 和 Hidden/System 过滤继续使用目录扫描。

新运行证据在 .mediaslimx/import-tests/平台-folder-随机ID/ 下，不提交仓库。产品运行不需要 Node；开发可按现有 MSX_PLAYWRIGHT / MSX_CHROME 环境运行 node tests/folder-language-browser.cjs。尚无 FIRANO 真实案例，未接触其他项目或发布仓库。

最终 folder-language-browser 在 Windows 和 WSL 均通过：英文设置/结果中未翻译的应用中文为 0，保留原始中文媒体路径；以英文偏好重载后下拉可恢复中文。英文导入在 640/720/900px 高度主操作均可见，五档宽度无横向溢出、44px 目标通过。传输中切换语言不重启上传，英文取消可用；清理请求被明确门控时禁止新来源操作，清理后重入成功。全部浏览器请求在本实例，页面异常为 0。

## 中英文排版与交互复查（2026-10-16）
- [x] 修复实际截图中的中文尾部孤字、英文单词独占末行；说明宽度与短段落换行统一处理。
- [x] 320px 英文侧栏导航、目录按钮内距、预设自适应列数、平板输出说明占满整行、完整下拉选项换行。
- [x] 手机表格独立横向滚动，状态与文件大小保持可读；滚到末列后详情可点击。
- [x] 弹窗滚动后关闭按钮真实命中；超长文件路径标题最多三行，完整文字可聚焦滚动。
- [x] 文档补充语言排版维护约定，不增加前端或 Python 依赖。

最终 tests/bilingual-layout.cjs：Windows 原生 Node/Chrome 与 WSL Linux Node/Chrome 各 208 组通过，覆盖中英两种语言、11 档视口（含 320×568、844×390 横屏、1280×500 短窗口和 1440×900），页面宽度/按钮文字/44px 目标/组件溢出检查均无问题，页面异常为 0。孤行检测、超长标题、表格末列命中、滚动后弹窗关闭命中、键盘菜单和桌面开始操作可达均通过。移动尺寸由 Chrome 模拟，尚未实测实体手机或 Safari。

原 ui-audit 两平台各 20 组、viewport-height 各 50 组复查通过，包括深浅主题、减少动效、错误重试、真实导出、键盘焦点、参数滚动与短窗口主操作。此次只调整 HTML/CSS，未修改媒体核心或后端接口，没有重复运行无关的后端测试。

证据：.mediaslimx/import-tests/windows-bilingual-3519b104-b00f-4459-8e94-22268c31ed48/ 和 wsl-bilingual-bad78e1c-ab5e-4e03-9118-2f03afb386a6/ 内的 bilingual-layout.json 与截图，均已被 Git 忽略。两个正在使用的服务 8766/8765 已只读确认提供最终样式和详情标题标记，无需重启；刷新网页生效。未操作用户现有任务库、其他项目或 FIRANO 真实素材，未上传文件。

## 字号规范、侧栏对齐与备份快捷入口（2026-10-16）
- [x] 根目录 DESIGN.md 作为现行设计依据，AGENTS.md 指明后续前端改动先读；延续现有配色与原生技术栈。
- [x] 中英共用字号变量，正文/输入 14px、控件 13px、辅助/表格至少 12px、区块标题 16px、页面标题 28px/手机 24px。系统字体，无新增字体下载。
- [x] 侧栏标题、清理文字、任务名与计数/固定图标统一左右内容边缘，44px 点击区域保留。
- [x] 手机紧凑连接状态保留可访问名称与 title；目录弹窗头尾固定、中间滚动，字号提升后确认按钮仍可点击；历史时间保持单行省略。
- [x] “备份原件，再原位优化”勾选与既有模式同步，复用原有备份/验证/原子写入/恢复保护；取消勾选、新任务均回到导出。
- [x] 导入转原目录的引导，取消保留待处理导入；选中真实目录后扫描并准备备份模式，仍需点开始。浏览器导入继续仅导出。
- [x] 导入超过 200 文件 / 2 GiB 等边界时保留完整报错与目录扫描按钮，不偷偷截取前 200 个。

设计文件校验：npx @google/design.md lint DESIGN.md，0 errors / 0 warnings，仅开发校验，不是产品运行依赖。两平台最终 bilingual-layout 各 208 组通过，加入所有可见文字计算字号 ≥12px 与手机目录确认按钮实际命中检查，页面异常为 0。最终证据为 .mediaslimx/import-tests/windows-bilingual-ab25305e-bb80-4224-b9bc-47d26cd467ae/、wsl-bilingual-82f2da24-a5d6-42ca-9f31-d2696392e03b/；移动为桌面 Chrome 视口模拟，未宣称实体手机或 Safari 实测。

tests/backup-workflow-browser.cjs 在各自私有测试源目录中真实执行：导入默认导出、取消目录选择不丢列表、勾选/模式同步、跨语言保持备份设置、原件复制到自定义任务备份、较小结果原位写入、整批恢复后字节完全相同且备份保留、新任务默认导出。201 文件元信息边界夹具验证无上传且扫描引导可用，不冒充手工拖放 201 个真实媒体验证。Windows/WSL 各通过，页面异常为 0；证据分别在 windows-backup-workflow-ade71eb6-bc20-4797-87ef-ef463223e738/、wsl-backup-workflow-55071d39-665a-42a7-9ea1-2119710e7737/。

字号提升后的原 ui-audit 各 20、viewport-height 各 50 组通过；只读侧栏检查各 12 组通过，左右布局边缘偏差 ≤1px（未固定图标按未旋转布局框比较），命中范围与页面宽度通过。对应平台验证目录 sidebar-alignment.json/png；没有操作用户现有任务的固定或清空。

未改后端媒体核心或引入生产依赖，不重复无关的后端单测。Windows/WSL 虚拟环境、服务与测试数据保持分离，未触及 FIRANO 等其他项目或发布文件。

最终目录弹窗将说明、快捷入口和目录列表一起置于中间滚动区，避免只压缩目录框导致快捷入口扁成一条。双语检查追加了手机快捷入口与确认按钮的实际命中，两平台各 208 组仍通过。手机指标统一为 24px，不再受旧断点字号覆盖。

## 字号放大后的间距复查与副本清理分组（2026-10-16）
将“选择图片 / 视频”“导入文件夹”保留为同一来源操作组，“清理未使用副本 · 数量”移到下方独立次级文字行，保持至少 12px 文字和 44px 命中范围。没有未使用副本时整行收起，不留空白。规则同步 DESIGN.md 和 ui-flow.md。

空态采用安全居中，矮窗口需要滚动时从首行到末尾内容均可到达。使用真实合成媒体创建并保留一个未使用导入副本，补齐以往新数据库隐藏清理按钮时未覆盖的状态，同时发现并修正“清理未使用副本 · 数量”漏译：显式数量模板先于通用文字加数字模板，保留原始媒体路径绑定规则。

tests/bilingual-layout.cjs 两平台各 226 组通过，覆盖 12 档视口、两种语言、空态/目录/设置/尺寸/菜单/结果/详情/文件位置/环境/清空确认；另外逐项验证六档短窄窗口中标题、说明、两个导入按钮、清理按钮及末尾说明都可达，并检查主/次操作独立成行居中。所有可见文字 ≥12px、交互目标 ≥44px，无页面/按钮文字/组件溢出，页面异常为 0。英文清理数量标签有明确断言。

取消清理保持测试副本，确认后副本和维护行消失，合成源媒体字节不变；真实扫描导出任务仍保留。Windows 与 WSL 各自独立服务/数据库，仅清理测试副本，未清理用户现有副本或任务。移动仍为 Chrome 视口模拟，未实体手机或 Safari 验证。

最终证据：.mediaslimx/import-tests/windows-bilingual-8ab4a90a-9d40-4ac6-9266-5389f4225b53/ 和 wsl-bilingual-0d9dd38c-18aa-4493-bffd-8b7377545ce0/，报告与截图均被 Git 忽略。WSL 另复查原主题/键盘 ui-audit 20 组、viewport-height 50 组通过。DESIGN.md lint 为 0 errors / 0 warnings。未改后端或新增运行依赖，不重复无关后端单测。

本轮发现 Windows 8766 未运行，已通过只恢复此项目已停止实例的辅助脚本启动原 Windows 服务，保留当前访问令牌；未停止任何其他进程。最终只读确认 HTML、CSS、i18n.js 与工作区哈希一致，刷新现有页面可见。WSL 验证使用独立测试服务，不将其冒充 Windows 实测。

## 类型选择、选择列与稳定展开动效（2026-10-16）
- [x] 待处理工具栏增加“按类型选择”：仅 JPG（含 .jpeg）、PNG、WebP、MP4。按已检查 info.format 分组，只选 ready 项；操作替换勾选，不过滤列表或直接启动任务。保留全选/清空和手动调整；没有可处理文件的类型禁用。
- [x] 复用既有 select/listbox，补齐禁用选项同步、键盘 Home/End/方向键跳过禁用项、全部不可用时禁用触发器。原输出/筛选/排序下拉兼容；导入失败返回目录时恢复控件可用。
- [x] 选择列表第一列统一 64px，表头和 44px checkbox 使用同一中心线；已选数量作为礼貌可访问状态更新。
- [x] 环境披露标题保持完整一行，箭头固定在右端，只旋转；概览在下方展开，移除旧的展开时标题窄列网格。手机弹层流程保持。
- [x] 使用 motion-lexicon 的 fade-in-fade-out 行为与现有原生技术栈，180ms 上下文淡入，140ms 控件反馈、240ms 弹层保留；仅步骤变化播放，轮询/勾选/语言切换不重播。新步骤取消旧动画，系统减少动态效果时停用 WAAPI、CSS 缩至最多 1ms。无生产依赖增加。
- [x] DESIGN.md、ui-flow、v1-spec、localization 与中英文 README 同步；后端和媒体写入核心未修改。

node --check mediaslimx/static/app.js、i18n-catalog.js、tests/selection-motion-browser.cjs 均退出 0。DESIGN.md lint 为 0 errors / 0 warnings。

新增 tests/selection-motion-browser.cjs，两平台各自私有合成源、独立服务与数据库。真实验证：
1. JPG/JPEG 合并选择，损坏 JPG 不可勾选；选类型不隐藏行，手动/全选/清空保持；缺失 WebP/MP4 时键盘跳过，追加真实 WebP/MP4 后可选。
2. 中英两语言 × 320/390/768/1001/1440 宽度，表头与 checkbox 中心差 <1px、菜单在视口内，Escape 焦点返回。1001/1440px 两语言展开箭头中心差 <0.5px，同一坐标点击可收起，Space 可操作。
3. 实际提交仅两个选中的 JPG/JPEG ID，生成结果也仅来自这两项；扫描损坏检查记录按原规则保留，没有被编码。原件字节不变。
4. 完成任务的读取刷新不重播动画；减少动态效果后新任务/扫描不启动 WAAPI，概览 CSS 动画 ≤1ms，类型选择及键盘仍可用。
5. 非媒体导入失败后回到原扫描，输出方式下拉恢复可用。

Windows 与 WSL 均通过，页面异常为 0。证据：.mediaslimx/import-tests/windows-selection-motion-a587022e-6778-4980-94b2-7dbde3b000ea/ 与 wsl-selection-motion-96ea9b1c-a3e1-4ceb-b340-39947f5972a0/。两平台 bilingual-layout 各 226 组通过，证据 windows-bilingual-756015b8-2a45-4b99-ab7c-882fe1cea14e/、wsl-bilingual-49ca7f50-fafe-4919-92b0-ac328a0ae38f/；原主题/键盘 ui-audit 各 20、viewport-height 各 50 组通过，展开说明未挤掉主操作或文件列表。

以上移动为 Chrome 视口模拟，未实体手机或 Safari 实测。没有处理用户现有媒体、固定/清空用户任务或发布文件；全部测试截图与运行数据被 Git 忽略。


## 双向展开与事前处理计划（2026-10-16）
- [x] 修复仅展开淡入、收起瞬变的问题。环境与压缩说明使用 motion-lexicon 的 accordion-collapse：220ms 展开、180ms 收起，测量局部容器高度；快速反向先捕获中间高度再取消旧动画，箭头保持原位。
- [x] 收起内容 inert，内部焦点回 summary；Space/Enter 通过原生 summary 触发。减少动态效果时结束活动动画，不启动新 WAAPI；窗口/语言变化落到最新目标状态。手机环境详情保持明确点击弹窗。
- [x] 参数栏精简为摘要，标题“处理计划”和摘要点击打开同一个原生宽面板。桌面最大940px双列，手机单列，固定标题/返回区，中间独立滚动；长路径右列不影响左列说明排列。没有 hover 自动遮挡或额外强制确认。
- [x] 计划展示真实选中数量/总体积/格式、当前预设、尺寸上限和真实首选示例，分块解释原件、结果、备份、无收益与恢复。浏览器导入明确使用服务副本、无法得到原绝对路径。只读查看不创建任务。
- [x] 明示保留原文件名、扩展名和相对目录，不修改网站引用。当前未实现批量重命名；后续方向仅限导出、默认关闭、规则预览与冲突保护，不能影响原位覆盖/备份恢复。
- [x] DESIGN.md、ui-flow、v1-spec、localization 与中英文 README 同步。无后端/媒体写入修改或新增运行依赖。

新增 tests/processing-plan-browser.cjs，使用各平台私有合成源、独立服务和数据库。Windows/WSL 均通过：
1. 导入副本与原件边界、原名示例、实际1280×800到640×400示例；两个计划入口可返回焦点，查看不创建任务。
2. 三种模式展示正确路径/备份/恢复风险。两语言×两主题×六视口（320×568、390×640、768×900、1001×640、1440×640、1440×900），每平台24组，文字≥12px、交互目标≥44px，无弹窗溢出/固定栏遮挡，正文独立可滚动。
3. 暂停实际动画并读取中间高度，展开与收起均有插值；反向瞬间高度差<1px；连续反向最终状态正确，Space与内部焦点恢复可用。
4. 减少动态效果会结束当前展开，后续不产生新WAAPI；移动宽度转入环境弹窗并恢复焦点。
5. 查看计划后真实提交导出，维持原basename/相对目录，结果宽640，源字节不变；页面异常0。

证据（均被Git忽略）：
- Windows .mediaslimx/import-tests/windows-processing-plan-b74170fe-2911-46a4-bc23-add54e4c7034/
- WSL .mediaslimx/import-tests/wsl-processing-plan-a1da144f-8c5e-4f80-9c87-ff5d234367dd/

原有 bilingual-layout 两平台各226组通过：windows-bilingual-b7919c7f-3d2b-438f-b0a5-559015203f5f/、wsl-bilingual-8055e53d-a24f-44e1-a2d7-51cab6d0cba5/。WSL 追加上一轮 selection-motion 通过（wsl-selection-motion-c5766c25-1fbc-49ab-98a7-220019b47cc9/），主题/键盘 ui-audit20组与 viewport-height50组通过。node --check 检查 app.js/i18n.js/i18n-catalog.js/新测试退出0；DESIGN.md lint 0 errors/0 warnings。

当前Windows8766只读确认HTML/CSS/JS/词典与工作区哈希一致，不重启服务、不改变用户任务。手机仅Chrome视口模拟，未实体手机/Safari实测。没有处理用户现有媒体或上传/发布文件。


## 普通 PDF、完整记录外框与全宽处理计划（2026-10-16）
- [x] 读取用户实际Windows截图（经存在性确认的/mnt/c映射），修复history选中边框只包文字、pin在框外的问题；整行边框和背景包含独立44px固定按钮，内部文字不重复描边。
- [x] 归档条目查看与恢复共享外框，手机恢复在同框下一行。“清空/已清空”更名“归档/已归档”，确认及列表说明可随时恢复、无30天自动删除，不删除任务/报告/媒体/源副本/导出/备份，也不声称释放存储；保留现有API与数据库兼容。
- [x] 处理计划改为全宽信息分区（136px标题列、正文内112px标签列，650px以下单列），移除左右半分与右栏跨三行。命名示例不重复箭头两端长名；任务目录说明使用普通文字；恢复正文充分使用右侧空间。继续按DESIGN.md保证字号>=12、命中区>=44、固定关闭/返回和滚动。
- [x] 新增可选pdf.py、requirements-pdf.txt。Windows .venv-win Python3.12安装pikepdf10.17.0；WSL .venv Python3.10安装10.13.0.post1，依赖/runtime/data严格分开。核心图片视频依赖不改，缺PDF依赖时有可操作提示。
- [x] PDF检查/处理独立子进程与参数列表/JSON stdin，Windows Job Object和Linux RLIMIT_AS限制1GiB；检查30秒、处理90秒。普通非加密静态文档进行结构与Flate流重压，保留PDF版本、页面尺寸、JPEG原码，不栅格化、不降采样。所有预设同一保守策略，最大宽高不作用于PDF。
- [x] 首版64MiB/1000页/50000对象/单流32MiB/总解码128MiB；加密/权限限制、签名、表单、脚本动作、注释含链接、附件、外部文件流、复杂流或损坏/结构警告保守跳过。加密原因明确本工具不解密或移除访问限制。检查页数/页框/旋转/页面有序内容流与嵌入流摘要、qpdf语法；不宣称绝对视觉或语义等价。
- [x] 接入目录扫描、拖入文件/文件夹、仅PDF类型、页数、持久任务、CSV/ZIP与结果下载；全PDF时禁用画质尺寸，混合选择只作用于图像/视频。PDF默认导出；原位必须备份，前后端均拒绝无备份覆盖。复用现有验证/指纹/原子替换/无收益/重复/取消/恢复冲突机制。
- [x] PDF不嵌入页面，只提供受既有鉴权/路径/指纹保护的attachment+nosniff下载。用户用本机阅读器检查结果。修复真实浏览器测试发现的disabled fieldset导致FormData预设空值：提交与计划统一读取checked radio，PDF-only宽高均null。
- [x] 中英README、DESIGN、v1-spec、ui-flow、privacy-security和localization同步，截图及合成媒体/日志/测试数据库保持Git忽略。

### 实际验证
Windows .venv-win/Scripts/python.exe -X utf8 -m unittest discover -s tests -p test_*.py -q：89项全部通过。
WSL .venv/bin/python -m unittest discover -s tests -p test_*.py -v：89项中82通过、7项Windows子进程选择器测试按预期跳过。包括新增PDF独立11项、工作流6项；均使用临时合成文档。

两平台 tests/pdf-browser.cjs 各4组流程+8个双语视口通过，真实PDF-only/混合导入、先设图像320px再仅PDF、提交preset字符串且宽高null、实际结构压缩、文档kind/页数、附件下载SHA+CSV/ZIP、PDF禁止无备份覆盖、备份与恢复，页面异常0。
证据：
- .mediaslimx/import-tests/windows-pdf-f43074a1-291a-4eaf-8092-83cbf272b7b0/
- .mediaslimx/import-tests/wsl-pdf-bda4c4c5-1e82-468b-b789-384518c0ed86/

两平台 tests/record-layout-browser.cjs 各60组（20历史/20计划/20归档）通过：实际导出、固定不切换任务、外框包含pin与恢复、焦点不裁、完整正文宽度、长Windows文件名、中英/深浅/320/390/768/1001/1440、真实备份任务归档后任务/报告/媒体/备份字节保留、键盘恢复，异常0。测试测量等待实际进入动画结束，不放宽44px下限。
证据Windows windows-record-layout-615b8bb3-b623-4b70-a9bb-a474e2b08ec2/、WSL wsl-record-layout-88ea037e-4021-48cc-bf8d-f90b093297b3/。Windows正常素材真实扫描展示另为 windows-record-layout-24e86275-9baa-4973-ab16-60d702ed6895/record-plan-readable.png，60组同样通过；没有DOM伪造记录或启动展示任务。

两平台 tests/bilingual-layout.cjs 各226组通过，无字号/按钮/组件溢出或页面异常：windows-bilingual-7085e8de-5cfd-4f5d-b80a-0154ff10edb9/、wsl-bilingual-f2f8163a-ca4e-499f-bdb3-ead543d4f3bb/。
WSL tests/processing-plan-browser.cjs 24组通过（wsl-processing-plan-2560a347-9461-4122-a2e9-14efe247c0ea/），保留双向高度/快速反向/焦点/减少动态效果与真实图像导出检查。node语法检查通过，DESIGN.md lint 0 errors/0 warnings。

当前Windows8766在验证此项目实例、无进行中任务/恢复/上传后重启，复用原访问令牌/持久数据；随后只读确认PDF能力为true及HTML/CSS/JS/词典/导入过滤与工作区SHA一致。没有自动归档、清理或处理用户现有媒体，也没有上传/发布项目。手机仅Chrome视口模拟，未实体手机或Safari验证；未做FIRANO实测。


## 删除归档任务记录、表格内距与归档短说明（2026-10-16）
- [x] 读取用户两张真实截图，待处理table-wrap与标题/工具栏统一20px，结果与指标/筛选22px，手机15px。深色表头和行分割线整体内收；结果相对路径首列表头/数据不额外缩进。保持内部横滚、stickythead、64px选择列中心及44px控件。
- [x] 选择单元格空白代理原生checkbox.click()，直接控件/label不重复触发，Space仍原生一次切换，禁用项及其他列不切换。
- [x] 归档任务条目增加单条“删除记录”，与查看/恢复同框。先GET deletion-preview获取影响及版本，再打开独立native dialog；显示任务/结果/备份数量、不可撤销、丢失工具内CSV导出/预览/恢复入口、所有文件保留。按有/无备份分别说明手动恢复或未记录备份，已保存报告不受影响。主动勾选后按钮才启用；取消/Escape不删，提交防重复，关闭/页脚固定与中区滚动保持两语窄屏可达。
- [x] POST delete-record严格要求confirm=true及64hex record_version；仅终态、已归档、未固定记录，事务重验版本，worker_lock→engine.lock→SQLite BEGIN IMMEDIATE与写任务/恢复互斥，活线程未结束拒绝，幂等重复请求。仅删除单条task和list_state，不提供批量或媒体删除选项。
- [x] 原件/导出/备份/导入副本/已保存报告不打开或删除，其他任务、扫描、权限/排除与processed指纹保留；已结束线程/events引用清理。已用导入manifest保持sealed，兼容老记录同事务补标志，unused/discard/clear_unused与重启后均保护，不把删历史当作未使用副本。
- [x] 成功后归档计数刷新；若当前主区展示同一结果则清掉，避免留报告/恢复失效按钮。取消焦点回删除入口，成功回归档关闭按钮；陈旧确认和并发状态变更显示具体拒绝原因。
- [x] 按用户后续要求，归档确认短句改为“仅收起列表；任务、报告和备份保留，可随时恢复。”，桌面实测一行；手机自然换行不缩字。不自动过期说明保留在归档列表，不冗长重复。
- [x] DESIGN、中英README、v1-spec、ui-flow、privacy-security、localization同步；不承诺删除记录会释放媒体空间或缩小SQLite物理文件。没有执行用户现有记录的删除、归档或媒体处理。

### 实测与证据
Windows .venv-win/Scripts/python.exe -X utf8 -m unittest discover -s tests -p test_*.py -q：100项通过。
WSL .venv/bin/python -m unittest discover -s tests -p test_*.py -q：100项中93通过、7项Windows选择器专用测试按预期跳过。新增tests/test_record_delete.py共11项，覆盖严格确认/陈旧版本/归档固定状态/worker结束与恢复竞争/数据字节和其他记录保留/跨站/路径/令牌/幂等/重启/sealed保护；原有归档、导入、HTTP与PDF均回归通过。

新增 tests/record-delete-browser.cjs，两平台最终各9组风险流程+20布局（16删除两语/主题/四视口，4归档短句）通过，errors0：
- 真实export、backup、import任务；取消/Escape和焦点、主动勾选、旧确认因恢复/固定而拒绝；删当前结果后清state。
- 删除后源/输出/备份/导入副本字节均不变；旧报告/预览/恢复不可用；sealed不进unused，实际清理只清真unused，独立服务重启后保持。
- 有/无备份两语如实区别；500px中文归档确认辅助句Range实际一行，320px两语自然换行、>=12px无溢出。
证据：Windows .mediaslimx/import-tests/windows-record-delete-f7a14a6b-afff-4485-9dd9-7dd2cdd28bb4/；WSL wsl-record-delete-1faf6498-d065-460f-8a79-cd010e78d51a/。

新增 tests/table-layout-browser.cjs，两平台各40组（扫描/结果×中英×深浅×320/390/768/1001/1440），真实扫描10项/导出9项和损坏检查记录、原件不变、实际CSV下载；左右内距/表头正文/64px选择中心/44px/字体/横滚/sticky，选择列空白、checkbox、Space、禁用及其他列全部通过，errors0。
证据：Windows windows-table-layout-6ccf3d5c-c7f9-49d5-b115-06e3fd81a35d/，WSL wsl-table-layout-362fc27c-1df6-446d-b117-fde1baae90c9/，均有table-results.png。

原有 tests/bilingual-layout.cjs 两平台各226组通过：windows-bilingual-cff34276-4257-436f-815d-944bee728c26/、wsl-bilingual-ce6c8416-45d0-4ca0-b594-e89b9aa67b00/；无文字、按钮、组件或页面溢出。node语法检查通过，DESIGN.md lint 0 errors/0 warnings。全部测试使用独立临时/私有合成数据，截图、下载及日志均Git忽略。手机仍为Chrome视口模拟。

在确认此项目Windows8766实例无进行中处理/恢复/上传后更新服务，保留访问会话和持久任务。只读确认invalid-id deletion-preview被400拒绝（不访问真实任务），静态HTML/CSS/JS/词典SHA与工作区一致，没有实际调用删除用户记录。项目未发布或上传。


## 文件详情阅读层级与叉号关闭
- [x] 确认Windows截图可通过/mnt/c映射实际读取，定位原默认“两列JSON元信息+大块参数JSON”造成信息零散。沿用DESIGN.md色彩、字号与原生组件，不增加前端依赖。
- [x] 详情固定标题/单独叉号，44px热区、aria-label/title与三行可聚焦路径保持；独立.detail-content滚动，关闭/Escape停止视频并回原详情按钮，同入口因轮询被换则回同文件的新按钮。
- [x] 默认阅读顺序改为状态与原因、原大小/结果大小/实际节省/耗时、配对预览及格式/尺寸/色彩或视频/PDF可读信息、处理参数。摘要桌面四列/手机两列，预览桌面并排/手机单列，参数标签和值最多两列/窄屏一列。
- [x] 原始媒体JSON、实际参数JSON和任务设置JSON收进默认关闭“技术详情”，使用既有可反向局部伸缩/减少动态效果支持。JSON和原文件路径不翻译。
- [x] 采用结果状态和result_fp共同判断可展示结果，失败/取消不使用默认result_size冒充生成；无收益展示原件并标尝试参数未采用，duplicate说明未再次编码并展示设置；restored展示恢复原件，原处理参数/原输出尺寸与当前元信息分开。无实际参数不借task.params冒充实际编码。
- [x] 直接覆盖不造原图；PDF继续仅附件下载不内嵌；视频无音轨不声称复制；PNG仅称编码优化。保留修改/丢失时的原预览错误反馈。中英词典、DESIGN、README、ui-flow、v1-spec和localization同步。

新增 tests/detail-layout-browser.cjs，两平台私有素材、独立服务/数据库，Windows/WSL各28组布局+7组流程通过，页面异常0：
1. 真实JPEG导出，两图加载；摘要字节与指纹一致、质量90和画质预设可读，原始JSON默认折叠且可展开核查。
2. 中英×深浅×七视口（320×568、390×640、768×900、1001×640、1440×640、1440×900、844×390），>=12px/44px、无横向溢出、长路径不超过3行且可读，关闭叉号固定可达，叉号/Escape返回焦点。
3. PNG无收益预览字节相同，失败无虚假预览或NaN/undefined；视频两份元信息和真实播放，PDF仅两份附件实际下载并核对SHA/nosniff。
4. 明确确认私有JPEG直接覆盖后仅展示真实结果并说明原件不可比。
5. 真实优化结果同参数再次命中duplicate，中英均显示未再编码与任务设置，技术记录保留skipped。
6. 私有JPEG真实备份、缩到320px后恢复，两个预览字节/尺寸回原件；原处理320px记录与当前元信息分开。
证据：.mediaslimx/import-tests/windows-detail-layout-d9061272-ffd6-40a2-ad3b-8154091d9b7c/ 与 wsl-detail-layout-ec00ed20-7cf1-460d-bcfe-f001de765ce8/，包含detail-readable-desktop.png/mobile.png和report.json，全部Git忽略。

原有bilingual-layout两平台各226组通过：windows-bilingual-5072383f-ee1b-4c92-9c94-126a6505cc5b/、wsl-bilingual-2af14ea2-5493-4348-a47f-3dff3cc0da95/。node语法检查通过，DESIGN.md lint 0 errors/0 warnings。仅前端/文档改动，不重复无关后端写入单测。手机仍为Chrome视口模拟，不等同实体手机或Safari实测。

只读验证当前Windows8766的HTML/CSS/JS/词典SHA与工作区一致；无需服务重启，没有处理用户媒体、删除/归档用户任务或发布项目，刷新可见。

## 便携分发准备与体积收尾（2026-10-17）

- [x] 实测旧197MiB原型的ZIP组件占比：通用FFmpeg/ffprobe占压缩数据约165MiB（84%）；通过精简离线引擎解决主要体积来源，暂不增加首次联网安装器。
- [x] 从固定FFmpeg9.0.2/x264源码与独立LLVM-MinGW工具链构建Windows x64引擎。两个EXE合计8.44MiB、ZIP约3.42MiB；Windows受限PATH真实14项通过，覆盖三预设、保尺寸/缩放、AAC/无音轨、音轨packet SHA保留、全量解码及损坏拒绝。未借用编译工具链运行时DLL。对应源码、官方签名、配方、配置、许可证和校验材料由脚本保存，详见ffmpeg-engine.md。
- [x] 构建新增固定Windows依赖集、来源材料清单校验、公开源码白名单快照、源码树指纹、独立源码材料companion与ZIP体积分项。内部候选与旧原型并存；缺材料/真实干净环境时保留发行阻塞，不自动上传。
- [x] Python运行依赖官方wheel/sdist与安装内容逐文件比对，收集Python、qpdf、Tcl/Tk等材料。补齐PyInstaller实际引入的setuptools/vendor许可证，保存微软条款、准确OpenSSL源许可证与lxml Windows依赖固定gitlink源码/MSVC配方。尚需复核lxml wheel与所收集输入及重链接材料的实际对应、基础Python libffi DLL适用通知来源；不把下载源码包等同完整许可核实。
- [x] 材料阶段Windows/WSL后端各128项回归：Windows127通过/1权限跳过，WSL117通过/11平台跳过。全量发现的Windows短路径/长路径源码边界比较已修复，受影响7项两平台分别复验通过。后续停止修复后的136项最终基线见下方。
- [x] 准备只读Windows环境探测、需明确授权的Sandbox启用脚本（NoRestart）、禁网且最小目录映射的验收kit、无开发依赖的PowerShell验收harness。旧原型宿主自测8组通过，仅证明脚本可用，不当作干净系统验收。3项安全ZIP路径检查通过。
- [ ] 真实干净Windows客体执行：用户后续明确批准后已通过UAC启用Sandbox，Windows返回需要重启，仍待用户手动重启后执行；未创建测试账户或启动客体。标准用户、真实中文profile、真实默认浏览器/系统目录点选和下载标记需要实际观察证据，不能通过改环境变量或报告字段代替。
- [ ] 第三方剩余来源/许可核实、真实干净Windows验收完成后再评估正式分发。无GitHub上传、发布、签名完成或SmartScreen通过的声明。

仅在项目忽略目录制作TX原站矢量标识的封面署名预览，原站只读，不改TX项目、不把作者标识自动混入MIT产品资产。主标识保持MediaSlim X；小型“by TX”可作为系列来源署名，等待用户审阅。

### 停止时目录窗口仍打开的修复

首次35.62MiB候选通过导出、预览、CSV、导入释放及系统窗口取消，但独立portable最后一组发现Ctrl+Break退出等待未完成的目录选择请求，15秒不能结束；没有将其记作完整8组通过。开发机验收harness的8组则只包含空闲服务强制终止后数据重启，文档和报告补充两种退出方式的差异。

修复增加LocalServer，在HTTP请求drain之前关闭本FolderBrowser拥有的选择器，按独立Event/生命周期锁保护spawn与迟到授权竞态，保留原FFmpeg/PDF Job、浏览器脱离及媒体原子写入机制。HTTP宽限5秒，finally重复关闭安全，不增加公共HTTP停止接口。新增7项风险测试，Windows/WSL完成135项全量：分别134通过/1跳过、121通过/14跳过。使用新的packaging-r2候选重建，不覆盖第一次候选或旧197MiB原型。

实际WSL CLI检查进一步发现绕过Uvicorn原包装后SIGINT会打印KeyboardInterrupt；只补捕获该正常中断，其他异常仍抛出并保留finally清理，再加1项测试。最终两平台各136项全量通过：Windows135/1跳过、WSL122/14跳过。真实WSL CLI两次SIGINT均exit0无堆栈，约0.27秒关闭端口/释放锁，同数据/端口复启仍保留任务与CSV。

最终冻结候选为 `MediaSlimX-windows-x64-validation-candidate-packaging-r3.zip`，37,469,902字节（35.73MiB），完整解压83,923,023字节（80.04MiB），下载比旧原型减少81.9%；准确SHA及路径见packaging.md。最终真实ZIP的portable8组全部通过，含活动FFmpeg+系统选择器的Ctrl+Break退出及浏览器存活；独立host harness8组通过但只验证空闲强制退出后持久重启，不当作真干净客体验收。

证据：`.mediaslimx/packaging/验证 space 511bbb05f03543feb7cf6d4116ca5de5/report.json`、`.mediaslimx/clean-windows/a770b11622254776b275a6ef3c2ed4d4/results-host-self-test/report.json`、`.mediaslimx/validation-wsl/real-cli-r3-204ad2ec188948028d336a7b034f4be7/report.json`。所有证据/包/素材Git忽略；未接触既有8765/8766服务或用户任务，未启用Sandbox、修改系统账户或重启，没有上传发布。

## 经授权启用 Sandbox，等待手动重启（2026-10-17）

用户明确批准“允许启用，不自动重启”后，于10:58（Asia/Shanghai）通过Windows UAC执行已审查的 `Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All -NoRestart`。实际由Disabled变为Enabled，Windows返回 `RestartNeeded=true`，随后非管理员只读复查显示功能安装状态1、`WindowsSandbox.exe`仍不存在、不可启动。未自动重启、未启动客体，也未把启用功能记作干净系统验收通过。启用与复查原始记录保存在 `.mediaslimx/clean-windows/enable-sandbox-20261017-105555/`；此前“未启用”的段落为当时历史快照。

同时修正启用脚本的状态表达：Enable命令结果并不含可靠State，改为再次实际查询；已Enabled的情况不重复启用，也不把重启需求猜为false，而是标记未重新判断。六组普通非管理员纯mock验证通过，保留NoRestart、WhatIf不变更及入口权限拒绝；没有为测试再次实际启用或提权。

客体验收流程改用绑定run ID、r3 ZIP SHA和阶段nonce的JSON观察握手，不再需要通过GUI自动操作终端；宿主自测不能接受clean观察答案，缺文件或无效输入保持未验证。客体中任务重启后重新打开当前认证会话，防止浏览器保留过期令牌，阶段元信息取重启后的实际端口且不包含令牌。八组观察边界与原三组ZIP边界测试通过；r3运行ZIP保持原指纹，新kit见clean-windows.md，未填写任何观察答案或伪造客体结果。待用户保存工作、结束任务并手动重启后继续真实Windows Sandbox验收。

最终冻结新kit为 `.mediaslimx/clean-windows/1e87942f0bb64a1f9213c543721ccb68/`，宿主兼容8组通过，报告保留 `host_self_test_passed`、`clean_windows=false`；真实客体输出仍仅 `results/NOT-RUN.json`。没有更换或重建35.73MiB的r3运行包。

## 发布说明、实际展示与界面形态评估（2026-10-17）

用户明确延后重启，本轮未再次操作Windows功能、未启动Sandbox、未重启或中断其他项目。用户确定首发使用便携包和源码、下载托管GitHub Releases，个人站介绍与跳转；在线引导包不在本轮实现。当前35.73MiB离线r3候选保持原指纹，发行阻塞仍以release-guide/distribution-materials/clean-windows为准，没有上传、提交或发布。

- [x] 统一中英文README导航；新增发布指南、双语Release正文草稿与案例文案，明确源码ZIP与可运行便携ZIP的区别，不编造版本、仓库拥有者或下载地址。
- [x] 独立WSL/Linux服务使用6项自制合成素材跑真实扫描、类型勾选、事前计划、默认导出、图片对照与CSV。5项成功、1项PDF无收益；889,747B→465,939B，全部原件SHA256保持。数字只说明这组合成素材，不是FIRANO、网站加载或固定压缩率成果。浏览器页面错误及第三方请求均0，独立服务与Chrome已关闭，未触碰8765/8766和用户任务。
- [x] `assets/showcase/` 保存1600×1000中英文工作台、结果与图片对照、逐文件manifest和真实CSV。原始33.04秒WebM及完整证据保存在忽略目录；维护脚本可复现捕获，不增加产品运行依赖。
- [x] 基于现有DESIGN和产品标记制作4张中英文分享/视频封面；不加入待定TX图形或虚构桌面外框。来源与导出哈希见assets/launch/manifest.json。
- [x] 完成建议40.0秒六镜脚本、逐镜预览、6张1920×1080静帧和本地审阅页。参数层/进度分别核实为WebM片内11.8/17.5秒，修正脚本事件时间与片内时间的差异；未渲染最终视频，等待明确的分镜批准。
- [x] 记录独立窗口、PWA和Chrome扩展的评估：后续若做Windows客户端，优先轻量窗口复用既有网页与Python核心；服务器保留浏览器。PWA不自动启动当前本机引擎；扩展应先有浏览器上传前优化等具体需求。三项本轮均未实现或改动架构。

本轮只变更文档、展示资产与开发捕获脚本；没有重跑不受影响的全部后端测试。脚本语法、文档链接、资产哈希、实际素材和静态审阅页单独验证，细节见launch-assets.md与相关manifest。截图来自桌面视口，不是实体手机或干净Windows验收。

## 素材审阅页说明宽度与演示初剪（2026-10-17）

用户指出审阅页多处说明提前换行。确认是全局 `p{max-width:78ch}` 对中文限制过窄，移除行长上限，保留14px正文、自然换行、pretty及长链接兜底；说明现在使用各自区块完整宽度。精简素材说明，宽窗口不再留下短孤行，不强制单行或拉伸字距。页首明确这里只审阅封面、分镜和视频，实际处理继续进入工具工作台；不把内部审阅页塞进用户启动流程。

用户在40秒六镜合成确认中回复“分镜没问题”，LOGO统一延后。已按原版完成中文无声初剪：40.000秒、1920×1080、30fps、1200帧、H.264/yuv420p、faststart、无音轨，1,432,789字节（1.37MiB）。真实操作保持原速，只有事前计划与已完成结果各停留1.2秒；无循环/拉慢/冻结进行中进度。沿用现版LOGO，作者站点地址待定不加占位链接，品牌文档保留来源与未来案例页衔接规划。中英文制作说明、分镜状态和审阅页同步更新，没有新增运行依赖。

视频与清单：`.mediaslimx/showcase/demo-first-cut-732450b4-7b0d-4993-827b-0795ac0ac920/`，MP4 SHA-256 `6b24ec773697901fb4ac60f34536a7420d30dac9d7ce917c8e3cd77dca10f70a`。逐镜视觉检查、ffprobe及Chrome实际加载/跳转/播放通过。新增维护脚本 `scripts/render-demo-video.py`，限定项目展示目录，并在写入前校验已审原片哈希；错误来源拒绝且不创建目标的检查通过，保留所有旧素材和视频。

最终静态审阅页在1540×1244及1024/768/390/320宽度、中文/长英文共10组检查通过，四处说明均满容器宽，无横向溢出，文字≥12px、导航≥44px，两视频正确加载40.00/33.04秒，页面错误与外部请求为0。证据：`.mediaslimx/showcase/review-final-1792209715290/`。这仍是WSL桌面浏览器视口检查，不代表实体手机或干净Windows验收；未修改8765/8766服务、候选包、用户媒体或其他项目，没有发布、上传或重启。

## Windows独立窗口与新便携候选（2026-10-17）

用户明确要求双击后使用独立小窗口、关闭时安全退出自己的后台，服务器继续保留网页；同时禁止本轮上传发布和重启电脑。本阶段在现有网页与Python核心外增加轻量WebView2窗口，不重写媒体处理逻辑、不实现PWA或浏览器扩展。此前章节的“尚无独立窗口”属于当时历史状态。

- [x] 新增原生Windows窗口host、锁定WebView2 SDK 1.0.4258.31与构建配方。仅允许本实例回环工作台、无JS/native公共关闭桥；UI和本机服务通过私有管道协作，host错误或EOF进入所属实例安全排空。SDK官方nupkg按固定SHA-256/SHA-512核对，LICENSE/NOTICE的BSD 3-Clause相关条款已实际核对并随包保存，不把SDK许可当作Runtime再分发材料。
- [x] 新增窗口协调器，空闲/繁忙关闭确认、停止新变更、取消剩余任务、事务结束后收尾、异常host与启动失败清理均按实例拥有。Windows Job仅拥有本次启动的窗口与工作进程，不按名称关闭Python、FFmpeg、Edge或其他项目。针对venv转发程序遗留真实worker的问题，实际进程测试后修复为仅收尾仍存活的自有Popen PID树，无关进程保持存活。
- [x] `Start-MediaSlimX.cmd` 改为独立窗口入口，源码数据 `.mediaslimx/windows-window`；旧网页入口单独保留为 `Start-MediaSlimX-Browser.cmd`，原数据 `.mediaslimx/windows` 与8766不变。WSL/Linux仍使用 `.venv`、`.mediaslimx/wsl` 与服务器网页。窗口二次启动核对所属进程后激活原窗口，不接管其他服务。
- [x] 构建器增加可选 `-WindowHostMaterials` / `--window-host-materials`。提供时使用 `window-entry.py` 和 `--windowed`；省略时保持旧控制台/浏览器构建。固定bin/材料名单、SDK pin与源输入hash校验，编译源码/配方/许可/证据纳入对应companion，邻近WebView测试profile与缓存严格排除。源码白名单包含新C#组件、精确SDK JSON和两个启动入口，不广泛收集运行JSON。
- [x] GUI子系统下冻结PDF/目录助手从父进程继承的标准句柄复制JSON管道，不额外打开控制台，不把worker协议写入主程序日志。真实冻结EXE的PDF检查、实际压缩与页面/流摘要一致、坏JSON/未知操作拒绝及原件SHA保持通过。
- [x] 构建全新 `windows-window-r1`，不覆盖浏览器r3或旧197MiB原型。运行ZIP为37,788,573B（36.04MiB），完整解压84,931,564B（81.00MiB）；SDK/源码材料另存278,164,208B companion。窗口包依赖机器已安装WebView2 Evergreen Runtime，未捆绑、未自动安装或静默回退浏览器，不宣传缺Runtime的机器也能仅解压离线运行。
- [x] 同步窗口使用说明、平台与便携构建文档，窗口与旧浏览器包各自记录体积、指纹、退出方式和验收范围。源码首次准备依赖可能联网，便携运行与媒体处理没有新增在线安装器或自动更新流程。

### 本阶段实际验证范围

窗口生命周期阶段一次完整回归快照：Windows166项（165通过/1符号链接权限跳过），WSL166项（151通过/15平台跳过）。覆盖协调器、关闭协议、繁忙确认、错误/EOF、启动失败、关闭期间变更503及原有Host/鉴权/CSRF约束。后来材料定向测试在两平台各14项通过，含文件哈希/路径、源码变化拒绝、SDK pin、WebView缓存排除及旧浏览器证据不能通过窗口门槛；这些执行有重叠，不将不同快照简单相加为新总数。

本机源码窗口已真实运行在WebView2中，两张自制合成图片扫描与导出2项成功；同数据目录的二次pythonw启动，以及从不同工作目录执行 `start-window.ps1`，均验证复用同一实例。新窗口ZIP已完整解压至独立目录，1397项文件、PE subsystem=2（GUI）；从该实际解压EXE在受限PATH执行PDF worker四组检查全部通过。没有打开用户素材或接管现有8765/8766服务。

源码实际显示进程异常也已验证：62张合成图处理中，经临时CDP `Browser.close` 模拟显示端故障，后台安全排空，任务为cancelled（1成功/61取消）；work空、窗口记录移除，登记的8个所属进程全部退出，原件SHA保持，原有8765/8766服务继续可用。CSV、结果图片HTTP预览与英文切换通过。证据：`.mediaslimx/window-tests/window space aa143e38c90b46318f463d0147b70390/source-close-validation.json`。这是实际进程故障退出，不是物理叉号正常关闭。

窗口ZIP：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r1.zip`，SHA-256 `3a811c75b83045ea3f0adbff91b6067919bdcef6949da8afb293d562ca1fe502`。Payload SHA-256 `f5f4fa15f2030af356489c3aaec04cb581f7eb434c087418270443a5a64640c8`，源码树 `bc0b0f26b5a4741263c6c178d5bf47dc66abb036889aae23e7d9e5283fa76db1`；旧r3指纹保持原值，不能用旧包证据替代新payload。PDF解压包证据：`.mediaslimx/packaging/window-workers-dfa39a2c09994c32972517a7a04a3a9e/report.json`。

- [x] 后续发现的服务线程Thread.start失败退出卡住、停止异常排空与无Pictures默认范围已修复；图片放大由target=blank改为页面内dialog，键盘/关闭和布局另行验证。原生窗口Shown后按当前屏幕工作区夹紧尺寸/位置，离线重编host并保存新材料。稳定后独立构建r2，不覆盖上述r1阶段包或复用其指纹。
- [ ] 物理系统叉号、繁忙关闭确认、原生目录人工点选与缺Runtime的实际观察需补证据；当前系统UI工具在WSL工作目录初始化失败，不能把协调器测试、CDP显示端故障或无法执行的点击记作人工/系统UI验收。
- [ ] 真实干净Windows验收仍待用户手动重启后开展；既有Sandbox套件绑定浏览器r3而不是新窗口包，不能复用为窗口通过记录。本轮不重启、不启动Sandbox或改系统设置。
- [ ] lxml/iconv精确来源及重链接材料、基础Python libffi适用通知继续保留为分发阻塞；新SDK材料许可已核对不等于整包法律认证。新包状态仍为 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`，未签名、未上传或发布。

### r2边界收尾与重建快照

受影响的后端风险测试Windows、WSL各56项通过，最后窗口模块17项各通过；两平台图片放大均完成20组布局与完整交互，页面错误0、外部弹窗0。这些是有重叠的定向执行快照，不将数量简单相加，不为文档改动重复全量回归。先前材料与兼容门槛14项各通过的记录保留。

已按稳定代码与最新host材料生成 `MediaSlimX-windows-x64-validation-candidate-windows-window-r2.zip`：37,792,731B（36.04MiB），完整解压84,943,748B（81.01MiB）；对应源码材料ZIP278,183,586B，独立于日常运行下载。新ZIP真正解压到独立测试目录，共1397项文件，确认PE subsystem=2（GUI）。从这份解压EXE再执行PDF worker四组全部通过：普通合成PDF检查、实际压缩与页面/流摘要一致、坏JSON/未知操作拒绝、原件SHA保持。没有启动服务或改动用户任务。

| r2指纹 | SHA-256 |
|---|---|
| 运行ZIP | `1b34983bd5fcbc0af95b4ccb6fcc1dac015c34e14a6207d7bae1a7ce729bd77f` |
| 对应材料ZIP | `564a8b9f5d2be7018e9c1c80bc9fc02d5c1400187d4e298b0da78e6b962e7d9d` |
| Payload | `cb021caceb892ade31ec06f690ce52b6c78bd432a0a17246d7b3d81d566504f0` |
| 源码树 | `1f76580d63ce0095d621a62987140e96c73b2a89d542cc0877311fbfcb85ad31` |
| 窗口材料清单 | `8a127528eb034be24b48b7402879429936a735640261db3763abd522500787c3` |

r2 PDF证据：`.mediaslimx/packaging/window-workers-e81157c470794664af32757a3c8b2819/report.json`。独立解压目录：`.mediaslimx/packaging/window-zip-r2-60817caa6b3f4350ac9a50943698b0cd/MediaSlimX/`，另用于实际主窗验收。r1、浏览器r3及其原证据保持，所有新包仍为本机候选；不上传、不发布、不重启，干净Windows和材料三项阻塞不变。

### r2实际ZIP主窗与显示进程故障收尾

- [x] 在受限PATH、不同工作目录、中文空格解压目录中，真实WebView2主窗完成JPG/PNG/WebP/MP4/PDF五格式扫描与导出，4项成功、WebP无收益；原件SHA全部保持，不用协议夹具伪造媒体结果。
- [x] 页面内图片100%放大、Esc/焦点返回、CSV按钮实际下载、视频实际播放、系统picker取消、英文与主题切换均通过；无溢出、页面错误或外部新窗口。重复EXE激活同owner/host，不另起服务。
- [x] 真实合成JPEG备份覆盖与恢复通过，备份保留；同一测试数据重启后，已完成任务仍可读。
- [x] 同一脚本在CIM确认自有FFmpeg活动、API任务仍running时经临时CDP `Browser.close` 模拟显示进程故障，后台安全排空为task cancelled（1项取消），登记10个所属进程全部退出，work空、window.json清除。完成任务、CSV及备份保留，6项原件SHA保持，既有8765/8766服务继续可用；未按进程名结束其他项目。

证据目录：`.mediaslimx/window-tests/portable 中文 space 150fdca05ea34439880d001fdcc9c058/`，包含 `portable-ui-report.json`、`portable-close-report.json` 和 `portable-webview-english.png`。这是**实际显示进程故障的安全退出**，不冒充物理X点击/繁忙确认；目录人工点选、缺Runtime及干净机器仍保留未验状态。产品与r2包未因修正验收脚本而改动或重建。

## 导入上限可见与大批量目录引导（源码更新，2026-10-17）

本轮改善浏览器导入超过上限后的选择与状态保留，不放宽后端200项/2GiB、单媒体大小或8GiB声明配额，不扩展格式。已运行的r2不会随源码更改自动更新；保持原服务和用户任务，后续新候选独立生成，由用户自行决定何时停止旧实例换包。

- [x] 空状态入口常显200项/2GiB与大批量目录扫描说明，避免传入前无法得知限制。数量、目录项与层级超限对照已发现值及上限；批容量仅说明2GiB上限，不展示精确已发现字节。明确0项新增传入，不截取前200项、不分配/上传部分列表；现有列表、勾选、输出与模式保持。
- [x] 主入口引导运行设备目录扫描，目录面板明确“扫描此目录”和“系统选择并扫描”；两者只扫描，仍需点开始优化。取消或扫描失败不丢旧导入，只有扫描成功才切换来源/列表。超限引导默认export；原有主动“选择原目录，备份后优化”成功后仍准备backup，不混淆两种意图。
- [x] 成功切换目录不自动discard旧导入副本，转入独立手动空间管理。8GiB配额不足使用独立说明与存储入口，不自动清理、释放或扩大配额。现有清理的影响预览、版本检查、主动确认及任务副本保护保持。
- [x] 修复收集器中单PDF超过64MiB时的闭包误用，说明超过64MiB，不承诺面板显示其具体大小。导入收集单元检查16项通过；目录扫描仍遵守PDF大小和原有格式支持条件，不把转目录当作绕过限制。
- [x] 同步中英文README、ui-flow、v1-spec与privacy-security，说明当前连接设备/服务器的路径边界、扫描不等于开始优化，以及旧副本不自动删除。
- [x] 修复回目录入口的旧清空委托：入口移到限额提示行，点击只打开目录面板，取消不discard、不丢已有列表。短桌面主区滚动、workbench保留360px可用高度；不缩字或隐藏操作。
- [x] Windows原生Chrome与WSL/Linux Chrome的独立指导测试均通过：每平台14组行为、20组限额面板、24组helper与5组workbench可达检查，错误0、创建任务0。实际使用203张合成微JPEG验证列表与超限，边界case无额外上传；旧备份快捷流程4组通过。单元16项通过的范围单独保留，不把布局模拟当作实体手机验收。
- [x] 代码与验证明确冻结后生成新的 `windows-window-r3`，保留r2及原指纹；只做独立解压、PDF worker和静态资源校验，没有停止或替换用户正在使用的默认便携实例，不上传、发布或重启。

最终独立浏览器证据：WSL `.mediaslimx/import-tests/wsl-guidance-7c63d37a-9928-4a6f-b075-b061feb1ad84/report.json`；Windows `.mediaslimx/import-tests/windows-guidance-c2a7a07e-652d-4dc3-a790-6796c5c226b8/report.json`。测试退出仅回收所属独立服务/进程树，不操作默认r2数据或实际用户素材。

原 `tests/import-browser.cjs` 本轮另在WSL复验，最终6项全过、页面错误0，覆盖真实JPG/MP4拖入、同名追加、压缩预览、ZIP、取消、清空与孤儿副本清理。首轮出现一次30秒XHR等待超时，随后诊断同流程及原脚本复跑连续通过，尚未定位原因，不称全过程无失败。产品与测试未因此修改，r3包指纹不变；最终证据 `.mediaslimx/import-tests/wsl-73e5bee1-ee9f-4de0-bbfd-83a932b231b7/report.json`。

### r3构建与独立解压校验

运行ZIP：`.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r3.zip`，37,797,147B（36.05MiB）；完整解压84,956,067B（81.02MiB）。对应材料ZIP为278,206,332B，仍独立于日常下载。FFmpeg、Python review-r2与锁定WebView2 host材料复用r2已保存的相同清单，没有为本轮纯前端引导增加运行库。

| r3指纹 | SHA-256 |
|---|---|
| 运行ZIP | `9d386acc2684dbf26d6b62418e38a34c3705e42e8fbb8e7321d028a23d413b00` |
| 对应材料ZIP | `5d910303e2de2b55fd0f62db5ba42500859697d51d84af157b379873d295e139` |
| Payload | `9824370c280ed18fd7c52861ca34d31e269e3019501270551813d538f58bf9c8` |
| 源码树 | `077ec12faee75b3a2116b79dfdcadf7b9015aea91a9395c73f2dcf4868fbbf4a` |
| 复用窗口材料清单 | `8a127528eb034be24b48b7402879429936a735640261db3763abd522500787c3` |

真实ZIP完整解压到 `.mediaslimx/packaging/window-zip-r3-755b85c7d6c043fda595307c17d4f048/MediaSlimX/`，1397项文件，确认PE subsystem=2（GUI）。8个静态资源 `app.js`、`index.html`、`style.css`、`storage.js`、`import-tree.js`、`i18n.js`、`i18n-catalog.js`、`theme.js` 的当前源码/ZIP成员/真实解压文件三方字节与SHA-256全部一致；证据为解压根旁 `static-assets-report.json`。

从r3实际解压EXE在受限PATH中执行无界面PDF worker，合成PDF检查、真实压缩及页面/流摘要一致、坏JSON/未知操作拒绝、原件SHA保持四组通过。证据：`.mediaslimx/packaging/window-workers-dc9f2647258347279c7bc4ebb7be91bf/report.json`。没有启动r3主窗或新服务，不把源码Chrome/视口检查写成r3原生主窗或实体手机验收，也不复用r2的真实主窗证据作为新payload验收。

已有用户实例未被开发命令停止或改写；本轮没有在测试前单独核实其存活状态，不依据事后旧PID记录断言它仍运行或何时退出。换包时机由用户决定。三项原分发阻塞保持：lxml/iconv对应来源与重链接材料、基础Python libffi适用通知、真实干净Windows验收。新包仍为 `LOCAL_VALIDATION_CANDIDATE_NOT_FOR_PUBLICATION`，未上传、发布或重启。

## 单个真实目录拖入直扫与r4准备（2026-10-17）

用户要求在实际新窗口完成验收，并让本机单目录拖入不必超量后再选择同一目录。本阶段只将Windows独立窗口的**拖入单个真实目录**切为授权后正常扫描：默认导出、保留原件，只扫描不优化或覆盖，仍需Start。散文件、多目录、普通浏览器/远程连接及“导入文件夹”按钮继续副本导入；FileList不推导父目录，200项/2GiB和媒体边界保持。

- [x] 原生host仅接受所属顶层工作台的固定操作与一个真实CoreWebView2File目录对象，不接受JSON任意路径；经私有管道由Python再次校验目录链、隐藏/依赖/运行数据/输出备份并授权，host和owner closing后均拒绝。没有增加公开HTTP目录授权、关闭或通用native接口。
- [x] 修复Engine默认mediaslimx-export/backup及复数名称未登记时被扫描的问题。此前r3真实窗口扫描合成范围得到203而非201，暴露此边界，未记作正确结果；本轮受影响Engine25项测试在Windows/WSL均通过。
- [x] 新目录/桥/窗口风险检查WSL44项通过；Windows旧27项及新17项通过。前端语法和import collector单元16项通过；native host已离线重编并保存与新C#一致的15项材料，打包器复核通过，无需重复编译。
- [x] 同步README中英、ui-flow、v1-spec与隐私边界，明确仅单目录拖入直扫，“导入文件夹”按钮仍是受限副本导入，不从子file推parent。空态中英提示精确到“拖入单个文件夹直接扫描”。
- [x] 代码冻结后生成独立windows-window-r4，保留r3；真实ZIP完整解压、PDF worker四组与八静态三方hash通过，随后由独立实际主窗验收补验证，不提前标通过。

前置r3实际WebView2检查已覆盖导入200/201与取消/失败后的目录引导；显示进程故障测试确认10个所属进程结束、任务cancelled、211项合成原件SHA与203项保留文件/副本及备份保持，8765/8766前后可达。证据 `.mediaslimx/window-tests/r3 中文 space 24ef889d4f634d88946da32858795cdc/window-close-report.json`。只确认开发未发送停止用户默认实例或改其数据命令，不以事后旧PID不活推断其被开发关闭或仍运行。物理X/YesNo仍受CUA sandboxCwd非local URI初始化问题阻塞，不能将CDP或协议检查记作物理点击。无发布、重启或系统变更。

### r4实际ZIP构建校验

运行ZIP `.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r4.zip` 为37,801,460B（36.05MiB），完整解压84,967,872B（81.03MiB）；配套材料ZIP278,241,630B，独立于运行下载。窗口host15项材料已与离线编译新C#核对，没有重复编译或复用r3旧host清单。

| r4指纹 | SHA-256 |
|---|---|
| 运行ZIP | `32cfbd14aac7703d6fd4e7dbf7e074ffaa23895b67e5ecee423be162a472fde4` |
| 对应材料ZIP | `93436981b54edc329cec562bc933554287763d176a67ca5e8e5834bde41b6784` |
| Payload | `e0a1917e029de6c9ab5d365ed74bdf0419ec01f7fd20084c7da18b7ea5a65e9a` |
| 源码树 | `21c4a407adb22fb1274ab12b0d42c3655c9ec9c86de4d92756fa34d51304e36d` |
| 新窗口材料清单 | `fc09045c7bf7b61df38403ac5de6dd197eafbd7e5c7a349c76c614c6025ec24e` |

真实ZIP独立解压到 `.mediaslimx/packaging/window-zip-r4-08682eb958c6469ea1e1218db8c7b86a/MediaSlimX/`，1397项文件、PE GUI子系统确认。8个静态资源app/index/style/storage/import-tree/i18n/catalog/theme的当前源码/ZIP成员/解压字节与SHA全部一致，报告在解压根旁 `static-assets-report.json`。PDF worker四组通过，报告 `.mediaslimx/packaging/window-workers-0ed1c0339b25484381f8a761502d5328/report.json`。

打包验证仅运行自己生成的无界面worker，没有开启r4主窗或服务，不操作用户default数据或发出停止命令。完整r4原生主窗及真实单目录拖入随后独立验收，不预记通过；三项原发布阻塞保持，不上传、发布或重启。

### r4实际窗口验收与r5提示收尾

r4真实ZIP主窗12项通过，覆盖200/201导入引导、目录选择取消/400失败保留、扫描201项且4个目录排除、201项真实压缩全部success与CSV、五格式逐项success/CSV/原件hash、100%图片放大/视频、中英明暗4布局、系统picker启动后网页取消和两项任务持久化。真实WebView2目录对象9项通过，含201目录自动扫描、未授权新目录仅授权精确root、无额外上传/任务、隐藏目录与回退拒绝。

观察自有FFmpeg实际running后经CDP模拟显示故障，11个所属进程（含bootloader）全部退出，HTTP/CDP端口关闭、work空、任务cancelled，212项原件hash和409项保留文件不变，8765/8766前后可达。重开3项通过：任务与精确目录授权保留、不自动开任务、二次启动复用同owner/host；空闲显示故障后8个所属进程/两端口退出。

证据 `.mediaslimx/window-tests/r4 中文 space 524a2e69ea79473496a38fb7c5bd0f12/` 中的 `window-ui-report.json`、`window-native-directory-drop.json`、`window-close-report.json`、`window-reopen-report.json`。这些不是物理X/YesNo点击或Explorer手拖；用户协助手点尚无结果，不能把未回应视为验证通过。

随后复核发现重复拖入忙碌时的泛错误会残留至扫描成功，r5仅在native成功分支增加clearError，保留clearIntakeGuidance与原有状态提交；专测补充成功后错误区隐藏断言，前端语法通过。r4历史通过范围不抹去此后发现的问题，r5独立新建，不覆盖r4或复用其主窗结论。

### r5独立打包历史记录

运行ZIP `.mediaslimx/packaging/MediaSlimX-windows-x64-validation-candidate-windows-window-r5.zip` 为37,802,628B（36.05MiB），完整解压84,967,885B（81.03MiB）；配套材料278,245,129B。复用r4的fc090窗口材料，无需重编host。

| r5指纹 | SHA-256 |
|---|---|
| 运行ZIP | `86878fa51eb9d55eea9b004198a4f08044a885849a4223a1a8af1d8fd4a6be77` |
| 对应材料ZIP | `87d04818eec6060b41139981e4e84267610d5d985838e0e593cd90687674effe` |
| Payload | `feef68252dcfd9db12c66f6f98299295031169d4e428c2a6567a92474c84dbf3` |
| 源码树 | `024652eba6285319b4a300e317eff9bed50ab693b2c0d3fb65aba2c69890696f` |
| 复用窗口材料清单 | `fc09045c7bf7b61df38403ac5de6dd197eafbd7e5c7a349c76c614c6025ec24e` |

真实ZIP完整解压到 `.mediaslimx/packaging/window-zip-r5-da674dacb4244efd92087969df5d8294/MediaSlimX/`，1397项文件、PE GUI子系统确认；八静态源码/ZIP/解压字节与SHA全部一致，报告在解压根旁 `static-assets-report.json`。从该EXE执行PDF worker四组通过，证据 `.mediaslimx/packaging/window-workers-1811f1d9c9ee4878b038d149e2d34bd7/report.json`。该打包阶段只运行自有无界面worker，后续实际窗口结果独立记录如下。未发停止用户实例或修改default数据命令，未上传、发布或重启。

### r5最终本机可执行验收

r5实际解压EXE主窗12项通过，覆盖200/201导入引导、取消/失败保留、201项目录真实压缩、五格式/CSV/预览、中英明暗和系统picker实际启动后网页取消。真实WebView2目录对象9项通过，含精确新root授权、不扩大父目录、201目录无副本上传/任务，以及成功后旧busy提示隐藏的新断言。

观察实际自有FFmpeg后以CDP模拟显示端故障，11个所属进程退出、HTTP/CDP私有端口关闭、work空、任务cancelled，212项原件与409项保留文件hash不变。重开3项通过：任务与精确授权保留且不自动启动任务、重复启动同owner/host；空闲显示故障后8个所属进程/两端口退出。证据 `.mediaslimx/window-tests/r5 中文 space 3fef68a559c64429a5888d6f26db6c1e/` 中的四份 `window-*-report.json` / `window-native-directory-drop.json`。

无关服务基线与结束时均为8765不可达、8766可达；没有向其他实例发停止命令，不把8765既有不可达状态归因于本轮。普通浏览器WSL回归14行为、20panel、24helper、5workbench通过，证据 `.mediaslimx/import-tests/wsl-guidance-94929069-d598-4a13-8f92-cfd7de2784bb/report.json`，自有41434端口已关闭。引擎25项双平台与窄桥44项WSL/Windows27+17项风险结果保持。

该轮自动化没有物理Explorer手拖或标题栏X/YesNo点击，CUA路径初始化失败；随后人工协作结果与更正如下。目录人工点选、缺Runtime、普通账户及真实干净Windows仍未验。r5保留其当时三项分发阻塞，纯文档不改冻结包或hash，不重建、不发布、不重启。

### r5人工关闭范围更正

用户实际点空闲标题栏X，机器核对13项任务已完成、所属进程/私有端口退出，224原件及既有结果保持；繁忙X后用户选择否，同owner/host存活、任务running且实际FFmpeg继续，以上两项有证据。最后一次X后用户更正未看到或确认点击Yes，先前Yes说法撤回。最终机器核验20项success/completed、231原件/426保留文件/20结果hash保持、自有后台退出，`yes_confirmed=false`、`remaining_cancel_observed=false`；不计作繁忙Yes或剩余取消通过，8765=false/8766=true前后不变。证据为同r5根的 `manual-idle-close-report.json` 和 `manual-busy-close-report.json`。20合成硬链接视频及owner单核/低优先级只用于隔离测试，不是产品设置。

## 同主题退出层与当前r7候选（2026-10-17）

- [x] 繁忙关闭改为当前主题、单语言HTML层；默认继续，Escape/叉号/继续保留任务并恢复有效焦点，避免No返回时显示skip-link。安全退出只提交一次，显示收尾状态。空闲X直接退出。
- [x] 仅窗口页脚提供“退出工具”，调用真实native Close/OnClosing再由Python协调器判断忙碌，不增加HTTP关闭接口。严格字段/当前nonce/所属顶层来源校验；错误、旧nonce和无pending回应不退出。3秒未shown才撤销nonce并进入单语言默认No系统回退；prefs不授目录或关闭权限。撤销后统一恢复四按钮。
- [x] 生成独立r7，r6仅内部构建过渡、未进入交互验收；所有旧包保持。r7完整解压1341项文件、GUI子系统2；12静态源码/ZIP/解压字节与SHA一致，实际EXE PDF worker四组通过。
- [x] r7实际主窗12项、真实目录对象9项、新关闭UI 7项及21组布局通过；通过产品Quit→真实native Close/OnClosing→协调器→HTML确认层点安全退出，退出前API任务仍running。不是物理X或人工Yes点击。
- [x] Python终态核验任务cancelled（2success/18cancelled），231原件/409保留文件及当前2项成功结果SHA保持，自有PID/HTTP53359/CDP53358自然退出，window.json移除、work空；8765=false/8766=true与基线一致。
- [x] r7重开3项通过：完成任务及精确拖入目录授权持久、不自动续跑，二次启动复用同owner/host；空闲CDP显示端故障后8个所属进程及两私有端口退出。此处不是物理X关闭。
- [x] 随后同一r7包另开隔离窗口，60项合成视频队列仅给测试owner单核、低优先级。人工第一次点物理标题栏X并选继续使用，同owner/host和任务running（16/60）保持；第二次点X并选安全退出，窗口关闭。只读终态核验19success/41cancelled、271原件/2既有文件/19本次结果SHA保持，自有PID与HTTP49956/CDP49955退出、work空，8765=false/8766=true与基线一致。证据 `.mediaslimx/window-tests/r7 中文 space 5d2bb4a7d9194771b7b7e12da5aa5dbb/window-close-ui-exit-report.json`；人看到/选择按钮来自用户回报，机器核验来自任务数据库和文件，不把它写成录屏。

运行ZIP37,688,174B（35.94MiB），完整解压84,710,640B（80.79MiB）；配套源材料262,718,093B，独立于运行下载。

| r7冻结指纹 | SHA-256 |
|---|---|
| 运行ZIP | `5b0662dfab79f67a630a05de1f19528e647d20d16539ee1b0338108150588e34` |
| 对应材料ZIP | `560527a22ae1a2e832f7f079448dc9a11a2b7159cb52fd6f9408c8cc119c5480` |
| Payload | `44ed904a53b86fc99f6db0cd16389763346b6ac5e3a767ae0f507edec1c859be` |
| 冻结源码树 | `c44eeb3527a30217e165858823b0c45c68b8c1d67ba30439ac0ff15a042b0076` |
| 窗口材料清单 | `5e91796ee6ab1b8f661fda9f75431f9078cff6051c927d254a51ca968e8e7a87` |

静态证据 `.mediaslimx/packaging/window-zip-r7-9357f33bb3c5445fa445b36d12d7ce2c/static-assets-report.json`，PDF证据 `.mediaslimx/packaging/window-workers-5b472bd236df43359d4b900fdd5fd604/report.json`。实际窗口证据 `.mediaslimx/window-tests/r7 中文 space bcb26c69f0534989a26d1abde9664177/` 中 `window-ui-report.json`、`window-native-directory-drop.json`、`window-close-ui-report.json`、`window-close-ui-exit-report.json` 与 `window-reopen-report.json`。显示端故障与人工证词仍分开，不把产品Quit触发写成物理标题栏点击。

r7清单仍列四条发行阻塞：GNU libiconv审计材料SSL EOF下载失败、lxml的iconv实现/适用源码与重链接材料、CPython外部库来源与微软运行库分发条款、真实干净Windows未验。物理Explorer手拖、目录人工点选、缺Runtime及普通账户也仍未验。用户不宜重启，本轮不重启或发布；补充文档不重建或追补冻结源码hash。

## 源码已实现：异常中断与安全暂停后的显式续做

SQLite任务与逐文件结果跨重启保留；Engine启动时核对提交边界，将残留running/cancelling/restoring标为interrupted，未完成项标取消。繁忙窗口关闭现在表达为“保留进度并退出”：已完成项及备份保留，剩余项持久记录为安全暂停。下次启动自动**展示**最近一条安全暂停或异常中断任务；不自动压缩、覆盖或恢复。用户主动点击“继续剩余文件”后沿同一任务ID处理剩余项，已完成项不重新编码；每项复核扫描时源指纹、已有备份和目标提交边界，冲突逐项失败。新建任务返回目录选择，不删除历史。

源码隔离合成验证：WSL/Linux和Windows各55项核心/导入/HTTP回归通过，其中6项新风险测试覆盖安全退出导出续做且已完成结果不变、异常重启后源文件变化拒绝覆盖、同任务备份复用与篡改拒绝、导出目标冲突、直接覆盖源变更及导入副本释放。独立WSL服务的浏览器测试 `tests/resume-browser.cjs` 通过，覆盖重启自动展示但不运行、手动续做、中英两语言及320/390/768/1440宽度无横向溢出和无页面异常。此测试以合成记录构造异常现场，不是杀真实任务进程的证据。

新本机候选 `windows-window-r8` 独立构建：ZIP 37,808,279B，SHA-256 `39486b8e3d115aa6f74b3591d8e043c911bef1b5cce4f29850b5d51b1c81542a`；完整解压后六项界面资源与源码/ZIP逐字节一致，包内PDF worker四组通过。在真正r8解压EXE的隔离WebView2窗口中，合成异常任务启动时自动显示、点击后续做另一张图片，旧结果与原件SHA保持；随后仅本测试窗口经页脚空闲退出，所属owner/host与HTTP/CDP私有端口关闭、work空。证据 `.mediaslimx/window-tests/r8 中文 space 16bba0fbf78648098d618af2ae43e5fe/` 中 `window-resume-report.json` 与 `window-resume-terminal.json`。此阶段未跑r8完整12项主窗/9项目录/繁忙物理X，不借r7旧结果冒充；干净Windows和材料三项阻塞仍在。未操作用户实例、重启、上传或发布。

## 结果提示卡片与隔离窗口观感（2026-10-18）

- [x] 用户截图显示中断续做的绿色提示卡片外框贴住结果面板左右边界，路径与卡片之间也过紧。卡片改用结果区既有边距：桌面22px、窄屏15px，路径下方12px；内容内部间距不变。DESIGN.md已固定规则。
- [x] 隔离WSL浏览器在中文、英文的320/390/768/1440px验证卡片边距、无横向溢出及手动续做，页面错误0；不是实体手机验收。
- [x] 本机候选 `windows-window-r10` 完整ZIP为37,806,296B，SHA-256 `6ebb5366cca8c5aa7789f1401d3e6e3530cf0d622adcd6810f283fb5b110c5a1`。实际解压EXE的隔离WebView2合成任务验证桌面/390px卡片边距、续做、原件及已有结果SHA保持，页脚空闲退出后自有进程/端口消失、work空；六静态资源三方一致、PDF worker四组通过。证据见 `docs/windows-window.md`。未跑r10繁忙物理X或干净Windows验收，不自动发布。
- [x] 测试脚本曾在关闭隔离窗口前保持390px、英文测试状态，造成可见的临时窄窗/英文画面；这是CDP验收脚本改变实际窗口视口所致，不是产品自动切换。脚本现于退出前恢复原视口和语言；尚未为该脚本修正重跑实际窗口，不将其列为已动态验收。用户运行实例和任务未改动。

后续需求控制：本版继续聚焦网站媒体的批量压缩和安全导出。已有最大宽/高限制只在超出上限时等比缩小，不放大、不变形；批量重命名、强制固定宽/高、变形、自动裁剪和抠图暂不加入本版。待有真实使用反馈，再逐项评估规则预览、冲突保护及维护成本。

独立体验窗口另做一次本机Windows实际流程：从r10解压EXE启动全新隔离数据，扫描五项自制JPG/PNG/WebP/MP4/PDF，显式指定隔离导出根目录后由界面开始处理；五项均success、任务completed、导出模式、五个原件SHA-256均保持。实测节省1,545,111字节，仅属于这组刻意易压缩的合成素材，不代表真实网站收益。只读报告在 `.mediaslimx/window-tests/r10 中文 space 26ebd81b6a8943e0883c8329027f8e3b/experience-report.json`；窗口保留结果页供用户体验，未关闭或操作其余实例。首次核对脚本因Windows/WSL路径分隔符不一致导致指纹键查找失败，随后改用标准化键只读复核通过，未重复压缩。

## 结果路径与打开目录（2026-10-18）

- [x] 结果页标题下直接列来源、实际结果和适用的备份路径；尚无结果的导出目录标作计划位置。Windows 独立窗口在有结果时显示“打开结果目录”，按已保存任务模式打开导出任务目录或原位处理的来源目录；服务器网页只显示运行设备路径。
- [x] 请求只传任务编号；服务端检查原生窗口能力、任务记录、结果存在、目录存在以及符号链接/重解析点，避免页面传入任意目录。旧窗口只刷新前端时，新按钮会因缺少后端能力声明而隐藏，需安全退出并重新启动才可用。
- [x] WSL隔离测试12项通过；Windows原生隔离测试13项通过、1项因该账户无建链接权限跳过，其中系统打开调用由mock验证，没有启动真实资源管理器。WSL中文/英文202组视口及交互检查无布局问题和页面异常；这属于浏览器视口检查，不是实体手机验收。用户的现有媒体与任务没有作为测试素材。
- [x] 只读确认用户 Windows 源码体验实例的唯一任务已完成后，校验私有窗口归属并走正常关闭，再以同一 Windows 数据目录重开；新实例报告 `open_result_folder=True`，原任务1条仍为completed。未重启系统、未更动其他实例、未发布。该窗口加载后补做的长英文标签间距调整需页面刷新才能显示。

## 结果路径与侧栏整理修正（2026-10-18）

- [x] 用户 Windows 截图暴露结果路径外层 `dl` 继承全局两列网格，第二个路径行被压到单字宽。外层显式改为单列，每条路径行再在内部排标签和值；测试新增“路径行必须占满父容器”的断言。WSL 合成任务的中英结果页截图已人工查看，长路径正常换行、没有竖排。
- [x] 最近任务以名称和“状态＋上级路径”两行区分，完整路径仍可悬停查看；未固定图标及可归档任务的单条归档操作在悬停/聚焦时出现，固定图标常显。侧栏将批量归档/已归档放进“整理”菜单，悬停可展开、点击可保持打开，触屏和键盘可用；成功后由“已归档 N”更新反馈，不常驻长句。归档仍只整理列表，服务器继续保护固定与进行中任务。
- [x] 隔离WSL合成任务通过侧栏浏览器回归、60组记录/归档布局、20组记录删除布局、中英202组响应式检查；实际结果页和悬停动作截图已查看。菜单新增中英320/390/768/1440px边界与44px目标检查，发现768px左越界5px并修正，复测通过。Windows 当前用户窗口没有在本轮强制重启或处理媒体，刷新页面即可加载前端修正；真实 Windows WebView2 视觉由用户体验继续核对。

## 导出目录命名与结果路径说明（2026-10-18）

- [x] 新任务导出和备份仍使用独立文件夹，改用日期时间加8位任务前缀命名；历史完整编号目录保持原样。结果页按任务记录中的目录名显示和打开，避免把旧任务指向不存在的新目录。WSL与Windows隔离媒体/目录测试通过；用户已有输出未移动。
- [x] 结果页将“处理方式”从目录字段中分离，来源、结果、备份分别附用途说明。Windows独立窗口的可用目录行显示“打开”；请求只含任务ID及固定目录类型，后台检查记录、来源授权/副本状态、结果或备份存在、目录存在和重解析点。服务器网页不显示打开操作。旧运行中的源码窗口须安全退出并重开，才会报告新能力；现有便携包未因此重建或发布。
- [x] WSL合成任务的中英文226组视口/交互检查无布局溢出或页面异常，另用模拟能力标志检查窄窗口“打开”按钮可触达；Windows Python的目录端点使用mock文件管理器验证。模拟按钮检查不是实际 Windows WebView2 点击，未操作用户正在运行的窗口或任务。
- [x] 按实际界面反馈收紧层级：结果模式改为“导出 · 保留原件”等短句，不再重复“处理方式”；各目录的“打开”降为轻文字操作，仍保留44px热区和键盘焦点。WSL隔离浏览器的中英226组结果布局检查通过，JS语法检查通过；当前用户Windows窗口未在本次改动后强制刷新或重启。
- [x] 随后用户核对发现归档操作被隐藏到自己的热区，列表悬停只见固定图标。恢复为整条任务行悬停或键盘聚焦时两个操作同时显露，归档与固定统一透明底、低对比色、14px图标及44px热区；触屏保持常显。隔离WSL合成任务的侧栏交互回归通过，中英320/390/768/1440布局无溢出、页面错误0；截图人工核对两个图标同显。不操作用户Windows任务或媒体。
- [x] 空状态“更多文件用目录扫描”原为透明轻按钮，和限额说明混在一起，悬停也缺少明显变化。用户看过线框效果后选择文字链接：现以薄荷色、默认虚线下划线、悬停实线下划线及变色区分，同步导入后入口；保留按钮语义、12px文字、44px热区、键盘焦点及原有目录选择行为。WSL隔离合成素材浏览器回归通过：20组中英深浅主题与宽度检查、24组入口布局检查，页面错误0；不操作用户媒体，未重新进行实际Windows WebView2视觉验收。
- [x] 结果页目录信息默认收起为处理模式与单行缩显的实际结果路径；点击原生披露行后查看完整来源、结果与适用备份路径及备注，展开区限高滚动，任务切换收起。避免依赖鼠标悬停遮住文件列表，键盘与触屏仍能打开。备份覆盖实际写入逻辑未变，界面仍为三条目录说明；WSL隔离浏览器中英250组响应式检查通过，截图人工核对桌面收起和窄屏展开，无页面错误。未重新进行实际Windows WebView2视觉验收。

## Windows 源码无终端启动（2026-10-18）

- [x] 查明本地测试快捷方式直接指向 PowerShell，因 `.cmd`/PowerShell 为控制台程序而先闪终端。新增 `Start-MediaSlimX.vbs` 作为 Windows Script Host GUI 入口，隐藏既有 PowerShell 准备流程，后端继续使用 `pythonw.exe` 和原窗口所有权/安全退出机制；`.cmd` 保留用于查看启动准备错误，便携版 `MediaSlimX.exe` 不受影响。
- [x] 项目内机器专用 `MediaSlim-X-local-test.lnk` 改指向 `wscript.exe` 与新脚本，保留原 `.mediaslimx/windows-window-tryout` 数据目录及图标。Windows 本机执行脚本返回0，通过修改后的快捷方式再次启动仍复用同一窗口PID，未创建第二个 WebView2 窗口；终端不再作为快捷方式目标。没有关闭用户任务、重启电脑或发布。实际肉眼是否完全无闪窗仍待用户体验确认。

## 空状态文件夹入口梳理（2026-10-18）

- [x] 将三条处理原则移到主按钮上方，压短空状态说明。Windows 独立窗口将“导入文件夹”改为“选择本机目录”，直接调用既有受控系统目录选择端点，选定后扫描并准备默认导出，隐藏重复的空状态扫描文字链；系统窗口或页面取消均不扫描、不上传，已禁用入口恢复后才还原键盘焦点。现有文件导入的“添加文件夹副本”仍为显式副本追加。
- [x] 普通网页/远程连接区分“导入文件夹副本”（浏览器可能显示原生上传确认）和“扫描运行设备目录”（服务设备原位扫描）；不能从网页脚本关闭浏览器自身的上传确认。同步中英文词典、README、界面流程、功能边界和隐私说明。未改媒体压缩、备份或恢复核心。
- [x] WSL隔离合成素材浏览器回归：模拟独立窗口能力时选目录只发一次扫描请求、没有文件选择器/导入分配/上传；系统取消和页面取消均保留空状态与焦点。真实Windows系统目录选择器未在本轮重新手工点测。中英文布局检查250组，字号/热区/溢出错误0；390px模拟视口截图人工核对原则顺序与按钮换行，不宣称实体手机测试。未刷新或关闭用户正在运行的Windows任务窗口。

## 目录确认与工作台可见性（2026-10-19）

- [x] 网页目录面板逐级浏览保持只读导航；确认“扫描此目录”后直接做一次只读扫描，不再要求到主界面重复点击。主界面的“扫描目录”仍用于手动输入路径和重新检查；扫描后仍需明确点击“开始优化”。WSL隔离合成素材回归验证导航0次扫描、确认1次扫描、未创建任务。
- [x] 参数标题区移除重复的处理计划入口，增加可见文字“展开设置”，保持原表单覆盖展开、焦点与 Escape 行为；固定摘要仍可打开只读计划。超宽桌面主内容最大2080px、设置栏约360px，文件列表获得余下空间。路径复合输入框聚焦边界合为连续单框。
- [x] WSL隔离浏览器回归通过：2560px列表宽度、中文/英文320–1280px展开入口与覆盖层、24组计划面板布局、真实合成媒体导出、原件不变，页面错误0。独立 Windows 浏览器预览在8768端口、独立数据目录启动，Windows localhost接口返回200；不将此当作 Windows WebView2 或实体手机验收。未重启电脑、未发布，也未操作其他任务数据。
- [x] 参数覆盖层的入场方向改为从右侧短移24px、240ms停稳，背景遮罩同步淡入；不移动文件列表。减少动态效果时无滑移。WSL隔离浏览器回归验证方向、中途位置、320–1280px中英文布局、焦点/关闭和真实导出，页面错误0。现有Windows预览页刷新后可见；本轮未重新验收Windows WebView2外观。
- [x] 按钮、遮罩与 Escape 收回时从当前可见位置向右退24px、160ms，遮罩淡出后才释放背景焦点；任务切换仍立即卸下。收起图标由叉号改为向内四角。隔离浏览器验证三种收回入口、入场中途反向无位置跳变、减少动态效果立即结束，中英文小窗口与真实合成导出继续通过。Windows浏览器预览刷新即可体验，未操作用户任务或重启系统。
- [x] 修正覆盖层收回末端仍可见而瞬间回窄栏的视觉回弹：160ms 向右退出时淡至透明，退场缓动不超调；收起按钮移除按压缩放。隔离浏览器回归检查终点透明度、位移方向及原有操作流程。
- [x] 首页副标题、HTML 标题/描述、中英文 README 与展示用仓库描述明确列出图片、视频和普通 PDF；品牌继续使用 MediaSlim X，避免“多媒体”暗示音频支持。Chrome 扩展作为独立入口评估，未实现或发布。

## 首次开源准备与演示刷新（2026-10-19）

- [x] 核对仓库仍无提交和远端，198个源码/文档/合成素材文件待审；运行数据、虚拟环境、用户任务与候选便携包由 Git 忽略。公开首提交不能沿用本地个人邮箱，须先核实目标 GitHub 账号及其公开或 noreply 提交身份。
- [x] 命名评估记录在 [品牌说明](brand.md)：首发继续 MediaSlim X，清楚描述图片、普通 MP4 与 PDF；抠图、AI 与扩展尚未实现，不为假设功能先行改名。ImageX 是另一个已被使用的图片工具名，且字面不覆盖现有视频/PDF；暂不迁移仓库、数据目录和素材品牌。
- [x] 使用独立 WSL 服务与六项自制合成媒体重新捕获当前工作台，原件哈希均保持，页面错误及第三方请求为0。录屏33.32秒、SHA-256 `f31d7929ecfc5803f08092d53c9a069d56d5fa22200575aaf68dbf09e3897bf2`，只存本地忽略目录；公开截图、逐文件测量、CSV、分镜和中英封面已经按本次素材更新。
- [x] 按认可的六镜节奏重新合成40秒中文无声初剪，1920×1080、30fps、1200帧、H.264，1,515,051字节；SHA-256 `7202f3464153e630d0d8da37c0139465a4176c2502ac702dce40e470de73c7b7`。抽帧逐镜检查与独立Chrome加载、跳转、播放通过，无外部请求或页面错误。片尾仍写本地未发布，公开前必须按真实仓库和下载范围定稿。
- [x] 静态素材审阅页在1540/1024/768/390/320px检查8张图片、40.00/33.32秒视频元信息、最低12px文字、44px导航与无横向溢出；这是浏览器视口测试，不等于实体手机或干净Windows验收。
- [x] 目标空 Public 仓库已确定为 `tigerx-dev/mediaslimx`，本地 `origin` 已设置，Git 提交邮箱采用用户提供的 noreply；用户要求源码与便携包齐备后再一起公开。仓库仍无首次提交或推送。
- [ ] 公开前按真实版本更新发布文案和演示片尾，核对首次提交和实际 GitHub 页面。Windows 便携包仍等待精确 lxml/iconv 材料与干净 Windows 验收；不以源码回归代替。

## 官方 Python 窗口候选与本机实测（2026-10-19）

- [x] 为解除旧 r10 的解释器 libffi 来源疑点，核对 Python.org 3.13.16 embeddable ZIP、SPDX、CPython 官方 NuGet 包及签名有效的 Tcl/Tk MSI 管理映像；仅在项目忽略目录装配隔离运行时，没有系统安装。官方 DLL 与 `cpython-bin-deps` libffi 3.4.4 指纹一致，旧 r10 的不同 DLL 仍按历史问题保留。
- [x] 独立 Windows 虚拟环境重装锁定依赖；`pip check` 通过，213 项 Windows 单元测试通过、2 项跳过。材料收集重指向 lxml 6.1.3 发布前的 Windows 库 2026.05.17 标签，保存静态库、源码提交和构建配方；官方 Python 3.13 材料清单仅保留 lxml 精确 wheel 来源/LGPL 重链接材料一项阻塞。
- [x] 构建 `official-python313-r1` 独立窗口验证包，运行 ZIP 为 38,123,090B（36.36MiB），SHA-256 `3433bb9ff6c9281bb748e87b19a194fe1a33efbadf004ddf743b0717443ab3f3`；对应材料 ZIP 为 307,721,642B，SHA-256 `73c8e1339af43c3ba311454fb5fb6758b582cb54567fc29f31836a416fc6d6a8`。实际解压 EXE 的 PDF worker 四项通过。
- [x] 私有 Windows WebView2 合成素材窗口通过 12 项流程：文件导入和 200 上限、201 文件目录扫描和实际导出、JPG/PNG/WebP/MP4/PDF、CSV、图片放大/视频播放、两种语言/主题、目录选择器取消、原件指纹保持；空闲退出后窗口记录和工作目录清空。报告在 `.mediaslimx/window-tests/window 中文 space d62b5f2d9b784b9e9b2bb28fb6aa595e/window-ui-report.json`。不把此本机测试冒充干净 Windows 或新包的繁忙物理标题栏 X 验收。
- [ ] 保持未发布；待 lxml 材料核实、用户方便时手动重启后完成真实干净 Windows 验收，再核对最终 payload、发布说明与演示片尾。没有自动重启或触碰既有任务。
- [x] 准备 [TX 官网项目案例交接稿](tx-case-handoff.md)，仅用自制合成素材和已实现功能描述，不填未发布的下载、视频或官网地址；未修改 TX 网站。公开源码清单现为 198 项，`assets/launch/review.html` 因引用本地忽略视频而留在本机，不作为公开源码入口；发布素材说明已移除指向忽略视频的 Markdown 链接，30 份拟公开 Markdown 的本地链接检查无缺失或忽略目标。
- [ ] TX 官网案例待产品实际发布后再接入真实仓库、Release 和可观看演示链接；本轮不改其他项目、不提交或推送，也不重启系统。

## 工作台标题与启动状态收尾（2026-10-20）

- [x] 顶栏副标改为“本地批量压缩工具”；准备阶段主标题为“新建任务”，任务创建后切换为来源名称及实时状态。任务创建后加入左侧列表，当前选中行对应主区；完成记录保留。进度与结果采用独立区块标题，中英词典和界面流程已同步。
- [x] 用独立 WSL/Linux 服务、自制合成素材实际扫描、导出、完成后重新截取中英工作台。案例封面改用已完成状态：左侧真实任务记录选中，主区显示同名任务及完成状态；开始前截图保持空列表。素材和报告只含合成数据，未访问用户任务。隔离浏览器的文件夹/语言/320–1440px 回归通过，无页面错误或未翻译的设置、结果文案。
- [x] Windows 原生启动卡片分组收紧，按钮统一 44px 高和 8px 圆角。隔离编译宿主通过快速、等待、失败、重试、退出、超时、深浅主题、中文/英文及 900×600 窄窗口矩阵；实际 Python 工作台就绪后正常退出。供 TX 使用的真实窗口截图已重新导出。正在使用的宿主因文件占用未替换，正式便携包仍需重构建与干净 Windows 验收。
