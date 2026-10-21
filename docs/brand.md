# MediaSlim X 品牌资产 / Brand assets

## 名称与范围 / Name and scope

首发沿用展示名 **MediaSlim X** 和项目、仓库名 **MediaSlimX / mediaslimx**。现有图片、普通 MP4 与 PDF 的压缩、等比缩小和批量结果管理都属于“让文件变轻”的明确用途。介绍文案可写成“图片、视频与 PDF 批量优化工具”，让中文用户通过具体类型理解“媒体”，不把 PDF 误称为图片或视频。

批量抠图、加水印、AI 处理和浏览器扩展尚未实现，也不作为首发名称或封面的承诺。若以后有实际使用需求，再判断它们属于 MediaSlim X 内的可选处理、独立的姊妹工具，还是需要更宽的产品名；不为尚未验证的方向提前改名。改名将涉及命令、数据目录、仓库链接、图标、文档与演示，须作为单独的兼容性工作处理。候选方向仅记录在[后续方向备忘](future-ideas.md)，不是产品路线承诺。

The first release keeps **MediaSlim X** as the display name and **MediaSlimX / mediaslimx** for the project and repository. Its current purpose is batch optimization of images, ordinary MP4 videos and PDFs. Background removal, watermarking, AI processing and a browser extension are not implemented or implied by this name. Reconsider a broader name only if real usage warrants a wider product scope; a rename would require a separate compatibility review.

品牌延续 [DESIGN.md](../DESIGN.md) 的石墨底色和薄荷强调色。标记沿用作者 TX 网站 X 的原向轮廓：左侧向右推进的折面与右侧分开的两笔。原 SVG 中心有与主笔画同色的重叠路径，必须分开填充，不能合并成导致深色菱形镂空的复合路径。MediaSlim X 只调整颜色和留白，不镜像或加电光效果；它不依赖相机、播放键等单一格式图标。

The mark reuses the author's original right-facing TX X geometry, recolored in the app's graphite and mint palette. It represents the whole workbench rather than a particular media format.

## 文件用途 / Files

| 文件 | 用途 / Use |
| --- | --- |
| `assets/brand/mark.svg` | 薄荷色透明底标记，用于深色背景 / Mint mark on dark backgrounds |
| `assets/brand/mark-dark.svg` | 石墨色透明底标记，用于浅色背景 / Graphite mark on light backgrounds |
| `assets/brand/logo-dark.svg` | 深色背景横版字标 / Horizontal logo for dark backgrounds |
| `assets/brand/logo-light.svg` | 浅色背景横版字标 / Horizontal logo for light backgrounds |
| `assets/brand/favicon.svg` | 石墨圆角底应用图标源 / Source application icon |
| `assets/brand/app-icon.png` | 256×256 应用图标 / Application icon |
| `assets/brand/app-icon.ico` | Windows 图标，含 16/24/32/48/64/128/256px / Multi-resolution Windows icon |
| `assets/brand/tigerx-origin.svg` | 从作者 TX 项目只读复制的完整 TIGERX LOGO；仅用于作者来源署名 / Full maker logo copied read-only from the author's TX project |
| `assets/brand/tigerx-origin-dark.png` | 完整作者署名的透明 PNG 源；原生窗口嵌入其透明蒙版并按主题着色 / Transparent full-logo source embedded and tinted for the native cover |
| `assets/brand/github-mark.svg` | GitHub 的 Octicons 标记，仅用于固定仓库链接 / GitHub Octicon for the repository link only |
| `assets/brand/github-mark.png` | 36px 仓库标记透明源；原生窗口嵌入并按主题着色 / Transparent repository mark embedded and tinted for the native cover |
| `assets/brand/GITHUB-MARK-NOTICE.md` | GitHub 标记来源与权利说明 / Source and rights notice for the GitHub mark |
| `assets/brand/social-cover.svg` | 1200×630 仓库与分享封面源 / Repository and social cover source |
| `assets/brand/social-cover.en.svg` | 同构图英文封面源 / English cover source |
| `assets/brand/social-cover.en.png` | 英文封面 PNG / English cover export |
| `assets/brand/social-cover.png` | 同尺寸栅格导出，适合不支持 SVG 的平台 / Raster export for platforms without SVG support |
| `mediaslimx/static/brand/mark.svg` | 网页组件使用的 currentColor 标记 / Current-color mark for UI components |
| `mediaslimx/static/brand/favicon.svg` | 本地网页图标 / Local app favicon |

SVG 是维护源文件；PNG 和 ICO 是由源文件导出的交付文件。除下述 GitHub 链接标记外，本页列出的品牌素材在本机制作，没有用户媒体、任务、路径或压缩比例。封面中的英文与中文是品牌介绍，不表示界面语言被固定。另有后续制作的[真实界面发布封面](launch-assets.md)，使用独立合成素材任务的截图，按其来源说明管理，不与本页纯品牌素材混淆。

SVG files are the editable sources. PNG and ICO files are exports. The cover contains no user media, tasks, paths, or measurements; the GitHub link mark is the one externally sourced brand asset noted below.

## 使用规则 / Usage

