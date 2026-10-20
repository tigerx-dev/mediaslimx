# MediaSlim X

简体中文 | [English](README.en.md)

![MediaSlim X：图片、MP4 与 PDF 批量压缩工具](assets/brand/social-cover.png)

MediaSlim X 是一个免费开源的本地批量压缩工具。扫描文件夹，选择要处理的图片、MP4 或 PDF，查看每个文件的实际结果。默认导出到新目录，保留原件、文件名和相对目录结构。

**当前只发布源码。** 首版以 Windows 独立窗口为主；尚无免安装的 Windows 便携包或其他二进制下载。GitHub 的“Download ZIP”是源码，需要按下文准备运行环境，包括需要 PDF 时单独安装其依赖。计划中的便携包会自带 Python、PDF 引擎和媒体引擎，用户无需运行 pip 命令；它仍待最终材料与干净 Windows 验收，暂不能下载。

## 能做什么

- 扫描运行设备上的目录，按文件类型或逐项选择；也可把文件拖入工作台。Windows 独立窗口支持拖入单个本机文件夹直接扫描。
- 提供画质优先、均衡、体积优先三种预设。图片和受支持的 MP4 可选择最大宽高，**按比例缩小**；默认保持原尺寸。PDF 不改变页面尺寸或图片画质。
- 默认另存结果并保留原件。需要更新原目录时，可明确选择“备份后覆盖”；无备份直接覆盖需要额外确认，且不支持 PDF。
- 显示真实进度、无收益和跳过原因；保留任务历史，支持结果预览、CSV 报告和有备份文件的冲突检查恢复。节省量以实际结果为准，不承诺固定比例。

![真实合成素材的工作台截图](assets/showcase/workbench.zh-CN.png)

## 支持范围

| 类型 | 当前处理范围 |
| --- | --- |
| 图片 | JPG/JPEG、PNG、静态 WebP；动图及部分特殊色彩格式会跳过。 |
| 视频 | 普通 H.264、8 位 SDR `yuv420p` MP4，至多一条 AAC 音轨；需要 FFmpeg 与 ffprobe。HDR、旋转、字幕和复杂流等会跳过。 |
| PDF | 源码运行时可选安装 pikepdf；计划中的 Windows 便携包将自带 PDF 引擎。支持符合条件的非加密静态 PDF，仅优化结构与可压缩数据，不调整页尺寸。加密、签名、表单、批注等不支持。 |

完整边界与逐项原因见[功能规格](docs/v1-spec.md)。图片和视频可能使用有损压缩；不适合的文件会保留或跳过，不会把失败当作成功。

## 从源码运行

### Windows：独立窗口

1. 安装 **Python 3.10+**（含 Tcl/Tk）、**Microsoft WebView2 Evergreen Runtime**；首次构建窗口组件还需要 Windows .NET Framework 的 C# 编译器。处理 MP4 另需把 Windows 版 FFmpeg、ffprobe 放入 `PATH`。
2. 克隆仓库或下载源码 ZIP 并完整解压。
3. 在资源管理器中双击项目根目录的 **`Start-MediaSlimX.vbs`**。首次启动会建立 Windows 专用虚拟环境并安装 Python 依赖，准备窗口组件时可能联网获取 WebView2 SDK；以后可直接打开。准备失败时运行 **`Start-MediaSlimX.cmd`** 查看错误。

若只想用浏览器界面，可运行 **`Start-MediaSlimX-Browser.cmd`**。它与独立窗口共用处理核心，但各自保存任务记录。不要直接打开 `mediaslimx/static/index.html`：界面需要本机服务。

### 仅源码运行：启用 PDF

以下命令**只给从源码运行的用户**，不是将来便携包的使用步骤。源码首次启动会自动准备基础依赖；如果还需要 PDF，先完成一次源码启动，再在 Windows 虚拟环境中安装并重启工具：

```powershell
.\.venv-win\Scripts\python.exe -m pip install -r requirements-pdf.txt
```

源码环境缺少 PDF 依赖时，图片和视频仍可使用，PDF 会显示可操作的跳过原因。计划中的 Windows 便携包自带 PDF 引擎，不需要 Python、虚拟环境或上述命令；目前尚未公开下载。其他开发环境的运行与依赖记录见[平台状态](docs/platforms.md)。

## 基本流程与数据边界

1. 选择或扫描目录，检查候选文件并勾选；扫描本身不会开始压缩。
2. 选择预设、可选尺寸和输出方式，确认原件、结果、备份分别放在哪里，再开始处理。
3. 在结果页查看逐文件状态、预览与报告；有备份时可尝试恢复。处理后原文件若被修改，恢复会跳过冲突。

![合成素材任务的实际结果页，显示逐文件状态与节省量](assets/showcase/results.zh-CN.png)

目录扫描只读取所选范围内的候选媒体，不跟随符号链接，并跳过隐藏、依赖、输出及备份目录。浏览器拖入文件或文件夹会把**副本传到当前连接的 MediaSlim X 服务**，因此这类导入只允许导出；按上述本机方式启动时，副本留在本机。浏览器导入限每批 200 个媒体文件、2 GiB，大批量请扫描本机目录。其他连接方式的数据边界见[隐私与安全](docs/privacy-security.md)。

工具不把媒体上传第三方，也不接入账号、遥测或外部 CDN。默认只监听 `127.0.0.1`，不要直接暴露到公网。详情见[隐私与安全](docs/privacy-security.md)。

## 验证、文档与许可

Windows 源码窗口已用合成素材验证；其他系统不在首版发行范围内。现有演示数字只来自合成素材，不代表实际网站收益。详细状态见[平台状态](docs/platforms.md)和[发布指南](docs/release-guide.md)。

运行 Python 测试：`.venv-win\Scripts\python.exe -m unittest discover -s tests`。项目采用 [MIT License](LICENSE)；核心功能免费。问题反馈请勿附上含令牌、私人路径或敏感媒体的原始日志与截图。
