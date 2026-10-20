# 隐私和安全边界

空间管理仅清理本实例已登记的导入副本，必须先预览影响并主动确认，不能借此删除任意路径、输出、备份或其他项目。释放会失去原件预览，任务/报告和实际结果保留；不是安全擦除。并发、旧数据快照及中断重试规则见 [storage-management.md](storage-management.md)。便携包只改变运行时交付，不改变默认回环监听、数据不传第三方和允许目录边界；数据独立位置见 [packaging.md](packaging.md)。
## 数据流
程序在运行设备读取指定范围的候选媒体、必要的文件头/元信息与内容，FFmpeg/Pillow 在本机处理。非媒体仅查看名称、目录项和 stat，不读取项目代码、配置、数据库内容。
任务数据库是程序自身运行数据，记录根目录、相对路径、指纹、参数、备份位置和错误；不扫描分析用户数据库。
不接入遥测、第三方上传、广告、AI 或外部 CDN/字体。安装依赖需要网络，与媒体处理数据流不同。
浏览器预览通过用户的本机连接或 SSH 隧道传输媒体内容，远程浏览器会收到媒体。图片/视频可能含个人或业务敏感内容，保留的元信息也可能敏感，不承诺绝对安全。
## 目录限制
CLI 明确 --allow-root，服务器默认仅启动目录；Windows 窗口默认从当前用户图片目录开始（不存在时使用程序目录），源码双击脚本明确授权本项目目录。扫描根必须位于允许范围。所有路径需绝对路径且逐级拒绝符号链接；Windows 还需拒绝 reparse/junction。
默认跳过隐藏项、node_modules、.venv/venv、依赖、缓存、输出和备份目录。不跟随链接。Linux 读取/写入使用相对目录描述符和 O_NOFOLLOW 防止链接替换越界。
所有导出目标在任务目录内，保持相对路径；不允许用户从 URL 直接提供文件路径。预览仅通过任务 ID/条目 ID和允许的原件/结果槽位，重新验证路径及指纹。
目录行的“打开”只在 Windows 独立窗口显示。请求只传任务 ID 和固定目录类型（来源、结果或备份）；服务端按已保存的任务记录推导目录，检查来源授权/副本状态、结果或备份是否已生成，以及目录存在且没有符号链接或重解析点后，才调用系统文件管理器；不接受浏览器提供任意路径。Linux/服务器网页只展示运行设备上的路径。
Windows 原生已实测：读取使用 OPEN_REPARSE_POINT 并核对属性，目录链句柄限制提交期间重命名；junction 边界与置换测试通过。默认还跳过 Windows Hidden/System 属性。当前账号无法创建文件符号链接，未提高系统权限。
同一用户恶意并发写入源文件不是完整隔离的工作负载；处理前、提交前、恢复前均核对指纹，仍建议处理期间停止其他写入程序。
## Web 访问
只监听 127.0.0.1；Host 限制本机和配置端口；所有 API 需要高熵随机令牌；媒体预览和精确匹配的导入任务 ZIP 下载可使用同源引导后签发的 HttpOnly、SameSite=Strict 会话 Cookie，以支持浏览器原生 Range 播放。Cookie 名包含服务端口，避免 Windows 与 WSL 实例互相覆盖。令牌通过 URL fragment 引导，存入当前标签页 sessionStorage，随后从地址栏移除。
验证请求 Origin 与 Fetch Metadata，拒绝跨站；无宽松 CORS。状态改变使用 POST JSON，导入文件体使用 PUT application/octet-stream；两者均需访问令牌自定义头，不接受 GET 触发覆盖/恢复；响应禁用缓存与 iframe 嵌入。
令牌重启轮换，历史任务数据保留。本工具不是多用户托管服务，没有账号权限隔离，不应反向代理到公网。
默认 API 文档关闭；静态资源随工具发布，使用 CSP 限制脚本、媒体、网络到自身。
## 操作可靠性
处理快照、源 SHA-256、同文件系统临时文件、解码验证和原子替换；失败清理临时文件，成功才替换。备份先完整写入且持久化恢复意图，再提交覆盖。
恢复核对当前文件与任务记录，修改冲突跳过；直接覆盖没有备份不可恢复。
输出和旧备份不静默覆盖；状态 SQLite 事务提交，重启将处理中任务标记中断并保留记录。
FFmpeg 使用参数数组、禁用 stdin、白名单本地协议，不调用 shell，不读取网络 URL，设置探测/处理超时。
CSV 对 =、+、-、@、制表符和回车等公式前缀转义；默认不导出绝对源路径。
## 开源排除
.gitignore 排除运行数据、虚拟环境、缓存、生成素材和案例私有记录。不提交 FIRANO 素材、真实路径、日志或案例私人数据。
机器管理员、同账号其他进程仍可能读取本机数据；自行保护运行设备与 SSH 凭据。