产品标记与作者来源分开维护。MediaSlim X 的启动封面、工作台、favicon、应用图标和品牌封面已统一到 TX X 原向轮廓；TX 项目本身未改动。Windows 启动封面的主识别是居中产品名内的 X；石墨／浅灰底和紧凑卡片保持克制，仅在真实等待时让底部淡薄荷光影缓慢移动，不叠放第二个巨大的 X、文件卡片或背景照片。页脚右侧的完整 TIGERX 标识只作小号来源署名；版本和带 GitHub 图标的仓库入口单独放左侧。个人站尚未就绪时不添加猜测的域名、空链接或不能访问的入口；真实地址确定后，再判断是否添加作者链接。

Windows 启动封面页脚右侧以非交互的 `by` 加完整 TIGERX 图形小号署名；左侧显示版本和带文字的 GitHub 源码仓库入口，只有点击才打开固定地址，启动时不联网。它们不和真实启动状态争夺注意力；仓库目前仅提供源码，便携包下载入口仍隐藏。未来如需工作台常驻“关于”入口再单独设计。个人站实际地址确定后再补，不设置空链接。

The Windows startup cover shows the real version and a separate user-activated GitHub icon-plus-label entry at bottom left; a non-interactive `by` with the full TIGERX mark sits at bottom right. Only while startup is actually waiting, a restrained mint light moves along the lower background. The repository link opens source code and does not initiate a download or update. Add a persistent repository entry to the workbench About view in a later iteration, and add the personal-site link only when its real address is ready.

The product mark and author attribution remain separate. The app uses the author's original TX X orientation across its interface and icon assets; no TX project files were changed. Add an author-site link only when its real address is ready.

- 图形保持原比例，不额外倾斜、描边、拉伸或加阴影。最小视觉尺寸16px；图形与周边内容至少留出标记宽度的1/8。标记所在按钮或链接仍须遵循44px交互目标。
- 小图标使用纯图形，大横幅再使用完整字标；不把字标缩进 favicon。
- 深色底使用 `#B4EDC6` 标记，浅色底可使用 `#24303A` 或设计规范的 `#246C48`。图形不表示连接成功、任务完成或安全承诺。
- 网页文字和封面 SVG 使用系统字体；SVG 字标在不同系统的字形可能略有变化。对外需要固定呈现时使用已导出的 PNG。
- 当前色 `mark.svg` 通过内联 SVG、SVG 引用或 CSS mask 使用；外部 `<img>` 内的 currentColor 不继承页面主题。普通图片引用使用固定颜色版本。

Keep the original proportions and leave clear space around the mark. Do not rotate or decorate it. Use the mark alone at small sizes; interactive controls still need a 44px target. SVG text uses system fonts, so use the PNG cover when a platform needs a fixed rendering. The mark is a brand element, not a status or safety claim.

## 本地重新导出 / Local exports

导出属于开发操作，运行工具本身不需要 Node 或 Playwright。先准备已有开发验证使用的 Playwright 和 Chrome，再指定对应本机路径；Windows 与 WSL 不混用 Node、Chrome 或虚拟环境。

Exporting is a development task. The app does not require Node or Playwright. Use the Node, Chrome, and Python environment for the platform running the export.

在仓库根目录运行，`MSX_PLAYWRIGHT` 指向本机可用的 Playwright 模块，`MSX_CHROME` 可覆盖脚本中的本机 Chrome 默认位置：

```bash
MSX_PLAYWRIGHT=/absolute/path/to/playwright node scripts/render-brand.cjs
```

这会生成中英封面 `social-cover.png` / `social-cover.en.png`、`app-icon.png` 与 `github-mark.png`。再用当前平台已有 Pillow 导出 Windows ICO：

```python
from PIL import Image

with Image.open("assets/brand/app-icon.png") as image:
    image.save(
        "assets/brand/app-icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
```

图形变更时同步两份 favicon 与网页标记。封面尺寸保持1200×630，不加入未经实测的收益数字。当前 PNG 和 ICO 已使用 WSL Chrome/Pillow 实际导出并检查，尚未验证所有开源托管平台的裁切效果。

Keep the source and static copies synchronized when changing the geometry. Cover exports remain 1200×630. Current PNG and ICO exports were rendered and checked using Chrome and Pillow on WSL; individual hosting platforms may crop previews differently.

## 许可 / License

本项目自制资产与仓库代码一样，适用根目录的 [MIT License](../LICENSE)。`github-mark.svg` / `github-mark.png` 例外：标记来自 GitHub 的 [Primer Octicons](https://github.com/primer/octicons/blob/main/icons/mark-github-24.svg)，仅用于通往 GitHub 仓库的链接；GitHub 标记的权利与使用规范仍归 GitHub，见其 [品牌规范](https://github.com/primer/octicons#license)。这不表示 GitHub 认可或赞助本工具。没有外部字体或图库依赖。

Project-created assets are covered by the repository's [MIT License](../LICENSE). The GitHub mark is an exception: its source is [Primer Octicons](https://github.com/primer/octicons/blob/main/icons/mark-github-24.svg), and GitHub retains the rights and usage rules for its logo. It appears only on a link to the repository and does not imply GitHub endorsement. No external font or stock-art dependency is required.
