# 界面形态与后续选择

本页记录当前事实与后续建议。用户已授权并推进 **Windows 独立窗口**，源码与 WebView2 助手已实现；真实窗口、最终便携包与干净 Windows 验收按实际结果单独记录。PWA 和 Chrome 扩展仍未实现。源码仓库为 `tigerx-dev/mediaslimx`；本次仅公开源码，Windows 便携包和二进制下载继续等待验收。个人站以后只展示介绍并跳转。

## 当前是什么

Windows 窗口沿用 HTML/CSS/JavaScript 中英文工作台，扫描、压缩、备份与恢复继续由 Python 核心执行。独立窗口启动自己的回环服务并通过 WebView2 显示工作台；正常关闭先排空本实例接受的媒体事务，再关闭服务与助手，不启动外部浏览器。Linux/WSL 仍使用浏览器与 SSH 隧道。源码另保留 `Start-MediaSlimX-Browser.cmd`；该网页入口关闭标签页不会停止控制台服务。

**35.73 MiB ZIP / 80.04 MiB 解压属于旧浏览器 r3 候选**，不能作为新窗口包大小或其验收证据。窗口包自带 Python、媒体引擎与网页资源，但需预先安装 WebView2 Evergreen Runtime；不捆绑完整 Runtime，不自动安装，也不以浏览器静默回退。现有宣传录屏来自先前浏览器工作台，不应把它冒充真实独立窗口录制。新 payload 的实际记录见 [Windows 独立窗口](windows-window.md) 与 [便携包说明](packaging.md)。

## 当前选择与另外两条路线

| 方向 | 给用户的体验 | 能复用什么 | 主要代价 | 本项目建议 |
| --- | --- | --- | --- | --- |
| Windows 轻量独立窗口 | 双击即见工具窗口，不进入普通浏览器标签页 | 现有网页界面、Python 核心和媒体保护 | WebView2 运行时、启动退出与进程管理验收 | 本轮已实现源码与助手，继续完成实际验收 |
| PWA 安装 | 有应用图标和独立窗口，仍由浏览器平台承载 | 网页界面；后端仍须另行启动 | 安装与缓存状态、后端启动仍未解决 | 不能单靠它实现当前工具“一键独立运行” |
| Chrome 扩展 | 在浏览器上传素材等具体场景里调用优化 | 部分界面与处理核心；本机调用需伴随程序 | 扩展权限、商店维护、本机通信和安装 | 等浏览器内的实际需求出现再做 |

## 已实施：网页界面放进轻量独立窗口

Windows 窗口由轻量 .NET Framework 助手承载 WebView2，负责展示现有界面，与 Python 所有者通过私有 stdio 协议协作；Python 仍拥有自己的服务和媒体事务。没有改成 Electron、引入完整 Chromium 或重写处理控件。Linux/服务器继续通过浏览器和 SSH 隧道使用同一核心。

