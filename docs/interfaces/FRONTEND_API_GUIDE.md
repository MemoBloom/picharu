# 前端接口接入规范 v1.0.0

更新：2026-10-20。状态：依据当前 Web 路由、共享 Schema 和 OpenAPI 整理的前端接入视图，可用于开始前端开发；不是新的平行协议。本轮仅输出文档，不开发前端或修改后端行为。

权威来源：[统一接口协议](INTERFACE_SPEC_V1.md)、[可导入 OpenAPI](openapi.json)、[可执行 Schema](../../packages/contracts/src/index.ts)、[当前路由](../../apps/web/src/server/router.ts)。业务字段变化应先同步这些来源，再维护本文。

页面数量、入口与跳转提案见 [前端页面与跳转设计](../../../../docs/product/FRONTEND_PAGE_MAP.md)。其中 /ja/... 为拟开发的页面路由，不是本规范承诺已实现的 /api 路由。

## 1. 当前可用边界

- Web API 首轮代码已实现并经过本地测试，真实 Vercel/Supabase/R2/Stripe 环境仍需配置和联调。
- Cloud Run Worker 未实现，GPU 推荐服务未部署；生成默认关闭。没有可供前端直接连接的已上线生产域名。
- GENERATION_ENABLED=false 时，GET /api/tools 返回 20 项，但 available 全为 false；新 POST /api/edit 返回 503 GENERATION_DISABLED。已有任务同键重放仍可返回旧任务。
- 推荐仅从当前可用的单图工具选择候选。因此默认全部关闭时，推荐为 source=fallback、recommendations=[]，不能假造推荐卡片。
- 套餐初始为空、新用户积分为 0；不要在前端写死生产套餐、赠送额度或模型费用。
- 下文 JSON 均为结构示例，ID/金额/积分/图片尺寸是假设值；成功创建任务、返回收费套餐和有推荐结果的示例以真实配置已启用为前提，不是现网结果。

## 2. 基础约定和登录

| 项目 | 规则 |
|---|---|
| Base URL | 同一个 Next.js/Vercel 应用使用相对路径 /api/...；本地默认 http://localhost:3000 |
| 数据格式 | JSON、UTF-8、snake_case；POST JSON 带 Content-Type: application/json |
| 认证 | 私有接口带 Authorization: Bearer <Supabase access_token> |
| 请求追踪 | 可选 X-Request-ID，必须 UUID；响应总有 X-Request-ID 和 X-Contract-Version: 1.0.0 |
| 缓存 | 当前响应 Cache-Control: no-store；不要持久缓存签名 URL 或用户余额 |
| ID/时间 | 资源 ID 为 UUID；时间为 UTC ISO8601 字符串 |
| 空值 | null 与缺省不同；保持响应中的 null，不转成字符串或虚构默认值 |
| 请求大小 | JSON 上限 16KiB；文件本体通过 R2 PUT，不放进业务 JSON |
| 请求校验 | 未声明的额外请求字段会被拒绝；不能提交 user_id、价格、模型 ID 或完整执行 Prompt |

登录、退出、邮箱验证、Google OAuth 和 token 刷新由 Supabase Auth SDK 完成。当前没有 /api/login、/api/register、/api/refresh 路由，cookie 本身不作为 API 认证。浏览器只能使用 Supabase 公共 URL/publishable key，不接触 service_role。

收到 401 时由 SDK 检查/刷新会话，取得新 token 后原请求最多重试一次；仍失败则进入登录流程，避免循环。请求开始前先取得有效会话，禁止请求端自行提交或猜测 user_id。

当前按同源集成设计，不提供任意跨域 CORS；若前端另设域名，需要另行设计并实现跨域策略，不能假定已支持。

## 3. 接口总表

共 18 个公开 Web 操作，其中 17 个面向浏览器，1 个仅供 Stripe 调用。`{id}` 替换为真实 UUID。

