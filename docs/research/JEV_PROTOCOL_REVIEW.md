# Decision Index 与 Decision 3.0 协议核查

日期：2026-10-20。用户依次提供 StartLux 仓库、Decision Index Space 和 Decision 3.0 集合；当前模型评估优先方向为 d3-mini。此文件区分“读到的协议”“实际本地转换测试”和“尚未完成的模型调用”。

补充：用户已确认先按d3-mini设计并授权SSH调查。固定revision、上游HTTP严格字段、noul和原生batch已从源码核实；纯图片按批推理，不承诺全请求只做一次视觉编码，见 [Lambda协议](../interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md) 与 [环境证据](LAMBDA_ENVIRONMENT_2026-10-20.md)。下方10项检查仍是之前的Decision Index转换试验，不是这次d3推理测试。

## 1. 这个 Space 能做什么

[Decision Index Space](https://huggingface.co/spaces/multimodalart/jev-decision-index) 的 README 标明 sdk:static；页面读取 data/index.json、data/v03.json、data/vision.json 等公开结果，未提供模型推理端点。浏览器直接打开时停留在Loading；本轮另实际下载并解析了公开页面和JSON，确认其开源评测入口为 [apolinario/decision-index](https://github.com/apolinario/decision-index)。

它与真正模型服务不是同一个东西：排行榜数据中的概率/时延是既有评测记录，不能提交本项目照片得到新推荐。本轮没有上传照片、提交评测、建立HF Job或运行完整数据集。

## 2. 几种协议的差别

| 层/路径 | 请求核心 | 响应核心 | 本项目处理 |
|---|---|---|---|
| Browser POST /api/recommend | owned ready image_id、top_k | 公开推荐source、模板、score、reason | 保持现有接口 |
| 项目内部 POST /v1/recommend | JevRequest v1：版本、request/catalog、规范JPEG、完整candidates、top_k | JevResponse v1：原ID/版本、排序分、原因、bundle版本 | 保持HMAC与严格校验，模型无关 |
| System One POST /v1/systemone | state、questions；支持视觉的实现加images；model由具体服务处理 | answers按问题key返回typed answer | d3官方Engine明确提供此路径 |
| POST /v1/decisions | 某些实现提供的System One别名 | 对应typed answers | StartLux支持；不能据此声称d3也支持同名路径 |
| POST /v1/decide | kind、state中image、question、options位置数组、thinking | choice_index、位置概率数组 | 是另一种协议，不能只改URL直接复用请求 |
| OpenAI chat/completions | messages里多模态content | 生成文本或logprobs | 不是天然System One概率接口，须另行适配 |
| 评测results.jsonl | run_id、status、payload、response、时延、来源 | 供scorer读取 | 不发给浏览器；gold expected/provenance不能进入推理输入 |

主要依据：[HTTP engine源码](https://github.com/apolinario/decision-index/blob/f5a6e4fd85fed05e77878dfc4966d0568bfb45ec/decision_index/engines/http.py)、[视觉engine源码](https://github.com/apolinario/decision-index/blob/f5a6e4fd85fed05e77878dfc4966d0568bfb45ec/decision_index/vision/engines.py)、[Vision说明](https://github.com/apolinario/decision-index/blob/f5a6e4fd85fed05e77878dfc4966d0568bfb45ec/docs/vision.md)。

### Choice、noul 与 Score

Choice回答在给定选项中做决策；适配器必须保持原始ID与概率分布的对应关系。noul回答一个独立yes/no问题，适合多项效果同时成立的情况。Score是有序档位判断，应固定档位含义，不当作任意自由数值输出。共同的结构化形式可作为内部适配基线，但选项限制、扩展字段、错误、认证和版本需逐实现核对。

本项目拟将每个效果的“照片适合作为该编辑输入吗”编译为独立noul，得到适配信号后排序。适配器须检查缺项、非有限概率和未知ID；输出仍是项目有限原因码，不透传完整判断文本或内部模型路径。

## 3. 实际完成的协议试验

读取上游vision/engines.py的已检查纯转换方法，仅提取single_choice、answer、HttpDecide.body/parse，在本地用合成fixture验证。没有执行模块顶层、构造HTTP客户端、加载模型或调用GPU；图片编码器用固定data URL替身。因此这是字段映射试验，不是照片理解或远程服务成功证据。

**10项断言通过**，详细记录：[JEV_PROTOCOL_CHECK_RESULTS.json](JEV_PROTOCOL_CHECK_RESULTS.json)。覆盖：

- decisions的typed questions＋images保留，扩展字段与decide字段分开；decide映射到kind/question/options/image-state。
- 视觉评测adapter拒绝多题、拒绝noul、拒绝非A/B/C字母keys。这是评测工具限制，d3模型卡本身支持多题和noul。
- 两种响应正确映射；另外复现评测parser在缺概率或异常数值时可能退为one-hot。该宽松兜底不能复制到生产推荐服务，否则会把缺数据伪装为确信判断。

所查kit当前普通http engine仅传state/questions，不传images；视觉评测必须选择相应vision engine。vision decide引擎使用protocol=decisions时可选择显式path=/v1/systemone对接d3，仍只接受单道字母Choice。生产多题noul应直接调用本项目adapter/模型API，不通过该视觉评测适配器。

## 4. d3-mini 的推荐接法

[官方模型卡](https://huggingface.co/vllm-sr/d3-mini)显示：AutoModel.system_one(state,questions,images)提供程序内路径；Semantic Router Engine提供POST /v1/systemone。两种后端都包装在Lambda推荐adapter内，Vercel不随模型实现变化改协议。

项目请求固定单张JPEG分析图，直接构造data URI；不接收任意URL、本机路径或视频。一次HTTP可有多个问题，但每题仍有自己的forward成本；同时记录图片大小、题数、批大小、后端版本与时延。

d3-mini模型卡的“一个调用问多个问题”不能被理解为20效果只需一次forward。上游模型或服务接受的think_mode/none_check等字段也不通用，首轮仅用已确认的公共字段。

完整机器方案、批次、截止/取消与回滚见 [Lambda设计](../architecture/JEV_LAMBDA_DESIGN.md)。

## 5. 评测复用范围

可以借用Decision Index的固定输入、来源版本、完整概率、answered/unsupported/error记录、覆盖率、校准和硬件时延分开统计的方法。本项目还必须有自己的20工具多标签适配数据，评价Top-K相关性、禁忌推荐、拒选和候选顺序变化；公开视觉选择题不能替代这些指标。

公开kit只能复现公开部分，不能独自重建未公开的Full score。其视觉预算和本项目768px缩图不同，报告必须注明实际分辨率，不把本项目结果冒充榜单标准结果。失败/不支持记录为失败，不能过滤掉后只报告成功样本的高分。

## 6. 仍未完成的在线验证

- 官方Decision 3.0演示导航的自动审批检查超时，没有获得实际模型答复；这不是“不安全”的判断。未绕过浏览器安全检查。
- 早期d3源码/revision查询超时；本轮已通过授权SSH只读取得固定revision和源码，此项调查缺口消除。未安装或运行这些源码，生产依赖和推理仍待验证。
- 未安装开发通道、下载权重、创建收费资源、联系任何作者或发送真实用户图片。

下一步在固定revision与机器条件后，先用合成/授权样本做程序内smoke test，再验证System OneHTTP、20候选延迟与取消、真实推荐evaluation。模型可行性当前来自官方说明与协议核查，尚未由本机推理证实。