窗口依赖 **WebView2 Evergreen Runtime**，不能用“装了 Edge 浏览器”代替检测。本轮选择使用已安装的 Runtime，缺少时解释原因并提供人工安装说明，不自动下载安装，不捆绑完整 Runtime。本机检测到的 Runtime 版本不等于干净机器已有该依赖。锁定的 WebView2 SDK 只用于构建与分发窗口助手，不是 Runtime，也不是 Python/FFmpeg 在线库更新器。[微软：WebView2 分发与 Runtime 检测](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。

当前实现与验收边界：

1. **启动清楚**：`Start-MediaSlimX.cmd` 通过 Windows `pythonw.exe` 启动源码窗口，使用 `.mediaslimx/windows-window`，默认在 8767–8866 选可用回环端口。服务就绪后启动助手；缺依赖、端口或数据锁冲突时解释。二次启动只尝试聚焦已验证的原窗口，不接管其他网页服务。
2. **退出清楚**：没有任务时关闭窗口，正常停止自己的服务和助手；有任务时说明状态，允许继续等待或取消剩余并安全退出。不能把直接硬杀当作安全退出，也不能结束用户其他 Python、FFmpeg、浏览器或项目进程。
3. **复用原有保护**：继续使用目录授权、回环地址、请求访问校验、指纹、备份、验证、原子替换与恢复冲突检查。WebView 导航和请求限制到本实例的受控来源；不增加网页可执行任意命令、读取任意路径或触发后台关闭的通用原生桥。
4. **保留环境隔离**：Windows、WSL 与服务器各自使用运行时和数据，不猜测映射路径。窗口缓存和运行状态采用明确目录，不混进媒体目录或旧源码实例。
5. **实际验收分别记录**：源码窗口两张合成图片及r2实际ZIP窗口五类媒体扫描/导出、图内放大、视频、CSV按钮下载、目录窗口取消、重复启动、备份恢复已通过。r2在所属FFmpeg仍编码时模拟显示进程故障，确认任务取消、自己的进程与临时文件清理，原件及已完成记录保留，原有8765/8766服务不受影响。物理叉号、繁忙确认及目录人工点选、缺Runtime提示、普通账户与干净Windows仍待单独验收。开发侧桌面点击工具因WSL工作目录URI初始化故障未能运行，不能把DOM/协议/显示故障测试当成人工窗口点击。新包大小、许可材料与验收绑定新payload。

这些状态由本项目的代码与实测记录支持；微软文档说明平台机制，不替 MediaSlimX 背书。详见 [窗口说明](windows-window.md)。

## PWA 能改善窗口感，不能替代当前本机启动器

PWA 可以通过 manifest 的 `standalone` 显示为独立窗口，并用 service worker 缓存网页资源；它仍受网页平台的运行能力与权限约束。微软文档也把 WebAssembly、文件访问等能力与后端工作区分。[微软：PWA 最佳实践](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/best-practices)。

对本项目的判断是：给当前页面加 PWA 安装入口，不会自动把 Python 或 FFmpeg 装进浏览器，也不能凭网页自行启动现有 EXE 服务。若服务未运行，缓存下来的界面仍不能进行这套后端处理。另一条“完全在浏览器内处理”的路线可以使用浏览器编码能力或 WebAssembly，但这意味着重新实现和验证处理范围、内存、视频与文件写入策略，不能当作本轮的小型包装工作。

## 扩展只有在浏览器内解决具体问题时才值得做

在本项目讨论的分发方式里，Chrome Web Store 面向的是浏览器扩展，不是把现有 Python/FFmpeg 桌面 EXE 放上去就能自动安装运行，也不是当前 PWA 的替代安装器。

如果要让扩展复用本机处理核心，需要单独安装并登记 Native Messaging 伴随程序；扩展声明 `nativeMessaging` 权限，本机 host 清单限制允许的扩展来源。消息只接受明确的优化任务和经过校验的参数，不能开放任意 shell 命令或把来自网页的任意路径直接送进覆盖流程。Chrome 官方要求验证内容脚本消息来源与内容；文件字节不宜当作无限大的 JSON 消息流来回传。[Chrome：Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。

扩展权限只申请实际功能需要的最小范围，不为未来用途预先索要所有网站权限；涉及页面时优先限定用户主动选择的网站或操作，不读取无关页面内容。[Chrome Web Store：权限使用政策](https://developer.chrome.com/docs/webstore/program-policies/permissions)。

将来若出现“给 CMS、商品后台或博客上传图片前，直接在浏览器里优化已选素材”的实际需求，扩展才有独立价值。若只是打开现有工作台，多一个扩展安装、伴随程序登记和商店维护流程反而更复杂。当前不做扩展、不上架商店，也不以此作为商业收入承诺。

## 当前继续做什么

继续完成独立窗口真实验收、新便携 payload 与材料核对，再进行干净 Windows 验收与两项既有依赖材料核实。旧浏览器 r3 保留，Linux/服务器网页与 Windows 网页入口继续可用。更新采用人工获取完整 Release 的流程，不做自更新或在线装库，见 [升级策略](updates.md)。用户稍后手动重启；当前不重启，不干预其他项目，源码和正式便携包都留在本地，直到发行门槛完成。
