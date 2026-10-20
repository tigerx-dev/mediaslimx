# 导入副本空间与安全清理

本说明适用于本实例通过浏览器接收的文件/文件夹副本。目录扫描直接读取用户指定的媒体，不把它们纳入导入清理。Windows 源码、WSL 和 Windows 便携实例各自独立统计和保存数据。

## 查看空间

页脚“导入副本空间”展示实际副本占用、声明大小预留配额及剩余配额。总声明上限仍为 8 GiB；单批 200 文件/2 GiB，图片视频单个 1 GiB、PDF 单个 64 MiB。配额不是整个磁盘剩余空间，结果、备份、数据库与下载 ZIP 不计入该导入配额。

逐批以首个相对文件名辨认，列出创建时间、文件数、批次ID、占用、关联任务数和可清理状态；确认层最多展示三个文件示例。未知内容、链接或校验异常会明确保护；无法完整计量时不把部分值冒充总占用。没有媒体时展示真实空状态。

## 三种操作的区别

| 操作 | 影响 |
| --- | --- |
| 归档任务 | 只收起列表项，任务/报告/副本/导出/备份保留，随时恢复 |
| 删除归档任务记录 | 不删媒体，但失去该任务在工具内的报告、预览和自动恢复入口 |
| 释放导入副本 | 只删本实例接收的该批副本，归还配额；任务和导出保留，原件预览失效 |

没有自动过期或后台清理。已用于任务、甚至任务记录已删除的 sealed 批次，不会因为整理历史而进入“清理未使用副本”；必须从空间管理单独确认释放。

## 确认与影响

1. 点击批次“释放副本”，服务端计算文件/目录身份及 SHA-256 快照，获取关联任务与版本。
2. 确认层显示文件数、预计释放大小、关联任务数、没有记录导出结果的副本数；数量依据现存记录，不保证结果文件仍在。
3. 明确告知不可撤销、原件对比失效、未处理/未选择/失败文件的副本也会删除。应先在工具外保留需要的原件。
4. 主动勾选理解后提交。取消或 Escape 不删除；提交期间防重复操作。

用户原先拖入的文件、导出、备份、任务、CSV 与重复处理指纹都不删除。保留任务的 CSV、实际结果预览及结果 ZIP 继续可用；详情只展示真实结果并说明原始副本已释放。删除记录本身不会调用此接口，也不会因此提供缺失的恢复能力。

## 边界、并发与中断

- 只接受有效 UUID 的本实例批次，物理文件由服务器生成 ID，不接受任意路径。
- 不递归删除。只处理 manifest 登记的普通、单链接文件及已知 partial；未登记文件、符号链接、Windows 重解析点和硬链接会阻止清理。
- 固定目录边界并比较目录/容器身份，提交时重验版本、文件身份、大小、mtime 与 SHA-256；文件或任务变化需重新确认。
- 上传活动、扫描、处理或恢复、未结束的关联后台线程受保护。清理沿用 worker_lock → engine.lock 顺序，与创建/写入/恢复互斥。
- 旧批次优先复用上传/扫描/任务指纹；没有历史指纹时，以本次私有文件完整快照确认当前内容，不虚构原件指纹，也不要求对 sealed 批次执行不可用的扫描。
- 删除前保存 releasing 和 release_plan；成功后记录 released/released_at、释放配额并拒绝旧扫描、追加及再次处理。重复已释放请求幂等返回。
- 部分失败或中断留下 release_failed，保留剩余文件和整批配额。重启不自动续删，重新预览确认后重试。结果预览/下载仍检查输出指纹。

清理是普通删除，不是安全擦除；数据库中的路径、任务、清理状态和指纹仍可能含敏感信息。空批次目录和少量状态可以保留，不承诺回收全部文件系统开销或缩小 SQLite。不清理导出、备份或其他项目。

## API 与验收

- `GET /api/imports/storage`：占用、配额、统计是否完整和逐批状态。
- `GET /api/imports/{id}/release-preview`：影响与 record_version，只取快照不删除。
- `POST /api/imports/{id}/release`：严格 `{confirm:true,record_version}`，沿用令牌、Host/Origin 与 JSON 限制。

风险验证见 `tests/test_import_storage.py`，浏览器验证见 `tests/storage-browser.cjs`，均使用独立服务和合成素材。不能对用户任务库做清理测试。最新执行范围见 [平台状态](platforms.md)。

## English summary

Storage cleanup is separate from archiving and record deletion. Explicitly review and confirm a batch to delete only its service-held copies. Dropped originals, exports, backups, reports, tasks, and processing fingerprints remain. Original comparisons become unavailable; retained tasks keep result previews, CSV, and output ZIP downloads. Quota is released only when cleanup completes. Active transfers/workers, changed data, unknown files, and link/path anomalies are protected. Partial cleanup never resumes automatically after restart; a new review and confirmation is required. Deletion is not secure erasure.
