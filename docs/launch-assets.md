# 发布视觉素材 / Launch artwork

这批素材把 TX 原向 X 产品标记与真实浏览器工作台组合，供开源介绍、项目案例和视频封面使用。封面标题中的 X 直接使用该标记，避免再叠加一个字形不同的普通 X。静态图随源码公开；本地录屏与剪辑视频仍留在忽略目录，未上传。

The artwork combines the TX X product mark with actual browser workbench screenshots for the open-source introduction, portfolio case study, and video cover. Static images ship with the source repository; local recordings and edited videos remain ignored and unpublished.

## 审阅页与实际工具 / Review page and application

`assets/launch/review.html` 是仅保存在本机、由 Git 忽略的静态素材审阅页，用于查看封面、分镜、演示片与来源说明；它引用未公开的本地视频，源码克隆中没有这个页面。它不扫描或处理媒体，不是用户双击程序后的工作台，也不作为工具使用的必经页面。实际优化界面由 `mediaslimx/static/` 提供。后续个人站可以复用这些封面、演示与案例文案，再整理成面向访客的案例页；内部审批、复现路径与开发证据不应直接充当公开介绍内容。

The Git-ignored `assets/launch/review.html` is a local review page that references unpublished local videos; it is absent from source clones. It does not scan or optimize media and is not part of the application's launch flow. The actual workbench is served from `mediaslimx/static/`. Artwork, video and case-study copy can later be reused on an author's portfolio, with internal review and development notes replaced by visitor-facing content.

审阅页说明使用区块完整可用宽度，按内容与视口自然换行；不对中英文段落施加全局 `ch` 行长上限，不强制单行或两端拉伸。继续遵循 DESIGN.md 的字号、间距和44px导航热区。

Review-page descriptions use their section's available width and wrap naturally, without a global character-count width cap, forced single lines or justified spacing. Typography, spacing and 44px navigation targets follow DESIGN.md.

## 演示视频准备 / Video preparation

另有 [视频脚本](../video-spec.md)和[六镜预览表](../preview-board.md)。40 秒横版无声六镜方案已获用户认可，已用当前工作台重新录制并完成中文更新初剪；本机可在 `assets/launch/review.html` 审阅，视频位于 `.mediaslimx/showcase/demo-first-cut-tx-x-solid-20261019/demo.zh-CN.mp4`。标记已统一为 TX 原向 X，不加入未知的作者站点 URL。六张 1920×1080 静态关键帧位于 `assets/launch/preview-frames/frame-01.png` 至 `frame-06.png`，各附 HTML 源与独立 manifest。原始真实视口 WebM 为 33.12 秒；两份视频都留在本地忽略目录，不随运行包分发。

The user accepted the six-scene, 40-second silent landscape direction. The updated Chinese local cut uses the current workbench and TX X mark; no unknown author-site URL is added. Six static storyboard frames, their HTML sources and a separate provenance manifest are prepared. Both the edited MP4 and actual 33.12-second raw recording remain in ignored local storage, outside the runtime bundle.

更新初剪实测40.000秒、1920×1080、30fps、1200帧、H.264/yuv420p、无音轨、faststart，1,463,398字节（1.40MiB）；SHA-256为 `e18bca5431fdf810806794f881001436abfbb2c617cc970f38a52ea9859ee51f`。逐镜视觉检查和独立Chrome实际加载/跳转/播放通过，浏览器解码帧与播放时间实际增长，无页面错误或外部请求。仅计划层和已完成结果各停留1.2秒，处理过程原速，未循环、拉慢或冻结进行中进度。本机 `.mediaslimx/showcase/demo-first-cut-tx-x-solid-20261019/manifest.json` 记录剪点、原片哈希与验证。

The updated local cut is exactly 40.000 seconds: 1920×1080, 30fps, 1200 frames, silent H.264/yuv420p with faststart, measuring 1.45MiB. Its SHA-256 is listed above. Per-scene inspection and actual Chrome playback/seeking passed. Motion stays at recorded speed; only the real plan and completed results are held for 1.2 seconds each. There are no frozen in-progress states, page errors or external requests.

开发复现：`.venv/bin/python scripts/render-demo-video.py --raw /absolute/path/to/reviewed-raw-demo.webm`，需要与原始捕获相同的WSL开发环境及录像；脚本在写入前核对已审原片SHA-256，不接受未经重新审阅和校准的任意替代录像。输出到新的 `.mediaslimx/showcase/demo-first-cut-<uuid>/`，不覆盖旧演示。克隆源码不会附带忽略目录中的视频，需先复现捕获并审阅来源与剪点，再生成。这些仅是开发制作工具，不增加产品运行依赖。

Developer reproduction: `.venv/bin/python scripts/render-demo-video.py` in the capture's WSL development environment. It verifies the reviewed raw recording's hash before writing and creates a new ignored output directory. Clones do not include these videos; review a reproduced capture and its cut points before generating a new demo. The renderer is a development script, not a new product dependency.

关键帧使用本次原片内 11.8 秒的真实计划层与 17.5 秒的真实处理进度，不能把捕获脚本全程事件计时当作视频片内时间。可用同平台开发环境执行 `node scripts/render-video-preview.cjs --raw /absolute/path/raw-demo.webm` 复现；取帧秒数针对本次已审阅原片，换原片必须重新核实并调整源脚本中的时间，不可自动沿用画面描述。截图、关键帧和静态审阅页均未改动正在使用的服务。

Frame extraction uses 11.8s and 17.5s within this reviewed WebM. The capture script's wall-clock events have a different origin. With a new recording, inspect its frames and adjust extraction times before reusing the descriptions. Node, Playwright, Chrome and capture FFmpeg remain development tools only.

