# 真实登录发布与后台配置

更新：2026-10-21。当前主站https://picmoko.com，原Vercel别名https://picharu.vercel.app保留；Supabase项目oltbspdxgrnrqhkupuco。认证经PR #3、品牌邮件经PR #4/#5、网站品牌UI经PR #7合入main并发布。本文配置值是核对要求，不代表本次读取或修改了云端私有配置。

## 已核实与边界

- 用户已确认Resend DNS与Supabase SMTP测试通过，并明确反馈真实邮件网页登录正常；实际收到的邮件Logo正常。不再将SMTP/收信列为未配置。
- PR #7后picmoko.com与原Vercel别名的首页/登录及云朵/A1/Google图标均HTTP200；CUA已核查主站登录页实际品牌显示与无相关控制台错误。网页公开显示不代表Google最终授权成功。
- 真实退出/再次登录、Google最终授权、账户初始化五项只读结果尚未单独回传；不从邮件登录成功推断它们全部通过。用户不知道日语时可按文末中文对照退出。
- Supabase后台Preview破图与真实收件分开：用户已确认实际邮件Logo正常；先前后台预览的CSP限制已有检查记录。保留生产公开HTTPS资源，不改成localhost或内嵌私有地址。
- 本次只整理已有工作，不读取云端Key/SMTP密码、不发信或代用户登录。最新完整本地结果见[残留审计](../verification/RESIDUAL_WORK_AUDIT_2026-10-21.md)；历史认证候选116测试/90 SQL不是当前全库计数。

## 1. Vercel生产环境

在项目Settings的环境变量设置Production：

| 变量 | 来源/值 |
|---|---|
| APP_ORIGIN | 主站要求https://picmoko.com；核对已有配置，不擅自覆盖 |
| NEXT_PUBLIC_SUPABASE_URL | https://oltbspdxgrnrqhkupuco.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 同项目publishable key；兼容NEXT_PUBLIC_SUPABASE_ANON_KEY |
| SUPABASE_URL | 与浏览器项目URL完全相同 |
| SUPABASE_SECRET_KEY | 同项目服务端secret key；兼容SUPABASE_SERVICE_ROLE_KEY，只放服务端 |
| GENERATION_ENABLED | false |
| MODEL_PROFILES_JSON | [] |

已有同名变量先检查，不重复覆盖有效配置。修改NEXT_PUBLIC变量必须重新构建；保存变量不会更新旧部署。Google Client Secret和SMTP密码只留Supabase，不放Web公开变量。支持token_hash的认证版本已发布，邮件完整HTML以本库supabase/templates为准。

## 2. Supabase认证

打开项目Authentication：

1. Sign In / Providers：Allow new users to sign up开启、Confirm email开启、Email开启。Google已启用时保留现有有效Client，不重建或旋转Secret。
2. URL Configuration：主站Site URL应为https://picmoko.com，Redirect URLs包含精确https://picmoko.com/auth/callback；原Vercel别名或www若仍用于登录，保留各自有效精确回调。应用新流程不把next放进OAuth回调地址，目标页暂存当前标签页。
3. Google Auth Platform的对应Web客户端：Authorized JavaScript origins包含实际登录主站https://picmoko.com，仍使用别名时保留其origin；Authorized redirect URI为https://oltbspdxgrnrqhkupuco.supabase.co/auth/v1/callback。不要把这两个后台的回调填反。
4. 测试状态下，在Google Audience中加入实际测试账号；只使用openid/email/profile登录权限。

