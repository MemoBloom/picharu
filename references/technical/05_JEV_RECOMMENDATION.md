# 推荐方案导航

2026-10-20：用户最新候选为 [vllm-sr Decision 3.0](https://huggingface.co/collections/vllm-sr/decision-30)，当前建议先评估d3-mini。完整方案见 [Lambda设计](../../docs/architecture/JEV_LAMBDA_DESIGN.md)，此前StartLux调查见 [历史候选](../../docs/research/JEV_STARTLUX_RESEARCH.md)。

项目adapter包装System One视觉与结构化问题接口，逐候选判断输入适配性后排序。Vercel协议、任务和计费边界保持模型无关；20工具只是初期。

Decision Index Space是静态评测排行榜。多种决策协议、实际完成的10项本地纯转换断言及在线试用限制见 [协议核查](../../docs/research/JEV_PROTOCOL_REVIEW.md)。这些不是实际模型推理通过的证据。

D3-mini模型卡标注Apache-2.0；生产仍需固定实际revision、审阅远程代码并完成真实GPU及效果evaluation。当前无模型服务开发或部署。
