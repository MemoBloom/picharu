> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：首轮 20 × 15 任务覆盖，旧六工具评测及其采样口径已替换。

**阶段更新（2026-10-19）：** 首期覆盖完整 20 工具，每工具 15 个任务用例，共 300；不能用旧六工具小样本替代。详见 `docs/product/BASELINE_REQUIREMENTS.md`。

# IMAGE_EDIT_BENCHMARK

> 研究基线：2026-10-15。项目定位：日本普通消费者、无需 Prompt 的 AI 图片编辑聚合站。
> 注意：日语词均为**候选查询词**，未取得日本月搜索量；功能可实现不等于质量已验收；没有采购价格的接口均记作 TBD。

## 目标

建立 **质量-成本-时延** 的可重复评测，逐项验证 20 工具的端点能力、质量与成本；备选模型按实际能力差距论证。不得只用模型展示图判断质量，也不得仅用 CLIP/LPIPS 代替真人验收。

## 数据集

- 首期每工具 15 个真实/授权任务用例，20 项合计 300；可共享原图但每条任务单独评价。后续需要扩大统计可信度时再增加样本，不使用旧六工具 × 50 的覆盖口径。
- 首轮每工具采样分层建议：简单 6、中等 6、极端 3；覆盖手机照片、社交截图、噪声、遮挡、多主体、不同分辨率。
- 每张样本记录：`sample_id, consent/license, device, image_size, complexity, target_region, desired_outcome, forbidden_changes`。
- 保存源图私有，公开只发布授权样例；剥离 EXIF、避免保留可识别私人信息。

## 各工具评价规则

以下覆盖完整 20 工具，均按任务完成、非目标保持和视觉质量打分。首轮每工具 15 用例；多图合成每个用例可以包含多张输入，不能按图片张数替代任务覆盖。

| Tool ID | 验证任务 | 必查失败/禁止变化 |
|---|---|---|
| `remove_person` | 去除路人 | 遮挡路人、被误删主体 |
| `remove_object` | 去除杂物 | 复杂背景重建 |
| `change_background` | 更换背景 | 主体漂移 |
| `photo_color_grade` | 照片调色 | 整图重绘改变细节 |
| `weather_season` | 天气/季节转换 | 大范围结构变化 |
| `light_time` | 光线/时间转换 | 人物和场景不一致 |
| `ai_avatar` | AI 社交头像 | 身份变化 |
| `natural_beauty` | 自然人像美化 | 过度修图 |
| `hair_color` | 发色更换 | 发丝选区溢出 |
| `hairstyle` | 发型尝试 | 人脸轮廓漂移 |
| `professional_headshot` | 职业头像 | 身份保持 |
| `anime_photo` | 照片动漫化 | 人物数量变化 |
| `illustration_photo` | 照片插画化 | 身份与配饰 |
| `chibi_person` | Q版人物 | 标志性特征丢失 |
| `pet_illustration` | 宠物插画 | 毛色与花纹漂移 |
| `pet_humanization` | 宠物拟人 | 拟人化可控性 |
| `multi_photo_composite` | 多照片合成 | 多参考图与人物保持 |
| `product_background` | 商品背景美化 | 商品真实性 |
| `room_redesign` | 房间风格改造 | 空间几何不准确 |
| `clothing_recolor` | 衣服颜色更换 | 衣料纹理变化 |

## 评测协议

1. 每个工具验证可用的 1–2 个候选端点；具备第二个端点时做同输入对比；统一输入/目标输出/分辨率档位，参数与 Prompt 固定。
2. 先单次调用，仅在确认不会重复创建收费任务后允许最多一次重试，并将所有重试费用计入成本。
3. 由两位独立评审盲评 1–5 分：任务完成、非目标内容保留、视觉质量；分歧大于 1 分第三人复核。
4. 人工合格定义：三项评分均 ≥4，且无严重伪造/版权/安全问题。
5. 单项报告：技术成功率、人工合格率、首次合格率、平均重试次数、P50/P95 时间、每张合格图成本。
6. 质量-成本对照：不能仅以模型“每次价格”比较。
7. 异常工况：空图、损坏图、过大图、多次快速点击、供应商 429/5xx、回调重复、任务取消、支付中断。

## 内部放量门槛（待试点校准）

- 技术成功率 ≥ 98%；人工合格率 ≥ 80%；P95 单次任务反馈时延 ≤ 40 秒（按功能允许例外）。
- 重大隐私泄露、越权访问、重复扣费容忍度为 0。
- 任何未达标工具须打标签 beta/试验版，不能宣传“保证去除/绝对保真”。

## CSV 结果记录模板

```csv
sample_id,task_id,provider,model_version,prompt_version,attempts,api_cost_usd,storage_cost_usd,latency_ms,technical_success,task_score,preservation_score,visual_score,human_acceptable,notes
A001,remove_person,provider_a,model_v1,prompt_v3,1,,,,,,,,,
```

## Codex 开发任务与验收

- `bench/dataset_manifest.jsonl`：数据集清单 + 数据许可标记；可验证覆盖 20 工具的 300 个首期任务。
- `bench/providers/`：统一 adapter 接口和 mock provider；可在没有 API Key 时运行单元测试。
- `bench/run.py`：固定 Prompt、输入 hash、seed（如支持）、超时与重试；输出 JSONL。
- `bench/report.py`：出任务维度的 CSV、HTML 汇总和质量/成本帕累托图。
- `bench/review_ui/`：随机化盲评，两位评审与仲裁流程。
- CI：不调用付费模型，只跑接口契约和 10 张固定样例回归；完整评测手动触发并设成本封顶。
