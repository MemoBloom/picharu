> 2026-10-19 implementation update: [Interface v1](../../docs/interfaces/INTERFACE_SPEC_V1.md), [Vercel backend](../../docs/backend/VERCEL_BACKEND.md), [Worker design only](../../docs/architecture/CLOUD_RUN_WORKER_DESIGN.md), [JEV design only](../../docs/architecture/JEV_LAMBDA_DESIGN.md). These documents supersede conflicting earlier examples. No cloud deployment; generation defaults to disabled.

> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：按 20 工具的不同输入、费用、失败和版本情况审查归属与原子积分；示例单图字段需在多图契约冻结时对齐。

# 用户认证、订单、积分与数据库

> 文档基线：2026-10-19。面向日本普通消费者；香港公司经营；首期使用商用图像 API；以下“目标”不是已通过实测的指标。

## 身份

使用 Supabase Auth：Google OAuth、邮箱密码注册（验证邮件/密码重置）、可选有限游客体验。`auth.users.id` 是身份主键；`profiles` 记录业务资料。多个 OAuth 身份需要通过 Supabase 安全身份关联，绝不能因邮箱字符串相同自动合并账户。游客免费试用必须限额和防刷；游客作品迁移要校验归属。

## 香港经营与 Stripe

香港注册公司、香港居民董事/股东，尚无实际运营流水、尚未开立企业账户。业务系统先用 Stripe Test Mode；正式开通 Stripe Hong Kong、JPY Checkout、结算银行与经营审核是**独立外部阻塞项**。建议同时评估香港传统银行和合规支付账户。日本消费者交易披露、个人信息/跨境传输和可能的日本消费税义务需法律税务专业核实。Stripe 是支付处理商，**不是自动代替商户承担所有税务责任**。

## 核心 Schema（MVP）

| 表 | 核心字段/约束 |
|---|---|
| `profiles` | `user_id PK FK auth.users`, `locale`, `status` |
| `images` | `id PK`, `owner_id`, `storage_key`, `parent_image_id`, `status`, `mime_type` |
| `credit_accounts` | `user_id PK`, `available INT CHECK >=0`, `reserved INT CHECK >=0` |
| `credit_ledger` | `id`, `user_id`, `available_delta`, `reserved_delta`, `reason`, `business_key UNIQUE` |
| `credit_packages` | `id`, `credits`, `currency='JPY'`, `price_minor`, `stripe_price_id`, `active` |
| `orders` | `id`, `user_id`, `package_id`, `amount_minor`, `currency`, `stripe_session_id UNIQUE`, `status` |
| `stripe_events` | `event_id PK`, `processed_at`, `payload_ref`（避免保留不必要敏感数据） |
| `edit_jobs` | `id`, `user_id`, `input_image_id`, `final_prompt`, `prompt_id`, `prompt_version`, `provider_job_id`, `status`, `reserved_credits`, `idempotency_key`, `lease_expires_at`, `result_image_id` |
| `edit_versions` | `parent_image_id`, `result_image_id`, `job_id` |

## 充值

`POST /api/checkout` 仅收 `package_id`；Vercel 使用服务器端套餐价格创建 Pending 订单、向 Stripe 创建 Checkout Session。支付成功需 **Stripe 签名 Webhook** + 确认 session 真正 `paid` + 核验币种金额套餐 + **同一 PG 事务**记支付事件、订单 Paid、积分发放和流水；重复事件不能重复发放。异步支付事件、失败、退款、拒付须单独处理。支付成功回跳不能触发积分发放。

## 消费

`reserve_credits(user_id, job_id, amount)`：对余额做原子更新，创建任务/流水；`commit_credits(job_id)`：结果成功写入 R2 且数据库归属保存后，预留转消费；`release_credits(job_id)`：生成终止失败时将预留退回可用。所有操作依靠唯一业务键保证幂等；Worker 不直接无条件 `UPDATE balance`。

```mermaid
flowchart LR
 A[available] -->|reserve| B[reserved]
 B -->|commit| C[consumed]
 B -->|release| A
```

## 重要异常

- 同一用户同时生成多张、重复点击、Worker 重启、支付重复 Webhook。
- 上游模型扣费但结果丢失：用户积分按交付规则释放；平台记录损失。
- 退款与已消费权益：按公开政策进行权益冲正/人工处理；禁止粗暴产生无解释负余额。
- 登录、图片和订单的 Row Level Security；只有服务端/受控 PG 函数可增减积分。
- 用户账户删除处理原图、结果、会话、任务和适用的账务保留义务。

## MVP 不做

复杂订阅等级、积分过期批次、促销券/分销返佣、企业团队账户和完整财务中台；可在 Schema 中保留演进空间。日元积分包的数量和单价必须根据真实 API/手续费测试后定价。
