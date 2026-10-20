# 日本消费者 AI 图片编辑

当前已有可本地验证的 **Vercel Web 后端**，包含 20 工具配置、多图输入、资产、任务、积分与支付接口。Cloud Run Worker 和 Lambda GPU 推荐服务仅完成设计，尚未实现或部署；默认关闭生成。

## 主要文档

- [目录与文件管理规范](DIRECTORY_GUIDE.md)
- [Git、版本与流水线规范](docs/maintenance/GIT_AND_CI.md)
- [分类文档导航](docs/README.md) 与 [文件用途清单](docs/FILE_INVENTORY.md)
- [统一接口协议](docs/interfaces/INTERFACE_SPEC_V1.md) 与 [OpenAPI](docs/interfaces/openapi.json)
- [前端接口接入规范与示例](docs/interfaces/FRONTEND_API_GUIDE.md)
- [前端页面、功能入口与跳转设计](docs/product/FRONTEND_PAGE_MAP.md)
- [Vercel 后端：实现、配置与上线条件](docs/backend/VERCEL_BACKEND.md)
- [数据库事务与权限](docs/backend/DATABASE_SCHEMA.md)
- [Cloud Run Worker 设计，待审阅](docs/architecture/CLOUD_RUN_WORKER_DESIGN.md)
- [Lambda GPU JEV 具体方案，待审阅](docs/architecture/JEV_LAMBDA_DESIGN.md)
- [d3-mini 对20工具的评分与扩展](docs/architecture/RECOMMENDATION_SCORING_20_TOOLS.md)
- [Lambda推荐接口与d3协议映射](docs/interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md)
- [Lambda服务器只读核查](docs/research/LAMBDA_ENVIRONMENT_2026-10-20.md)
- [Decision Index／Decision 3.0 协议核查](docs/research/JEV_PROTOCOL_REVIEW.md)
- [本轮验证记录](docs/verification/VERIFICATION.md)
- [需求基线](docs/product/BASELINE_REQUIREMENTS.md)、[架构评审](docs/architecture/ARCHITECTURE_REVIEW_20_TOOLS.md)、[开发路线图](docs/planning/DEVELOPMENT_ROADMAP.md)、[AI 分工](docs/planning/AI_AGENT_EXECUTION_PLAN.md)

## 本地检查

要求 Node.js 22+。依赖版本由 package-lock.json 固定。

```sh
npm ci
npm run verify
npm run hooks:install
```

复制 `.env.example` 到 `apps/web/.env.local`，填写自己的测试环境配置后运行 `npm run dev`。无需配置即可构建；运行 `/api/health` 和关闭生成时的 `/api/tools` 不依赖云凭据。其他接口会验证真实身份或调用实际云服务，不带内置模拟账户。测试替身只存在于 tests。

当前工作区已包含网页页面和 Web API 代码；尚无生成供应商调用、Worker 或 JEV 服务运行实现。20 工具是初期目录，模型和模板以版本化快照演进；模板目前均未完成真实效果 evaluation。

本地 Git 已初始化为 main，remote 待用户添加。推送 main 或更新 PR 后运行 GitHub CI；正式版本可手动触发 Version tag 工作流，在检查通过后自动打标签。详见 Git 与流水线规范。
