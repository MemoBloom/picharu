# Web 仓库文档

这些文档随Web代码独立版本管理；路径、命令未特别说明时以本仓库根目录为准。

- [统一协议](interfaces/INTERFACE_SPEC_V1.md)、[前端接入](interfaces/FRONTEND_API_GUIDE.md)、[生成OpenAPI](interfaces/openapi.json)
- [Vercel后端说明](backend/VERCEL_BACKEND.md)、[数据库说明](backend/DATABASE_SCHEMA.md)
- [验证记录](verification/VERIFICATION.md)
- [Vercel构建故障审查与修复](verification/VERCEL_BUILD_REVIEW.md)

项目级产品、计划、跨服务架构和研究仍保留在父工作区docs；在工作区内可以沿链接追溯。单独clone本仓库时父级文档可能不存在，运行/构建/CI不依赖它们；接口字段及Web实现说明均已随本仓库保留。

- [真实登录发布与后台设置](backend/AUTH_SETUP.md)：生产环境、Google/邮箱回调、账户初始化及实际验收。

- 邮件公开Logo/字体资源：apps/web/public/email-assets/v1/README.md；独立静态路径与公开字体跨域头，不变更Auth或网站页面样式。
- [已确认的注册/登录邮件](../supabase/templates/README.md)：HTML权威源码、Subject及Supabase手动保存步骤。
