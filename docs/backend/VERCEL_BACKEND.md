# Vercel Web 后端交付说明

2026-10-19。当前交付是 API 后端与数据库迁移，可本地构建和验证。没有向 Vercel、Supabase、R2、Stripe 或 GPU 主机发布，没有执行真实付款或模型调用。Worker 与 JEV 服务保持设计状态，生成默认关闭。

## 1. 已实现的范围

| 模块 | 位置 | 行为 |
|---|---|---|
| HTTP 路由 | apps/web/src/app/api/[...path]/route.ts、server/router.ts | 统一实现协议中的 18 个公开操作；Node runtime，60s 上限 |
| 身份与数据 | server/supabase.ts、supabase/migrations | Supabase Auth getUser 验证；service_role 受控事务；私有查询附 owner；RLS |
| 工具与模板 | packages/tool-config、packages/prompts | 20 工具参数白名单、日语元数据、初期执行 Prompt、推荐资料、能力与价格版本 |
| 上传与图片 | server/storage.ts、server/media.ts | 私有 R2 直传；签名绑定类型/声明字节；真实 Sharp 解码、方向纠正、移除 EXIF、固定 PNG 与 JPEG 分析图 |
| 任务与积分 | server/router.ts、PG RPC | 多图/角色、不可变快照、幂等、余额预留、查询、继续编辑关系、queued 取消和释放 |
| 推荐代理 | server/recommend.ts | 固定私有缩图、精确字节 HMAC、2.5s 模型 RPC deadline、响应/候选校验；显式 fallback |
| 支付 | server/payments.ts、PG RPC | 服务端套餐价格、Stripe Checkout 幂等、真实签名校验、重新读取支付事实、原子充值与退款/争议权益撤回 |
| 契约 | packages/contracts、docs/interfaces/openapi.json | Zod 字段契约、可重复导出 OpenAPI；内部 Worker/JEV 路由明确设计状态 |

执行入口 `createRouter(deps)` 通过端口注入便于验证，生产 `runtime.ts` 只装配真实 Supabase/R2/Stripe 客户端；不使用进程内假任务、假余额或假生成结果。

## 2. 配置与本地运行

Node.js 22+；根目录 `npm ci`。将根 `.env.example` 复制至 `apps/web/.env.local` 后填写测试环境配置，运行 `npm run dev`。Next 按 Web workspace 加载环境，根脚本不自动读取 `.env`。生产部署使用 Vercel 项目环境变量。

| 环境变量 | 用途与要求 |
|---|---|
| APP_ORIGIN | 回跳本站的固定 origin；生产必须 HTTPS；禁止客户端提供任意回跳 URL |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | 服务端 Auth/PG；service role 不发给浏览器 |
| R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET | 私有桶；权限仅项目桶读写删除；禁止 public bucket |
| STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET | 测试/生产环境分开；Webhook 原始字节验签 |
| IMAGE_RETENTION_DAYS | 1–30 整数，默认 7；只控制资产期限，不能替代定时物理清理 |
| GENERATION_ENABLED | 只有字符串 true 才启用；默认 false；Worker 尚未实现时必须保持 false |
| MODEL_PROFILES_JSON | 默认 []；版本化、经人工 evaluation 的真实模型能力和费用；详见 ModelProfile Schema |
| JEV_BASE_URL / JEV_SERVICE_SECRET | 可选；模型服务未配置、故障或返回不合法时明确 fallback |

所有变量均为服务器变量。日志仅记录 request_id/稳定错误码，不能打印 token、图片、完整 Prompt、签名链接或支付密钥。

模型 profile 必须声明真实 provider/model_id/adapter_version、verified_tool_ids、max_images、roles、qualities、aspect_ratios、credits_standard/high、pricing_version。目录中未验证模板不是效果已达标的证据；配置 verified_tool_ids 的依据必须来自真实 evaluation。没有可信价格或能力时保持关闭。

## 3. 数据库初始化和部署配置