更新后的本地审阅页在独立 WSL Chrome 检查了1540、1024、768、390、320px五种宽度：8张图片均能解码，两个视频时长分别为40.00与33.12秒，均无页面横向溢出或脚本错误。新视频已通过独立浏览器播放与解码；窄视口排版模拟不等于手机产品或干净Windows验收。

2026-10-20 工作台标题层级调整后，静态中英封面和工作台截图已重拍、重导出；上文的 40 秒本地初剪与六张分镜帧仍来自此前实际录屏，画面中的旧顶栏/主标题尚未同步。用于正式公开演示前须重录、重审剪点与字幕，不把这段旧视频描述成当前界面。

The updated local review page passed an independent WSL Chrome check at widths of 1540, 1024, 768, 390 and 320px. All eight images decode, both videos report 40.00 and 33.12 seconds, and there are no horizontal overflows or page errors. The new video also passed actual browser playback and decoding. Narrow viewports are layout simulations, not physical-phone or clean-Windows acceptance.

此前的长英文说明模拟与说明宽度回归仍是历史证据，见本地忽略目录 `.mediaslimx/showcase/review-final-1792209715290/`；本次替换图片和视频后重新执行了上面的五种宽度与资源检查。

The earlier long-English copy and description-width regression remains historical evidence. After replacing the imagery and video, the five viewport/resource checks above were rerun.

## 交付文件 / Deliverables

| 文件 / File | 尺寸 / Size | 用途 / Use |
| --- | --- | --- |
| `assets/launch/social.zh-CN.png` | 1200 × 630 | 中文分享或仓库介绍封面 / Chinese social or repository cover |
| `assets/launch/social.en.png` | 1200 × 630 | 英文分享或仓库介绍封面 / English social or repository cover |
| `assets/launch/hero.zh-CN.png` | 1920 × 1080 | 中文视频封面或案例首图 / Chinese video cover or case-study hero |
| `assets/launch/hero.en.png` | 1920 × 1080 | 英文视频封面或案例首图 / English video cover or case-study hero |
| 同名 `.html` / Matching `.html` | 同上 / Same | 可编辑构图源，引用完整截图和既有 SVG 标记 / Editable layout referencing full screenshots and the existing SVG mark |
| `assets/launch/manifest.json` | JSON | 来源、截图与导出 SHA-256、尺寸和排版检查 / Provenance, screenshot/export SHA-256, dimensions, and layout checks |

## 事实边界 / Claims and provenance

- 截图来源与测量见 `assets/showcase/manifest.json`。案例封面使用独立服务和自制合成素材完成任务后的真实结果界面：左侧已有并选中该任务，主区展示同一任务的名称、完成状态和结果。`workbench.zh-CN.png` 与 `workbench.en.png` 拍摄于任务创建前，左侧保持真实空态。图片不含用户项目、真实网站素材、访问令牌或地址栏。封面明确写有“合成演示素材 · 实际运行界面”。
- 完整截图只按原比例缩放；不删除、不替换截图里的状态、文件、结果或参数。原始截图保留在 `assets/showcase/`，封面不增加虚构的系统窗口边框。
- 封面不展示压缩收益比例，不把合成样例当作 FIRANO 或真实网站收益，不承诺完全无损或固定比例。“普通 PDF”仍受 PDF 支持条件限制，详见 README 和规格。
- 这些截图来自本地 Python 服务的 WSL 浏览器工作台；Windows 独立窗口源码已实现，但封面不冒充窗口版实拍，也不宣称在线安装器、已上线下载或干净 Windows 验收完成。
- 文字与图形沿用 `DESIGN.md` 的石墨、薄荷、系统字体和简洁边界。没有外部字体、图库或网络资源。封面文字最低 12px；导出的缩略图仍应配可访问说明，不用缩略截图代替操作文档。

The full, unmodified cover screenshots show a completed export task against self-generated synthetic media in an isolated service. The selected sidebar record matches the task name and completed status in the main panel. Pre-task workbench captures keep their genuine empty sidebar. The disclosure is visible on each artwork. No real website savings, Windows-window capture, online installer, published download, or completed clean-Windows validation is claimed. The composition uses the existing graphite/mint design system, system fonts, and local files only. Refer to the original screenshots and their manifest for evidence; artwork thumbnails do not replace usage documentation.

## 本地重新导出 / Re-export locally

导出只是开发操作，工具用户不需要 Node、Playwright 或 Chrome 自动化。Windows 与 WSL 使用各自的 Node/Chrome；不要在同一次导出中混用运行时路径。

Export is a development task. App users do not need Node, Playwright, or browser automation. Keep Windows and WSL runtimes separate.

先确认 `assets/showcase/` 中已存在实际截图及 `manifest.json`，再在仓库根目录运行：

```bash
MSX_PLAYWRIGHT=/absolute/path/to/playwright \
MSX_CHROME=/usr/bin/google-chrome \
node scripts/render-launch-assets.cjs
```

脚本只写 `assets/launch/`，生成中英文 HTML 源、PNG 与来源清单，不访问正在使用的 8765/8766 服务，也不上传文件。它检查图片与文字分区不相撞、页脚留白、文字最低字号和外部请求。重新生成截图后必须重新导出并检查封面，避免来源哈希过期。

The renderer writes only `assets/launch/`, checks layout separation, footer clearance, minimum text size, and external requests, and never connects to the user's running service. Re-export and inspect after changing source screenshots so the manifest hashes remain current.

## 许可 / License

封面构图和既有项目自制品牌资产随根目录 MIT License。截图中的演示素材也由本项目自行合成，不含第三方图库或私有案例。界面中的第三方软件许可仍以项目依赖说明为准，封面不会替代分发材料。

The project-created artwork and synthetic demo content follow the root MIT License. Third-party software notices remain governed by the distribution documentation; artwork does not replace those materials.
