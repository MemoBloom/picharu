# 本轮实现验证记录

> 2026-10-20 Git/CI 补充：本地仓库与工作流配置已建立；统一 verify、84项测试、90项SQL断言、103项原生PG并发断言及当前网页/API生产构建通过。remote 尚未添加，GitHub runner 和标签推送未实跑，详见 [Git与CI规范](../../../../docs/maintenance/GIT_AND_CI.md)。

日期：2026-10-19。范围：统一协议、Vercel Web 后端、数据库迁移，以及 Worker/JEV 设计的协议一致性。所有效果模板尚未完成真实模型 evaluation；没有云部署或真实付款记录。

2026-10-20追加：按用户授权SSH只读确认Lambda服务器、工作空间与固定d3-mini源码，详见 [环境证据](../../../../docs/research/LAMBDA_ENVIRONMENT_2026-10-20.md)。本次只完善部署/评分/接口设计并做文档与共享Schema一致性检查；未开发或部署推荐服务，未下载权重/运行GPU、未scp；不把SSH调查作为模型联调成功。

## 已实际执行

| 检查 | 结果 | 能证明什么 |
|---|---|---|
| npm run typecheck | 通过 | 当前 TypeScript 契约与实现编译一致 |
| npm test | 60/60 通过，3 个测试文件 | 29 契约、29 HTTP/业务/媒体、2 真实 AWS SDK 签名测试 |
| npm run test:db | 90 项 SQL 断言通过 | 完整迁移、实际 PostgreSQL RPC、RLS、权限、资金与状态约束，运行于 PGlite |
| npm run test:concurrency | 103 项断言通过 | 原生 PostgreSQL 17，独立连接实际并发和锁竞争，非内存假数据库 |
| npm run contracts:export | 成功，22 paths/23 operations | 18 公开 Web 操作和 5 内部设计操作；内部服务器为 .invalid，不表示已部署 |
| npm run build | 通过，Next.js 16.4.2 | API-only 应用生产构建、类型检查、路由产物可生成 |
| 实际 next start + HTTP 请求 | 通过 | /api/health 200；/api/tools 200、20项且全部关闭；无token访问/api/credits 401；响应协议版本1.0.0 |

npm test 直接执行真实迁移和真实 Sharp 解码/元数据移除，通过注入端口隔离外部 R2/Stripe/JEV 网络。Stripe Webhook 使用 Stripe SDK 生成测试签名并真实验签，不跳过密码学验证；支付事实由测试端口提供，不是真实支付。R2 签名测试使用实际 SDK 和合成凭据，无网络，验证类型/长度绑定及无空内容 CRC32。

原生 PG 并发测试覆盖 20 个同键请求仅一个 job/reserve、20 个不同键争抢余额只允许可负担任务、20 次取消一次返还、20 个不同支付事件仅一次充值、30 组删除/建任务竞争（两种先后各15次）。另外覆盖已知全退款/部分退款/拒付后的并发支付及后到撤回，验证净额入账、单调权益撤回和不能花费全退款积分。脚本创建独立随机临时库，完成后自动删除；不读取 .env、不接生产数据库。

HTTP 回归覆盖归属、坏文件与声明不一致、固定上传版本、多图/角色、参数白名单、父任务关系、幂等重放跨模型/价格变更、积分不足、取消/删除、持久频控、分页、JEV HMAC 与候选校验/明确回退、服务端计价、支付/退款乱序与重复事件。退款先到的审查问题已复现后修复，并加入测试；R2 空 checksum 与签名约束问题已修复并加入真实签名器测试。

## 尚未验证或实现

- Supabase 真实 Auth/OAuth、PostgREST/RLS 集成与迁移应用，真实 R2 CORS/浏览器直传和对象生命周期，Stripe 测试环境完整异步流程，Vercel 线上区域和性能：需后续 staging 联调。
- Cloud Run Worker、执行供应商、结果资产/结算、清理和故障恢复：本轮仅设计，没有运行实现，也没有成功生成的端到端证据。
- 2026-10-20 补充：用户先提供StartLux，随后提出Decision 3.0。当前设计优先评估d3-mini；Decision Index协议纯转换试验10项断言通过，使用合成fixture、不运行推理。官方演示导航审批超时，d3补充源码/revision访问超时；无新的GPU、模型质量或在线调用成功证据。见JEV_PROTOCOL_REVIEW.md。
- 20 工具初期 Prompt 为可评测起点，真实效果、身份/结构保持、质量分档、成本和时延需要授权样本及真实模型 evaluation。
- 无前端页面、上线监控告警和生产发布流水线。本轮后端通过本地验证，不等于整个产品完成或可开放收费生成。

复查命令与安全限制见 [后端说明](../backend/VERCEL_BACKEND.md)、[数据库说明](../backend/DATABASE_SCHEMA.md)。GENERATION_ENABLED 保持 false。验证结束已停止本轮临时 Next 服务与 PostgreSQL 测试实例。
