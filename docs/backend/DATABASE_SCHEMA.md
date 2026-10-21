# Web 数据库设计与迁移

接口版本：1.0.0。迁移：`supabase/migrations/202610190001_web_backend.sql`。本轮实现的是 Vercel 所需的持久化、事务和权限边界；Google Cloud Worker 的认领、调用模型和结果结算 RPC 尚未实现，须按 Worker 设计另行审阅后开发。

## 部署边界

迁移必须应用于真实 Supabase PostgreSQL，复用平台的 `auth.users`、`auth.uid()`、`anon`、`authenticated`、`service_role`。生产迁移不会创建伪 Auth。`auth.users` 的插入触发器创建 `profiles` 与余额为 0 的 `credit_accounts`，并为迁移前的用户补齐这两类记录。生产套餐初始为空；没有默认价格和注册赠送积分。

服务端持有 service role，仅在 `getUser(access_token)` 验证之后传递 `p_user_id`。任何浏览器可传字段都不作为账户归属依据。所有修改 RPC 从 PUBLIC/anon/authenticated 撤销 EXECUTE，只向 service_role 授权。默认 Supabase 的 service_role 具有 RLS bypass，服务端查询必须继续显式附 owner_id，不能把 service role 当作自动按用户隔离。

## 实体与字段对照

| 表 | 主键、归属与关键字段 | 约束/用途 |
|---|---|---|
| profiles | id → auth.users.id；locale、created_at | 用户基础设置，默认 ja |
| images | id、owner_id；status；declared_mime/declared_bytes；temp_key；storage_key/preview_key/sha256；mime_type/bytes/width/height；expires_at/deleted_at/cleanup_pending | uploading → ready/deleted；ready 必须有固定对象和完整媒体元数据；SHA256、20MiB 上传/32MiB 输出/24M 像素约束 |
| credit_accounts | owner_id；available、reserved、status、updated_at | 非负 bigint 余额；active/restricted |
| credit_ledger | id、owner_id；business_key、kind、available_delta/reserved_delta、reference_id | 唯一业务键避免同一 reserve/release/purchase/revoke 重复记账；没有客户端写权限 |
| edit_jobs | id、owner_id、tool_id；idempotency_key/request_hash；inputs、snapshot；status/stage；credits_reserved；parent_job_id/result_image_id；error_code、时间戳 | owner+幂等键唯一；请求 hash 为 SHA256；snapshot/inputs/费用/归属/幂等字段不可修改；终态不可更新 |
| edit_jobs 执行预留字段 | lease_token/lease_expires_at、attempt_count、provider_request_id/provider_job_id、checkpoint | 仅预留后续 Worker 状态字段，当前 Web 不认领或生成 |
| job_inputs | job_id、image_id、position、role | 有序多输入关系，position 0..3，任务内 image 不重复；主外键用于删除保护 |
| credit_packages | id UUID；package_id 可选文本标签；credits、amount_minor、currency、active | HTTP 中的 package_id 实际指本表 UUID `id`；JPY；初始不写入套餐 |
| orders | id、owner_id、package_id UUID、idempotency_key；credits/amount_minor/currency；stripe_session_id/payment_intent_id/checkout_url/metadata；status、paid_at；refunded_minor/revoked_credits/reversal_shortfall/disputed | 下单冻结套餐数量与金额；两类 Stripe ID 各自唯一；metadata 固定 order_id/user_id 供 Web 验证；累计退款和权益撤回只增不减 |
| stripe_events | event_id、kind、order_id、payload、created_at | 真实 Stripe 事件幂等；重复 ID 的事件内容不匹配会拒绝，不能用重复 ID 跳过校验 |
| rate_buckets | key、window_start、count | PG UPSERT 的共享固定窗口频控；多 Vercel 实例共用 |

`inputs` 与 `snapshot` 都为 JSONB；`job_inputs` 则提供关联、顺序和运行中资产查询。历史直接读取 jobs/images，不复制一份历史表。工具 ID 是 text，数据库不把当前 20 项写成长期数量限制；工具、参数和能力白名单由版本化服务端契约检验。任务的 tool_id 从服务端快照取得。

所有 UUID 默认生成使用 PostgreSQL 自带 `gen_random_uuid()`，不需要引入扩展。时间戳均 timestamptz；排序索引为 `(owner_id,created_at DESC,id DESC)`。

## RPC 与实际返回值

精确签名以 [接口第 9 节](../interfaces/INTERFACE_SPEC_V1.md) 和 SQL 为准，均返回 JSONB，rate limit 除外：

