# 项目文档导航

更新：2026-10-20。目录与命名规范见 [DIRECTORY_GUIDE](../DIRECTORY_GUIDE.md)，全文件用途见 [FILE_INVENTORY](FILE_INVENTORY.md)。

## 当前状态

Vercel Web 后端首轮代码已实现并完成本地验证；未部署云服务。前端页面、Cloud Run Worker 和 GPU 推荐服务运行实现尚未交付，生成默认关闭。GPU 推荐的当前候选与适配方案以最新 [Lambda 设计](architecture/JEV_LAMBDA_DESIGN.md) 为准；历史候选保留在 research，不能混作当前选型。

本轮已按用户确认以d3-mini完善评分/部署/接口，并通过SSH只读核查指定Lambda机器；未开发服务、下载权重、运行GPU或scp。设计审阅后才传输至`/data01/kanzhi/picjp-jev-server`供云端agent后续开发。

## 阅读顺序与主文档

| 分类 | 文档 | 作用 |
|---|---|---|
| 维护 | [Git 与 CI 规范](maintenance/GIT_AND_CI.md) | 本地仓库、remote 接入、自动测试、版本标签和协作提交 |
| 产品 | [需求基线](product/BASELINE_REQUIREMENTS.md) | 用户确认的 20 工具初期范围、模型迭代与开发方式 |
| 产品 | [项目理解](product/PROJECT_UNDERSTANDING.md) | 目标用户、产品路径、资料来源 |
| 产品 | [前端页面与跳转设计](product/FRONTEND_PAGE_MAP.md) | 14 类页面、12 个模板、功能入口、用户旅程与接口缺口 |
| 计划 | [开发路线图](planning/DEVELOPMENT_ROADMAP.md) | 优先级、模块、milestone、验收和依赖 |
| 计划 | [AI 执行分工](planning/AI_AGENT_EXECUTION_PLAN.md) | AI 职责、并行边界与人工架构/evaluation |
| 接口 | [统一协议 v1](interfaces/INTERFACE_SPEC_V1.md) | 前后端及内部模块的 HTTP 语义 |
| 接口 | [Lambda推荐协议](interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md) | v1字段、HMAC、错误、d3映射与版本切换 |
| 接口 | [前端接口接入规范](interfaces/FRONTEND_API_GUIDE.md) | 浏览器流程、请求/响应示例、状态、错误和当前未接通能力 |
| 接口 | [OpenAPI](interfaces/openapi.json) | 从可执行 Schema 和路由描述生成的契约 |
| 后端 | [Vercel 实施说明](backend/VERCEL_BACKEND.md) | 已实现范围、环境变量、运行和上线条件 |
| 后端 | [数据库说明](backend/DATABASE_SCHEMA.md) | 表、事务、RLS、资金与并发验证 |
| 架构 | [20 工具架构评审](architecture/ARCHITECTURE_REVIEW_20_TOOLS.md) | 能力需求、原有缺口与迭代边界 |
| 架构 | [Cloud Run Worker 设计](architecture/CLOUD_RUN_WORKER_DESIGN.md) | 待评审的持久任务执行与故障恢复 |
| 架构 | [Lambda GPU 推荐设计](architecture/JEV_LAMBDA_DESIGN.md) | 当前 Decision 3.0 候选和模型无关适配 |
| 架构 | [20工具评分规格](architecture/RECOMMENDATION_SCORING_20_TOOLS.md) | 每项问题/正反例、资格、阈值、扩展与模型替换 |
| 研究 | [Lambda环境核查](research/LAMBDA_ENVIRONMENT_2026-10-20.md) | 实际A100资源/权限/工作空间与固定源码证据，非部署记录 |
| 研究 | [Decision 协议核查](research/JEV_PROTOCOL_REVIEW.md) | 上游不同协议与项目契约的差异 |
| 研究 | [协议检查结果](research/JEV_PROTOCOL_CHECK_RESULTS.json) | 本地纯转换断言证据，不是模型推理结果 |
| 研究 | [StartLux 历史研究](research/JEV_STARTLUX_RESEARCH.md) | 历史候选，适用范围不能照搬到当前模型 |
| 验证 | [后端验证记录](verification/VERIFICATION.md) | 已运行测试与未验证的云端/模型范围 |
| 维护 | [本次整理与迁移](maintenance/DIRECTORY_REORGANIZATION_2026-10-20.md) | 旧路径、新路径、保留范围与检查结果 |

## 不同任务的入口

- 前端开发：需求基线 → 前端页面与跳转设计 → 前端接口接入规范 → 统一协议 / packages/contracts → Vercel 说明。页面直接增加到现有 apps/web，服务端业务留在 src/server。
- 后端维护：统一协议 → 数据库说明 → Web 实施说明 → 验证记录。
- Worker 架构审阅：20 工具评审 → 统一协议 → Worker 设计。
- 推荐模型审阅：Lambda部署设计 → 20工具评分 → Lambda接口协议 → 环境证据 → 协议/历史研究；先本地审阅，之后再传输云端。
- 了解原始构想：[产品资料](../references/product/README.md)、[技术资料](../references/technical/00_README.md)。这是导入后更新过的工作副本，具体实现以当前主文档和代码为准。

两份 ZIP 位于 [原始附件目录](../archive/source-packages/)。本次不改 ZIP 内容，不将导入包重新压缩冒充原件。
