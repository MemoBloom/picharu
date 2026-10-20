# 项目文件用途清单

更新：2026-10-20。列出当前纳入版本管理的正式文件，不列.git、依赖、构建产物和真实环境密钥。目录规则见 [DIRECTORY_GUIDE](../DIRECTORY_GUIDE.md)，阅读入口见 [导航](README.md)。

本次已登记138个正式文件，包含当前工作区已有前端与Git/CI配置；进入Git不表示完成云联调或效果evaluation。后续新增/移动文件时同步清单。

## 根目录

| 文件 | 用途与边界 |
|---|---|
| [.env.example](../.env.example) | 无真实密钥的环境变量示例 |
| [.gitattributes](../.gitattributes) | 文本LF换行与二进制标记 |
| [.gitignore](../.gitignore) | 版本管理忽略规则 |
| [.node-version](../.node-version) | Node22开发与CI基线 |
| [AGENTS.md](../AGENTS.md) | AI 协作入口及目录规范引用 |
| [DIRECTORY_GUIDE.md](../DIRECTORY_GUIDE.md) | 目录、命名、文件放置、权威来源与维护规则 |
| [README.md](../README.md) | 项目或资料包入口 |
| [package-lock.json](../package-lock.json) | 根工作区依赖版本锁定 |
| [package.json](../package.json) | npm workspace 元数据、依赖与执行命令 |
| [tsconfig.json](../tsconfig.json) | TypeScript 编译配置 |
| [vitest.config.ts](../vitest.config.ts) | 测试运行配置 |

## Git与流水线

| 文件 | 用途与边界 |
|---|---|
| [.githooks/pre-push](../.githooks/pre-push) | 本地推送前运行verify |
| [.github/dependabot.yml](../.github/dependabot.yml) | GitHub Actions固定SHA的每周更新PR |
| [.github/pull_request_template.md](../.github/pull_request_template.md) | PR验证和evaluation说明模板 |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | GitHub完整验证及PG17并发流水线 |
| [.github/workflows/version.yml](../.github/workflows/version.yml) | 检查通过后自动打正式版本标签 |

## Web应用

