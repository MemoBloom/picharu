> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：逐工具核实 20 项输入和保真能力，不能假定一个单图接口已覆盖所有需求。

**阶段更新（2026-10-15）：** 这里是长期供应商参考矩阵；首阶段不实现专用 API 链路和自动模型路由。详见 `references/product/PHASE1_COMMERCIAL_API_MVP.md`。

# IMAGE_EDIT_MODEL_MATRIX

> 研究基线：2026-10-15。项目定位：日本普通消费者、无需 Prompt 的 AI 图片编辑聚合站。
> 注意：日语词均为**候选查询词**，未取得日本月搜索量；功能可实现不等于质量已验收；没有采购价格的接口均记作 TBD。

## 选型方法

不要以供应商的宣传效果当成实测结果。对所有候选 API，按照**接口确认 → 授权确认 → 小样本调用 → 固定测试集评估 → 成本核算 → 灰度上线**六步筛选。按 20 工具逐项验证主力端点能力和失败处理；备用端点是否需要由评审确定，首期不默认要求自动路由或自动供应商切换。多图、改色与身份/结构保持需专项记录。

## 可核对的公开接口和能力

| 服务 | 官方/平台入口 | 已公开的能力 | 适合链路 | 注意事项 |
|---|---|---|---|---|
| OpenAI Images Edits | https://developers.openai.com/api/reference/resources/images/methods/edit | 输入图片、提示词、可选蒙版、多图支持，具体模型参数须逐一确认 | R1/R2/R5 | 蒙版可能不是严格锁定区域；价格查供应商当日表 |
| Google Gemini 图片 | https://ai.google.dev/gemini-api/docs/image-generation | 图像+文字编辑、删除/增加元素与风格处理 | R1/R5 | 注意版本、速率及授权 |
| FLUX.1 Kontext [pro] via fal | https://fal.ai/models/fal-ai/flux-pro/kontext | 输入图+编辑提示词 | R1 | 当前页面列示 $0.04/张，仅为对应端点的查询快照 |
| FLUX.1 Kontext [dev] via fal | https://fal.ai/models/fal-ai/flux-kontext/dev | 输入图+提示词 | R1 | 当前页面列示 $0.025/MP，需核实计量取整和许可证 |
| Clipdrop API | https://clipdrop.co/apis/docs | cleanup、upscaling、remove background、remove text、uncrop 等 | R2/R3/R4/R6 | 各端点额度/价格/限制独立确认 |
| Bria | https://bria.ai/ | 背景和部分专门商业视觉任务 | R1/R5 | 端点/商用及可转售协议逐项核实 |
| Sharp/OpenCV | https://sharp.pixelplumbing.com/ ; https://opencv.org/ | 旋转、裁切、压缩等确定性编辑 | R7 | 自部署运维成本 |

## 历史链路研究（非当前首期路由承诺）

下表保留专用 API 与自动路由研究，不能据此扩大现行架构；当前必须先按统一清单逐项验证 20 工具，并在能力矩阵记录实际端点支持与差距。

| 任务类别 | 主力候选 | 备用方案 | 自动路由条件 | 风险 |
|---|---|---|---|---|
| 消除路人/杂物 | Clipdrop Cleanup 或修补模型 | GPT Image/FLUX Kontext | 小面积蒙版→专用；复杂背景→通用 | 幻觉纹理 |
| 背景透明化 | Clipdrop Remove Background 或自部署分割 | 第二分割服务 | 发丝/半透明场景优先质控 | 边缘误删 |
| 高清化/旧照 | 专用 upscale/restore | 通用图像编辑 | 需求真实性优先专用恢复 | 伪细节与人脸漂移 |
| 插画/AI头像 | FLUX Kontext/Gemini Image | GPT Image | 以身份一致性+质量/价格路由 | 人物细节改变 |
| 多图合成/试衣 | 专用多参考图模型 | 通用多图编辑 | 复杂约束或失败率高→专用 | 衣服/人体结构 |
| 文字编辑 | OCR+局部修补+排版 | 通用编辑 | 需准确文字→确定性排版 | 日文字形错误 |
| 裁切/压缩/格式 | Sharp / OpenCV | 浏览器本地处理 | 无语义需求时优先不调用生成模型 | 色彩空间/元数据 |

## 价格与质量采购表（待供应商实测补齐）

| 字段 | 单位/说明 |
|---|---|
| provider, endpoint, model_version | 精确端点版本，不只写营销型号 |
| billing_unit, list_price, currency | 计费单位、阶梯价、币种、税费 |
| max_pixels, formats, max_upload_MB | 请求限制 |
| supports_mask, supports_multi_image, supports_seed | 编辑控制能力 |
| median_latency, p95_latency | 从用户发起到可下载结果 |
| success_rate, acceptable_rate, retries_per_success | 成功率和可接受率 |
| input_retention, output_retention, training_opt_out | 数据治理 |
| resale_allowed, commercial_use, geographic_restrictions | 面向 SaaS 用户的再提供权 |
| cost_per_accepted_result | **核心单位经济指标** |

## 成本公式

`Cost_per_accepted = (sum(API_charge + storage + transfer + retries + moderation)) / accepted_outputs`

`Gross_contribution = net_revenue - variable_inference - payment_fees - refunds - variable_infra`

**重要：** 经中转站调用上游模型之前，必须确认转售/再分发权、数据保留与服务等级；不要将“网页可调用”视为“允许商业中转”。
