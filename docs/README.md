# Web 仓库文档

这些文档随Web代码独立版本管理；路径、命令未特别说明时以本仓库根目录为准。

- [统一协议](interfaces/INTERFACE_SPEC_V1.md)、[前端接入](interfaces/FRONTEND_API_GUIDE.md)、[生成OpenAPI](interfaces/openapi.json)
- [Vercel后端说明](backend/VERCEL_BACKEND.md)、[数据库说明](backend/DATABASE_SCHEMA.md)
- [验证记录](verification/VERIFICATION.md)
- [Vercel构建故障审查与修复](verification/VERCEL_BUILD_REVIEW.md)

项目级产品、计划、跨服务架构和研究仍保留在父工作区docs；在工作区内可以沿链接追溯。单独clone本仓库时父级文档可能不存在，运行/构建/CI不依赖它们；接口字段及Web实现说明均已随本仓库保留。

- [Worker接口评审与本地实现边界](interfaces/WORKER_INTERFACE_REVIEW.md)；共享SQL增量随Web管理，执行服务在独立Worker仓库。
- [完整生成链路及跨仓库离线验收](backend/FULL_FLOW.md)：Web创建、Worker同步执行、R2保存、积分结算和结果读取。
- [双看板三阶段开发](backend/CONSOLE_IMPLEMENTATION.md)、[阶段1数据与权限](backend/CONSOLE_FOUNDATION.md)、[分阶段验收](verification/CONSOLE_VERIFICATION.md)。
- [阶段2个人控制台](backend/PERSONAL_CONSOLE.md)：本人使用总览、任务/作品筛选及积分流水。

- [阶段3管理员完整数据看板](backend/ADMIN_ANALYTICS.md)：8页面、24指标、固定快照/分页/钻取/CSV、事件与实际退款事实。

- [双看板逐项完成审计](verification/CONSOLE_COMPLETION_AUDIT.md)、[最新UI/Auth/SEO兼容与合并说明](integration/CONSOLE_UI_INTEGRATION.md)。

- [真实登录发布与后台设置](backend/AUTH_SETUP.md)：生产环境、Google/邮箱回调、账户初始化及实际验收。

- 邮件公开Logo/字体资源：apps/web/public/email-assets/v1/README.md；独立静态路径与公开字体跨域头，不变更Auth或网站页面样式。
- [已确认的注册/登录邮件](../supabase/templates/README.md)：HTML权威源码、Subject及Supabase手动保存步骤。

- [SEO S0–S4 实施与验收](seo/DELIVERY.md)、[Google与云端配置指南](seo/CLOUD_SETUP.md)

- [SEO采集镜像与Cloud Run首次真实导入](seo/COLLECTOR_CLOUD_RUN.md)：先构建，后配置/执行；复用现有构建基础设施，独立于图片Worker。

- [SEO CSV研究与健康检查](seo/RESEARCH_IMPORT.md)、[S0–S4要求复核](seo/REQUIREMENTS_AUDIT.md)

- [SEO内容优化计划与观察复盘](seo/OBSERVATION_REVIEW.md)

- [S1首发候选中日对照稿](seo/S1_REVIEW_PACKET.md)、[人工审校记录](seo/S1_OWNER_REVIEW.md)：三项保留候选，真实样例/日语结论待确认；译稿绑定页面内容指纹。
- [双看板 Supabase / Vercel 部署步骤](backend/CONSOLE_DEPLOYMENT.md)：迁移顺序、只读盘点、管理员授权与采集启用边界。

- [双看板合入main验证](verification/CONSOLE_MAIN_MERGE.md)：实际合并、前端WIP保护、认证/邮件及跨模块回归。
- [picmoko品牌UI合并验证](verification/PICMOKO_UI_MAIN_MERGE.md)：云朵/A1字标、日文字体、移动编辑、Google图标与main看板的整合。
- 网页字体来源/OFL/摘要：apps/web/public/fonts/picmoko/README.md；Google图标来源：apps/web/public/auth/README.md。

- [SEO每日采集与告警配置](seo/SCHEDULING_AND_ALERTS.md)：独立Job、Scheduler调用身份、每日组合执行、失败/漏跑监控及测试通知。

- [SEO剩余任务与完成标准](seo/REMAINING_TASKS.md)：上线前6项任务、上线后数据/效果闭环及可延期事项。

- [SEO与最新主分支集成](integration/SEO_MAIN_INTEGRATION.md)：保留品牌/登录/双看板、认证回调生命周期修复及最终回归，索引仍关闭。
- [剩余19文件逐项审计](verification/RESIDUAL_WORK_AUDIT_2026-10-21.md)：已合入/等效覆盖/需补漏的分类、法律404与数据库回归、文档状态修正。
- [消除类退出一期](verification/TOOL_RETIREMENT_2026-10-21.md)：当前18活动方向、历史20 ID与幂等/积分兼容。
- [效果展示与头像详情](design/EFFECT_DISCOVERY.md)：首页真实样例、图片式工具卡片、六风格详情、移动体验及私有素材排除边界；本地开发，未部署。
- [个人页与支持导航](design/ACCOUNT_SUPPORT_NAVIGATION.md)：编辑历史归入マイページ，全站/手机增加サポート，保留退出和权限边界；本地实现待发布。
- [统一图片预览与任务进度](design/IMAGE_PREVIEW_AND_PROGRESS.md)：上传/处理中/结果共用图片舞台，日文阶段与等待时间、加载/重试/停止反馈；本地预览，未上线。
