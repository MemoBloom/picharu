> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：本目录 20 项全部是首期架构设计输入，10/6/4 仅为实现与灰度顺序。

# 20 个图像编辑功能首发地图

> 文档基线：2026-10-19。面向日本普通消费者；香港公司经营；首期使用商用图像 API；以下“目标”不是已通过实测的指标。

## 第一阶段目标

完整 20 个工具均为首期架构设计输入；未通过真实效果验收的功能不得对外宣称成熟，但仍须保留设计与评测覆盖。优先选用同一或两个通用商用 Image Edit 模型端点，配置 20–50 个 Prompt 模板；无需为每个工具接一个新模型。功能使用频率/搜索需求为假设，须用日本真实数据验证。

**已明确排除首发：智能扩图。** 用户在既有真实产品中已验证低价值，当前以衣服颜色更换替代。

## 首期设计目录（完整 20 工具）

| 分类 | Tool ID | 中文名 | 日语入口 | 开发预估可控性 | 关键风险 |
|---|---|---|---|---|---|
| 日常修图 | `remove_person` | 去除路人 | 写真から人を消す | 高 | 遮挡路人、被误删主体 |
| 日常修图 | `remove_object` | 去除杂物 | 写真の不要なものを消す | 高 | 复杂背景重建 |
| 日常修图 | `change_background` | 更换背景 | 写真の背景を変更 | 高 | 主体漂移 |
| 日常修图 | `photo_color_grade` | 照片调色 | 写真の色味を変える | 中高 | 整图重绘改变细节 |
| 日常修图 | `weather_season` | 天气/季节转换 | 写真の天気・季節を変える | 中 | 大范围结构变化 |
| 日常修图 | `light_time` | 光线/时间转换 | 写真の雰囲気を変える | 中 | 人物和场景不一致 |
| 人像社交 | `ai_avatar` | AI 社交头像 | AIアイコン作成 | 高 | 身份变化 |
| 人像社交 | `natural_beauty` | 自然人像美化 | AI美肌加工 | 中 | 过度修图 |
| 人像社交 | `hair_color` | 发色更换 | 髪色変更AI | 中高 | 发丝选区溢出 |
| 人像社交 | `hairstyle` | 发型尝试 | 髪型変更AI | 中 | 人脸轮廓漂移 |
| 人像社交 | `professional_headshot` | 职业头像 | AIプロフィール写真 | 中 | 身份保持 |
| 插画趣味 | `anime_photo` | 照片动漫化 | 写真をアニメ化 | 高 | 人物数量变化 |
| 插画趣味 | `illustration_photo` | 照片插画化 | 写真をイラスト化 | 高 | 身份与配饰 |
| 插画趣味 | `chibi_person` | Q版人物 | ちびキャラ化 | 高 | 标志性特征丢失 |
| 插画趣味 | `pet_illustration` | 宠物插画 | ペットをイラスト化 | 高 | 毛色与花纹漂移 |
| 插画趣味 | `pet_humanization` | 宠物拟人 | ペットを擬人化 | 中 | 拟人化可控性 |
| 生活创意 | `multi_photo_composite` | 多照片合成 | 写真合成AI | 中 | 多参考图与人物保持 |
| 生活创意 | `product_background` | 商品背景美化 | 商品写真背景変更 | 高 | 商品真实性 |
| 生活创意 | `room_redesign` | 房间风格改造 | 部屋模様替えAI | 中 | 空间几何不准确 |
| 生活创意 | `clothing_recolor` | 衣服颜色更换 | 服の色を変えるAI | 中高 | 衣料纹理变化 |

## 分批执行和稳定性

以下分批仅描述实现/灰度顺序，完整 20 工具的能力论证与契约设计须先完成；不能先按第一批简化架构再将后批需求排除。

- 第一批 10 个：remove_person, remove_object, change_background, photo_color_grade, ai_avatar, anime_photo, illustration_photo, chibi_person, pet_illustration, product_background。
- 第二批 6 个：weather_season, light_time, natural_beauty, hair_color, pet_humanization, clothing_recolor。
- 第三批 4 个：hairstyle, professional_headshot, multi_photo_composite, room_redesign（需更严格保真测试）。
- 功能是否真正上线由真实商业模型生成的合格率、用户理解、质量和单位成本决定；可调整先后顺序，不为凑满 20 强行上线。
- 发型试穿、商业商品图、专业头像、房间改造都不能承诺事实与结构精准。

## 工具页标准

`tool_id / name_ja / slug / image_examples / default_prompt_id / supported_input_count / output_options / credits / limits / FAQ / analytics_labels`。首屏上传 + 真实 Before/After、可选一句补充要求、失败说明、透明扣费、结果继续编辑。所有工具页必须有独立真实内容，不能换标题复制模板以刷 SEO。
