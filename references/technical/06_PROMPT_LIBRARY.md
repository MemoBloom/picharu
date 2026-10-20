> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：模板与评测映射到 20 个工具；20–50 是模板数量，不是工具数量或已验证能力。

# Prompt Library 与 Recommendation Profile

> 文档基线：2026-10-19。面向日本普通消费者；香港公司经营；首期使用商用图像 API；以下“目标”不是已通过实测的指标。

## 决策

初期按 **20–50 个模板**规划，20 个工具也只是初期范围；模板数量不设长期硬上限。架构重点是适配模型能力迭代，效果质量逐步验证与改进。权威源为 GitHub `packages/prompts/templates/*.json`；随 Vercel 服务端构建发布。**初期不建立 Supabase 动态模板数据库、不做 Lambda 本地副本同步、无目录服务/向量 DB**。每次推荐把本次候选模板的**丰富推荐元数据**传给 JEV；仅提交生成任务时把完整 Prompt 快照写 PG。候选集增长后再按实际延迟评估筛选方式，不预建复杂检索平台。

## 模板双 Profile

```json
{
  "id":"pet_watercolor", "version":3,
  "tool_id":"pet_illustration", "enabled":true,
  "recommendation": {
    "name_ja":"ペット水彩イラスト",
    "intent":"turn a pet photograph into watercolor art",
    "category":"pet_creative",
    "suitable_subjects":["dog","cat"],
    "visual_requirements":["clear pet face","pet occupies useful area"],
    "negative_conditions":["extreme blur","severe occlusion"],
    "expected_result":"soft watercolor portrait preserving recognizable fur pattern",
    "edit_intensity":"medium",
    "known_failure_modes":["coat pattern drift"]
  },
  "generation": {
    "model_validation":["verified-provider-model-id"],
    "prompt":"Transform the input pet photo into a gentle watercolor illustration. Preserve coat patterns, pose and key identity cues.",
    "preservation_requirements":["pet anatomy","coat pattern"],
    "parameters":{}
  },
  "evaluation": {"sample_count":0,"acceptance_rate":null}
}
```

`sample_count=0`/`null` 的模板不能宣称已通过质量验收。面向用户使用的示例图需是实际生成模型验证结果，具有来源和授权。

## 模板匹配与合成

- Vercel 构建 `getRecommendationCandidates()` 返回仅 Recommendation Profile（含 ID、版本、Tool ID、描述、正反条件、预期、类别），而**不含完整生成 Prompt**。
- `getPrompt(id, revision)` 只在服务端被调用；`enabled=false` 不对新请求可用。
- 最终指令＝固定功能约束＋模板主体＋用户附加文字＋保真/安全约束；用户冲突时明确要求切换自由编辑或拒绝不兼容参数；不能直接让用户输入覆盖安全规则。
- 创建任务时存 `final_prompt`、`prompt_id`、`prompt_version`、模型、输入图版本；Worker 不重新组合。
- 对 JEV 返回 `prompt_id` 做候选集、启用状态、当前版本校验；新旧部署交错时失效推荐需重新选择。

## CI 自动校验

ID 唯一、版本递增、Tool ID 存在、启用模板有推荐元数据和完整生成指令、正负条件非冲突、初期单次推荐候选集控制在 50 项以内（不是全库长期上限）、模板能构建、不可在浏览器包中打包完整密钥/私有 Prompt。模型或端点更换后需重新记录适配与评测，不能沿用旧模型的已验证结论。

## Prompt 质量管理

至少每模板 10–15 张真实有权测试图片的初测；按任务完成/主体保持/伪影/重试/费用标记。Prompt 迭代不直接覆盖旧任务快照；历史数据按不可变 revision 做横向比较。Prompt 名称和日语文本可改，但 ID 稳定。

## AI Agent 文件所有权

Prompt/QA Agent 是 `packages/prompts/templates` 的唯一编辑方；`packages/contracts` 由架构集成人员审阅后修改，JEV/Worker 不各自重新定义模板数据格式。