1. 在独立 Supabase 测试项目应用 `supabase/migrations/202610190001_web_backend.sql`。迁移依赖 Supabase 的 auth.users、auth.uid() 与标准角色；本地 PGlite/原生 PG 测试显式建立模拟 Auth schema，不能据此声称完整 Supabase 服务已联调。
2. 启用需要的邮箱/Google Auth，配置站点和 OAuth redirect；浏览器使用自己的 publishable key 和 Supabase SDK，向 API 提交 access token。浏览器认证页面未实现。
3. 新用户余额初始化为 0，credit_packages 初始为空。上线前以运营批准的日元价格建立套餐并启用，不内置生产价格或免费额度。
4. R2 建私有桶，配置本站 origin 的 PUT CORS；允许 Content-Type。上传签名同时绑定 Content-Length，由浏览器根据 Blob/File 实际长度自动生成，JS 不手动设置该禁用头。必须在真实浏览器/R2 联调确认签名与 CORS。
5. `staging/` 配短生命周期（建议 1 天）；工作图/分析图/结果采用数据库归属与期限。未实现清理 Worker 前不开放长期用户流量；过期读取已拒绝，但物理清理、孤立对象清理与 cleanup_pending 重试仍是 Worker 后续任务。
6. Vercel 项目 Root Directory 设 `apps/web`；框架 Next.js，构建 `npm run build`，安装在仓库根执行 `npm ci`（控制台可配置 `cd ../.. && npm ci`）。monorepo 允许访问根 packages，hnd1 见 apps/web/vercel.json；账号是否可用该区域需实配验证。环境变量按 Preview/Production 分开。
7. Stripe 测试 Webhook 指向 `/api/stripe/webhook`，订阅 checkout.session.completed、checkout.session.async_payment_succeeded、charge.refunded、charge.dispute.created。成功页面不发积分；前端支付页面未实现。
8. 部署后先保持 GENERATION_ENABLED=false；完成实际 Auth→上传→complete→推荐回退→支付沙盒→查询的联调。Worker 经审阅、实现、恢复测试与 evaluation 后，才配置真实模型并启用生成。

此轮没有账号访问或部署命令执行记录，上述为明确交接步骤，不代表这些配置已应用。

## 4. 正确性与故障处理

任务请求先按工具参数归一化后计算 hash；同用户同键重放原快照和价格，当前默认模型变化、价格变化或生成关闭不改变旧任务。创建任务、资产归属检查、输入关系、预留与流水同一 PG 事务完成。图片与账户按锁序处理，并发删除不能绕过运行输入保护。

PUT 签名键只写 staging；complete 以解码结果/hash 写服务端规范键，再原子登记 ready，避免重用旧 PUT 签名篡改待生成资产。R2 与 PG 无跨系统事务，失败可留下孤立对象；内容地址键、幂等登记与后续清理共同收敛。删除先隐藏数据库资源，存储失败不会恢复公开访问。已发出的短签名链接在过期前仍有可用窗口，物理删成功后失效，UI 不应承诺瞬间撤销所有缓存。

支付事件先真实验签，再重新读取 Checkout Session、PaymentIntent/latest Charge，核对金额、币种、所有权与支付意图；支付入账事务同步应用当前累计退款/争议事实，避免退款先到而随后释放全额可消费积分。未建立 payment_intent 映射的退款返回可重试 503；之后支付先按净权益入账，退款重试不重复回撤。已处理 event_id 直接确认。累计退款按比例向上取整，已消费不足部分保留负债事实、限制账户，不把 available 设负数。争议解除/退款撤销恢复权益不自动实现，需后续运营对账策略。

推荐模型请求不自动重试；调用失败、未知/重复候选、版本不匹配、空结果、超大响应均回退。fallback 分数为 null，仅按目录顺序，POPULAR_FALLBACK 是协议标签，不代表已取得真实热度数据。2.5s 是模型 HTTP 调用上限，资产/数据库开销另计；端到端延迟仍需实测。

## 5. 当前边界

- Web 只把任务持久化为 queued；尚无 Worker 领取、供应商提交、结果保存、成功扣实、失败释放或自动过期恢复运行代码。queued 取消已实现，processing 取消未承诺。
- 结果资产需要 Worker 设计中的数据库增量，当前迁移只支持上传资产；不能手动把任务改 completed 充当交付。
- 20 工具/Prompt 已配置，真实编辑效果和各供应商能力未验证；不保证每个效果可由同一模型完成。
- 2026-10-20 用户确认先按d3-mini设计。固定revision和Lambda A100资源已只读核查，评分/接口与部署设计见docs/architecture及[Lambda协议](../interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md)。未开发、部署或运行推荐模型；Web稳定字段保持不变。当前尚缺批准bundle allowlist，现有候选资料也需按20工具规格细化，后续实现时补齐。
- 无前端、邮件流程、真实生产支付、生产清理、监控告警平台或部署流水线；只实现本轮授权的 Web API 后端。所有上线差距列入 Worker 设计和原有路线图。

测试命令、实际结果与外部联调限制见 [验证记录](../verification/VERIFICATION.md)。