| RPC | 返回 | 事务职责 |
|---|---|---|
| app_consume_rate_limit | boolean | 单行 UPSERT 计数；超限也记数，窗口结束重置 |
| app_create_upload | images 完整行 | 校验声明范围与有效期，插入上传资产记录 |
| app_complete_upload | images 完整行 | 锁定 owned 资产；仅第一次写入规范键/hash/媒体参数；重复完成返回第一份 ready 记录 |
| app_delete_image | images 完整行，包含所有待清理键 | 锁定资产；运行中输入拒绝；先持久 tombstone 和 cleanup_pending，再由 Web 删除 R2 对象 |
| app_create_job | `{job_id,status,credits_reserved,replayed}` | 幂等检查、锁定并验证全部输入、parent 关系、余额预留、job/inputs/ledger 同一事务 |
| app_cancel_job | edit_jobs 完整行 | 只取消 queued，余额返还及唯一 release ledger 同事务；重复 cancelled 返回原任务 |
| app_create_order | orders 完整行 | owner+key 幂等；冻结活跃套餐快照；同 key 换套餐冲突 |
| app_attach_checkout | orders 完整行 | 锁定订单绑定 session/url；相同 session 重放复用；另一 session 拒绝 |
| app_apply_paid_checkout | `{applied:boolean}` | 校验 session/金额/币种/PI，结合当前 Charge 已退款/拒付事实，一次净额更新余额；事件、订单、purchase/revoke ledger 原子提交 |
| app_apply_payment_reversal | `{applied,revoked_credits,shortfall,restricted}` | 事件去重、累计退款撤回权益、不足冻结和对账缺口记录同事务 |

行 JSON 仅供服务端读取。HTTP 必须映射到公开契约，不能直接把完整 images/edit_jobs/orders RPC 行传给浏览器。`expires_at` 是资产保留期限，**不**是 5 分钟 PUT URL 的有效期；PUT 的有效期在 R2 签名层单独执行。删除完成后 `markCleanup` 只更新 deleted 资产的 cleanup_pending；对象删除失败仍保持 tombstone，后续清理按 Worker 设计实现。

## 锁、幂等与退款

创建任务/取消/创建订单使用按用户的 `pg_advisory_xact_lock(hashtextextended(user_id,0))`，任务还按 UUID 排序锁定全部图片，最后锁定账户行。图片删除也锁同一图片行，避免“校验后删除、删除后仍入队”。账户 CHECK 禁止负值；幂等唯一索引与账本唯一业务键是第二层保护。校验失败抛稳定 message code，整个函数回滚，不留下半个任务或孤立扣费。相同规范请求 hash 的重放不重新验证当前模型价格或重新预留，直接读取第一次的不可变快照。

支付函数按 order 行锁串行化同一订单事件，账户 UPDATE/SELECT FOR UPDATE 串行化与其他余额变动。首次 paid 的参数追加 `p_amount_refunded bigint DEFAULT 0` 与 `p_disputed boolean DEFAULT false`，前六参数保持兼容。生产调用必须先从 Stripe PaymentIntent/latest Charge 验证这些当前事实，不能依赖兼容默认值将未知事实假设为零。一次账户 UPDATE 写入 purchase 与已知 reversal 的净额，purchase/revoke ledger 与订单事实在同一事务提交，全退款/拒付先到不会先产生可消费积分。同订单不同 paid 事件仍记录事件；不会第二次发积分，但会合并更大的累计退款或新的拒付事实。相同事件再次读取到更新的 Charge 时，身份和金额仍需匹配，该已处理事件不再产生任何余额变更。退款/拒付后的后到 paid 不会把状态改回 paid。已退款比例对应的权益为 `ceil(credits * cumulative_refund / amount_minor)`，只处理相对旧累计值的增量。available 不足时最多撤回 available，不取负数、不取用正在运行任务的 reserved；余量记录 reversal_shortfall，并保持账户 restricted，等待人工对账。账户不会因任务取消或再次收到 paid 自动解除限制。

拒付事件撤回整单权益、冻结账户并标记 disputed；权益撤回目标为已撤回数量、累计退款比例权益、拒付全额权益三者最大值，后到的较低退款/未拒付快照不能恢复余额。refunded_minor 仍只记录真实累计退款金额，不把拒付伪造成退款。当前接口不实现人工解除限制、债务抵扣和发起退款；运营流程须另行设计。若 reversal 先于 paid 到达，尚无 payment_intent 映射时抛 PAYMENT_MISMATCH，Webhook 必须把这一合法乱序视为可重试服务故障（5xx）或先验证并补齐 paid 事实，再重试 reversal。不能对未知 PI 直接 200 吞掉。paid 路径已经通过当前 Charge 事实原子反映退款/拒付，因此在等待早到 reversal 重试期间也没有可消费积分窗口。

## 直接数据库访问权限

所有表启用 RLS。authenticated 只读自己的 profile、credit account、ledger、orders，以及剔除对象键/hash 的 images 列；匿名只能读 active 套餐。没有客户端写策略，也没有客户端任务 snapshot 读取授权。edit_jobs/job_inputs、stripe_events、rate_buckets 仅服务端可访问。任务历史由 BFF 映射公开 JobView；完整快照只向未来受控 Worker 提供。

