# 真实登录发布与后台配置

2026-10-20。目标网站https://picharu.vercel.app，Supabase项目oltbspdxgrnrqhkupuco。本分支从已部署main准备认证必需变更，不包含Worker协议/迁移或未发布的品牌UI。

## 已核实与边界

- Vercel主域名已提供登录表单；原生产源码878383f，仅含旧回调。Google按钮可到达Google登录页，Supabase Google和Email均显示启用。
- GitHub本地认证可用，仓库MemoBloom/picharu。没有本机Vercel/Supabase CLI凭据或.env.local；不从浏览器提取后台会话Token。
- 公网页面及到达Google登录页不等于已完成首次注册、数据库账户初始化或邮件投递。尚未代用户登录/发信。
- 本地npm run verify通过116测试、90 SQL断言、契约/类型及生产构建。Auth集成测试使用真实SDK、基础SQL与隔离传输；不需要Worker迁移。

## 1. Vercel生产环境

在项目Settings的环境变量设置Production：

| 变量 | 来源/值 |
|---|---|
| APP_ORIGIN | https://picharu.vercel.app |
| NEXT_PUBLIC_SUPABASE_URL | https://oltbspdxgrnrqhkupuco.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 同项目publishable key；兼容NEXT_PUBLIC_SUPABASE_ANON_KEY |
| SUPABASE_URL | 与浏览器项目URL完全相同 |
| SUPABASE_SECRET_KEY | 同项目服务端secret key；兼容SUPABASE_SERVICE_ROLE_KEY，只放服务端 |
| GENERATION_ENABLED | false |
| MODEL_PROFILES_JSON | [] |

已有同名变量先检查，不重复覆盖有效配置。修改NEXT_PUBLIC变量必须重新构建；保存变量不会更新旧部署。Google Client Secret和SMTP密码只留Supabase，不放Web公开变量。发布本认证分支后再更换邮件模板，避免旧回调不支持token_hash。

## 2. Supabase认证

打开项目Authentication：

1. Sign In / Providers：Allow new users to sign up开启、Confirm email开启、Email开启。Google已启用时保留现有有效Client，不重建或旋转Secret。
2. URL Configuration：Site URL为https://picharu.vercel.app，Redirect URLs包含精确https://picharu.vercel.app/auth/callback；保留已有有效条目。应用新流程不把next放进OAuth回调地址，目标页暂存当前标签页。
3. Google Auth Platform的对应Web客户端：Authorized JavaScript origins包含https://picharu.vercel.app；Authorized redirect URI为https://oltbspdxgrnrqhkupuco.supabase.co/auth/v1/callback。不要把这两个后台的回调填反。
4. 测试状态下，在Google Audience中加入实际测试账号；只使用openid/email/profile登录权限。

官方依据：[Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google)、[回调允许列表](https://supabase.com/docs/guides/auth/redirect-urls)。

## 3. 邮件

Authentication → Emails：核对SMTP是否配置。没有自定义SMTP时，Supabase默认服务只适合项目团队邮箱有限测试，不能当作普通用户邮件投递已可用；不代购邮件服务。已有SMTP保留。新的host/port/username/password和发信地址由账户持有人在后台填写，无需发到聊天。

认证代码发布后，将Confirm signup和Magic Link两份模板的链接统一为：

```html
<h2>picmoko にログイン</h2>
<p>下のリンクからログインしてください。</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">ログインする</a></p>
<p>心当たりがない場合は、このメールを無視してください。</p>
```

应用固定RedirectTo为/auth/callback，未附next，以上模板才可直接拼接?token_hash。Google仍用PKCE code；邮件code旧格式兼容，但需发起登录的同一浏览器保留verifier。跨浏览器token_hash无原目标记录时回到/ja/edit。不要开启密码登录或关闭邮箱确认来绕过配置。

依据：[SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[邮件模板](https://supabase.com/docs/guides/auth/auth-email-templates)。

## 4. 账户初始化，只读检查

在Supabase SQL Editor运行scripts/inspect-auth.sql，只输出结构及数量：initialization_trigger_ready=true、profiles_rls=true、credit_accounts_rls=true、users_missing_profile=0、users_missing_credit_account=0。不要重新执行已应用的建表迁移。

基础migration的app_user_created触发器会创建profiles与0可用/0预留的credit_accounts，不赠送额度。初始化失败会回滚注册；重复登录不重置余额或restricted。API/me必须确认账户已存在，才能完成回调。新secret key只放apikey，显式用户JWT仍用于验证身份。

## 5. 真实验收

1. 发布完成后打开/ja/login?next=%2Fja%2Faccount，用持有人的Google测试账号完成登录；验证码或账号选择由本人完成。
2. 回到账户页后确认个人资料；积分页0可用/0预留；退出再登录、刷新恢复均正常。
3. 在允许收信的测试邮箱发起邮件链接：首次注册及再次登录各测一次，实际收到邮件并完成回调。
4. 同一链接重复使用/过期应失败，返回登录可重试；另一浏览器邮件回调默认进入编辑页。
5. 再运行只读初始化检查；只汇报成功/失败和五项结果，不提交完整邮件链接、code、token_hash、JWT或任何Secret。

正式条款/隐私文案仍需发布前确认。生成保持关闭，认证验收不上传照片、不购买积分、不调用模型。
