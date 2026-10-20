> 2026-10-19 implementation update: [Interface v1](../../docs/interfaces/INTERFACE_SPEC_V1.md), [Vercel backend](../../docs/backend/VERCEL_BACKEND.md), [Worker design only](../../docs/architecture/CLOUD_RUN_WORKER_DESIGN.md), [JEV design only](../../docs/architecture/JEV_LAMBDA_DESIGN.md). These documents supersede conflicting earlier examples. No cloud deployment; generation defaults to disabled.

> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：从 20 工具要求论证架构，不能以只支持少数单图工具的最小链路作为完成。

# Phase 1 技术架构（20 工具论证基线）

## 1. 设计目标

架构从完整 20 个工具出发，逐项论证输入形态、编辑控制、模型能力、结果交付、资产版本、任务恢复、积分与成本。原单体六工具设计不再是执行基线。20 个 Tool ID 以`docs/product/BASELINE_REQUIREMENTS.md` 为准。

现有技术包方案是本轮评审的输入，部署方式及契约仍需验证，不能仅因工具数量增加直接推断必须微服务化。

## 2. 现有候选架构与职责

```text
Browser /ja/tools/[slug] (20 tools) / Smart Edit / 自由编辑
  -> Vercel Next.js: 会话、上传授权、工具/模板、任务与支付 API
  -> Supabase Auth/PostgreSQL: 归属、任务快照、原子积分、订单
  -> R2: 私有原图、缩图、结果及版本
  -> Lambda GPU JEV: 图片 + 推荐资料 -> Top-K 模板 ID
  -> Cloud Run CPU Worker: 持久任务 -> 商业图像 API -> 结果落存 -> 结算
```

推荐是可回退的入口，不阻塞指定工具。图像生成优先 1–2 个经验证端点，是否满足 20 工具由能力矩阵证明。

## 3. 必须覆盖的设计场景

- 单图删除/背景/调色与风格转换；参数按工具白名单和能力声明约束。
- 发色、发型、人像美化与职业头像的身份/边界保持；商品、房间、衣服的结构与纹理约束。
- 多图合成的输入图集合、顺序/角色、数量限制、每张归属校验与真实供应商支持。
- 连续编辑的原图、父版本、结果图和任务快照关系。
- 20 工具分别配置费用、限额、启用状态、模板版本和质量指标。

## 4. 数据与接口评审范围

沿用技术包的 `profiles`、`images`、`edit_jobs`、`edit_versions`、`credit_accounts`、`credit_ledger`、`orders` 等概念，逐项检查是否支持上述场景。不能将旧单个 asset_id 示例当作最终多图合约。

任务需记录稳定 tool_id、输入版本、模板/Prompt 快照、模型、预留积分、供应商任务 ID、lease、结果与实际成本。创建任务和预留同事务，结果可交付后原子结算；重试与支付事件幂等。

API 草案以 `references/technical/03_API_CONTRACTS.md` 为入口；多图输入、历史/删除/取消及 Worker 持久触发机制须在实现前明确。

## 5. 能力验证和可靠性

- 20 × 15 = 300 个首轮授权任务用例；逐工具报告技术成功、人工接受、主体保持、实际费用、P50/P95 和重试。
- 服务端密钥、鉴权、频控、费用熔断、私有存储与删除机制。
- 重复点击、Worker 崩溃、上游超时、保存失败与掉队任务恢复；不得盲目重交已收费的上游作业。
- 模型名称、速度和再提供权仍待真实核验；云区域不能直接当数据驻留保证。

## 6. 范围边界

不自研生成模型、不以模型数量为目标、不预建复杂动态路由和专业画布。单一共享链路需要支持工具差异；对难工具记录能力缺口并论证，不缩减 20 工具架构范围。
