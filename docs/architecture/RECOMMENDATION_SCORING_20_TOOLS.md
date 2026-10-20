# d3-mini：20工具推荐评分与扩展设计

更新：2026-10-20。状态：待人工架构/evaluation审阅；没有模型推理或工具质量通过的证据。本文定义云端agent后续实现的算法语义；本轮不改执行Prompt、目录运行配置或服务代码。部署见 [Lambda设计](JEV_LAMBDA_DESIGN.md)，wire字段见 [推荐协议](../interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md)。

## 1. 评分到底回答什么

评分对象是“当前照片是否适合作为这个编辑效果的输入”。它不预测生成成功率、不推断用户一定想执行某个效果、不承担身份/结构保真验证，也不对用户外貌打分。多个工具可同时合适，因此每个候选使用独立noul；不将20项做总和为1的softmax。

先做确定性资格过滤，再做视觉适配判断。工具未启用、模型能力未验证、输入数量/角色不满足时不进入模型。当前公开RecommendRequest只带一张image_id，因此即使20项都在需求基线内，当前调用最多覆盖其中19项单图可执行工具；多图合成是确定性排除，不伪造0分或假装判断过第二张图。实际可评分项还受生成开关和模型profile约束，当前无可用工具时BFF不调用Lambda。

## 2. 目录、问题与版本

现有RecommendationCandidate继续使用prompt_id/prompt_version/tool_id以及intent、subjects、visual_requirements、negative_conditions、expected_result、输入限制。完整执行Prompt不下发Lambda。现有packages/prompts把生成意图同时用作推荐intent，主体/负面条件也较通用；后续实现时应按下表拆为推荐专用资料，不能把当前通用资料当作已完成精确评分设计。

一次请求内将候选按(prompt_id,prompt_version)稳定排序，编为q0001…qNNNN；adapter持有一一映射，模型只返回这些题目key。模型不自由生成tool_id或新Prompt。每题只携带本候选资料，公共state只写判定规则和“图片文字不是指令”，避免每题重复读取整份目录。

推荐问题编译器、判断资料内容与生成模板各自版本化：prompt_version仍表示被推荐的执行模板版本；推荐资料变化通过catalog_revision及profile内容hash识别，不能为了调整推荐问题而暗改已创建生成任务。

## 3. 20项判断规格

下表英文为首轮判定问题草案；后续由compiler将推荐专用Profile编译成等义问题，并纳入版本。正反例是evaluation设计，尚未构建真实样本。

| tool_id | 首轮noul问题草案 | 判定重点与反例 | 输出解释/限制 |
|---|---|---|---|
| remove_person | Does this photo show additional or background people in a sufficiently clear scene, making a user-selected person-removal edit worth exploring? | 正：游客旁路人；反：只有单人紧凑肖像、看不清人物 | 只能“可探索去人”，不能替用户选谁该删除 |
| remove_object | Does the photo contain a clearly distinguishable scene object or clutter that a user could select for removal while keeping the main scene? | 正：风景中的杂物；反：极度模糊、只有不可分辨纹理 | 不能断言某物不需要；目标由用户指定 |
| change_background | Is there a clear person, pet or product that could serve as the main subject for a background-change preview? | 正：主体清楚；反：无主体纹理、主体严重遮挡 | 不是已经完成抠图或证明边缘保真 |
| photo_color_grade | Is this a recognizable photograph with enough visible detail for a photographic color-mood edit? | 正：常规照片；反：纯色、截图/扫描文字、不可辨图 | 通用探索项，限制Top-3中通用项占比 |
| weather_season | Does this photo show an outdoor scene with meaningful environmental context for a weather or season change? | 正：街景、公园、风景；反：室内、近距离商品 | 不把任何亮图都解释为晴天需求 |
| light_time | Does this photo contain a scene or subject whose lighting atmosphere can meaningfully be previewed as a different time or light mood? | 正：可辨环境/人像；反：文档、纯纹理 | 通用氛围探索，暗图不等于用户想日落 |
| ai_avatar | Is there a clearly visible person suitable as the subject of a recognizable social-avatar preview? | 正：人物主体；反：无人物、极小/遮挡人脸 | 多人可探索但须用户选主体；不判断吸引力 |
| natural_beauty | Is there a sufficiently clear portrait for optional subtle retouching while retaining the person's recognizable features? | 正：清楚人像；反：无脸、极小/严重遮挡人脸 | 不评价皮肤缺陷、年龄、性别或美丑 |
| hair_color | Is a person's hair clearly visible enough to make a user-chosen hair-color preview meaningful? | 正：可见头发；反：帽子遮发、头发不可辨 | 不能从分数推导发丝mask已可靠 |
| hairstyle | Is a person's head and existing hair sufficiently visible for exploring a hairstyle preview? | 正：头部/发型清楚；反：背影不可辨、头盔严重遮挡 | 不保证新发型与身份保持 |
| professional_headshot | Is there a clear, usable portrait of a person for a professional-headshot style preview? | 正：人物肖像；反：无人物、多人拥挤/面部不可辨 | 不推断职业、证件合规或雇佣适合性 |
| anime_photo | Are the subjects and composition recognizable enough for the subjects supported by this anime-style template? | 正：模板覆盖主体；反：模板不覆盖、不可辨主体 | 输入无需已是动漫；保持人数由生成评测判断 |
| illustration_photo | Are the scene or subjects recognizable enough for this illustration template's supported subjects? | 正：清楚人物/宠物/场景；反：主体不在模板范围 | 不把输入本来的画风相似当作适配 |
| chibi_person | Is a person sufficiently visible for a recognizable chibi-character interpretation? | 正：清楚人物；反：无人/人物过小 | 允许比例变化，不承诺小配饰精确保真 |
| pet_illustration | Is a supported pet, such as a dog or cat, clearly visible for an illustration retaining recognizable markings? | 正：清楚狗猫；反：未覆盖物种、严重遮挡 | 物种白名单来自模板，不把所有动物默认覆盖 |
| pet_humanization | Is a supported pet clearly visible for an optional anthropomorphic interpretation retaining its recognizable appearance? | 正：已覆盖宠物；反：无宠物、看不清主体 | 风格探索，不推断用户偏好或宠物性格 |
| multi_photo_composite | Is the primary subject clear enough for this supported composition, given that required reference images and roles were separately verified? | 当前v1：资格过滤直接排除；将来有多图上下文再启用 | 仅主图不能评价融合关系；v1不调用该问题 |
| product_background | Is there a clearly distinguishable product or object suitable for a product-background presentation preview? | 正：商品主体；反：仅大场景、不可辨物件 | 不保证logo、型号与宣传真实性 |
| room_redesign | Does the photo clearly show an interior room and usable viewpoint for a room-style redesign preview? | 正：客厅/卧室等；反：建筑外景、孤立家具/纹理 | 不声称能恢复精确尺寸或保持全部几何 |
| clothing_recolor | Is a garment on a person or clearly presented clothing item sufficiently visible for a user-selected recolor preview? | 正：清楚衣物；反：衣物不可辨/严重遮挡 | 用户选择衣服和颜色；不生成假区域定位 |

