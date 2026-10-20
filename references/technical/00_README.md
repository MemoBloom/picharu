> 2026-10-19 implementation update: [Interface v1](../../docs/interfaces/INTERFACE_SPEC_V1.md), [Vercel backend](../../docs/backend/VERCEL_BACKEND.md), [Worker design only](../../docs/architecture/CLOUD_RUN_WORKER_DESIGN.md), [JEV design only](../../docs/architecture/JEV_LAMBDA_DESIGN.md). These documents supersede conflicting earlier examples. No cloud deployment; generation defaults to disabled.

> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：导航与执行范围统一为 20 工具；现有部署表是待按完整需求论证的方案。

# 项目文档导航与决策总览

> 文档基线：2026-10-19。面向日本普通消费者；香港公司经营；首期使用商用图像 API；以下“目标”不是已通过实测的指标。

## 推荐阅读顺序

开发规划见当前 [开发优先级与 Milestone 草案](../../docs/planning/DEVELOPMENT_ROADMAP.md)：14 模块职责、M0–M8、并行窗口与外部阻塞；替代原 D0–D30 工期目标。本轮 Vercel Web 后端已实现，实际范围见 [交付说明](../../docs/backend/VERCEL_BACKEND.md)；完整生成闭环尚未完成。

已确认由多个 AI agent 按依赖完成全部开发，人工仅负责架构设计和 evaluation；8 类职责、执行槽调度和评价节点见 [AI_AGENT_EXECUTION_PLAN.md](../../docs/planning/AI_AGENT_EXECUTION_PLAN.md)。

本轮论证见当前 [20 工具架构评审](../../docs/architecture/ARCHITECTURE_REVIEW_20_TOOLS.md)：20 效果仅为初期，重点是模型能力迭代和稳定边界；高级效果控制按需增强。评审建议尚未作为最终 API 或部署方案冻结。

1. `references/technical/01_PRODUCT_VISION.md`：产品定位与范围。
2. `references/technical/02_SYSTEM_ARCHITECTURE.md`：部署拓扑与服务职责。
3. `references/technical/03_API_CONTRACTS.md`：跨 Agent 冻结协议。
4. `references/technical/04_IMAGE_PIPELINE.md`：上传、推荐、生成、下载闭环。
5. `references/technical/05_JEV_RECOMMENDATION.md`：美国 Lambda 上的 JEV 推荐。
6. `references/technical/06_PROMPT_LIBRARY.md`：20–50 个成熟模板的结构、版本、推荐知识。
7. `references/technical/07_AUTH_BILLING_DATA.md`：Supabase Auth、Stripe 香港、积分账本、数据库与退款。
8. `references/technical/08_FEATURE_CATALOG.md` / `.csv`：首期 20 工具完整设计范围及质量门槛。
9. `references/technical/09_MULTI_AGENT_EXECUTION.md`：Codex/Kimi/Pi 分工及集成方法。
10. `references/technical/10_TESTING_RELEASE.md`：测试、验收、灰度与风险。
11. `references/technical/11_JAPAN_GROWTH.md`：日语 SEO 与早期获客。
12. `references/technical/12_DECISIONS_AND_OPEN_QUESTIONS.md`：已定事项 / 未验证依赖。

## 项目一言以蔽之

日本普通消费者上传图片，JEV 类轻量视觉模型据照片内容和模板的丰富适用知识，推荐合适的编辑效果与成熟 Prompt；用户也可直接选工具或自由描述；由第三方 GPT Image / Nano Banana 等图像编辑 API 执行；网站提供透明积分付费、历史和继续编辑。优先低门槛、质量、低成本快速验证，不自研生成模型。

## 正式确定的系统边界

| 领域 | MVP 默认方案 |
|---|---|
| 网站与轻量业务 API | Next.js/TypeScript，部署 Vercel 东京 |
| 身份和持久化 | Supabase Auth + PostgreSQL，东京项目 |
| 图片对象存储 | 私有 Cloudflare R2（区域位置提示不等于日本境内保证） |
| 图像理解推荐 | 已有美国 Lambda GPU，部署 JEV + FastAPI |
| 长任务执行 | Google Cloud Run 东京 CPU Worker，初期可不加 Cloud Tasks |
| 图像生成 | 1–2 个经授权验证的商用模型中转端点 |
| Prompt | Git 管理的 20–50 个 JSON 模板；Next.js 服务端编译读取 |
| 收款 | 香港公司 Stripe Hong Kong（需企业账户和审核） |

## 非目标

不做 Canva 式画布/专业设计工作流；不批量接入数十模型；不自研、训练或微调模型；不做向量数据库、通用 Agent 编排、复杂动态 Prompt 同步。智能扩图已有低价值实测，**不进入首发**。

## 执行准则

- `SPEC`：明确协议和验收；`HYPOTHESIS`：市场、效果、成本或时延待测试；`BLOCKED`：需证件、资质、供应商审核或 API 访问权限。
- 任何服务必须能用 mock 开发，并能在 staging 进行真实跨服务集成。
- 个人照片不得公开；涉及图像和支付的生产接口默认私有、授权、可审计。
- 未经实测，不要把指定模型版本、单张价格或 200–500ms 的 JEV 估算当作保证。
