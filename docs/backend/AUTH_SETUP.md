# Supabase 真实登录接入

更新：2026-10-20。目标Web为`https://picharu.vercel.app`，Supabase为`https://oltbspdxgrnrqhkupuco.supabase.co`。本次代码只接Google/邮箱登录及账户初始化，不启用生成或支付。

代码、SDK/SQL离线测试已完成；以下真实后台设置仍需执行，不能据本地测试认定Google登录或邮件投递已通过。当前工作区没有真实.env.local，未获取Google Client Secret、SMTP密码或Supabase公开Key。

## 1. 先配置Web并发布这次代码

在Vercel对应项目的Settings → Environment Variables，为本次使用的环境设置：

| 变量 | 值/来源 |
|---|---|
| APP_ORIGIN | `https://picharu.vercel.app` |
| NEXT_PUBLIC_SUPABASE_URL | `https://oltbspdxgrnrqhkupuco.supabase.co` |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Supabase项目Settings → API Keys中的Publishable key；兼容旧anon key变量 |
| SUPABASE_URL | 与上面的Supabase URL完全一致 |
| SUPABASE_SECRET_KEY | 同项目服务端Secret key，仅Vercel服务端使用；旧SERVICE_ROLE变量兼容 |
| GENERATION_ENABLED | `false` |
| MODEL_PROFILES_JSON | `[]`，本轮不配置生成 |

浏览器配置只接受publishable或旧anon key，拒绝sb_secret/service_role。Google Client Secret和SMTP密码不填入这些Web变量。修改NEXT_PUBLIC变量后必须重新构建/部署。

**先将包含本次Auth修改的代码发布到picharu.vercel.app，再启用下面的新邮件模板。** 旧版回调只处理code，不能处理新的token_hash模板。当前代码在Web的feat/picmoko-ui，本次没有自动推送、合并或部署；原UI/字体等未提交内容保持原状。

本地若配置同一测试项目，文件为`apps/web/.env.local`，APP_ORIGIN改实际本地origin，并在Supabase增加该origin下的精确回调。不要把localhost写成Google的Supabase回调，也不要把Cloud Run Worker URL用作Web登录地址。

## 2. Supabase：站点、注册与邮箱开关

进入当前Supabase项目的Authentication：

1. URL Configuration → Site URL：`https://picharu.vercel.app`。
2. Redirect URLs增加精确地址：`https://picharu.vercel.app/auth/callback`。本次代码的redirectTo没有next查询串；目标页暂存在当前标签页，只保存安全站内路径。新增自定义域名时要同步更新两边配置。
3. Sign In / Providers（部分界面显示Providers）→ Email：启用Email provider。
4. 确认General Configuration中的Allow new users to sign up开启。保留邮箱确认；本应用通过登录链接确认邮箱，不实现邮箱密码登录。

回调允许列表规则见[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)，邮箱自动注册与登录见[Passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)。

## 3. Google：建立Web OAuth客户端

可复用Google Cloud项目`picjp-staging`，不必新建项目。在Google Cloud Console打开Google Auth Platform：

1. 首次使用点Get Started。Branding填应用名`picmoko`、支持邮箱和联系邮箱。
2. Audience选择External；先用于Testing，并在Test users加入实际测试Google邮箱。
3. Data Access只配置登录需要的openid、email、profile；不请求Drive或Photos权限。
4. Clients → Create client → Web application。
5. Authorized JavaScript origins填`https://picharu.vercel.app`。
6. Authorized redirect URIs填：

```text
https://oltbspdxgrnrqhkupuco.supabase.co/auth/v1/callback
```

7. 创建后，将Client ID与Client Secret填到Supabase → Authentication → Sign In / Providers → Google，启用Google并保存。Secret留在Supabase后台，不发送到聊天或前端。