| 方法 | 路径 | 登录 | 成功 | 前端用途 |
|---|---|---|---|---|
| GET | /api/health | 否 | 200 | 进程健康，不代表外部服务就绪 |
| GET | /api/tools | 否 | 200 | 工具目录、参数、能力和展示价格 |
| GET | /api/me | 是 | 200 | 当前用户 |
| POST | /api/images/upload-url | 是 | 201 | 申请图片上传 |
| POST | /api/images/complete | 是 | 200 | 上传后校验并固定图片 |
| GET | /api/images/{id} | 是 | 200 | 图片信息和预览链接 |
| GET | /api/images/{id}/download | 是 | 200 | 获取附件下载链接 |
| DELETE | /api/images/{id} | 是 | 200 | 删除图片 |
| POST | /api/edit | 是 | 202 | 创建编辑任务并预留积分 |
| GET | /api/jobs | 是 | 200 | 编辑历史分页 |
| GET | /api/jobs/{id} | 是 | 200 | 查询任务状态 |
| POST | /api/jobs/{id}/cancel | 是 | 200 | 取消 queued 任务 |
| POST | /api/recommend | 是 | 200 | 已完成上传的图片推荐 |
| GET | /api/credits | 是 | 200 | 当前可用/预留积分 |
| GET | /api/credit-packages | 否 | 200 | 当前活跃积分套餐 |
| POST | /api/checkout | 是 | 200 | 创建或复用 Stripe Checkout |
| GET | /api/orders | 是 | 200 | 订单历史分页 |
| POST | /api/stripe/webhook | Stripe 签名 | 200 | 浏览器不调用；服务端处理支付事实 |

未列出的 GET /api/images（图片列表）、GET /api/orders/{id}、按 session_id 查询订单、SSE、WebSocket、上传前推荐、批量任务查询和取消 processing 都没有实现。历史页从 jobs 读取，按其中图片 ID 获取图片详情；不能自行约定不存在的接口。

## 4. 健康、当前用户与工具目录

### GET /api/health

无请求体。响应：

```json
{"status":"ok","contract_version":"1.0.0"}
```

### GET /api/me

无请求体。响应：

```json
{"user_id":"00000000-0000-4000-8000-000000000001","email":"user@example.invalid","locale":"ja"}
```

email 可为 null。locale 当前固定 ja，不代表已有用户语言偏好修改接口。

### GET /api/tools

响应 `{ "tools": ToolView[] }`，当前 20 项。下面是默认未配置生成模型时的一项，实际列表由服务端返回：

<!-- schema-example: ToolView -->
```json
{
  "tool_id":"illustration_photo",
  "name_ja":"写真をイラスト化",
  "name_zh":"照片插画化",
  "category":"插画趣味",
  "tool_version":1,
  "minimum_input_count":1,
  "maximum_input_count":4,
  "allowed_roles":["primary","subject_reference","background_reference","style_reference","identity_reference"],
  "prompt_id":"illustration_photo_default",
  "prompt_version":1,
  "evaluation_state":"unverified",
  "available":false,
  "unavailable_reason":"GENERATION_DISABLED",
  "parameter_fields":[
    {"name":"style","type":"enum","required":false,"values":["natural","anime","watercolor","line_art","chibi","studio","cinematic"]},
    {"name":"strength","type":"enum","required":false,"values":["subtle","balanced","strong"]}
  ],
  "output_options":{"qualities":[],"aspect_ratios":[]},
  "credit_cost":{"standard":null,"high":null}
}
```

前端规则：

- 根据 available 决定生成按钮是否可用，不能因为目录有工具就认为模型已接通。unavailable_reason 当前为 GENERATION_DISABLED 或 UNSUPPORTED_CAPABILITY，未来未知值用通用不可用提示。
- evaluation_state 当前只有 unverified；不在 UI 声称全部效果已经通过质量验收。
- 参数控件来自 parameter_fields，输入数量/角色、质量、比例来自对应字段，不通过工具名推断模型能力。
- credit_cost 为展示用配置；null 表示未配置，不能当成 0 或免费。真正费用仍由任务创建时服务端冻结。
- parameter_fields 尚无 label_ja、placeholder、帮助文案、默认值、逐字段错误详情；前端需要按字段建立日语展示映射。不要把希望增加的字段当作当前接口已返回。
- category 是展示文本，不是稳定枚举；标签和筛选需要容忍新增值。工具数量不能在 UI 布局中写死为永久 20 项。

