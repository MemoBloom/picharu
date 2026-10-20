> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：M0/M1 先明确 20 工具能力矩阵及核心契约覆盖；开发分工和试点顺序不能推迟难工具的架构论证。详见新的 Milestone 草案。

# Codex / Kimi / Pi 并行开发与集成

用户已确认：全部实现由 AI 完成，多个 AI agent 按依赖并行；人工只负责架构设计与 evaluation。统一执行分工、所有权、波次、并发资源和人工评价节点见 [AI_AGENT_EXECUTION_PLAN.md](../../docs/planning/AI_AGENT_EXECUTION_PLAN.md)。本文件不构成开始实现的记录。

> 文档基线：2026-10-19。面向日本普通消费者；香港公司经营；首期使用商用图像 API；以下“目标”不是已通过实测的指标。

## M0/M1 需要先明确的共享边界

人工确定架构边界和取舍；主集成 AI 将其落实到 `packages/contracts` 的 OpenAPI/Schema、任务状态与积分事务，并准备 Mock、固定 20 个 Tool ID 和能力矩阵。数据协议包含多图、身份/结构保持与连续编辑。开发 agent 使用独立 Worktree；协议和 migrations 等共享文件由指定 AI 所有者维护，重大架构变更交人工设计评审，普通实现不逐项等待人工批准。

## Agent 划分

| Agent/角色 | 文件所有权 | 交付物 | 不要修改 |
|---|---|---|---|
| A0 主协调/集成 AI | `packages/contracts`、根配置、CI | 落实人工架构、任务调度、Mock、合并和端到端集成 | 不擅改人工架构，不覆盖其他所有者实现 |
| A1 Web AI | 日语页面、组件、前端状态与样式 | 20 工具共享工作台、历史、推荐/充值 UI | 业务 API、migrations |
| A2 身份/资产/DB AI | `supabase`；约定身份、图片、查询/额度 API | 归属、固定资产、schema、积分原子事务 | Prompt、Worker、支付事件处理实现 |
| A3 Worker/模型 AI | `apps/worker`；生成提交 API | 真模型接入、恢复、存储、费用和模型升级 | migrations、Web UI |
| A4 JEV AI | `apps/jev-service`；推荐 API | 真实推荐、合法候选、性能与回退 | 生成、支付、Web 推荐 UI |
| A5 Prompt/配置 AI | `packages/prompts`、`packages/tool-config`、约定内容文件 | 20 工具配置、初期模板、日语资料与能力限制 | migrations、全局契约 |
| A6 Billing AI | Checkout、套餐、Stripe Webhook 等指定模块 | 支付、订单流程、退款/对账；调用 A2 账务接口 | migrations、Web 支付 UI |
| A7 独立 QA AI | `benchmarks`、跨模块测试和评测报告 | 独立复核、效果/成本材料、缺陷复现与修复复验 | 不并行改被测模块，不替代人工语义 evaluation |

工具选取可替换，目录所有权和接口边界不能混乱。

## Monorepo 建议

```text
apps/web                 # Vercel
apps/worker              # GCP Cloud Run
apps/jev-service         # Lambda GPU
packages/contracts       # 集成负责人维护
packages/prompts         # Prompt Agent
packages/tool-config     # 工具配置
supabase/migrations      # DB Agent
benchmarks/              # 测试样本与脚本
docs/                    # 本资料包
.github/workflows/       # CI
```

## Milestone 与并行验收

本轮以 [DEVELOPMENT_ROADMAP.md](../../docs/planning/DEVELOPMENT_ROADMAP.md) 的 M0–M8 草案为讨论依据。原 D0–D30 目标不再作为可靠工期依据；协作工具和人数不能替代真实模型、联调、评测及外部审核时间。

- M0：20 工具能力矩阵、真端点尤其多图探查、JEV 和经营依赖识别。
- M1：工具/模板/模型/任务边界、契约与数据版本、Mock、staging 和目录责任。
- M2：真实单图/多图代表链路、固定资产、持久任务和积分交付闭环。
- M3：完整 20 工具 Alpha、共用工作台、历史/继续编辑、接入证据与质量状态。
- M4：模型升级/回滚、在途任务兼容、并发与失败恢复；从 M2 后即可推进。
- M5：JEV Smart Edit 的真实推荐、有效候选与回退；服务可独立开发，不阻塞直接工具链路。
- M6：积分包、Stripe 沙盒、Webhook、充值/退款/对账；经营外部条件另行跟踪。
- M7：技术 Beta、Smart Edit 与真实收费分别放行；收集日本用户的实际任务和成本证据。
- M8：按证据迭代模板、模型与必要控制能力；不把所有高级增强提前做成首版前置条件。

AI 模块按核心契约并行推进，主 AI 调度执行槽并负责集成；人工只负责架构设计与 evaluation，不作为常规编码/修复资源。8 类逻辑职责不等于 8 个同时运行的 agent；实际并发与 W0–W5 波次见执行计划。真实与 Mock、部分完成和已完成必须区分。

## 合并纪律

- 每个 PR 写清：契约版本、所改目录、如何测试、Mock 与真实服务差异、失败或遗留项。
- 每次提交运行 Schema/类型检查、单元测试、静态检查、密钥扫描；每日 staging 真实全链路 Smoke Test。
- 生产部署可一键回滚；schema 执行迁移前先评估兼容性；支付和扣费必须人工复核。
- 不允许多个 Agent 同时修改同一 migration / Prompt ID / OpenAPI 文件。跨模块变更先契约 PR 后实现。

## 每个子任务的 Definition of Done

有功能演示、匹配契约的接口、自动化测试、失败路径、必要指标与成本日志、部署/回滚步骤、不会泄露密钥/用户图片。代码提交并不等于任务完成。
