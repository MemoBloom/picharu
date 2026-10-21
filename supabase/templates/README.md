# picmoko 认证邮件

用户于2026-10-20确认此风格。此目录是可粘贴到Supabase的邮件HTML权威源码；工作区设计稿/截图用于设计归档，不作为另一份长期模板源码。

| Supabase模板 | Subject | Body |
|---|---|---|
| Confirm signup | 【picmoko】ようこそ。メールアドレスをご確認ください | [confirm-signup.html](confirm-signup.html) |
| Magic Link | 【picmoko】ログインリンク｜写真の続きを、ここから | [magic-link.html](magic-link.html) |

在Supabase Authentication → Emails → Templates打开对应模板，将Subject与完整HTML分别填入标题和正文，预览后保存。Git合并或Vercel部署不会自动更新Supabase托管模板；本轮未代保存后台或发送邮件。

两份HTML使用现有回调：`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email`。RedirectTo由Web精确指向`/auth/callback`，回调消费token_hash并验证业务账户。保留当前实测成功的变量/href，不因展示文案调整改回调域名或协议。确认邮件预览后，由用户执行一次收件及登录验收；不要将含真实token的邮件URL提交Git或聊天。

原云朵Logo与A1字标通过公开HTTPS PNG加载；正文/按钮Zen Kaku Gothic New 400/700，重点标题Zen Maru Gothic 700。资源与OFL/来源摘要位于[公开素材目录](../../apps/web/public/email-assets/v1/README.md)，由PR #4生产发布在`https://picharu.vercel.app/email-assets/v1/`。部分客户端屏蔽图片或网络字体：字标提供alt，文字回退系统日文字体。WOFF2是当前固定文案子集，新增字符须重新生成并使用新版本资源，不能覆盖已长期缓存的v1文件。

注册邮件介绍清理/背景与调色、发型/头像、人物/宠物插画三组方向；登录邮件精简介绍。当前保留“功能顺次公开”的说明，不宣称20工具全部开放，不虚构额度或链接有效分钟数。所有模板仅含一个认证操作链接，无脚本、营销追踪或用户数据。

## 已完成验证

2026-10-20：`npm run verify`通过116项测试、90项PGlite SQL断言、类型/契约校验及生产构建。此次只新增静态模板和说明，未改认证处理代码、依赖或数据库。

两份源码与用户确认的工作区设计稿逐字节一致；静态检查单认证href、两张公开PNG、三条字体声明、无脚本/iframe/form和本地资源URL。先前浏览器600px/360px实际预览通过，公开资源HTTP200及摘要/MIME/CORS检查通过；邮件客户端实际收件效果仍需保存Supabase模板后验收。