Google填的是Supabase回调；网站`/auth/callback`填在Supabase允许列表。具体后台步骤依据[Supabase Google登录](https://supabase.com/docs/guides/auth/social-login/auth-google)与[Google OAuth配置](https://developers.google.com/workspace/guides/configure-oauth-consent)。

## 4. 邮件：SMTP与两份模板

在Supabase的Authentication → Email/SMTP设置中配置自定义SMTP：host、port、username、password、发送人邮箱与名称。发送人地址/域名需要按邮件服务商要求验证。这些配置只填Supabase后台，本次不代选或购买邮件服务。

如果暂时没有SMTP，可以先用Supabase项目团队成员邮箱做有限测试；默认发信服务不适合普通外部用户，当前官方说明只允许项目团队地址、限额很低。Google登录不依赖此SMTP。见[Supabase SMTP说明](https://supabase.com/docs/guides/auth/auth-smtp)。

Authentication → Email Templates中，将**Confirm signup**和**Magic Link**两份模板的登录链接设为：

```html
<h2>picmoko にログイン</h2>
<p>下のリンクからログインしてください。</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">ログインする</a></p>
<p>心当たりがない場合は、このメールを無視してください。</p>
```

本应用发信时固定emailRedirectTo为网站`/auth/callback`，因此RedirectTo后面没有既有查询串。首次注册和后续登录都使用type=email，回调通过verifyOtp交换会话；Google继续使用PKCE code交换。保留旧ConfirmationURL模板时的code回调也兼容，但需要发起登录的同一浏览器保留PKCE verifier。邮件模板变量见[官方模板说明](https://supabase.com/docs/guides/auth/auth-email-templates)。

登录凭据会从回调地址栏移除，回调页不缓存并使用no-referrer。新标签页/另一浏览器使用token_hash可完成会话，但没有原标签页的目标页记录时会回到`/ja/edit`。不要把收到的完整登录链接、code、token_hash或JWT贴回聊天。

## 5. 新用户账户初始化

沿用已经部署的基础migration `202610190001_web_backend.sql`，**本次没有新增migration，不要重新执行已应用的建表SQL**。其`app_user_created`触发器在Auth用户插入的同一数据库事务中创建：

- `profiles`：同一个Auth UUID，语言默认ja。
- `credit_accounts`：available=0、reserved=0、status=active。

不按可编辑用户metadata发积分或授予管理员身份；重复登录不会重置余额或解除restricted。初始化失败会使注册事务回滚。此触发器方式与风险说明见[Supabase用户数据](https://supabase.com/docs/guides/auth/managing-user-data)。

在Supabase SQL Editor运行本库`scripts/inspect-auth.sql`（只读），预期：

```text
initialization_trigger_ready = true
profiles_rls = true
credit_accounts_rls = true
users_missing_profile = 0
users_missing_credit_account = 0
```

脚本不输出用户邮箱、metadata或密钥。若缺记录/触发器，不要直接改余额或反复重跑原迁移；先核对实际结构。当前登录回调会等待API确认账户存在；缺失账户返回可重试503，不再显示虚构的零余额。注册没有赠送积分，本轮也不准备可消费的生成额度。

## 6. 检查与真实验收

本地配置准备好后，从Web仓库运行：

```sh
node --env-file=apps/web/.env.local --import tsx scripts/check-auth-config.ts
npm run verify
```

配置脚本不访问网络、不打印任何key；检查公开/服务端项目一致、密钥类型、精确回调及生成关闭。`provider_settings_verified=false`、`smtp_verified=false`和`live_login_verified=false`明确表示没有自动验证后台设置。

真实验收按以下顺序进行，不需要上传图片、购买积分或调用模型：

1. 新的浏览器无痕窗口打开`https://picharu.vercel.app/ja/login?next=%2Fja%2Faccount`，点击Google并用测试邮箱授权。
2. 回到本站账户页，邮箱正确；积分页显示0可用/0预留。Supabase Auth Users、profiles和credit_accounts存在同一个UUID。
3. 退出，再用邮箱登录链接测试首次注册及后续登录。实际邮件应到达，点击后账户检查通过；重复使用链接应拒绝，不显示供应商原始错误。
4. 刷新/关闭重开页面后会话可恢复；退出后私有页面要求登录。再次运行只读检查，确认没有缺记录。
5. 返回验收信息时只提供“Google是否成功、邮件是否收到/登录成功、初始化检查五项结果”；不提供Secret、密码或完整登录链接。

本轮已完成的离线覆盖：Google code与邮箱code/token_hash的实际SDK行为、PKCE challenge/verifier、API服务端getUser及用户归属、真实SQL触发器/零余额/失败回滚、重复登录余额保留、缺账户503、过期/重复凭据、账户切换保护、配置检查脱敏。浏览器QA使用本地服务与拦截替身，不代替上面的真实验收。

本轮`npm run verify`通过123测试、90项数据库断言、类型/OpenAPI与构建。浏览器在127.0.0.1:3131检查桌面1440×1000及手机390×844，共4场景（Google到账户、邮箱到账户、准备失败后重试、过期链接返回登录），页面/交互/无空白/无框架遮罩及非预期控制台错误检查通过。Browser插件未提供，使用本机已有Playwright与Chromium，无新浏览器依赖；截图和临时脚本留系统临时目录。按React最佳实践用稳定依赖和可取消请求处理回调，独立的账户/资料读取并行。

真实公网只读检查：picharu.vercel.app的`/api/health`和`/ja/login`均200，health为ok/contract_version=1.0.0；这不证明新代码已部署、Google provider已启用或邮件可投递。本轮没有真实Google授权、发信或付费模型调用。

常见问题：`redirect_uri_mismatch`核对Google所填Supabase回调；`access_denied`核对测试用户/用户是否取消；邮件未授权/超限核对SMTP与项目团队邮箱；回调的账户准备503核对服务端Supabase配置、权限和初始化检查。不要为绕过邮件确认去关闭初始化或伪造成功。