## 本地桌面与目录选择

Windows独立窗口在本机WebView2内显示同一工作台，服务仍只监听回环地址。启动地址与退出控制走父子进程私有管道，不提供公开关闭接口。另有只处理“拖入单个真实本机目录”的窄通道：仅所属工作台顶层页面可提交固定操作及WebView2真实目录对象，原生host不接受JSON路径；路径经私有管道交由所属Python实例再次校验本机目录、父目录链、隐藏/依赖、运行数据及输出/备份排除，再持久授权。host与Python进入closing后均拒绝新授权，不是网页任意路径读取或通用native调用能力。

Windows真实目录对象探针确认CoreWebView2File.Path保留junction别名原路径，Python路径检查随后拒绝“路径包含符号链接或Windows重解析点”；证据 `.mediaslimx/native-drop-probe/de7a584a55df45d6b4ad7a2083b7c583/report.json`，测试链接已移除、目标保留，冻结包未改变。

窗口关闭控制另限所属顶层工作台的固定消息：页脚退出请求交回原生OnClosing；host为一次繁忙确认生成nonce，页面只回报该nonce的已显示、继续或退出，严格校验字段与pending。错误/旧nonce及无pending回应不能退出；关闭选择不会扩大媒体授权。3秒未收到显示确认才撤销nonce并回退为当前语言、默认No的系统确认，超时不自动退出。语言/主题偏好仅作显示信息，不具备目录或关闭授权。网页/服务器无页脚退出入口，也无公开HTTP关机接口。

目录授权只准备后续正常扫描，扫描不自动优化或覆盖。Windows独立窗口空状态的“选择本机目录”通过既有受控系统目录选择器授权并扫描，不走浏览器文件夹上传；“添加文件夹副本”、文件、多个目录及普通浏览器/远程连接的“导入文件夹副本”仍是显式副本导入，浏览器可能自行要求确认，不从FileList子文件推断父目录。默认mediaslimx-export/backup等名称在未登记时也排除。页面导航、弹窗和网络资源限制在所属实例来源；图片放大使用页面内对话层。WebView2配置位于该实例数据目录，不共享个人Edge配置，任务令牌每次启动轮换。

程序不自动安装或更新 WebView2 Runtime，依赖机器已安装的微软组件。操作系统及该组件本身的更新或诊断行为由各自设置控制，本项目不将其宣传为整台机器绝不联网。Windows 启动封面的 GitHub 链接只有用户点击才调用系统浏览器打开固定仓库地址；启动过程不因此联网，也不传媒体或任务信息。当前没有应用在线更新器；未来若增加版本检查，会明确说明其对 GitHub 的请求，见 [版本更新方式](updates.md)。