官方依据：[Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google)、[回调允许列表](https://supabase.com/docs/guides/auth/redirect-urls)。

## 3. 邮件：使用已确认的完整模板

Resend负责投递，Supabase生成认证邮件；SMTP已经用户测试通过。保留已有有效host/port/username/password及经验证发信域名；Sender name使用picmoko。凭据仅在服务后台保存，不进入聊天、Git或公开变量。

两份完整HTML、Subject及逐步保存操作见[认证邮件权威源码](../../supabase/templates/README.md)：Confirm signup用于首次注册确认，Magic Link用于后续登录。打开Supabase Authentication → Emails → Templates，选择相应类型，分别粘贴Subject和完整HTML，再Save。Git合并/Vercel发布不会自动保存Supabase托管模板。Magic Link曾观察到保存成功；Confirm signup是否保存没有独立确认，不冒充两份都已后台应用。

保持唯一认证链接：

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">ログインする</a>
```

应用固定RedirectTo为/auth/callback，未附next，因此可直接拼接?token_hash；Google仍用PKCE code。旧邮件code方式兼容，但需发起登录的同一浏览器保留verifier。跨浏览器token_hash无原目标记录时回到/ja/edit。文案调整不改变已实测的href/变量，也不写死未经核对的有效分钟数。

邮件复用云朵、A1字标及Zen Kaku Gothic New正文/按钮、Zen Maru Gothic重点标题；图片和字体沿用已发布的HTTPS资源。邮件客户端不支持网络字体时回退系统日文字体。不要因后台Preview限制覆盖正常的生产资源；实际收件是显示验收依据。

依据：[邮件模板](https://supabase.com/docs/guides/auth/auth-email-templates)。

## 4. 账户初始化，只读检查

在Supabase SQL Editor运行scripts/inspect-auth.sql，只输出结构及数量：initialization_trigger_ready=true、profiles_rls=true、credit_accounts_rls=true、users_missing_profile=0、users_missing_credit_account=0。不要重新执行已应用的建表迁移。

基础migration的app_user_created触发器会创建profiles与0可用/0预留的credit_accounts，不赠送额度。初始化失败会回滚注册；重复登录不重置余额或restricted。API/me必须确认账户已存在，才能完成回调。新secret key只放apikey，显式用户JWT仍用于验证身份。

## 5. 真实验收

1. 打开主站https://picmoko.com/ja/login?next=%2Fja%2Faccount，用持有人的Google测试账号完成登录；验证码或账号选择由本人完成。
2. 回到账户页后确认个人资料；积分页0可用/0预留；退出再登录、刷新恢复均正常。
3. 在允许收信的测试邮箱发起邮件链接：首次注册及再次登录各测一次，实际收到邮件并完成回调。
4. 同一链接重复使用/过期应失败，返回登录可重试；另一浏览器邮件回调默认进入编辑页。
5. 再运行只读初始化检查；只汇报成功/失败和五项结果，不提交完整邮件链接、code、token_hash、JWT或任何Secret。

正式条款/隐私文案仍需发布前确认。生成保持关闭，认证验收不上传照片、不购买积分、不调用模型。

## 6. 已实现的入口、中文对照与离线覆盖

- 顶部珊瑚按钮「ログイン・新規登録」=登录/注册；手机顶部常驻，非编辑页底栏也有账户入口。Google按钮使用官方彩色G；首次Google或邮箱认证自动建号，不另设密码注册。
- 「マイページ」=我的账户；顶部同名按钮打开账户/编辑历史/「ログアウト」（退出登录）菜单。手机底栏同名入口进入账户页；账户页所有标签上方直接提供退出按钮，不必寻找「プロフィール」（个人资料）。退出后返回首页，私有页要求重新登录。
- 发送邮件后展示目标地址、注册确认/垃圾邮件/修改地址提示，60秒内防重复发送；安全next保留原目标并拒绝站外跳转。
- 已有真实SDK与基础SQL隔离测试覆盖首次注册/重复登录余额保留、账户初始化失败回滚、过期/重复凭据、503仅重试账户准备及账户切换保护。
- 原UI分支历史浏览器记录：320/360/390/768/1440px×4页共20组布局、9个隔离认证场景通过；含首页返回/刷新、手机邮箱注册、退出拦截、初始化重试、过期/取消/限流、跨浏览器默认编辑页和外部next拒绝。该阶段123测试/90 SQL为历史结果，非本次重跑；视口模拟不替代真机/Safari/屏幕阅读器验收。

已完成的真实邮件登录无需为本次文档整理重复发信；其余真实验收按第5节分别补证。生成保持关闭。

## 2026-10-21 认证回调生命周期修复

从SEO集成9314960独立提取统计Provider的生命周期修复：Google/邮箱建立会话时保持登录/回调页实例，避免消费一次性凭据后因身份变化重新挂载。账户/历史/编辑/管理员等业务子树仍按owner变化重置；每个owner的统计配置与取消scope独立，旧配置迟到不启用新账号，切换/退出取消在途事件和排队选择，退避等待被取消后不再进入下一次API重试。未引入SEO页面/接口或修改认证核心、服务端归属与数据库。

新增tests/auth-lifecycle.test.ts，以真实React挂载、AuthCallbackPage及凭据完成逻辑配合隔离端口验证10项行为；旧main的Google/邮箱/准备重试3项失败及取消退避后的额外API尝试均复现，修复后10/10通过。jsdom 26.1.0只作为兼容现有Node基线的开发依赖，运行依赖版本保持。完整verify通过327测试/26文件、90 SQL、契约/类型及生产构建。

CUA/IAB在独立临时构建127.0.0.1:3195验证合成Google→账户、A草稿→B切换清空、B草稿→退出清空、邮箱→账户；Google/邮箱凭据各交换一次，真实AuthProvider/回调/客户端参与，无控制台error/warn或框架覆盖。测试SDK、同源BFF及账户观测页只存在于/private/tmp独立项目，不进入Git或正式构建；未发送真实邮件、登录真实provider、访问云DB或调用模型。渲染验证为桌面，未重新验收真机/移动布局。


## 2026-10-21 退出入口与失败恢复

账户页的退出入口从仅个人资料标签移到页面标题区，覆盖全部五个标签，账户接口加载失败也能退出。顶部账户按钮使用可键盘操作的披露菜单，提供账户、编辑历史与退出；Escape返回触发按钮，外部点击/焦点移出关闭，失败提示与重试保持可见。手机编辑页将历史入口收进同一菜单，避免窄屏顶部挤压；非编辑页底栏保留直接进入账户的入口。字体、A1字标与配色保留。

共用LogoutButton展示处理状态、阻止重复点击，成功后整页替换到/ja/以清除私有路由缓存。AuthProvider按owner合并并发退出请求，仅成功后清理该owner的本地草稿/结账状态；失败保留会话与草稿，重试可恢复。若SDK已采用另一账户，不因旧退出Promise迟到清除新身份；新账户仍可独立发起退出。既有账户切换、私有子树重置和统计取消边界保留。

新增17项回归（tests/logout-navigation.test.ts、tests/auth-signout.test.ts），涵盖五标签/接口故障时的退出可见性、菜单键盘/外部关闭/身份变化、重复请求、失败重试与草稿保留、成功清理和新账户隔离；连同原10项生命周期回归27项通过。完整verify结果见本次PR。CUA浏览器在独立临时项目使用真实页面、AuthProvider与客户端配合合成SDK/BFF，桌面菜单失败→重试→首页→私有页登录拦截、320px底栏→账户直接退出、390px编辑页菜单/账户切换清理均通过。移动布局使用同源iframe视口，未声称真机/触控或真实Supabase重新验收；临时替身未进入Git。未发送邮件、上传照片或调用模型。
