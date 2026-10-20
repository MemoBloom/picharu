> 2026-10-19 implementation update: [Interface v1](../../docs/interfaces/INTERFACE_SPEC_V1.md), [Vercel backend](../../docs/backend/VERCEL_BACKEND.md), [Worker design only](../../docs/architecture/CLOUD_RUN_WORKER_DESIGN.md), [JEV design only](../../docs/architecture/JEV_LAMBDA_DESIGN.md). These documents supersede conflicting earlier examples. No cloud deployment; generation defaults to disabled.

> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：本包以完整 20 工具为首期设计基线；原六工具执行方案已替换。

# Japan Consumer AI Image Edit — Work 项目资料包

版本：2026-10-19。**目标：日本普通消费者，轻量 AI 图片编辑聚合站。**

## 建议阅读顺序
开发顺序见当前 [开发优先级与 Milestone 草案](../../docs/planning/DEVELOPMENT_ROADMAP.md)：14 个责任模块、M0–M8、依赖和验收；AI 执行资源与工期需用真实交付数据校准。

开发方式已确定为 AI 全量开发、人工负责架构与 evaluation；并行职责与波次见 [AI_AGENT_EXECUTION_PLAN.md](../../docs/planning/AI_AGENT_EXECUTION_PLAN.md)，原人工主开发工期估算已撤回。

先读当前 [20 工具架构评审](../../docs/architecture/ARCHITECTURE_REVIEW_20_TOOLS.md)：逐工具能力、现有缺口和面向后续模型迭代的建议；这是评审提议，不是已实现或已批准的最终架构。

1. `references/product/DECISIONS_AND_ASSUMPTIONS.md` — 已确认决策与未知事项。
2. `references/product/PRODUCT_PRD.md` — 产品定位、用户任务、MVP 与业务规则。
3. `references/product/UX_SCREEN_SPEC.md` — 页面与用户体验规范。
4. `references/product/PHASE1_COMMERCIAL_API_MVP.md` — 商用 API 首发方案（执行基线）。
5. `references/product/TECH_ARCHITECTURE_PHASE1.md` — 20 工具技术架构论证基线。
6. `references/product/ROADMAP_AGENT_TASKS.md` — 多 Agent 并行任务与验收。
7. `references/product/GO_TO_MARKET_JAPAN.md`、`references/product/JAPAN_IMAGE_SEO_PLAN.md` — 增长与 SEO。
8. `references/product/IMAGE_EDIT_FEATURE_CATALOG.md`、`references/product/IMAGE_EDIT_FEATURE_CATALOG.csv` — 原 56 项研究加新增调色项的 57 项候选池，标注当前 20 工具映射。
9. `references/product/IMAGE_EDIT_MODEL_MATRIX.md`、`references/product/IMAGE_EDIT_BENCHMARK.md` — 20 工具供应商能力验证与首轮 300 任务评测计划；其中历史专用链路仅作参考。

## 一句基线
**从完整 20 个工具开始论证首期技术架构，逐项覆盖工具能力与用户流程；优先验证 1–2 个商用编辑端点，不自研生成模型。分批执行不缩减 20 工具设计范围。**

## 使用方法
将整个 ZIP 上传至 ChatGPT Work 的项目工作目录/文件区，或把这些 Markdown 文件复制进你的代码仓库 `/docs`。从 `references/product/README.md` 开始，让 Agent 读取全部决策文档后再执行任务。

## 质量声明
文件中的时间、价格、关键词难度、工具能力属于规划信息或待验证假设，不代表已完成商用 API 调用、真实用户测试或日本市场定量调查。
