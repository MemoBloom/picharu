# 跨模块 API 契约导航

2026-10-19：原单图接口草案已由 [完整接口协议 v1.0.0](../../docs/interfaces/INTERFACE_SPEC_V1.md) 取代。可执行字段见 [contracts](../../packages/contracts/src/index.ts)，完整 HTTP 操作、请求与响应见 [OpenAPI](../../docs/interfaces/openapi.json)。不再保留相互冲突的旧示例。

- 编辑使用 inputs 数组，固定顺序、角色与所有权，支持初期多图合成；不接受顶层 image_id。
- 浏览器使用 Supabase access token；Web 验证 getUser。Cloud Run 使用 IAM/OIDC，JEV 使用精确请求字节的 HMAC，三者认证独立。
- 推荐只接受已上传 owned ready image_id，Web 发送内嵌私有 JPEG 缩图；不接受任意 URL 或上传前 multipart。版本、候选 ID 与得分语义均有明确校验。
- 任务快照、积分预留、订单、支付事件与退款的原子事务见 [数据库说明](../../docs/backend/DATABASE_SCHEMA.md)。公开响应不暴露 Prompt、供应商参数、内部 storage key。
- Worker 的 /internal/v1/drain 与可选 /internal/v1/process-job 只推进有界持久阶段，不在 HTTP 请求中承诺整项编辑完成。具体内部 RPC 见 [Worker 设计](../../docs/architecture/CLOUD_RUN_WORKER_DESIGN.md)，本轮没有实现这些执行接口。
- [JEV 具体方案](../../docs/architecture/JEV_LAMBDA_DESIGN.md) 已于2026-10-20按用户最新Decision 3.0候选改写；[协议核查](../../docs/research/JEV_PROTOCOL_REVIEW.md)区分System One、decide和项目接口，由adapter转换，尚未开发或部署模型服务。

20 工具仅为初期目录。新增模型与能力按契约、适配器、Prompt 和计价版本演进，不修改已经创建的任务快照。本轮实际代码边界和配置见 [Vercel 后端](../../docs/backend/VERCEL_BACKEND.md)。