## 5. 上传、预览、下载与删除

### 第一步：POST /api/images/upload-url

请求：

<!-- schema-example: UploadRequest -->
```json
{"mime_type":"image/jpeg","bytes":102400}
```

mime_type 仅 image/jpeg、image/png、image/webp；bytes 为正整数，必须等于实际 File.size，最大 20,971,520（20MiB）。HEIC、GIF、动画首版不支持；解码上限 24M 像素，服务端仍会验证真实内容。

响应 201：

<!-- schema-example: UploadResponse -->
```json
{
  "image_id":"00000000-0000-4000-8000-000000000101",
  "upload_url":"https://storage.example.invalid/signed-put",
  "expires_at":"2026-10-20T02:05:00.000Z",
  "required_headers":{"Content-Type":"image/jpeg","Content-Length":"102400"}
}
```

expires_at 此处是 PUT 链接有效期，默认 5 分钟。重复申请会创建新的上传记录，不具有编辑任务式的同键复用。

### 第二步：直接 PUT 文件到 upload_url

上传原始 File/Blob；不使用 FormData，不 JSON/base64 编码，不带 Supabase Authorization。不在拿到签名后改变图片类型、压缩或重编码；若需转换，先转换再以新文件的真实类型和长度申请链接。

浏览器不能手动设置 Content-Length，须用确定长度的 File/Blob 让浏览器自动生成。示意（浏览器上传片段，不是已经新增的客户端模块）：

```typescript
const result = await fetch(upload.upload_url, {
  method: 'PUT',
  headers: { 'Content-Type': upload.required_headers['Content-Type'] },
  body: file
});
if (!result.ok) throw new Error('Upload failed');
```

R2 PUT 的响应不是项目 ErrorEnvelope，通常无业务 JSON。真实浏览器与 R2 的 CORS/长度签名仍需联调；签名链接失效时按上传流程重新申请，不能拼接永久图片 URL。

### 第三步：POST /api/images/complete

请求：

<!-- schema-example: ImageCompleteRequest -->
```json
{"image_id":"00000000-0000-4000-8000-000000000101"}
```

响应 200，即 ImageView：

<!-- schema-example: ImageView -->
```json
{
  "image_id":"00000000-0000-4000-8000-000000000101",
  "status":"ready",
  "mime_type":"image/png",
  "bytes":180000,
  "width":1200,
  "height":800,
  "preview_url":"https://storage.example.invalid/signed-preview",
  "expires_at":"2026-10-27T02:00:00.000Z"
}
```

只有 complete 成功并 ready 后才能推荐/生成；PUT 成功不代表图片已验证。服务端会纠正方向、去除元数据并转成固定 PNG，所以 mime_type、bytes 可能与原 File 不同。重复 complete 返回第一次固定版本，不能用旧 PUT 改写 ready 图片。

ImageView 的 expires_at 是资产保留期限，与上传链接有效期不同，默认配置为 7 天。它不表示 preview_url 的有效期；preview_url 是短签名链接，过期后重新 GET 图片详情刷新。preview_url 当前对应分析缩图，不保证原图分辨率。

### GET /api/images/{id}

响应同 ImageView。status 可为 uploading 或 ready；未完成时尺寸和 preview_url 可为 null。已删除、过期或他人资源返回 404，不泄露其是否存在。前端可用本地 object URL 显示刚选择的文件，服务端预览以返回字段为准。

### GET /api/images/{id}/download

仅 owned ready 图片。响应：

<!-- schema-example: DownloadResponse -->
```json
{"download_url":"https://storage.example.invalid/signed-download","expires_at":"2026-10-20T02:05:00.000Z"}
```