| 文件 | 用途与边界 |
|---|---|
| [apps/web/AGENTS.md](../apps/web/AGENTS.md) | Next.js局部开发规则 |
| [apps/web/next-env.d.ts](../apps/web/next-env.d.ts) | Next.js 生成的类型引用 |
| [apps/web/next.config.ts](../apps/web/next.config.ts) | Next.js 配置和共享包编译 |
| [apps/web/package.json](../apps/web/package.json) | npm workspace 元数据、依赖与执行命令 |
| [apps/web/public/images/editorial-cat.png](../apps/web/public/images/editorial-cat.png) | 当前站点图片资源 |
| [apps/web/src/app/api/[...path]/route.ts](../apps/web/src/app/api/[...path]/route.ts) | Next.js API 请求入口，装配统一路由 |
| [apps/web/src/app/auth/callback/page.tsx](../apps/web/src/app/auth/callback/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/error.tsx](../apps/web/src/app/error.tsx) | 前端页面/布局/交互状态：error.tsx |
| [apps/web/src/app/globals.css](../apps/web/src/app/globals.css) | 网页全局样式 |
| [apps/web/src/app/ja/account/page.tsx](../apps/web/src/app/ja/account/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/billing/success/page.tsx](../apps/web/src/app/ja/billing/success/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/edit/page.tsx](../apps/web/src/app/ja/edit/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/help/page.tsx](../apps/web/src/app/ja/help/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/history/page.tsx](../apps/web/src/app/ja/history/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/jobs/[jobId]/page.tsx](../apps/web/src/app/ja/jobs/[jobId]/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/legal/[document]/page.tsx](../apps/web/src/app/ja/legal/[document]/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/login/page.tsx](../apps/web/src/app/ja/login/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/page.tsx](../apps/web/src/app/ja/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/pricing/page.tsx](../apps/web/src/app/ja/pricing/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/tools/[toolId]/page.tsx](../apps/web/src/app/ja/tools/[toolId]/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/ja/tools/page.tsx](../apps/web/src/app/ja/tools/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/app/layout.tsx](../apps/web/src/app/layout.tsx) | 前端页面/布局/交互状态：layout.tsx |
| [apps/web/src/app/loading.tsx](../apps/web/src/app/loading.tsx) | 前端页面/布局/交互状态：loading.tsx |
| [apps/web/src/app/not-found.tsx](../apps/web/src/app/not-found.tsx) | 前端页面/布局/交互状态：not-found.tsx |
| [apps/web/src/app/page.tsx](../apps/web/src/app/page.tsx) | 前端页面/布局/交互状态：page.tsx |
| [apps/web/src/components/account-pages.tsx](../apps/web/src/components/account-pages.tsx) | 前端业务组件：account-pages |
| [apps/web/src/components/auth-pages.tsx](../apps/web/src/components/auth-pages.tsx) | 前端业务组件：auth-pages |
| [apps/web/src/components/editor-workspace.tsx](../apps/web/src/components/editor-workspace.tsx) | 前端业务组件：editor-workspace |
| [apps/web/src/components/history-page.tsx](../apps/web/src/components/history-page.tsx) | 前端业务组件：history-page |
| [apps/web/src/components/job-detail.tsx](../apps/web/src/components/job-detail.tsx) | 前端业务组件：job-detail |
| [apps/web/src/components/public-pages.tsx](../apps/web/src/components/public-pages.tsx) | 前端业务组件：public-pages |
| [apps/web/src/components/site-shell.tsx](../apps/web/src/components/site-shell.tsx) | 前端业务组件：site-shell |
| [apps/web/src/components/ui.tsx](../apps/web/src/components/ui.tsx) | 前端业务组件：ui |
| [apps/web/src/lib/api.ts](../apps/web/src/lib/api.ts) | 前端客户端/认证/状态辅助：api |
| [apps/web/src/lib/auth.tsx](../apps/web/src/lib/auth.tsx) | 前端客户端/认证/状态辅助：auth |
| [apps/web/src/lib/drafts.ts](../apps/web/src/lib/drafts.ts) | 前端客户端/认证/状态辅助：drafts |
| [apps/web/src/lib/navigation.ts](../apps/web/src/lib/navigation.ts) | 前端客户端/认证/状态辅助：navigation |
| [apps/web/src/lib/tool-content.ts](../apps/web/src/lib/tool-content.ts) | 前端客户端/认证/状态辅助：tool-content |
| [apps/web/src/lib/types.ts](../apps/web/src/lib/types.ts) | 前端客户端/认证/状态辅助：types |
| [apps/web/src/server/config.ts](../apps/web/src/server/config.ts) | 服务端环境变量与模型能力配置读取 |
| [apps/web/src/server/errors.ts](../apps/web/src/server/errors.ts) | 错误封装、请求 ID 与有界 JSON 读取 |
| [apps/web/src/server/media.ts](../apps/web/src/server/media.ts) | Sharp 图片解码、规范化与分析缩图 |
| [apps/web/src/server/payments.ts](../apps/web/src/server/payments.ts) | 真实 Stripe 客户端、签名验证和支付事实读取 |
| [apps/web/src/server/ports.ts](../apps/web/src/server/ports.ts) | 数据库、存储、支付等依赖端口 |
| [apps/web/src/server/recommend.ts](../apps/web/src/server/recommend.ts) | 推荐服务 HMAC 代理、校验与明确回退 |
| [apps/web/src/server/router.ts](../apps/web/src/server/router.ts) | 18 个公开 Web 操作的业务路由 |
| [apps/web/src/server/runtime.ts](../apps/web/src/server/runtime.ts) | 生产依赖装配 |
| [apps/web/src/server/storage.ts](../apps/web/src/server/storage.ts) | R2 签名上传/下载、读写与删除 |
| [apps/web/src/server/supabase.ts](../apps/web/src/server/supabase.ts) | Supabase Auth、归属查询及 RPC 适配 |
| [apps/web/tsconfig.json](../apps/web/tsconfig.json) | TypeScript 编译配置 |
| [apps/web/vercel.json](../apps/web/vercel.json) | Vercel 区域配置；不表示已部署 |

