# PicJP Web

本仓库包含日本消费者图片编辑网站的 **网页前端和 Vercel Web API**。Cloud Run Worker 与 GPU 推荐服务是独立仓库边界，不放在本仓库，也不在本轮开发。

## 目录

- apps/web：同一个 Next.js 应用的页面、组件及 API；业务服务代码在 src/server。
- packages/contracts：Zod 共享字段和校验；packages/tool-config：初期20工具；packages/prompts：仅服务端使用的执行Prompt与推荐资料。
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

将.env.example复制为apps/web/.env.local后配置自己的测试环境。真实凭据不提交。生成默认关闭；Worker未实现前不要开启GENERATION_ENABLED。无云凭据也可构建及运行health/tools路径，其余接口需要真实环境或测试端口。

verify检查OpenAPI一致、类型、业务/契约/媒体测试、PGlite数据库事务和生产构建。原生PostgreSQL17并发测试由CI单独运行。新clone后执行hooks:install启用本地pre-push；CI无需生产密钥。

## 接口与实施说明

- [文档导航](docs/README.md)
- [统一接口](docs/interfaces/INTERFACE_SPEC_V1.md)、[前端接入](docs/interfaces/FRONTEND_API_GUIDE.md)、[OpenAPI](docs/interfaces/openapi.json)
- [Web实施说明](docs/backend/VERCEL_BACKEND.md)、[数据库](docs/backend/DATABASE_SCHEMA.md)、[验证](docs/verification/VERIFICATION.md)

日语前端已实现 12 个页面模板、20 工具详情和移动端底部导航；顶部使用普通「ホーム」，不放待定域名或临时品牌。页面直接接现有同源 API，登录、上传、任务和支付仍待真实云端联调。

接口稳定性与模型选择分离。新增效果可扩展配置和契约版本，不变更已创建任务快照；20不是长期上限。真实效果和上线联调尚未完成，已有页面代码不代表生成服务已可用。

## Git和CI

本仓库保留迁移前的Git历史，main分支，remote由用户提供。首次历史曾包含工作区资料，迁移提交将其移出当前代码树；原文件仍保存在工作区，历史未删除。

```sh
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

将OWNER/REPOSITORY替换为自己的地址。main push或指向main的PR触发Verify与PostgreSQL concurrency检查；Version tag手动输入版本后完整检查并创建不可覆盖的注释标签。流水线不发布npm包、不自动部署Vercel。没有remote时GitHub runner和标签推送尚未验证。

本仓库可单独clone、安装与运行CI，不要求检出父工作区或兄弟仓库。项目级产品规划和跨服务设计属于父工作区；未来Worker/GPU通过固定版本Schema/OpenAPI对接，不从本机兄弟路径直接导入代码。
