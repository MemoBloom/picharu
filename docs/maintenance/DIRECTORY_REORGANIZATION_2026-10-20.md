# 目录整理与迁移记录

日期：2026-10-20。范围：资料分类、文件移动、引用修复与规范落地；不开发前端、不更改业务逻辑、不部署云服务。

## 整理结果

- 整理前记录 81 个正式文件（不计 node_modules、.next、.git、tsbuildinfo）；移动 44 个文件，保留全部原文件内容来源。
- 根目录的需求、架构、计划文档归入 docs 分类；现有 docs 文档按主题归类。
- 两套导入工作资料迁移至 references/product 与 references/technical；原始 ZIP 迁移至 archive/source-packages。
- 新增根目录规范 DIRECTORY_GUIDE.md、AI 协作入口 AGENTS.md、分类导航与逐文件清单。
- OpenAPI 唯一输出位置改为 docs/interfaces/openapi.json，同步 scripts/export-openapi.ts 与 tests/contracts.test.ts。

## 完整性与改动边界

- 整理前逐文件计算 SHA256；全部 81 个原文件在新位置可找到。
- 40 个原文件字节完全一致；其余 41 个仅为 Markdown 路径/入口修订及上述两处脚本/测试路径修改。
- 两个 ZIP、两份 CSV、应用运行代码、契约 Schema、SQL、依赖锁文件均与整理前 SHA256 一致；不删除、覆盖或重打包原始附件。
- references 是先前已修改过的导入工作副本；本次不把其描述为原始 ZIP 的逐字内容。

## 路径映射