## 共享包

| 文件 | 用途与边界 |
|---|---|
| [packages/contracts/package.json](../packages/contracts/package.json) | npm workspace 元数据、依赖与执行命令 |
| [packages/contracts/src/index.ts](../packages/contracts/src/index.ts) | Zod 共享 Schema 与可推导类型 |
| [packages/prompts/package.json](../packages/prompts/package.json) | npm workspace 元数据、依赖与执行命令 |
| [packages/prompts/src/index.ts](../packages/prompts/src/index.ts) | 服务端执行 Prompt、推荐 Profile 与不可变快照 |
| [packages/tool-config/package.json](../packages/tool-config/package.json) | npm workspace 元数据、依赖与执行命令 |
| [packages/tool-config/src/catalog.json](../packages/tool-config/src/catalog.json) | 初期 20 工具的基础目录资料 |
| [packages/tool-config/src/index.ts](../packages/tool-config/src/index.ts) | 工具参数白名单与模型能力匹配 |

## 数据库

| 文件 | 用途与边界 |
|---|---|
| [supabase/migrations/202610190001_web_backend.sql](../supabase/migrations/202610190001_web_backend.sql) | 现有 Web 数据库迁移；不含 Worker 执行 RPC |

## 脚本和测试

| 文件 | 用途与边界 |
|---|---|
| [scripts/export-openapi.ts](../scripts/export-openapi.ts) | OpenAPI导出及--check只读校验 |
| [scripts/setup-git-hooks.mjs](../scripts/setup-git-hooks.mjs) | 保护已有配置的本地hook安装 |
| [scripts/test-concurrency.ts](../scripts/test-concurrency.ts) | 隔离临时Unix socket上的PG并发验证，兼容macOS/Linux |
| [scripts/test-db.ts](../scripts/test-db.ts) | PGlite 迁移、事务、权限验证脚本 |
| [tests/backend.test.ts](../tests/backend.test.ts) | HTTP、资金、图片、推荐和支付回归测试 |
| [tests/contracts.test.ts](../tests/contracts.test.ts) | 契约及 OpenAPI 同步验证 |
| [tests/frontend-client.test.ts](../tests/frontend-client.test.ts) | 自动化测试：frontend-client.test |
| [tests/storage.test.ts](../tests/storage.test.ts) | 真实 AWS SDK 无网络签名验证 |

## 当前文档