download_url 有效约 5 分钟，按附件方式下载；失效时重取。不能将签名链接当永久作品 ID。

### DELETE /api/images/{id}

无请求体。响应：

<!-- schema-example: DeleteImageResponse -->
```json
{"image_id":"00000000-0000-4000-8000-000000000101","status":"deleted","cleanup_pending":false}
```

重复删除可复用。cleanup_pending=true 仍表示对外已删除，仅物理清理待重试；UI 不得恢复显示。被 queued/processing 使用时返回 409 IMAGE_IN_USE；先取消 queued 任务或等任务终止。删除不等于自动取消任务。已发出的短签名链接不承诺瞬间撤销所有缓存。

## 6. 编辑请求、工具参数与幂等

### POST /api/edit

请求：

<!-- schema-example: EditRequest -->
```json
{
  "tool_id":"illustration_photo",
  "inputs":[{"image_id":"00000000-0000-4000-8000-000000000101","role":"primary"}],
  "prompt_id":"illustration_photo_default",
  "parameters":{"style":"watercolor","strength":"balanced"},
  "user_instruction":"背景の雰囲気を残してください。",
  "output":{"quality":"standard","aspect_ratio":"preserve"},
  "idempotency_key":"edit_20261020_example_0001"
}
```

| 字段 | 规则 |
|---|---|
| tool_id | 必填；当前工具 ID，不能自由发明 |
| inputs | 必填；1–4 张，不得重复 image_id，第一张且只有一张 primary |
| inputs[].role | primary、subject_reference、background_reference、style_reference、identity_reference；还须在工具 allowed_roles 内 |
| prompt_id | 可选；选择工具返回的 prompt_id，不自行拼模板名 |
| parameters | 可选，默认 {}；按具体工具白名单校验，不能传任意模型参数 |
| user_instruction | 可选，默认空字符串，最多 1000 字符；不能代替必填 tool_id |
| output.quality | 可选，默认 standard；只能从工具 output_options.qualities 选 |
| output.aspect_ratio | 可选，默认 preserve；只能从工具 output_options.aspect_ratios 选 |
| parent_job_id | 可选；仅用于继续编辑，不能传 null 代替缺省 |
| idempotency_key | 必填；16–128 字符，仅英文字母、数字、下划线、连字符 |

output 理论枚举：quality 为 standard/high；比例为 preserve、1:1、3:4、4:3、16:9、9:16。模型当前未支持的值即使在总枚举中也不能提交；不要在 default 不受支持时直接省略字段。

所有输入必须属于本人、ready、未过期。multi_photo_composite 最少 2 张，其余当前最少 1 张，最大实际张数读工具配置。多图示例：

<!-- schema-example: EditRequest -->
```json
{
  "tool_id":"multi_photo_composite",
  "inputs":[
    {"image_id":"00000000-0000-4000-8000-000000000101","role":"primary"},
    {"image_id":"00000000-0000-4000-8000-000000000102","role":"subject_reference"}
  ],
  "parameters":{"composition":"2人が並んだ記念写真"},
  "idempotency_key":"edit_composite_example_0001"
}
```

成功响应 202：

<!-- schema-example: EditAccepted -->
```json
{"job_id":"00000000-0000-4000-8000-000000000201","status":"queued","credits_reserved":3,"replayed":false}
```

202 只表示持久化任务并预留积分，不能直接显示“生成成功”。credits_reserved 是该任务冻结的预留数，终态后此字段仍作为历史记录保留；不是账户当前 reserved 总额。

幂等规则：用户确认一次生成意图时创建一个 key，保留请求内容。网络超时、401 刷新后重试、响应丢失均使用同一 key 和同一请求。用户修改参数、输入、选择新的生成或“再生成一次”时创建新 key。

