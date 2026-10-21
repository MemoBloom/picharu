# Web 仓库文档

这些文档随Web代码独立版本管理；路径、命令未特别说明时以本仓库根目录为准。

- [统一协议](interfaces/INTERFACE_SPEC_V1.md)、[前端接入](interfaces/FRONTEND_API_GUIDE.md)、[生成OpenAPI](interfaces/openapi.json)
- [Vercel后端说明](backend/VERCEL_BACKEND.md)、[数据库说明](backend/DATABASE_SCHEMA.md)
- [验证记录](verification/VERIFICATION.md)
- [Vercel构建故障审查与修复](verification/VERCEL_BUILD_REVIEW.md)

项目级产品、计划、跨服务架构和研究仍保留在父工作区docs；在工作区内可以沿链接追溯。单独clone本仓库时父级文档可能不存在，运行/构建/CI不依赖它们；接口字段及Web实现说明均已随本仓库保留。

- [Worker接口评审与本地实现边界](interfaces/WORKER_INTERFACE_REVIEW.md)；共享SQL增量随Web管理，执行服务在独立Worker仓库。
- [完整生成链路及跨仓库离线验收](backend/FULL_FLOW.md)：Web创建、Worker同步执行、R2保存、积分结算和结果读取。
- [Google/邮箱真实登录接入](backend/AUTH_SETUP.md)：picharu.vercel.app的Supabase/Google/SMTP配置、新用户初始化与验收。
- [双看板三阶段开发](backend/CONSOLE_IMPLEMENTATION.md)、[阶段1数据与权限](backend/CONSOLE_FOUNDATION.md)、[分阶段验收](verification/CONSOLE_VERIFICATION.md)。
- [阶段2个人控制台](backend/PERSONAL_CONSOLE.md)：本人使用总览、任务/作品筛选及积分流水。

- [阶段3管理员完整数据看板](backend/ADMIN_ANALYTICS.md)：8页面、24指标、固定快照/分页/钻取/CSV、事件与实际退款事实。

- [双看板逐项完成审计](verification/CONSOLE_COMPLETION_AUDIT.md)、[最新UI/Auth/SEO兼容与合并说明](integration/CONSOLE_UI_INTEGRATION.md)。