| 文件 | 用途与边界 |
|---|---|
| [docs/FILE_INVENTORY.md](FILE_INVENTORY.md) | 本清单，按实际文件维护 |
| [docs/README.md](README.md) | 项目或资料包入口 |
| [docs/architecture/ARCHITECTURE_REVIEW_20_TOOLS.md](architecture/ARCHITECTURE_REVIEW_20_TOOLS.md) | 20 工具能力与架构缺口论证 |
| [docs/architecture/CLOUD_RUN_WORKER_DESIGN.md](architecture/CLOUD_RUN_WORKER_DESIGN.md) | 仅设计：任务执行、租约、恢复、结果结算 |
| [docs/architecture/JEV_LAMBDA_DESIGN.md](architecture/JEV_LAMBDA_DESIGN.md) | 仅设计：当前 Decision 3.0 候选与 GPU 推荐适配 |
| [docs/architecture/RECOMMENDATION_SCORING_20_TOOLS.md](architecture/RECOMMENDATION_SCORING_20_TOOLS.md) | 仅设计：逐工具评分、资格/阈值、候选扩展与模型替换 |
| [docs/backend/DATABASE_SCHEMA.md](backend/DATABASE_SCHEMA.md) | 数据库表、权限、原子事务与并发证据 |
| [docs/backend/VERCEL_BACKEND.md](backend/VERCEL_BACKEND.md) | Web 后端实现范围、配置、运行与上线缺口 |
| [docs/interfaces/FRONTEND_API_GUIDE.md](interfaces/FRONTEND_API_GUIDE.md) | 面向前端的请求/响应示例、流程、状态与错误接入说明 |
| [docs/interfaces/INTERFACE_SPEC_V1.md](interfaces/INTERFACE_SPEC_V1.md) | 前后端和内部模块统一 HTTP 协议 |
| [docs/interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md](interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md) | 仅设计：Lambda字段/认证/错误、d3实际协议与后端替换 |
| [docs/interfaces/openapi.json](interfaces/openapi.json) | 生成的 OpenAPI 3.0.3，勿手改 |
| [docs/maintenance/DIRECTORY_REORGANIZATION_2026-10-20.md](maintenance/DIRECTORY_REORGANIZATION_2026-10-20.md) | 本次迁移映射、完整性与验证记录 |
| [docs/maintenance/GIT_AND_CI.md](maintenance/GIT_AND_CI.md) | Git、remote、版本和流水线规范 |
| [docs/planning/AI_AGENT_EXECUTION_PLAN.md](planning/AI_AGENT_EXECUTION_PLAN.md) | AI 职责、并行边界与人工架构/evaluation |
| [docs/planning/DEVELOPMENT_ROADMAP.md](planning/DEVELOPMENT_ROADMAP.md) | 模块优先级、milestone、依赖和验收 |
| [docs/product/BASELINE_REQUIREMENTS.md](product/BASELINE_REQUIREMENTS.md) | 用户确认的初期 20 工具与架构迭代基线 |
| [docs/product/FRONTEND_PAGE_MAP.md](product/FRONTEND_PAGE_MAP.md) | 前端页面数量、路由层级、入口、跳转与异常恢复提案 |
| [docs/product/PROJECT_UNDERSTANDING.md](product/PROJECT_UNDERSTANDING.md) | 项目目标、产品路径及资料综合理解 |
| [docs/research/JEV_PROTOCOL_CHECK_RESULTS.json](research/JEV_PROTOCOL_CHECK_RESULTS.json) | 10 项本地纯转换检查证据，不是模型推理 |
| [docs/research/JEV_PROTOCOL_REVIEW.md](research/JEV_PROTOCOL_REVIEW.md) | 上游与项目推荐协议核查 |
| [docs/research/JEV_STARTLUX_RESEARCH.md](research/JEV_STARTLUX_RESEARCH.md) | 历史候选 StartLux 调查，非当前默认方案 |
| [docs/research/LAMBDA_ENVIRONMENT_2026-10-20.md](research/LAMBDA_ENVIRONMENT_2026-10-20.md) | SSH只读核查的硬件/权限/目录、d3 revision与源码哈希；未部署 |
| [docs/verification/VERIFICATION.md](verification/VERIFICATION.md) | 已执行后端检查及未验证范围 |

## 导入资料