同用户同键同请求返回原 job_id、原费用，replayed=true；返回 status 可能已为 processing 或终态。不要把重放当新 queued。相同 key 修改请求返回 409 IDEMPOTENCY_CONFLICT。不要因为请求超时就在本地认定生成未发生，也不要换 key 自动重复提交。

### 当前 20 工具与参数白名单

下表为当前参数名称，不替代运行时工具目录。全部参数目前可缺省，但 remove_person/remove_object 至少需要非空 parameters.target 或非空 user_instruction。text 参数 trim 后长度 1–500 字符；未知参数返回 400。

| tool_id | 中文用途 | parameters |
|---|---|---|
| remove_person | 去除路人 | target:text |
| remove_object | 去除杂物 | target:text |
| change_background | 更换背景 | background:text, strength |
| photo_color_grade | 照片调色 | style, strength |
| weather_season | 天气/季节 | weather:sunny/rain/snow/cloudy, season:spring/summer/autumn/winter, strength |
| light_time | 光线/时间 | time:morning/day/sunset/night, strength |
| ai_avatar | 社交头像 | style, composition:text |
| natural_beauty | 自然美化 | target:text, strength |
| hair_color | 发色 | target:text, color:text, strength |
| hairstyle | 发型 | target:text, hairstyle:text |
| professional_headshot | 职业头像 | background:text, outfit:text |
| anime_photo | 动漫化 | style, strength |
| illustration_photo | 插画化 | style, strength |
| chibi_person | Q版人物 | style, target:text |
| pet_illustration | 宠物插画 | style, target:text |
| pet_humanization | 宠物拟人 | style, outfit:text, mode:costume/human_character |
| multi_photo_composite | 多图合成 | composition:text |
| product_background | 商品背景 | background:text |
| room_redesign | 房间改造 | style:text, preserve:text |
| clothing_recolor | 衣服改色 | target:text, color:text, strength |

除 room_redesign.style 为自由 text 外，表中 style 枚举为 natural/anime/watercolor/line_art/chibi/studio/cinematic。strength 为 subtle/balanced/strong，不是 0–1 数值。表单显示可以本地化，提交值保持原枚举。

## 7. 任务状态、轮询、历史与继续编辑

### GET /api/jobs/{id}

响应 JobView：

<!-- schema-example: JobView -->
```json
{
  "job_id":"00000000-0000-4000-8000-000000000201",
  "tool_id":"illustration_photo",
  "status":"queued",
  "stage":"queued",
  "inputs":[{"image_id":"00000000-0000-4000-8000-000000000101","role":"primary"}],
  "parent_job_id":null,
  "result_image_id":null,
  "credits_reserved":3,
  "error_code":null,
  "created_at":"2026-10-20T02:00:00.000Z",
  "completed_at":null
}
```

| status | 前端显示和行为 |
|---|---|
| queued | 等待处理，可申请取消 |
| processing | 正在处理，当前没有保证可取消的接口 |
| completed | 可按 result_image_id 获取图片与下载；刷新余额 |
| failed | 展示失败信息，刷新余额；再次生成是新用户意图、新 key |
| cancelled | 已取消，刷新余额；停止查询 |

status 是稳定枚举；stage 是字符串，当前没有冻结为前端穷举枚举。UI 可做已知阶段文案映射，未知 stage 按 status 显示通用状态，不崩溃、不编造百分比。error_code 为 string|null，未来任务执行错误须容忍未知值；当前没有字段级错误列表或保证的最终错误码全集。

建议的客户端轮询策略（前端实现建议，不是后端 SLA）：仅查询当前前台活跃任务，约 3–5 秒一次；隐藏页面暂停，长等待逐步退避；终态停止，429 遵循 Retry-After。多个任务需控制合计请求量，优先轮询当前打开的任务，历史页按需刷新。现有 API 没有推送连接或批量任务状态接口。

浏览器请求超时、关闭页面、AbortController 中断 fetch，都不等于服务器取消任务。刷新后可从 jobs 历史恢复。不要自动重发 edit 来“轮询”，也不能因 Worker 尚未接通就给 queued 任务计时模拟 completed。

