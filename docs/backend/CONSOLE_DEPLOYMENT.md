# 双看板：Supabase / Vercel 部署步骤

日期：2026-10-21。本次合并三阶段代码到Web主分支；云数据库、生产配置和真实支付并未由此次Git操作修改。原前端工作树的未提交品牌/字体/交互改动仍保留在`feat/picmoko-ui`，未当作此次发布内容；已在main的认证、邮件模板/资产和其他提交保留。SEO草稿分支及Worker独立仓库未合并。

## 1. 顺序与当前状态

理想顺序：核对目标数据库 → 安装缺失迁移 → 配置环境（采集仍关）与管理员 → Vercel构建/部署 → 权限/页面实测 → 显式启用采集。Git推送不会安装Supabase迁移；若Vercel已自动部署而迁移未安装，新看板API可能503，应先完成缺失迁移再验收，不用重跑模型任务。

用户此前已确认基础Web和Worker两迁移安装成功。这个反馈不等于四份新看板迁移已经安装；先在同一Supabase项目SQL Editor执行本库[scripts/inspect-console.sql](../../scripts/inspect-console.sql)。此脚本只有系统目录查询，不读照片/余额/邮箱，也不写数据。空库或缺对象安全返回`INCOMPLETE_OR_UNSAFE`；全部安装后预期`EXPECTED_STRUCTURE_PRESENT`、13表/14个精确RPC签名、issues=[]、base_present=true、worker_present=true。它只验证结构/RLS/有效授权，不证明函数正文或实际云端链路已验收。

## 2. Supabase：只安装尚未应用的迁移

| 顺序 | 文件 | 本次操作 |
|---|---|---|
| 前置1 | `202610190001_web_backend.sql` | 此前已确认安装，不重跑 |
| 前置2 | `202610200400_worker.sql` | 此前已确认安装，不重跑；这是Web共享SQL，不部署Worker |
| 新增1 | `202610210100_console_foundation.sql` | 角色/审计、环境冻结、浏览器事件、显式下载动作 |
| 新增2 | `202610210200_personal_console.sql` | 本人总览/流水/任务/作品读模型 |
| 新增3 | `202610210300_admin_analytics.sql` | 固定快照、管理员读取、用户精确定位、退款与版本发布事实 |
| 新增4 | `202610210400_console_telemetry.sql` | 粗粒度设备冻结及创建任务包装RPC |

在Supabase **SQL Editor**新建查询，按上表顺序逐份复制对应`supabase/migrations/`文件的完整内容执行；每份都有自己的BEGIN/COMMIT，前一份成功再下一份。不要同时运行同一文件、重复创建表或忽略报错继续；若盘点显示部分对象，先核对已执行的具体版本，而不是删表重装。完成后重跑盘点；再执行[scripts/inspect-auth.sql](../../scripts/inspect-auth.sql)确认认证初始化五项检查仍正常。

此前手动SQL执行不自动维护CLI迁移历史；不要直接`supabase db push`把历史建表重放。以后采用CLI时，先核对实际结构和`supabase migration list`，只对确实已经应用且正文一致的版本修复迁移记录。不要将SEO云端已安装状态误当成本次控制台迁移已安装。

## 3. Supabase：环境、管理员与开关

当前Stripe仍是测试模式；在这个联调数据库先设置`test`，即使Vercel页面属于Production环境，也不能因此把测试业务事实标为live。正式收费环境应使用对应的独立正式数据/密钥配置。新业务记录会冻结环境，历史unclassified不回填。

先配置环境并保持采集关闭：

```sql
update public.console_settings
set environment='test', collection_enabled=false where id;
select environment, collection_enabled from public.console_settings where id;
select enabled, coverage_start from public.console_refund_settings where id;
```

Auth → Users中核实自己的用户UUID，替换下面占位符后执行授权。`administrator`含分析/财务读取权限，不提供网页调账/退款操作。角色只能由受控数据库操作授予，不能放进用户可编辑metadata。

```sql
insert into public.console_roles(user_id,role,reason)
select id,'administrator','项目负责人授权看板读取'
from auth.users where id='<YOUR_USER_UUID>'::uuid
on conflict(user_id,role) do update
set reason=excluded.reason, revoked_at=null, expires_at=null;
```

应影响1行；0行表示UUID未匹配，不应继续假设已获权限。普通运营可改用analyst（无财务明细）。本次没有预置管理员、测试额度、余额或付费任务。

页面和权限验证通过、确定开始采集后，才执行：

```sql
update public.console_settings set collection_enabled=true where id;
```

此时会记录真实覆盖起点；停采可改false，缺口不会抹去。保存率24h、反馈7天、留存D7/W1、复购30天应等待各自窗口，不用0代替未成熟。下载链接签发仅是保存行为代理，不证明系统相册写入成功。