| 文件 | 用途与边界 |
|---|---|
| [references/README.md](../references/README.md) | 项目或资料包入口 |
| [references/product/DECISIONS_AND_ASSUMPTIONS.md](../references/product/DECISIONS_AND_ASSUMPTIONS.md) | 导入的产品决定与假设 |
| [references/product/GO_TO_MARKET_JAPAN.md](../references/product/GO_TO_MARKET_JAPAN.md) | 导入的日本市场进入假设 |
| [references/product/IMAGE_EDIT_BENCHMARK.md](../references/product/IMAGE_EDIT_BENCHMARK.md) | 导入的效果评测规划 |
| [references/product/IMAGE_EDIT_FEATURE_CATALOG.csv](../references/product/IMAGE_EDIT_FEATURE_CATALOG.csv) | 产品功能历史目录与当前工具映射 |
| [references/product/IMAGE_EDIT_FEATURE_CATALOG.md](../references/product/IMAGE_EDIT_FEATURE_CATALOG.md) | 导入的效果目录说明 |
| [references/product/IMAGE_EDIT_MODEL_MATRIX.md](../references/product/IMAGE_EDIT_MODEL_MATRIX.md) | 导入的模型能力矩阵 |
| [references/product/JAPAN_IMAGE_SEO_PLAN.md](../references/product/JAPAN_IMAGE_SEO_PLAN.md) | 导入的 SEO 规划 |
| [references/product/PHASE1_COMMERCIAL_API_MVP.md](../references/product/PHASE1_COMMERCIAL_API_MVP.md) | 导入的商用 API 首期方案 |
| [references/product/PRODUCT_PRD.md](../references/product/PRODUCT_PRD.md) | 导入的产品需求讨论稿 |
| [references/product/README.md](../references/product/README.md) | 项目或资料包入口 |
| [references/product/ROADMAP_AGENT_TASKS.md](../references/product/ROADMAP_AGENT_TASKS.md) | 导入的早期任务规划 |
| [references/product/TECH_ARCHITECTURE_PHASE1.md](../references/product/TECH_ARCHITECTURE_PHASE1.md) | 导入的首期架构讨论 |
| [references/product/UX_SCREEN_SPEC.md](../references/product/UX_SCREEN_SPEC.md) | 导入的页面/体验规格 |
| [references/technical/00_README.md](../references/technical/00_README.md) | 导入技术资料导航 |
| [references/technical/01_PRODUCT_VISION.md](../references/technical/01_PRODUCT_VISION.md) | 导入的产品目标与范围 |
| [references/technical/02_SYSTEM_ARCHITECTURE.md](../references/technical/02_SYSTEM_ARCHITECTURE.md) | 导入的系统架构讨论 |
| [references/technical/03_API_CONTRACTS.md](../references/technical/03_API_CONTRACTS.md) | 旧接口入口，指向当前统一协议 |
| [references/technical/04_IMAGE_PIPELINE.md](../references/technical/04_IMAGE_PIPELINE.md) | 导入的图片处理流水线规划 |
| [references/technical/05_JEV_RECOMMENDATION.md](../references/technical/05_JEV_RECOMMENDATION.md) | 导入的推荐方案背景，当前设计另见 docs |
| [references/technical/06_PROMPT_LIBRARY.md](../references/technical/06_PROMPT_LIBRARY.md) | 导入的 Prompt 组织规划 |
| [references/technical/07_AUTH_BILLING_DATA.md](../references/technical/07_AUTH_BILLING_DATA.md) | 导入的认证/支付/数据规划 |
| [references/technical/08_FEATURE_CATALOG.csv](../references/technical/08_FEATURE_CATALOG.csv) | 导入的 20 工具结构化目录 |
| [references/technical/08_FEATURE_CATALOG.md](../references/technical/08_FEATURE_CATALOG.md) | 导入的 20 工具目录说明 |
| [references/technical/09_MULTI_AGENT_EXECUTION.md](../references/technical/09_MULTI_AGENT_EXECUTION.md) | 导入的多 agent 执行规划 |
| [references/technical/10_TESTING_RELEASE.md](../references/technical/10_TESTING_RELEASE.md) | 导入的测试与发布规划 |
| [references/technical/11_JAPAN_GROWTH.md](../references/technical/11_JAPAN_GROWTH.md) | 导入的日本市场增长规划 |
| [references/technical/12_DECISIONS_AND_OPEN_QUESTIONS.md](../references/technical/12_DECISIONS_AND_OPEN_QUESTIONS.md) | 导入的技术决定与未决问题 |

## 原始附件

| 文件 | 用途与边界 |
|---|---|
| [archive/README.md](../archive/README.md) | 项目或资料包入口 |
| [archive/source-packages/Japan_AI_Image_Edit_Agent_Development_Pack_2026-10-19.zip](../archive/source-packages/Japan_AI_Image_Edit_Agent_Development_Pack_2026-10-19.zip) | 原始技术 ZIP，保留原字节 |
| [archive/source-packages/Japan_AI_Image_Edit_Work_Docs_2026-10-19.zip](../archive/source-packages/Japan_AI_Image_Edit_Work_Docs_2026-10-19.zip) | 原始产品 ZIP，保留原字节 |

## 本地文件和产物（不纳入上表）

| 路径 | 管理方式 |
|---|---|
| .git/ | 本地提交、分支、remote、hook配置 |
| node_modules/、apps/web/.next/、*.tsbuildinfo | 依赖/构建缓存，忽略 |
| apps/web/.env.local、.vercel/ | 本地真实环境与部署链接配置，禁止提交 |
| coverage/、playwright-report/、test-results/、*.log | 验证产物，忽略 |
