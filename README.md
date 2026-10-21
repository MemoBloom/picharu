# picmoko Web

本仓库包含日本消费者图片编辑网站的 **网页前端和 Vercel Web API**。Cloud Run Worker 与 GPU 推荐服务是独立仓库边界。Worker已获授权在独立picjp-worker开发，共享契约及PG增量留在本库；GPU仍仅设计。

## 目录

- apps/web：同一个 Next.js 应用的页面、组件及 API；业务服务代码在 src/server。
- packages/contracts：Zod 共享字段和校验；packages/tool-config：当前18方向、历史20个Tool ID；packages/prompts：仅服务端使用的执行Prompt与推荐资料。
- supabase/migrations：Web数据库迁移、权限和事务。
- tests、scripts：测试与工程命令；.github/workflows：本仓库的CI与版本标签。
- docs/interfaces：统一协议、前端接入说明及生成的OpenAPI；docs/backend：实现和数据库；docs/verification：已执行验证。

## 本地运行与验证

Node22为基线，参见.node-version。所有命令在本仓库根目录执行：

```sh
npm ci
npm run verify
npm run hooks:install
npm run dev
```

将.env.example复制为apps/web/.env.local后配置自己的测试环境。真实凭据不提交。生成默认关闭；Worker/模型与云端正式链路未验收前不要开启GENERATION_ENABLED。无云凭据也可构建及运行health/tools路径，其余接口需要真实环境或测试端口。

verify检查OpenAPI一致、类型、业务/契约/媒体测试、PGlite数据库事务和生产构建。原生PostgreSQL17并发测试由CI单独运行。新clone后执行hooks:install启用本地pre-push；CI无需生产密钥。

## 接口与实施说明

- [文档导航](docs/README.md)
- [统一接口](docs/interfaces/INTERFACE_SPEC_V1.md)、[前端接入](docs/interfaces/FRONTEND_API_GUIDE.md)、[OpenAPI](docs/interfaces/openapi.json)
- [Web实施说明](docs/backend/VERCEL_BACKEND.md)、[数据库](docs/backend/DATABASE_SCHEMA.md)、[验证](docs/verification/VERIFICATION.md)

日语前端采用已确认的云朵Logo与A1字标，正文/按钮Zen Kaku Gothic New、重点标题Zen Maru Gothic，同源WOFF2加载；顶部和手机账户入口清晰，Google按钮显示官方彩色G。当前18工具详情保留历史20 ID；编辑工作台支持上传/换图/放大、分类搜索选择器、主参数/详细设置及手机单层操作栏。页面与个人/管理员看板共用现有同源API，真实云运行与效果验收以各验证记录为准。

接口稳定性与模型选择分离。新增效果可扩展配置和契约版本，不变更已创建任务快照；20不是长期上限。真实效果和上线联调尚未完成，已有页面代码不代表生成服务已可用。

## Git和CI

本仓库保留迁移前的Git历史，main分支，remote由用户提供。首次历史曾包含工作区资料，迁移提交将其移出当前代码树；原文件仍保存在工作区，历史未删除。

```sh
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

将OWNER/REPOSITORY替换为自己的地址。main push或指向main的PR触发Verify与PostgreSQL concurrency检查；Version tag手动输入版本后完整检查并创建不可覆盖的注释标签。流水线不发布npm包、不自动部署Vercel。没有remote时GitHub runner和标签推送尚未验证。

本仓库可单独clone、安装与运行CI，不要求检出父工作区或兄弟仓库。项目级产品规划和跨服务设计属于父工作区；未来Worker/GPU通过固定版本Schema/OpenAPI对接，不从本机兄弟路径直接导入代码。

## 双看板

用户个人控制台与管理员完整数据看板的三阶段实现及本地证据见[实施计划](docs/backend/CONSOLE_IMPLEMENTATION.md)和[管理员实现](docs/backend/ADMIN_ANALYTICS.md)。采集默认关闭；本地验证不表示云迁移/部署/真实自然采集完成。当前品牌UI合并保留main既有看板、认证、邮件及18方向/历史20ID兼容，SEO仍在独立任务。看板合并验证见[记录](docs/verification/CONSOLE_MAIN_MERGE.md)，本次UI合并见[记录](docs/verification/PICMOKO_UI_MAIN_MERGE.md)，云端步骤见[部署清单](docs/backend/CONSOLE_DEPLOYMENT.md)。