### POST /api/jobs/{id}/cancel

空请求体，不必带 Content-Type。成功 200 返回完整 JobView，status=cancelled。重复取消已经 cancelled 的任务可复用；processing/completed/failed 返回 409 JOB_NOT_CANCELLABLE。若与 Worker 领取竞争，以服务端实际返回为准。取消成功后刷新 credits；释放由服务端事务完成，前端不自己计算加回。

### GET /api/jobs?limit=20&cursor=...

响应 `{items:JobView[],next_cursor:string|null}`。limit 默认 20，范围 1–50。按创建时间和 ID 倒序；next_cursor 原样传入 URLSearchParams，不手工构造或修改，不用 page=2、offset=20 替代。next_cursor=null 表示本轮没有下一页；刷新第一页时重置旧游标。

```json
{"items":[],"next_cursor":null}
```

历史没有图片独立列表接口；按 job.inputs/result_image_id 取得所需图片详情，缓存 image_id 对应资料并按需刷新签名 URL，避免每秒重取所有历史项。

### 继续编辑

只允许已完成父任务：新 edit 传 parent_job_id，并把父任务的 result_image_id 作为第一张 primary。其他参考图仍按本人所有权验证。原图、前一次输入图不能冒充该父任务的结果；新任务用新 idempotency_key。

Worker 未实现之前没有真实 completed 结果可走此链路。界面可以开发并使用明确标注的契约 fixture，真实演示要等结果资产和 Worker 接通。

## 8. 图片推荐

### POST /api/recommend

请求：

<!-- schema-example: RecommendRequest -->
```json
{"image_id":"00000000-0000-4000-8000-000000000101","top_k":5}
```

top_k 可省略，默认 5，范围 1–5。只接受本人 ready 图片 ID，不接受任意图片 URL、base64、multipart 或未登录上传前图片。

回退响应示例（以存在可用工具为前提）：

<!-- schema-example: PublicRecommendation -->
```json
{
  "source":"fallback",
  "recommendations":[
    {"prompt_id":"illustration_photo_default","prompt_version":1,"tool_id":"illustration_photo","name_ja":"写真をイラスト化","score":null,"reason_code":"POPULAR_FALLBACK"}
  ]
}
```

模型响应 source=model，可额外含 model_version；score 为有限排序分，可以小于 0 或大于 1，不能乘 100 显示“成功率”。当前模型原因码为 VISUAL_MATCH/SUBJECT_MATCH，回退为 POPULAR_FALLBACK；UI 对未知 reason_code 显示通用推荐文案。

fallback 是配置目录顺序，不代表已计算真实热度，也不能显示“AI 已理解你的照片”。默认工具全关闭时返回空 recommendations；推荐空结果可引导浏览目录并显示不可用状态，不报图片已损坏。

推荐不扣积分，但需要完成上传且受频控。只推荐单图可执行候选，不含要求多图的合成。模型不可用会降级；图片未 ready、认证或存储/数据库错误仍可能返回非 200，不能把所有错误理解为必然 fallback。

## 9. 积分、套餐、Checkout 与订单

### GET /api/credits

响应：

<!-- schema-example: CreditView -->
```json
{"available":20,"reserved":3,"status":"active"}
```

available 是可新预留余额，reserved 是当前在途预留；不要把二者相加当成可用余额。status 为 active/restricted；限制账户应显示状态并阻止继续发起生成，但现有订单和历史仍按实际接口读取。任务创建、取消、终态和支付回跳后重新查询，不用前端内存作为资金账本。

### GET /api/credit-packages

响应 `{packages:CreditPackage[]}`，可以为空。以下是一项套餐示例，非真实定价：

<!-- schema-example: CreditPackage -->
```json
{"package_id":"00000000-0000-4000-8000-000000000301","credits":30,"amount_minor":500,"currency":"JPY"}
```

JPY 的 amount_minor=500 表示 500 日元，不除以 100。套餐价格由服务端维护；前端只展示和选择 package_id。

