# 后续方向备忘 / Future ideas

**状态：想法清单，不是开发计划或功能承诺。** MediaSlim X 当前只聚焦本地批量压缩、等比缩小、可靠导出与结果检查。先完成并验证 Windows 便携包，再看实际使用反馈；本文不改变现有产品名、仓库、界面或发行范围。

## 仍可能属于 MediaSlim X

| 想法 | 何时考虑 |
| --- | --- |
| 更多压缩格式或编码选项 | 有明确素材需求，且能可靠识别、验证输出并解释兼容性时。不要为了格式数量扩大支持范围。 |
| 固定宽或固定高的批量等比缩小 | 现有“最大宽高、保持比例”不足以覆盖真实任务时；默认仍保留原尺寸。 |
| 导出时可选命名规则 | 仅在用户确有批量交付需求时考虑；默认保留文件名，避免破坏网站引用，并先解决冲突与可追溯性。 |
| 更清楚的批量报告与重复任务体验 | 如果实际使用暴露操作成本，再围绕现有任务记录小步改进。 |

这些都是候选项，不意味着下一版要做。裁剪、拉伸变形、水印等会改变画面或用途，暂不塞入压缩主流程。

## 既有未完成的 imgX 构想

**imgX 是作者早期已做过部分界面的独立构思，不是 MediaSlim X 的待定新名称。** 最初想用 AI 批量解析图片、生成适合图库平台供稿的信息。作者提供的旧界面图显示图库平台选择、图片文件夹、结果表格与处理进度，并画有裁剪、超分和 API Key 配置等入口；这只说明当时的界面方向，不能据此认定功能已经实现。该构思目前未继续开发，也未核查后续命名或商标。若将来重启，可能考虑的能力包括：

- AI 清晰放大与修复：通常会增加体积，需要展示真实效果、模型来源和处理成本。
- 批量抠图、背景替换与透明导出：要处理边缘质量、主体识别失败及原件保留。
- 批量风格化、水印、裁剪和尺寸模板：属于内容加工，需可预览、可撤销的输出方式。
- 图片识别、关键词或文案生成：若调用外部 API，必须由用户主动配置并明确数据传输、费用与密钥保存方式；本地模型则要评估下载体积和设备要求。
- 可复用的批量工作流：只有多步处理的真实需求出现后，再考虑配方、队列或自动化；不先搭通用流程平台。

MediaSlim X 的现有压缩能力将来**可以**成为 imgX 的一个步骤，也可以继续独立维护。是否复用 Python 核心或共享代码，须在有实际项目时单独评估；不能因为旧构思就改动现有用户任务、输出路径或仓库。旧界面里的付费入口也不作为本项目商业模式的依据。

## 选择下一步的原则

1. 先收集自己或真实用户反复遇到的一个问题，再选一个最小实验；不按功能清单逐项堆叠。
2. 新能力若改变内容、依赖模型、需要联网或产生费用，默认另做原型，明确预览、隐私与失败处理。
3. 不让设想影响当前版本的稳定性、便携包验收和“本地处理、默认保留原件”的承诺。

**English summary:** This is an idea pool, not a committed roadmap. MediaSlim X stays focused on local compression and reliable batch output. The author previously designed part of a separate, unfinished imgX interface for AI-assisted image analysis and stock-library submissions. A future revival could explore upscaling, background removal, style transfer, tagging and workflows if real demand justifies it. The old interface does not prove those features were implemented; no AI or cloud processing is promised in MediaSlim X.
