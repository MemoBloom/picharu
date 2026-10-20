# PicJP Web 仓库规则

本仓库负责网页前端和Vercel API，不是整个项目工作区。先读README、docs/README和需要修改的模块文档；在父工作区中工作时同时遵守父级AGENTS。

- 当前代码/校验路径以本仓库为根：apps/web、packages、supabase、scripts、tests。
- 保持现有Next.js前端与API一体，业务代码放apps/web/src/server；在apps/web下修改时还需遵守该目录AGENTS中的框架规则。
- 公开字段以packages/contracts为准；变更后同步docs/interfaces并导出OpenAPI，禁止手改生成文件。
- Prompt、service role、R2/Stripe密钥不得进入浏览器bundle或Git。
- Worker与GPU服务在其他仓库，仅在用户明确授权时处理相应实现。
- npm run verify是本仓库提交/推送前的统一检查。原生PG并发在CI隔离环境运行，不连接生产库。
- 保留其他任务的未提交改动；明确分支/文件范围，小提交，不擅自改remote或force push。
- 父工作区docs、references、archive不属于本仓库，不重新复制为独立平行主文档，不添加工作区根.git。