### POST /api/checkout

请求：

<!-- schema-example: CheckoutRequest -->
```json
{"package_id":"00000000-0000-4000-8000-000000000301","idempotency_key":"checkout_20261020_example_0001"}
```

响应 200：

<!-- schema-example: CheckoutResponse -->
```json
{"order_id":"00000000-0000-4000-8000-000000000401","checkout_url":"https://checkout.stripe.com/example"}
```

跳转 checkout_url，记录 order_id。网络重试复用同一 key；同键换套餐会冲突。用户明确新建另一笔购买才创建新 key，不能因暂时 pending 就自动创建新订单。服务端不接受前端金额、积分数量或回跳 URL。

当前 Stripe 配置的回跳页面，前端需要实现：

- 成功：/ja/billing/success?session_id=...。
- 用户退出付款：/ja/pricing。

回跳页面不能增加积分或假定成功。session_id 是 Stripe 会话 ID，不能直接作为 order_id；当前没有按 session_id 查询订单接口。优先用跳转前保存的 order_id 在 GET /api/orders 中匹配，丢失本地记录则展示订单历史并等待用户选择，不猜测“最近一单”必为本次支付。

回跳后适度轮询 orders 和 credits，等待 Webhook 更新；超过前端等待预算显示“支付状态确认中”，保留刷新入口，不能改成失败或再次扣款。Stripe 的取消回跳不表示订单已被服务端取消，pending 也不等于支付失败。

### GET /api/orders?limit=20&cursor=...

分页结构同 jobs：`{items:OrderView[],next_cursor:string|null}`。一项订单示例：

<!-- schema-example: OrderView -->
```json
{
  "order_id":"00000000-0000-4000-8000-000000000401",
  "package_id":"00000000-0000-4000-8000-000000000301",
  "credits":30,
  "amount_minor":500,
  "currency":"JPY",
  "status":"paid",
  "refunded_minor":0,
  "created_at":"2026-10-20T02:00:00.000Z"
}
```

当前数据库订单状态为 pending/paid/partially_refunded/refunded/disputed；公开 Schema 的 status 是 string，前端要容忍后续未知状态。refunded_minor 为累计实际退款日元；订单 credits 是该单购买快照，不是退款后可消费余额，实际余额查 credits。

仅 Stripe 调用 POST /api/stripe/webhook。前端不构造签名、不提交“支付成功”请求，也不直接访问订单或积分写表。

## 10. 错误、频控与重试

统一非成功响应示例：

<!-- schema-example: ErrorEnvelope -->
```json
{"error":{"code":"INSUFFICIENT_CREDITS","message":"INSUFFICIENT_CREDITS","request_id":"00000000-0000-4000-8000-000000000501","retryable":false}}
```

| HTTP / code | 前端处理 |
|---|---|
| 400 INVALID_REQUEST / INVALID_PROMPT | 校验输入/刷新工具配置，不盲重试；目前没有逐字段错误 details |
| 401 UNAUTHORIZED | 刷新有效会话后最多重试一次，否则登录 |
| 402 INSUFFICIENT_CREDITS | 查询余额和套餐，引导购买；不要改小请求中的费用，因为费用不由客户端提交 |
| 403 ACCOUNT_RESTRICTED | 显示账户受限状态，不自动重建订单或任务绕过 |
| 404 NOT_FOUND | 图片/任务不存在、过期、已删或无权限；不提示他人资源是否存在 |
| 409 IMAGE_NOT_READY | 等待上传完成，必要时重试 complete |
| 409 IMAGE_IN_USE | 先取消 queued 任务或等待终态后删除 |
| 409 IDEMPOTENCY_CONFLICT | 检查是否错误复用了另一意图的 key，不自动换 key 重复生成 |
| 409 JOB_NOT_CANCELLABLE | 重新查任务，显示当前状态 |
| 409 UNSUPPORTED_CAPABILITY | 刷新工具能力，调整张数/角色/输出规格 |
| 413 INVALID_REQUEST | 请求或媒体过大，缩小后重新按上传流程申请 |
| 415 INVALID_REQUEST | JSON 接口 Content-Type 不正确 |
| 429 RATE_LIMITED | 按 Retry-After 秒数等待，停止自动密集重试 |
| 503 GENERATION_DISABLED | 显示生成暂不可用；不能模拟真结果 |
| 503 SERVICE_UNAVAILABLE / 500 INTERNAL_ERROR | 根据 retryable 和有限退避恢复；编辑/购买保持原 key |

