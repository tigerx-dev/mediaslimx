# 版本更新方式 / Version updates

当前没有在线更新器、自动拉取仓库或后台版本轮询；Windows 便携包自带运行库，首次运行不联网安装库。源码入口首次运行可能安装开发依赖，属于源码环境准备，与便携包更新是两件事。独立窗口封面显示 Python 核心提供的真实版本号，不显示未经查询的“已是最新”或空的更新按钮。

There is no updater, repository auto-pull, or background version polling. The Windows portable bundle contains its runtime and does not install libraries on first launch; the source launcher may prepare developer dependencies. The standalone cover shows the actual core version without claiming that an update check has occurred.

## 首发：手动换包

未来发布后，从真实GitHub Release下载对应Windows发行ZIP，先在旧窗口中完成工作或安全退出，再完整解压到新目录并运行。不要在使用中覆盖EXE、DLL或媒体引擎，也不要混合两个版本的 `_internal` 目录。源码用户更新源代码后，按当前平台README准备对应依赖；普通用户无需使用Git。

任务数据与便携程序分开，位于 `%LOCALAPPDATA%\MediaSlimX\portable`，换程序目录不会主动删除原件、导出、备份或这些记录。未来若数据结构需要迁移，应先在程序完全退出后备份数据库和必要索引，记录版本兼容与回退限制；不能因为旧程序能打开，就承诺它能读取未来版本的数据。

After publication, download the real Release ZIP, finish or safely stop work, and extract the complete new build into a new directory. Do not replace in-use binaries or mix `_internal` folders. Portable data is outside the application directory. Future database migrations must document backups and downgrade compatibility; keeping data separate does not guarantee cross-version schema compatibility.

## 后续可选：检查后确认

不一定需要自建服务器。客户端可以查询GitHub Releases的版本、发行说明和附件下载信息，比较当前版本后提示用户。GitHub提供相应[Releases API](https://docs.github.com/en/rest/releases/releases)与[附件API](https://docs.github.com/en/rest/releases/assets)。这和下载仓库源码或运行 `git pull` 是不同流程。

若后续实现，先做用户主动触发的“检查更新”；可在用户明确开启后定期检查，仅在有新版本时显示不打断工作的提示标记。用户点开再看版本、说明、来源及验证结果，并自行决定是否前往真实发行页下载；忽略提示不影响使用。检查会向GitHub发起网络请求，须先说明，但不应带媒体、任务记录、本地路径或访问令牌。网络不可用不影响当前离线处理，不因此收集遥测。

当前规划止于提示与用户主动下载，不做静默下载、安装、重启或后台替换 Python 库、DLL、FFmpeg。将来若另行考虑一键安装，也必须先解决附件验证、安全解压、任务收尾、失败回退及明确的用户确认；不以一个哈希值代替完整来源验证。

A future optional check can use GitHub's release metadata without a dedicated update server. Start with an explicit user action; periodic checks require an explicit opt-in. Show a quiet badge only when a new version exists, with release details on demand. The user decides whether to visit the release page and download it. No media, task data, paths or local capability tokens are sent. Silent download, installation and restart are outside the current plan; none of these checks is implemented in the current build.