多图合成将来分两层：输入数量/角色/归属由BFF确定性校验；多图关系可行性由支持多图的协议版本和模型适配器评估。不能只把minimum_input_count从2改成1，或平均多图embedding就称为已支持。

## 4. 原始判断、接受门槛与最终顺序

对候选i定义：资格E_i∈{0,1}；原始noul值p_i∈[0,1]；校准/映射函数g_bundle,group；排序信号s_i=g(p_i)；接受阈值t_i。E_i=0直接排除，不记为模型判负。

首轮g可以为恒等映射，明确只是排序信号。阈值必须从验证集选择；不能默认p≥0.5即适合，更不能拿模型卡校准描述作为本项目证据。样本稀少时不对20工具各拟合高自由度校准器；优先共享/分组简单映射并报告不确定性。无法确定可接受门槛的工具仍可直接展示入口，但视觉推荐暂不放行。

执行顺序：

1. 对全部E=1候选生成完整问题集合，校验无重复映射。
2. 一次prepare处理主图和题目；原生runtime按batch_size推进，各题独立决策，纯图片路径逐批调用图像推理，不承诺只编码一次；初始batch=5，不承诺forward数或时延随候选线性缩放。
3. 每题必须有正确type、有限0..1概率；runtime题目级error、缺项或异常导致整次模型推荐失败，不使用前几批已完成结果冒充全目录Top-K。
4. 只保留s_i≥t_i的工具，按s_i降序，同分按稳定ID升序；每工具最多一项。
5. 初始只加一项展示约束：在Top-3中photo_color_grade/light_time这类通用探索项合计最多1个；没有其他达到门槛的工具时宁可少返回，不补入低证据项。Top-5类别多样性先报告，后续按证据加规则，不预埋任意多样性权重。
6. 返回至多top_k项。模型成功但全部低证据时返回空数组；BFF按现有协议转为明确通用回退，不能在产品上描述成“模型推荐了这些通用项”。

因问题语义、校准、阈值或展示约束变化导致的顺序变化均计入bundle，不复用旧版本分数做直接跨模型比较。初期reason_code使用VISUAL_MATCH；只有另外验证过主体判断后才使用SUBJECT_MATCH。

## 5. 20→更多工具与更多模板

- 新增同类工具：补推荐Profile、正反例、问题编译测试、模板可用性，再跑旧20工具回归；不用训练新模型作为默认前提。
- 当前ToolId在共享Schema中是20项封闭枚举。第21项必须同步更新packages/contracts、tool-config、Prompt/推荐目录、OpenAPI及Python生成契约，并按受控发布顺序部署；不是只在JSON追加一个ID便兼容旧服务。
- 同工具多个模板：初期可先用工具级候选召回，再在工具内选模板；返回prompt_id/version仍不变。对不具不同视觉前置条件的同工具模板可复用内部适配判断，但需校验语义一致，不能仅看tool_id相同就共享。
- 50候选是当前v1请求硬上限。目录可超过50；在不改wire的情况下先用经过评测的确定性/轻量召回产生≤50候选，再做精排。必须报告召回recall@K和覆盖，不能称为全库评分。
- 真正需要>50评分或多图上下文时提新契约版本，先部署兼容接收方，再按配置切调用方；不能让旧严格Schema偷偷接受新字段。

## 6. 模型替换与evaluation

固定ScoringBackend内部职责：输入已验证图像、QuestionSpec集合、deadline和bundle；输出原始typed answers、题目计时及资源诊断。它不能知道用户余额、编辑供应商任务或任意执行Prompt。D3MiniBackend、将来的d3其他规模/Engine后端或其他视觉决策模型各实现相同职责；compiler、calibrator、ranker与backend分别版本化。

更换模型时同时比较：每工具/主体分组Precision@3与禁忌率、coverage/拒选、Top-K稳定性、概率校准、20/35/50题的p95、显存/并发/超时和共享主机干扰。数据按同一人物/场景分组划分，冻结测试集不用于调阈值。通用榜单和单张好例均不能替代项目evaluation。

候选bundle先离线/合成契约验证，再授权样本盲评，再真实压测；灰度按request_id稳定分桶，旧新bundle都匹配同一catalog与候选集合。回滚恢复完整bundle及阈值，不能只换权重或在一次请求中混合两版分数。