## 4. Vercel：使用现有项目重新部署

无需新建第二个“后端项目”。同一Next.js部署包含网页和Vercel API。

| 设置 | 应确认 |
|---|---|
| Git Repository / Production Branch | `MemoBloom/picharu` / `main`；本次push通常自动触发部署，核对部署对应的实际commit |
| Framework / Root Directory | Next.js / `apps/web`；允许构建读取Root Directory外的workspace packages |
| Install / Build | 使用`apps/web/vercel.json`：安装命令回仓库根执行`npm ci --include=dev --workspaces --include-workspace-root`，构建`npm run build`；避免后台旧override删掉devDependencies |
| Domain / APP_ORIGIN | 主域名`https://picmoko.com`，www继续308到主域名；APP_ORIGIN同主域名 |
| Browser Auth | NEXT_PUBLIC_SUPABASE_URL与NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（或兼容ANON_KEY），和服务端指向同一项目 |
| Server Auth | SUPABASE_URL、SUPABASE_SECRET_KEY（或兼容SERVICE_ROLE_KEY），绝不加NEXT_PUBLIC前缀 |
| 原有依赖 | R2_*、STRIPE_SECRET_KEY、STRIPE_WEBHOOK_SECRET、IMAGE_RETENTION_DAYS保持当前有效值；测试密钥/Webhook同Stripe账号与模式 |
| 生成 | GENERATION_ENABLED=false；不为看板上线开启模型或修改once guard |

本次没有新增必填Vercel环境变量；管理员角色和采集配置在Supabase表中，不用增加ADMIN_EMAIL/ADMIN_TOKEN。保留当前有效模型配置，不因本文清空它。Vercel Production与Preview变量分别核对，Preview不要共用正式写入数据。修改环境变量后必须**Redeploy**，NEXT_PUBLIC变量在构建时写入；保存配置不会改变旧部署。

检查部署Build Logs：依赖/TypeScript/Next构建成功且Ready，核对该部署commit和域名，再打开下节路径。Supabase Auth的Site URL/精确`https://picmoko.com/auth/callback`以及R2 CORS已配置时保留，不重置Google/SMTP/邮件模板。

## 5. Stripe退款补充（与PAY-001分开）

仍使用现有`https://picmoko.com/api/stripe/webhook`，保留原四事件：checkout.session.completed、checkout.session.async_payment_succeeded、charge.refunded、charge.dispute.created。为未结退款状态补齐refund.created、refund.updated、refund.failed、charge.refund.updated。使用snapshot事件，测试模式及同一账户/对应endpoint的签名密钥；若已有endpoint只改订阅事件，通常不需要换whsec，若新建endpoint需在Vercel同步它自己的secret后重新部署。

只有确认迁移、新Webhook代码/订阅与真实退款回传正常后，才在匹配环境执行：

```sql
update public.console_refund_settings set enabled=true where id;
```

它声明退款覆盖起点，不是触发退款或收费；退款事实采集与浏览器开关独立。尚未回填历史时过去退款仍标不完整。当前收款代码仍是JPY，不因域名或地区配置自动变成HKD；本次未改币种。PAY-001测试Checkout/Webhook/积分/退款仍是待办，没有进行真实支付。

## 6. 部署后验收

1. `/api/health`返回200；`/api/tools`18个发现入口；历史Tool ID仍可读取，两个停用公开详情404。
2. 邮箱/Google使用既有本人会话登录，`/ja/account`看到本人总览、作品、流水；无数据与错误分别提示，退出后私有数据不可读。
3. 无管理员角色的普通用户`/api/admin/session`应403；授权用户打开`/admin`，8页面固定report/as_of，筛选、用户ID/邮箱定位、分页/钻取/CSV同口径。analyst不能读取财务，撤权后旧快照也应拒绝。
4. 确认采集关闭时显示未采集；人工启用后用真实页面操作检验曝光/选择/查看/显式下载，不为验收新发收费模型任务。缺图片/旧任务环境不符时不要伪造成功。
5. 原有认证回调、邮件图片/字体、上传与结果访问仍正常。保留期、Worker新版本、Stripe PAY-001、自然指标成熟及人工模型evaluation分别验收。

上述云验收由实际结果证明；GitHub CI绿色、Vercel Ready或SQL结构完整，任何一个都不能单独表示完整链路已通过。

依据：[Vercel Git部署](https://vercel.com/docs/git)、[环境变量](https://vercel.com/docs/environment-variables)、[Root Directory与workspace](https://vercel.com/docs/monorepos/monorepo-faq)、[Supabase迁移与手动SQL历史](https://supabase.com/docs/guides/deployment/database-migrations)。