service_role 仍有数据库管理权限，不是隔离不可信代码的沙箱。任何需要对外暴露的新函数都必须复核 grants/search_path 与 owner 校验；不得依赖前端过滤。

## 可重复验证与未验证范围

`node --import tsx scripts/test-db.ts` 在临时 PGlite PostgreSQL 实例执行真正的完整迁移和 SQL RPC；测试专门创建 Auth fixture 和三个角色，再 `SET ROLE` 验证 RLS 与 EXECUTE 权限。此 fixture 只存在于测试脚本。测试会创建模拟资金与套餐，但生产迁移不赠送积分或写入套餐。

当前已验证：首次 paid 已知全退款/部分退款/拒付的净额入账；相同与不同事件后到累计 reversal 不重复撤回；参数空值拒绝；初始零余额；owner 与 ready 状态；完成固定版本；预留失败回滚；任务重放/冲突/取消 exact-once；输入删除保护；snapshot 不可变/终态保护；频控窗口；套餐冻结；支付事件/订单双重幂等；累计和乱序退款；不足撤回的非负余额及冻结；后到 paid；对象清理 tombstone；实际 RLS/函数权限。

PGlite 是单实例测试，不能独自证明多连接竞态。另有 `scripts/test-concurrency.ts` 在本机 PostgreSQL 17 中使用 20 条独立连接进行实际并发验证，覆盖同 key 争抢、不同 key 抢同一余额、并发取消、重复付费与任务创建/图片删除竞态。上线前仍需在 staging Supabase 上应用迁移，检验真实 Auth provider、PostgREST schema cache、跨网络连接、真实 Stripe/R2 与支付/退款竞态；本机事务验证不替代云端集成。Worker RPC 本轮未实现，任务不会由该迁移自动完成或消费预留。

最近一次实际执行：本地 PGlite 完整迁移与 90 项 SQL 断言通过。原生 PostgreSQL 17 并发脚本另通过 103 项断言：20 个同幂等键同时创建只产生 1 个 job/1 笔 reserve；20 个不同键争抢 10 积分仅允许 2 个各花 5 积分的任务；20 次并发 cancel 只释放一次；20 个不同 paid 事件同订单只充值一次；30 次 delete/create 竞态均无 deleted 输入的运行任务，其中创建先赢/删除先赢各 15 次。新增已知 Charge 全退款/部分退款/拒付各 20 个 paid 并发事件，并并发执行后续累计 reversal；均只发放一次净额权益，拒付保持 restricted，全部退款后无法预留生成积分。脚本通过 pg_stat_activity 验证请求实际同时等待锁，并核对各连接的独立 backend PID。

并发验证命令：

```sh
PGHOST=/private/tmp/picjp-pg-review-01a15486/socket PGPORT=55439 PGUSER=kanzhiwu node --import tsx scripts/test-concurrency.ts
```

必须先单独启动受控临时 PostgreSQL。脚本只允许 OS 临时目录下 `picjp-.../socket` Unix socket（macOS 可为 `/private/tmp`，Linux 可为 `/tmp`），解析真实路径后校验父目录，拒绝 TCP 或任意数据库；要求显式端口和用户名，不读 `.env` 或复用 `PGDATABASE`。每轮创建随机独立 `picjp_concurrency_...` 数据库，并在 finally 清理，仅保留外部管理的测试 PG 服务。GitHub CI 使用 PostgreSQL 17 临时容器与同一脚本，配置见 [Git 与流水线规范](../../../../docs/maintenance/GIT_AND_CI.md)。此前本机验证最初受沙箱 shmget 限制，主 agent 获得自动审批后启动专用测试集群，才完成了上述实际验证；没有连接真实 Supabase。


## 双看板增量（2026-10-21）

210100/210200/210300/210400四份迁移在基础/Worker两份之后按序安装。控制台角色/审计、业务和上传的环境来源冻结、下载动作/事件、个人读模型、管理员固定报告/真实退款/发布证据及粗粒设备均在本分支实现；精确对象与权限以SQL为准。[管理员实现](ADMIN_ANALYTICS.md)、[基础](CONSOLE_FOUNDATION.md)和[个人读模型](PERSONAL_CONSOLE.md)说明对应事务。

`images.analytics_environment/analytics_internal`在上传首次完成时冻结，生成资产继承任务；旧图片未知，不回填当前账户标签。`console_version_releases`保存受控、分环境、真实时间与范围的发布事实，变更追加审计；不是模型发布执行器。四份210*迁移尚未执行云迁移，本分支修订属于首次安装源码；已安装旧草案的环境必须追加升级迁移，不能把重跑整份历史文件当升级。
