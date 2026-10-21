# PicJP Web

本仓库包含日本消费者图片编辑网站的 **网页前端和 Vercel Web API**。Cloud Run Worker 与 GPU 推荐服务是独立仓库边界，不放在本仓库，也不在本轮开发。

## 目录

- apps/web：同一个 Next.js 应用的页面、组件及 API；业务服务代码在 src/server。
- packages/contracts：Zod 共享字段和校验；packages/tool-config：当前18方向及历史20个ID的生命周期；packages/prompts：仅服务端使用的执行Prompt与推荐资料。
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

日语前端已实现 12 个页面模板、18 个公开工具详情和移动端底部导航；顶部使用普通「ホーム」。remove_person/remove_object退出目录和新任务，历史ID/任务及同key重放保留；两项旧SEO页面与消除教程返回404，即使数据库中已有旧发布也不再暴露。页面接现有同源API，云端验收以各模块记录为准。

接口稳定性与模型选择分离。新增效果可扩展配置和契约版本，不变更已创建任务快照；20不是长期上限。真实效果和上线联调尚未完成，已有页面代码不代表生成服务已可用。

## Git和CI

本仓库保留迁移前的Git历史，main分支，remote由用户提供。首次历史曾包含工作区资料，迁移提交将其移出当前代码树；原文件仍保存在工作区，历史未删除。

```sh
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

将OWNER/REPOSITORY替换为自己的地址。main push或指向main的PR触发Verify与PostgreSQL concurrency检查；Version tag手动输入版本后完整检查并创建不可覆盖的注释标签。流水线不发布npm包、不自动部署Vercel。没有remote时GitHub runner和标签推送尚未验证。

本仓库可单独clone、安装与运行CI，不要求检出父工作区或兄弟仓库。项目级产品规划和跨服务设计属于父工作区；未来Worker/GPU通过固定版本Schema/OpenAPI对接，不从本机兄弟路径直接导入代码。

## SEO 工程

独立 SEO 实施见 [交付与验收](docs/seo/DELIVERY.md) 和 [云端接入指南](docs/seo/CLOUD_SETUP.md)。公开正文服务端输出；工具/教程索引和分析采集默认关闭，等待真实样例、日语审校及云配置验收。`npm run test:seo:production` 检查已构建的本机服务，`npm run test:seo:publishing` 使用隔离 SQL/TLS 替身验证实际发布和 ISR；后者在临时源码/依赖副本中构建，使用明确标记的合成图，不修改原样例清单或普通预览构建。

首发候选的日文正文/中文对照见 [S1审校包](docs/seo/S1_REVIEW_PACKET.md)，人工记录另存；`npm run seo:review:check`在正文变化时提示重新核对，不能代替人工日语和真实效果评价。

Google只读接入与Supabase结构盘点见 [云端接入指南](docs/seo/CLOUD_SETUP.md)。Cloud Shell诊断使用Python 3标准库；离线回归运行 `python3 -m unittest discover -s tests -p test_google_read_preflight.py`，CI在Verify作业单独执行，不需要Google凭据。