| 旧路径（相对项目根目录） | 新路径 |
|---|---|
| `AI_AGENT_EXECUTION_PLAN.md` | [docs/planning/AI_AGENT_EXECUTION_PLAN.md](../planning/AI_AGENT_EXECUTION_PLAN.md) |
| `ARCHITECTURE_REVIEW_20_TOOLS.md` | [docs/architecture/ARCHITECTURE_REVIEW_20_TOOLS.md](../architecture/ARCHITECTURE_REVIEW_20_TOOLS.md) |
| `BASELINE_REQUIREMENTS.md` | [docs/product/BASELINE_REQUIREMENTS.md](../product/BASELINE_REQUIREMENTS.md) |
| `DEVELOPMENT_ROADMAP.md` | [docs/planning/DEVELOPMENT_ROADMAP.md](../planning/DEVELOPMENT_ROADMAP.md) |
| `Japan_AI_Image_Edit_Agent_Development_Pack_2026-10-19.zip` | [archive/source-packages/Japan_AI_Image_Edit_Agent_Development_Pack_2026-10-19.zip](../../archive/source-packages/Japan_AI_Image_Edit_Agent_Development_Pack_2026-10-19.zip) |
| `Japan_AI_Image_Edit_Work_Docs/DECISIONS_AND_ASSUMPTIONS.md` | [references/product/DECISIONS_AND_ASSUMPTIONS.md](../../references/product/DECISIONS_AND_ASSUMPTIONS.md) |
| `Japan_AI_Image_Edit_Work_Docs/GO_TO_MARKET_JAPAN.md` | [references/product/GO_TO_MARKET_JAPAN.md](../../references/product/GO_TO_MARKET_JAPAN.md) |
| `Japan_AI_Image_Edit_Work_Docs/IMAGE_EDIT_BENCHMARK.md` | [references/product/IMAGE_EDIT_BENCHMARK.md](../../references/product/IMAGE_EDIT_BENCHMARK.md) |
| `Japan_AI_Image_Edit_Work_Docs/IMAGE_EDIT_FEATURE_CATALOG.csv` | [references/product/IMAGE_EDIT_FEATURE_CATALOG.csv](../../references/product/IMAGE_EDIT_FEATURE_CATALOG.csv) |
| `Japan_AI_Image_Edit_Work_Docs/IMAGE_EDIT_FEATURE_CATALOG.md` | [references/product/IMAGE_EDIT_FEATURE_CATALOG.md](../../references/product/IMAGE_EDIT_FEATURE_CATALOG.md) |
| `Japan_AI_Image_Edit_Work_Docs/IMAGE_EDIT_MODEL_MATRIX.md` | [references/product/IMAGE_EDIT_MODEL_MATRIX.md](../../references/product/IMAGE_EDIT_MODEL_MATRIX.md) |
| `Japan_AI_Image_Edit_Work_Docs/JAPAN_IMAGE_SEO_PLAN.md` | [references/product/JAPAN_IMAGE_SEO_PLAN.md](../../references/product/JAPAN_IMAGE_SEO_PLAN.md) |
| `Japan_AI_Image_Edit_Work_Docs/PHASE1_COMMERCIAL_API_MVP.md` | [references/product/PHASE1_COMMERCIAL_API_MVP.md](../../references/product/PHASE1_COMMERCIAL_API_MVP.md) |
| `Japan_AI_Image_Edit_Work_Docs/PRODUCT_PRD.md` | [references/product/PRODUCT_PRD.md](../../references/product/PRODUCT_PRD.md) |
| `Japan_AI_Image_Edit_Work_Docs/README.md` | [references/product/README.md](../../references/product/README.md) |
| `Japan_AI_Image_Edit_Work_Docs/ROADMAP_AGENT_TASKS.md` | [references/product/ROADMAP_AGENT_TASKS.md](../../references/product/ROADMAP_AGENT_TASKS.md) |
| `Japan_AI_Image_Edit_Work_Docs/TECH_ARCHITECTURE_PHASE1.md` | [references/product/TECH_ARCHITECTURE_PHASE1.md](../../references/product/TECH_ARCHITECTURE_PHASE1.md) |
| `Japan_AI_Image_Edit_Work_Docs/UX_SCREEN_SPEC.md` | [references/product/UX_SCREEN_SPEC.md](../../references/product/UX_SCREEN_SPEC.md) |
| `Japan_AI_Image_Edit_Work_Docs_2026-10-19.zip` | [archive/source-packages/Japan_AI_Image_Edit_Work_Docs_2026-10-19.zip](../../archive/source-packages/Japan_AI_Image_Edit_Work_Docs_2026-10-19.zip) |
| `PROJECT_UNDERSTANDING.md` | [docs/product/PROJECT_UNDERSTANDING.md](../product/PROJECT_UNDERSTANDING.md) |
| `docs/CLOUD_RUN_WORKER_DESIGN.md` | [docs/architecture/CLOUD_RUN_WORKER_DESIGN.md](../architecture/CLOUD_RUN_WORKER_DESIGN.md) |
| `docs/DATABASE_SCHEMA.md` | [docs/backend/DATABASE_SCHEMA.md](../backend/DATABASE_SCHEMA.md) |
| `docs/INTERFACE_SPEC_V1.md` | [docs/interfaces/INTERFACE_SPEC_V1.md](../interfaces/INTERFACE_SPEC_V1.md) |
| `docs/JEV_LAMBDA_DESIGN.md` | [docs/architecture/JEV_LAMBDA_DESIGN.md](../architecture/JEV_LAMBDA_DESIGN.md) |
| `docs/JEV_PROTOCOL_CHECK_RESULTS.json` | [docs/research/JEV_PROTOCOL_CHECK_RESULTS.json](../research/JEV_PROTOCOL_CHECK_RESULTS.json) |
| `docs/JEV_PROTOCOL_REVIEW.md` | [docs/research/JEV_PROTOCOL_REVIEW.md](../research/JEV_PROTOCOL_REVIEW.md) |
| `docs/JEV_STARTLUX_RESEARCH.md` | [docs/research/JEV_STARTLUX_RESEARCH.md](../research/JEV_STARTLUX_RESEARCH.md) |
| `docs/VERCEL_BACKEND.md` | [docs/backend/VERCEL_BACKEND.md](../backend/VERCEL_BACKEND.md) |
| `docs/VERIFICATION.md` | [docs/verification/VERIFICATION.md](../verification/VERIFICATION.md) |
| `docs/openapi.json` | [docs/interfaces/openapi.json](../interfaces/openapi.json) |
| `japan_ai_edit_agent_docs/00_README.md` | [references/technical/00_README.md](../../references/technical/00_README.md) |
| `japan_ai_edit_agent_docs/01_PRODUCT_VISION.md` | [references/technical/01_PRODUCT_VISION.md](../../references/technical/01_PRODUCT_VISION.md) |
| `japan_ai_edit_agent_docs/02_SYSTEM_ARCHITECTURE.md` | [references/technical/02_SYSTEM_ARCHITECTURE.md](../../references/technical/02_SYSTEM_ARCHITECTURE.md) |
| `japan_ai_edit_agent_docs/03_API_CONTRACTS.md` | [references/technical/03_API_CONTRACTS.md](../../references/technical/03_API_CONTRACTS.md) |
| `japan_ai_edit_agent_docs/04_IMAGE_PIPELINE.md` | [references/technical/04_IMAGE_PIPELINE.md](../../references/technical/04_IMAGE_PIPELINE.md) |
| `japan_ai_edit_agent_docs/05_JEV_RECOMMENDATION.md` | [references/technical/05_JEV_RECOMMENDATION.md](../../references/technical/05_JEV_RECOMMENDATION.md) |
| `japan_ai_edit_agent_docs/06_PROMPT_LIBRARY.md` | [references/technical/06_PROMPT_LIBRARY.md](../../references/technical/06_PROMPT_LIBRARY.md) |
| `japan_ai_edit_agent_docs/07_AUTH_BILLING_DATA.md` | [references/technical/07_AUTH_BILLING_DATA.md](../../references/technical/07_AUTH_BILLING_DATA.md) |
| `japan_ai_edit_agent_docs/08_FEATURE_CATALOG.csv` | [references/technical/08_FEATURE_CATALOG.csv](../../references/technical/08_FEATURE_CATALOG.csv) |
| `japan_ai_edit_agent_docs/08_FEATURE_CATALOG.md` | [references/technical/08_FEATURE_CATALOG.md](../../references/technical/08_FEATURE_CATALOG.md) |
| `japan_ai_edit_agent_docs/09_MULTI_AGENT_EXECUTION.md` | [references/technical/09_MULTI_AGENT_EXECUTION.md](../../references/technical/09_MULTI_AGENT_EXECUTION.md) |
| `japan_ai_edit_agent_docs/10_TESTING_RELEASE.md` | [references/technical/10_TESTING_RELEASE.md](../../references/technical/10_TESTING_RELEASE.md) |
| `japan_ai_edit_agent_docs/11_JAPAN_GROWTH.md` | [references/technical/11_JAPAN_GROWTH.md](../../references/technical/11_JAPAN_GROWTH.md) |
| `japan_ai_edit_agent_docs/12_DECISIONS_AND_OPEN_QUESTIONS.md` | [references/technical/12_DECISIONS_AND_OPEN_QUESTIONS.md](../../references/technical/12_DECISIONS_AND_OPEN_QUESTIONS.md) |

## 验证

- 全部本地 Markdown 文件链接检查通过，302 个本地链接无断链。
- 原 81 个正式文件在新位置全部可找到；SHA256 比对确认两份 ZIP、两份 CSV、应用运行代码、契约 Schema、SQL、依赖锁文件保持原字节。
- npm run contracts:export 成功，OpenAPI 仍为 22 paths/23 operations，新输出路径与契约测试一致。
- npm run typecheck 通过；npm test 通过 60/60。测试和导出路径已随目录调整更新。
- 本轮没有修改运行代码或 SQL，不重复运行生产构建、数据库并发或云端联调；此前证据仍见 [原验证记录](../verification/VERIFICATION.md)。
- 文件清单列出 88 个实际存在的正式文件；7 个新增文件为本轮规范、导航、清单与迁移说明。未新增前端、Worker 或模型服务实现。
