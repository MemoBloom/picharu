> **范围决策（2026-10-19，用户确认）：首期从完整 20 个工具开始论证技术架构。** 分批开发、灰度或质量暂缓公开不缩减设计范围。统一清单与优先级见 [BASELINE_REQUIREMENTS.md](../../docs/product/BASELINE_REQUIREMENTS.md)。
> 本文影响：20 工具对应页面能力与内容规划；历史关键词表不覆盖现行工具范围。

**阶段更新（2026-10-19）：** 首期架构与工具页面设计对齐完整 20 工具清单，见 `docs/product/BASELINE_REQUIREMENTS.md`；下方关键词表已对齐当前 20 工具，不覆盖未纳入首期的历史功能。

# JAPAN_IMAGE_SEO_PLAN

> 研究基线：2026-10-15。项目定位：日本普通消费者、无需 Prompt 的 AI 图片编辑聚合站。
> 注意：日语词均为**候选查询词**，未取得日本月搜索量；功能可实现不等于质量已验收；没有采购价格的接口均记作 TBD。

## 关键战略

SEO 是长期渠道，不应承担首月产品验证。短期辅以 X、TikTok、日语内容创作者及小额搜索广告。和 Canva 不是完全同类定位；重点对照具体在线工具站和搜索结果中的实际同类功能页。

## 种子关键词与落地页（搜索量/难度均待实测）

工具页使用 `/ja/tools/[slug]`，Tool ID 与 slug 在契约阶段统一映射。下表为当前 20 工具的关键词与意图输入，不代表已取得搜索量或已上线。

| Tool ID | 用户意图 | 核心日语候选词 |
|---|---|---|
| `remove_person` | 去除路人 | 写真から人を消す |
| `remove_object` | 去除杂物 | 写真の不要なものを消す |
| `change_background` | 更换背景 | 写真の背景を変更 |
| `photo_color_grade` | 照片调色 | 写真の色味を変える |
| `weather_season` | 天气/季节转换 | 写真の天気・季節を変える |
| `light_time` | 光线/时间转换 | 写真の雰囲気を変える |
| `ai_avatar` | AI 社交头像 | AIアイコン作成 |
| `natural_beauty` | 自然人像美化 | AI美肌加工 |
| `hair_color` | 发色更换 | 髪色変更AI |
| `hairstyle` | 发型尝试 | 髪型変更AI |
| `professional_headshot` | 职业头像 | AIプロフィール写真 |
| `anime_photo` | 照片动漫化 | 写真をアニメ化 |
| `illustration_photo` | 照片插画化 | 写真をイラスト化 |
| `chibi_person` | Q版人物 | ちびキャラ化 |
| `pet_illustration` | 宠物插画 | ペットをイラスト化 |
| `pet_humanization` | 宠物拟人 | ペットを擬人化 |
| `multi_photo_composite` | 多照片合成 | 写真合成AI |
| `product_background` | 商品背景美化 | 商品写真背景変更 |
| `room_redesign` | 房间风格改造 | 部屋模様替えAI |
| `clothing_recolor` | 衣服颜色更换 | 服の色を変えるAI |

## SEO 页面模板

1. 自然日语 Title：任务 + 能解决的问题；避免堆砌 “無料”。
2. H1 + 真实的 Before/After（提供原始样例的授权和限制说明）。
3. 让用户在首屏直接开始任务；移动端上传无需注册，严控试用成本。
4. 处理步骤、可选效果、价格和预计消耗积分。
5. 日语 FAQ：是否免费、是否保存上传图、可删除吗、支持格式、失败怎么办。
6. 真实案例、适用与不适用情景、隐私政策、相关工具导航。
7. 合理的 title/description、canonical、hreflang、站内可抓取链接、sitemap、结构化数据（仅内容匹配时）。

## 关键词调研工作表字段

`keyword_ja, intent_cluster, JP_monthly_volume, trend_12m, SERP_top10, ranking_page_type, authority_signal, competitor_price, KD_tool_metric, intent_fit_1to5, technical_feasibility_1to5, projected_variable_cost, priority, verification_date`

**数据获取流程：** 日本地区 Google Keyword Planner → Google Trends → 日本 Google SERP 实查 → Ahrefs/Semrush 辅助 → 对比实际搜索者期待。不要将同义词自动算成不同需求；不要把第三方 KD 当成 Google 官方指标。

## 竞品分析维度

- 样本范围：MyEdit、Fotor、轻量去背景/修复工具和每个关键词实际排名的前 10 站点；Canva 仅作间接替代品参考。
- 每站记录首页入口、功能页面数量、首屏试用步骤、是否必须注册、额度、日元定价、购买墙时机、功能实际表现、用户隐私文案。
- 输出不是“复制页面”，而是识别尚未满足的任务：更快、少操作、清晰额度、真日语提示。

## 90 天具体计划

| 时间 | 交付 | 指标 |
|---|---|---|
| 1–2 周 | 按 20 工具整理种子词与搜索意图组、前 10 SERP 审计 | 非品牌关键词布局完成；落地页可抓取 |
| 3–4 周 | 准备 20 工具独立页面与真实前后对比，按质量灰度开放 | 上传/生成成功埋点和 Search Console 生效 |
| 5–8 周 | 8–12 篇教程/案例 + 日本创作者传播 | 高曝光查询、非品牌点击、试用率 |
| 9–12 周 | 更新有潜力页面、改进 CTA/生成体验 | 合格生成、有效付费、每个有效用户成本 |

## 活动/渠道归因

标准事件：`landing_view` → `upload_start` → `generate_click` → `generate_success` → `result_download` → `purchase`。强制区分 `organic_search`, `paid_search`, `x`, `tiktok`, `creator_referral`, `direct`。监控自然搜索带来的净新增有效用户，而非只看展示。

## 页面质量和边界

- 不为仅换关键词、内容相同的入口批量建页面；每个工具页必须对应实际任务、示例和可用操作。
- 不保证收录或排名。日语翻译须由本地审校；金额、取消订阅、退款和私图保留规则必须明确。
- 技术与多语言规则参考：https://developers.google.com/search/docs/specialty/international/localized-versions 和 https://developers.google.com/search/docs/fundamentals/seo-starter-guide

## 首阶段排除项

- 搜索量尚未知时，不采购长期昂贵 SEO 软件。
- 不为了“50 个工具”制造大量重复的空壳页面。
- 不宣称只因价格低于 Canva 就会自然获客。