The Windows window uses an instance-specific WebView2 profile and private parent/child control pipes, with no public shutdown endpoint. A narrow directory channel accepts only the owning workspace's fixed operation and one real WebView2 directory object, never an arbitrary JSON path. The native host and Python owner validate the directory independently; both reject new authorization during shutdown. The standalone window's Choose a local folder action uses the existing controlled system picker and scans without making import copies. It authorizes a normal scan, not optimization or replacement. Adding folder copies to an import, multiple folders, files and ordinary/remote browser imports retain the copy-import flow and may trigger a browser-managed confirmation. Image zoom stays inside the interface. The application does not install or update the Microsoft Runtime; its OS-level updating/diagnostics remain governed by their own settings. The startup-cover GitHub link opens the fixed repository URL in the system browser only after a click; startup makes no request for this link and sends no media or task data. No application updater is implemented.

网页目录浏览器只返回授权范围内的目录元信息，应用原有鉴权、Origin/Host 和穿越检查。服务器/WSL 模式不开放原生窗口。Windows --desktop 原生选择器使用同一 Windows Python 的标准库 Tk，在独立进程主线程运行消息循环；只有该辅助进程使用基础解释器避免 venv 转发，网页服务仍使用 .venv-win。初始路径通过子进程环境传递，启动参数为固定列表，不使用 shell 或 PowerShell。只有实际选择返回值可以扩大媒体允许范围。每次请求使用独立随机 ID，取消只结束匹配进程，关闭面板也会取消；取消或超时回收辅助进程，已取消和过期结果不填写字段。取消接口接受原有访问令牌、Host/Origin 与 JSON 校验，服务器模式拒绝。该列表和浏览器启动能力记录保存在对应平台 .mediaslimx 目录内，不纳入 Git。主题偏好仅存浏览器 localStorage，没有遥测。

## 列表整理的边界
任务及目录快捷入口的 pinned/hidden 状态存放于现有 SQLite 中独立的 list_state 表，避免媒体处理线程回存任务时覆盖界面状态。清空仅隐藏，不删除 records、processed 去重指纹、媒体、导出、报告或备份，因此也不等于擦除本机私人路径或释放数据库空间。
任务清空只处理确认快照中未固定的已结束记录；提交时再次检查，进行中及后续被固定的记录保留。目录快捷入口来自已经授权的范围，浏览器不能通过固定或找回接口新增允许根目录；隐藏入口也不会撤销原授权，确认框会明确说明。所有新接口使用现有访问令牌、Host/Origin 与 JSON 校验，不对第三方开放。

## 拖拽文件的数据流与保留
目录扫描（含独立窗口单个真实目录拖入后的扫描）不上传文件。其余副本导入将所选文件字节通过用户建立的本机连接或SSH隧道传入当前实例私有导入区；若实例在服务器，副本会到该服务器。本工具不再转发第三方，没有遥测或外部分析。文件可能含敏感信息，应按运行设备访问条件判断。

Windows 与 WSL 的解释器、数据目录、导入区、默认输出区分别管理；浏览器原始路径不接受、不推断、不跨平台转换。导入区不作为 CLI 允许根，目录扫描无法进入；预览仅允许任务记录对应副本并核对指纹，用户不能提供任意文件路径。文件名与服务端物理随机 ID 分离，拒绝跨平台特殊名称，写入使用已有 no-follow/目录链保护。

导入模式服务端强制导出，不提供覆盖/备份移动原文件能力。原始副本保存在对应平台运行数据中以支持重启后预览，默认不自动擦除。清空当前未使用导入或确认清理遗留副本会删除这些副本，不删除浏览器原件；已用于任何任务的副本（包括归档或已删记录）始终不进入“未使用副本”清理。总声明容量上限 8 GiB；历史副本通过独立“导入副本空间”流程查看影响、校验版本和主动确认后释放，规则见 [空间管理](storage-management.md)。

200项/2GiB单批超限提示在新文件分配/传输前阻止本轮导入，明确新增传入0项，不偷偷截取一部分；原列表、勾选、输出和模式保留。改用运行设备目录扫描仍遵守允许范围及平台路径校验，不依据浏览器名称推断原路径。取消选择或扫描失败不撤销现有导入，只有扫描成功才替换界面来源；成功也不自动删除旧副本，不把切换来源当作清理授权。超限扫描默认导出，既有用户主动备份入口保持显式语义，扫描本身不压缩或覆盖文件。