业务 API 的 error.message 当前常为英文错误码，不直接作为最终日语用户文案；前端维护 code→日语映射，保留 request_id 供排障。支付签名类错误仅供服务集成，不做浏览器可修复表单错误。

当前认证用户所有私有请求共用 120 次/分钟频控，另有上传申请、complete、edit、recommend 各 10 次/分钟，checkout 5 次/分钟。为共享 PG 固定窗口；Retry-After 当前返回 60 秒，是等待建议，不是秒级精确剩余时间。多标签页/多个轮询合计计入上限。

不要对全部 5xx 自动无限重试；POST upload-url 不是幂等任务创建，edit/checkout 必须保留 key；取消和删除只对同一资源重试。request_id 只追踪请求，不替代 idempotency_key。

## 11. 前端接入与交付边界

前端在现有 apps/web 中开发，统一 API 客户端建议放 apps/web/src/lib/。共享类型可从 @picjp/contracts 的 Schema 用 z.infer/z.input 推导：传入参数可以省略默认字段，校验后的 z.infer 则包含默认值，不能混淆两者。无需为每个效果复制后端 Prompt 或模型参数。

同一仓库严格响应校验可使用当前 Zod Schema；独立部署/未来滚动升级时，新增响应字段兼容策略需要统一，避免前端 strict.parse 因新增字段直接导致整页失败。未知错误码/阶段/订单状态均保留通用展示。

后续前端需要实现、但当前后端没有替你完成的部分：登录会话与刷新、API 客户端、上传状态与失败恢复、参数日语文案、任务轮询、历史分页、支付回跳确认以及空态/限制/不可用状态。模拟 fixture 只用于明确标注的开发演示，不能当成真实编辑交付。

开始前端不必等待 Worker 实现；完整生成、结果下载和继续编辑的真实端到端验收需要 Worker、模型能力和结果资产接通。协议已定义的未来状态不代表当前环境已经能够产生这些状态。

## 12. 本次文档校验

2026-10-20：19 个带 Schema 标记的 JSON 示例通过当前共享 Schema 校验；18 个 Web 操作与现有 OpenAPI 匹配；20 工具参数表与工具配置逐项匹配。本轮仅修改文档及索引，没有修改应用行为或执行真实云端/模型调用。

## 双看板增量

个人控制台接口见[PERSONAL_CONSOLE](../backend/PERSONAL_CONSOLE.md)；管理员接口及8页面口径见[ADMIN_ANALYTICS](../backend/ADMIN_ANALYTICS.md)。字段以contracts与生成OpenAPI为准。管理员报表使用POST创建15分钟快照，所有页面/钻取/分页/导出复用report_id；明细table独立分页，订单/流水/退款/成本都须finance:read。浏览器认证请求支持expectedOwnerId，CSV必须Bearer fetch→Blob，禁止Token查询参数。新结果页下载按钮用POST+action_id，GET不计保存；粗粒X-Picjp-Device与埋点均不参与扣费事实。

管理员精确定位使用`POST /api/admin/users/resolve`，请求`{kind:"id"|"email",value:string}`，响应match为matched/not_found/ambiguous，仅matched有user_id/脱敏email_masked。不得将完整邮箱写入URL、分析筛选或审计；匹配后必须继续使用原report_id查询用户切片，404表示当前快照不含该账号，保持原统计并提示调整范围。接口与快照读取每次重验权限，403清空旧管理数据。
