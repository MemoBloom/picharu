# 双看板分阶段验证

目标、范围及分期见[实施计划](../backend/CONSOLE_IMPLEMENTATION.md)。以下证据来自独立worktree `picjp-web-console`、`feat/console-analytics`，基线228e157；原UI/Auth/SEO checkout未改。

## 阶段1：2026-10-21 本地通过

- `npm ci --offline --include=dev`：独立安装成功；没有父/兄弟仓库运行依赖。
- `npm run verify`：生成OpenAPI一致、TypeScript、126测试、90项基础SQL回归、Next.js生产构建通过。新增10组测试覆盖真实三份迁移后的权限/角色撤销/过期、直接SQL拒绝、启停区间、历史环境、浏览器字段和时钟、曝光选择幂等、本人结果/过期、反馈、GET排除、POST下载、签名失败和确认故障/删除竞态。
- `npm run test:concurrency`：本机PostgreSQL17、专用临时Unix socket、独立随机数据库，114断言通过；20个独立连接真正重叠执行相同事件和签名确认，仅一条记录；原有积分预留/取消/付款/退款和30次删除创建竞态回归通过。初次沙箱内initdb因共享内存限制失败，使用批准的隔离本地进程重跑成功，测试后已停止集群；不连接云数据库。
- 失败场景中的SERVICE_UNAVAILABLE/CONSOLE_DOWNLOAD_RECORDING_PENDING为预期结构化错误日志，不含凭据或签名链接。

本阶段尚无新增可见页面，未做浏览器页面验收。上述离线替身不证明Supabase/R2/Vercel云端部署或真实采集通过。未执行Stripe沙盒PAY-001，未新增收费模型调用，生成开关不变。新SQL与API尚未部署。

## 阶段2、3

尚未实施/验收，不能以阶段1测试推断已完成用户控制台或完整管理员看板。后续各阶段分别追加代码/口径/API/实际浏览器交互和最终跨阶段验收证据。