8GiB导入空间配额不足使用单独提示，引导查看本实例的手动存储管理，不自动释放、擦除或提高限额。目录扫描不复制媒体到导入区，但也不取消媒体格式/PDF大小等支持限制；已有导入副本的保留与清理规则不因此改变。Windows、WSL与用户正在运行的便携实例仍各自管理数据，不通过开发验证接管或停止其他实例。

导出包只打包此任务、指纹核对后的结果和相对路径 CSV；压缩包临时文件响应后清理，异常清理，进程异常退出后的包在下次启动清理。ZIP 使用原格式媒体，解包不会得到任意运行目录内容。下载仍是你的连接上发生的媒体传输，不是第三方上传。

## 整个文件夹导入与语言边界
浏览器收集使用相对条目，隐藏名称、依赖及常见/已登记的输出备份名称在递归前过滤；拖拽递归在请求条目 File 对象前过滤非媒体；文件夹选择返回的 FileList 只按名称与必要元信息过滤，不读取或传输非媒体内容，不读取代码、配置、数据库内容。已登记目录按基名保守排除，因为浏览器没有可信原始绝对路径。相对名称仅影响经过校验的导出/ZIP 结构，收件区物理路径仍全部由服务端生成，不能通过目录字段写入任意位置。

浏览器文件夹 API 不暴露完整 Windows Hidden/System 属性及符号链接/reparse 元信息，不能把名称过滤宣传为原生文件系统隔离。需要这些严格排除时，应使用运行设备的目录扫描，其逐级 no-follow 与原生属性检查保持不变。浏览器是否直接拒绝链接取决于实现；本程序不据相对名称猜测源绝对路径，不调用跨平台进程寻找文件。API 结构依据 [File and Directory Entries 规范](https://wicg.github.io/entries-api/)；目录分批收集遵循 [readEntries](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryReader/readEntries) 的多次读取规则。

中文/English 切换使用随程序分发的词典与显示层原文绑定，不调用翻译网站、不发送文案或媒体。偏好只存浏览器 localStorage。原文件名、路径、媒体 JSON、数据库记录和 CSV 不翻译；操作系统原始诊断可能保留系统语言。显示层文本处理不使用 innerHTML，不将媒体文本执行为代码。


## PDF 与归档
PDF是用户主动指定范围内的候选文档，允许读取文件头、必要元信息与内部对象/内容流以验证和压缩；不会因此读取目录中的其他项目代码、配置或数据库。加密、签名、表单、脚本动作、注释、附件等跳过，不解密、移除访问限制或提取附件，不执行PDF脚本，不联网解析外部流。pikepdf工作进程使用参数列表、JSON标准输入与内存/时间限制。输出验证不能保证绝对渲染或语义等价。

PDF默认导出保留源；原位必须有独立任务备份，不允许无备份覆盖。预览接口对PDF强制attachment且nosniff，前端不以iframe/object/embed加载。下载经用户已有连接传到浏览器，不传第三方；用户用本机阅读器打开下载文档仍需自行检查内容。

归档只设置显示标记，保留任务、报告、源副本、导出和备份，以维持核查与恢复能力；无自动过期清理。归档不等于安全删除或释放空间。


## 删除记录与文件保留
“彻底删除记录”只从SQLite移除选中的归档任务行及列表状态，不打开或删除其媒体、导出、备份或原始导入副本。它不是安全擦除：其他扫描/导入manifest和重复处理指纹继续保留，不保证SQLite物理页立即缩小。对用户明确说明程序内报告/预览/恢复信息会失去，有备份仅可手动恢复；已有报告文件不会删除。

删除请求需有效本地访问令牌、来源校验、JSON严格确认与影响版本；只处理终态、归档、未固定任务，事务重查状态并与后台写入/恢复互斥。不会把删除记录后的sealed导入副本误纳入未使用清理；标志持久保存，重启后仍受保护。实际用户记录不由开发测试删除，验证只使用独立实例和合成素材。
