# 模块接口协议 v1.0.0

前端开发可先阅读 [前端接口接入规范](FRONTEND_API_GUIDE.md)：按浏览器流程整理请求/响应示例、状态、错误和未接通能力；该文是本协议的接入视图，不替代可执行 Schema 或另行定义接口。

2026-10-19。本文取代两包旧单图接口示例，是本轮 Vercel 实现和 Worker/JEV 设计的统一基线。人工可审阅架构取舍；Cloud Run 与 JEV 均未实现。可执行字段定义见 `packages/contracts/src/index.ts`，HTTP 全表由 `docs/interfaces/openapi.json` 导出。实现状态见 `docs/backend/VERCEL_BACKEND.md`；不得把接口已定义当作外部服务已运行。

## 1. 模块边界和实现顺序

- Browser：Supabase Auth SDK 完成邮箱/Google 登录及 token 刷新；向 BFF 提交 access token。初期不做游客生成，不自行合并同邮箱身份。
- Vercel Next.js Node Route Handlers：验证身份、输入/工具/能力、固定上传资产、服务端组装快照、创建持久任务与积分预留；状态/历史/下载/删除、JEV 代理和 Stripe。
- Supabase：Auth；PG 原子事务、RLS、持久任务、资产/输入关系、订单/账本。数据库初始余额为 0；无无限免费或未验证套餐价格。
- Worker：未来实现；从 PG 获取不可变快照，按阶段调用供应商并交付。此轮只设计，不在 Vercel 实现中伪造生成或假结果。
- JEV：未来实现；仅对候选评分。2026-10-20 用户确认先按d3-mini设计；固定模型revision及Lambda资源已只读核查，未运行推理。内部System One API由Lambda adapter转换，公开协议不变；完整[Lambda接口协议](../../../../docs/interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md)与[部署设计](../../../../docs/architecture/JEV_LAMBDA_DESIGN.md)供审阅，审阅后再传输云端。
- Vercel 只创建 queued 作业；初期 Worker 独立调度扫描 PG，不依赖 Web 发一次不持久请求。Worker 未上线前默认关闭新生成，接口测试可显式配置测试依赖。

## 2. 通用规范

JSON snake_case，UTF-8；UUID 资源 ID，UTC ISO8601 时间，费用单位为整数积分或货币最小单位。JPY 为整数日元。响应有 `X-Request-ID` 与 `X-Contract-Version: 1.0.0`；私有响应 `Cache-Control: no-store`。

浏览器私有 API：`Authorization: Bearer <Supabase access_token>`；服务端通过 Auth getUser 验证，不能只 decode JWT。v1 不读取浏览器可写 user_id，也不把 cookie 自动当认证；前端刷新 token 后重试一次。无跨域通配 CORS。Bearer 不隐式发送，避免 cookie CSRF。

错误 `{error:{code,message,request_id,retryable}}`；不返回数据库错误、密钥、storage_key、供应商任务/原始错误、完整 Prompt。400 INVALID_REQUEST/INVALID_PROMPT；413 INVALID_REQUEST（超字节上限）；415 INVALID_REQUEST（请求媒体类型错误）；401 UNAUTHORIZED；404 NOT_FOUND（包括别人的资源）；409 IMAGE_NOT_READY/IMAGE_IN_USE/IDEMPOTENCY_CONFLICT/JOB_NOT_CANCELLABLE/UNSUPPORTED_CAPABILITY；402 INSUFFICIENT_CREDITS；403 ACCOUNT_RESTRICTED；429 RATE_LIMITED（Retry-After）；503 GENERATION_DISABLED/SERVICE_UNAVAILABLE；500 INTERNAL_ERROR。retryable 仅表示稍后原请求可重试，不允许用户理解为供应商会被再次提交。

JSON 请求读取有字节上限，拒绝非法 Content-Type/超大流；修改路由使用持久 PG 频控，不能依赖单 Vercel 进程内存。关键 RPC 仅 service_role 可执行；RLS 限制用户直读自己的记录且不允许客户端直接写积分/任务。

## 3. HTTP 接口清单

| Method/path | 认证 | 请求 | 成功 |
|---|---|---|---|
| GET /api/health | 无 | 无 | 200 `{status:'ok',contract_version}`，不泄露配置 |
| GET /api/tools | 无 | 无 | 200 `{tools:[...]}`，20项，包含输入/参数/初期模板元数据、available 和不可用原因；不泄露模型/完整Prompt |
| GET /api/me | 用户 | 无 | 200 `{user_id,email,locale:'ja'}` |
| POST /api/images/upload-url | 用户 | `{mime_type,bytes}` | 201 `{image_id,upload_url,expires_at,required_headers}` |
| POST /api/images/complete | 用户 | `{image_id}` | 200 ImageView，第一次规范化并固定；重复完成返回已固定版本 |
| GET /api/images/:id | 用户 | UUID | 200 ImageView，preview_url 短签名；不返回原键 |
| GET /api/images/:id/download | 用户 | UUID | 200 `{download_url,expires_at}`，私有固定版本，签名附件下载 |
| DELETE /api/images/:id | 用户 | UUID | 200 `{image_id,status:'deleted',cleanup_pending:boolean}`；重复删除幂等 |
| POST /api/edit | 用户 | EditRequest，下节 | 202 EditAccepted，重试也为202且replayed=true |
| GET /api/jobs | 用户 | `limit 1..50,cursor?` | 200 `{items:JobView[],next_cursor:string|null}` |
| GET /api/jobs/:id | 用户 | UUID | 200 JobView，无后台Prompt或供应商参数 |
| POST /api/jobs/:id/cancel | 用户 | UUID，空body | 200 JobView；只有queued可保证取消并释放 |
| POST /api/recommend | 用户 | `{image_id,top_k?:1..5}` | 200 PublicRecommendation，可明确fallback |
| GET /api/credits | 用户 | 无 | 200 `{available,reserved,status:'active'|'restricted'}` |
| GET /api/credit-packages | 无 | 无 | 200 `{packages:[{package_id,credits,amount_minor,currency:'JPY'}]}`；可为空 |
| POST /api/checkout | 用户 | `{package_id,idempotency_key}` | 200 `{order_id,checkout_url}`，套餐服务端读取 |
| GET /api/orders | 用户 | 同jobs分页 | 200 `{items:[公开订单视图],next_cursor}` |
| POST /api/stripe/webhook | Stripe签名 | 原始body | 200 `{received:true}`；签名错400；暂时故障5xx供Stripe重试 |

分页按 created_at DESC,id DESC 键集排序，cursor为 `<UTC timestamp>|<uuid>`；每次多取一条决定next_cursor。私人查询始终附owner，不使用客户端提供的owner。历史不单建重复表，GET jobs/images既提供历史基础。

## 4. 上传、输入资产与删除

允许 JPEG/PNG/WebP，最大20MiB，解码最大24M像素，拒绝多帧/损坏输入；手机HEIC首版明确不支持并要求转换，不能假称支持。签名PUT有效5分钟，绑定Content-Type与Content-Length，原图直接到私有R2暂存键。required_headers返回两者；浏览器按Blob/File实际长度自动生成Content-Length，JS不得手动设置该禁用头。

complete 检查实际字节、声明类型与文件头解码，EXIF方向归正、sRGB、移除位置等元数据，固定为PNG工作图并生成最大768px JPEG分析图（上限1MiB）；规范输出另有32MiB限额。由服务端计算SHA256，规范键仅服务端可写；不把客户端可重用PUT键标为ready。下载和推荐仅用固定版本。

上传记录含declared_bytes、declared_mime、expires_at；ready记录含规范尺寸/字节/类型/hash和预览键。输入/结果保留期限由部署配置，初始7天为实现默认值、非既定法律承诺；上线需确认用户文案与供应商政策。过期资源拒绝访问/建任务；对象生命周期用于清理暂存，规范图/结果必须有定期清理任务（设计在Worker文档）。

DELETE先PG tombstone再删除对象；对象删除失败标cleanup_pending供重试，不能恢复对外读取。若图片被queued/processing任务使用，返回409 IMAGE_IN_USE，用户可先取消queued任务或待终止后重试；此限制须在UI说明。完成结果/输入可独立删除，不自动级联删除其他用户作品或整条版本链。

## 5. 编辑协议和20工具能力

EditRequest：`{tool_id,inputs:[{image_id,role}],prompt_id?,parameters?,user_instruction?,output?,parent_job_id?,idempotency_key}`。

- 20个当前ID在可执行Schema枚举；这不是数据库或长期产品数量上限，新增效果可升级配置与Schema次版本。
- inputs 1..4，顺序稳定且第一张唯一primary；其他role为subject_reference/background_reference/style_reference/identity_reference。不得重复image_id。多图合成最少2张；其他工具初期单图即可，其附加参考能力只在模型明确验证后启用。
- 所有输入属于当前用户、ready且未过期/删除；每张的角色/张数须同时满足工具与服务端模型profile。
- parameters按工具白名单验证，如style、target、color、strength、weather、season、time、background、hairstyle、outfit、composition等；非法参数拒绝，不能静默穿透为供应商参数。strength仅为产品语义，不伪装成模型真实数值控制。
- output `{quality:'standard'|'high',aspect_ratio:'preserve'|'1:1'|'3:4'|'4:3'|'16:9'|'9:16'}`；未支持规格在预留前拒绝。
- parent_job_id若存在必须同用户completed，且primary必须等于该任务的result_image_id；另附的原始参考图仍需独立校验。
- 服务端选择已配置/验证的模型profile，包含精确model_id、provider、adapter_version、verified_tool_ids、允许角色/张数、输出能力及pricing_version/积分。
- final_prompt、工具/模板/模型/参数/执行/计价版本、输入集合均进入不可变快照；初期execution_type=commercial_edit、execution_version=1。未来可新增CPU/受控处理类型，Worker 执行代码在独立 picjp-worker 仓库。
- 初期20模板均标未评测，不直接当成成熟效果。GENERATION_ENABLED默认false；必须配置真实验证的模型profile和明确启用后才能接收用户生成，不靠假模型/假费用过关。

同用户幂等键16..128字符，同键同规范化请求复用任务；同键不同输入/参数409。同键不同用户隔离。请求hash来自归一化用户请求，不包含会变化的当前模型/价格；重放必须复用原快照和费用，不因新默认模型而变化。

首请求的全部输入校验、创建job、inputs关系、余额预留与流水在同一个PG事务完成。并发请求借用户事务锁/唯一约束收敛；余额不得负。初始余额0，免费赠送由单独受控运营政策实现，不在注册接口自动加钱。

## 6. 任务状态、取消与Worker边界

对外queued→processing→completed/failed；queued可→cancelled。终态不可回到运行态；public completed只在固定结果已保存、归属已登记、预留已消费时出现。stage仅用于展示可靠阶段，不伪造百分比。error_code为稳定公开枚举或null。

内部stage建议 queued,submitting,waiting_provider,storing,settling,needs_reconciliation,done。认领带lease_token和lease_expires_at，阶段写回均校验当前领取版本，过期旧Worker不能覆盖新Worker结果。

Cloud Run 内部接口（已有本地实现，尚未部署）：POST /internal/v1/drain `{contract_version,limit?:1..20}`（认证调度），POST /internal/v1/process-job `{contract_version,job_id}`（可选快速触发），GET /health（无敏感信息）。工作必须在受认证请求生命周期内完成一个有界阶段并保存checkpoint。响应WorkerAck为 `{contract_version,request_id,processed:0..20,remaining:boolean}`，processed统计已持久化阶段，process-job只能0/1，drain不超过limit；健康探针返回 `{status:'ok',contract_version:'1.0.0'}`。Google IAM/OIDC ID token audience为服务URL，分别授权scheduler/dispatcher服务账户。Vercel初期不持有Google长期私钥，也不依赖fire-and-forget。

Worker使用PG受控RPC：worker_claim_jobs、worker_record_submission、worker_defer_job、worker_complete_job、worker_fail_job、worker_mark_uncertain。具体参数、权限、状态/故障表与租约时序由Worker设计文档列出；增量 migration 202610200400_worker.sql 已实现执行函数，尚未应用到云环境。当前落实及明确差异见 [Worker 接口评审](WORKER_INTERFACE_REVIEW.md)。Web RPC创建的快照是唯一生成语义来源，Worker不能重新从模板库编译。

供应商受理后响应丢失：先查幂等/请求号，无法确认则needs_reconciliation，禁止盲重提交。保存失败只重试保存；R2与PG没有跨系统事务，结果对象幂等保存后PG原子settle。超出恢复期限时按失败释放并记录平台损失；晚到结果不可在已释放后自动补扣。

## 7. JEV协议

本节保持当前1.0.0可执行字段；字段逐项说明、错误/认证、完整bundle语义、catalog与候选子集hash区别、固定d3实际输入输出及尚未实现的校验见 [Lambda推荐接口协议](../../../../docs/interfaces/LAMBDA_RECOMMENDATION_PROTOCOL.md)。本轮只完善设计，不改Schema或导出器。

初期Browser仅提交owned ready image_id，Vercel从私有JPEG分析图取数据；不接受用户URL，也不向Lambda暴露原图读写凭证。当前先完成上传再推荐，上传前缩图并行推荐属于后续优化，不在v1伪实现。

POST /v1/recommend 请求：`{contract_version:'1.0.0',request_id,catalog_revision,image:{encoding:'base64',media_type:'image/jpeg',data,width,height},candidates,top_k}`。JPEG≤1MiB、最长边≤768；候选1..50、top_k1..5。每项包含prompt_id/version、tool_id、name_ja、intent、category、适用主体、正负条件、预期、minimum_input_count和required_input_roles。候选只含推荐资料，不含完整执行Prompt。

Vercel按配置可用和当前输入条件预过滤，不用单图推荐一个可立即执行的多图任务。响应`{contract_version,request_id,catalog_revision,model_version,inference_ms,recommendations:[{prompt_id,prompt_version,score,reason_code}]}`；reason_code=VISUAL_MATCH或SUBJECT_MATCH。score是有限排序数值，不要求0..1也不是成功概率。ID/version/catalog/request必须匹配且无重复，结果项不得超过top_k；不合法或超时触发fallback，不把无关ID透传给客户端。

TLS+共享HMAC认证：X-Service-Timestamp为Unix秒，X-Service-Signature为HMAC-SHA256(secret, `POST\n/v1/recommend\n<timestamp>\n<sha256(exact_body)>`)的hex。校验时钟偏差≤60s和常数时间比较；HTTPS、服务token独立于浏览器。重放窗口内只做无副作用评分，限流和request_id去重仍应实现。

public返回`{source:'model'|'fallback',model_version?,recommendations:[{prompt_id,prompt_version,tool_id,name_ja,score:number|null,reason_code}]}`。fallback必须score=null并标POPULAR_FALLBACK，不假装视觉分析；无可用工具返回空数组。JEV错误不扣积分。

## 8. 订单和支付

credit_packages服务端表定义活跃套餐，初始无生产套餐。用户提交package_id及幂等键；PG冻结金额、币种、积分数量，创建pending订单。Stripe session使用order_id为幂等键，metadata只含order_id/user_id；仅允许配置APP_ORIGIN的成功/取消URL。响应丢失重试复用同订单/session。

Webhook必须验证原始字节签名，再从Stripe重新获取Checkout Session、PaymentIntent/latest Charge确认真实paid状态、币种、金额、payment_intent、metadata与已有订单对应。checkout.session.completed和async_payment_succeeded均可触发同一PG入账函数；原子事件去重+订单paid+credit ledger+余额，一笔订单只发一次积分。同一入账事务应用当前Charge累计退款/争议事实，不暴露可消费的中间余额。异步失败/过期不给积分。

charge.refunded（累计退款金额）与dispute事件独立处理：按累计退款比例向上取整撤回权益，事件幂等，不重复撤回；不足撤回的已消费权益不制造负余额，账户restricted并留人工对账记录。拒付冻结账户；支付事实和退款事实不可被后来的重复paid事件重置。具体表/RPC见配套数据库迁移和后端文档。服务端不提供自动真实退款发起接口，退款由Stripe已授权运营流程执行后回传事件。

## 9. 本轮Web数据库RPC

全部RPC仅service_role执行，p_user_id由已验证Auth会话提供：

- app_consume_rate_limit(p_key,p_limit,p_window_seconds) → boolean。
- app_create_upload(p_user_id,p_image_id,p_mime_type,p_bytes,p_temp_key,p_expires_at) → upload row JSON。
- app_complete_upload(p_user_id,p_image_id,p_storage_key,p_preview_key,p_sha256,p_mime_type,p_bytes,p_width,p_height) → image row JSON；已ready复用第一份固定版本。
- app_delete_image(p_user_id,p_image_id) → image row JSON（含待清理keys）；运行中输入返回IMAGE_IN_USE。
- app_create_job(p_user_id,p_idempotency_key,p_request_hash,p_inputs,p_snapshot,p_reserved_credits,p_parent_job_id default null) → `{job_id,status,credits_reserved,replayed}`。
- app_cancel_job(p_user_id,p_job_id) → job row JSON。
- app_create_order(p_user_id,p_package_id,p_idempotency_key) → order row JSON；同键不同package冲突。
- app_attach_checkout(p_order_id,p_session_id,p_checkout_url) → order row JSON。
- app_apply_paid_checkout(p_event_id,p_order_id,p_session_id,p_payment_intent_id,p_amount_minor,p_currency,p_amount_refunded default 0,p_disputed default false) → `{applied:boolean}`。
- app_apply_payment_reversal(p_event_id,p_payment_intent_id,p_refunded_minor,p_dispute) → reversal JSON。

读取均显式owner过滤；实体字段和SQL验证结果在后端文档中记录。异常RPC用稳定message code（例如INSUFFICIENT_CREDITS），Web映射为标准错误，不泄露SQL细节。

## 10. 版本、验证及上线条件

新增可选能力次版本升级，删除/改语义主版本升级；消费者忽略新增可选响应字段，严格校验用户请求。任务snapshot固定contract_version；旧适配版本未部署时拒绝/恢复，不自动换模型计费。Web、Worker与JEV各自兼容矩阵需记录。

本轮验证以契约、HTTP路由行为、数据库事务、R2媒体处理/签名和Stripe/JEV适配的可重复测试为证据；真Supabase/R2/Stripe/Lambda环境联调需要真实凭据和部署。未完成的真实集成必须明确标记，不宣称已实现商用生成。

## SEO运营扩展

SEO管理员鉴权、草稿可选观察计划、固定基线与不可变复盘见 [观察复盘协议](../seo/OBSERVATION_REVIEW.md)；准确Schema以packages/contracts及生成OpenAPI为准。该扩展不改变原任务、支付或用户照片协议。
## 双看板加法契约

Console与Analytics字段见packages/contracts/src/{console,analytics}.ts，契约包1.2.0；HTTP和Worker执行协议仍1.0.0，Worker现有固定消费版本不因看板自动升级。管理员快照/分页/CSV及退款事实细则见[ADMIN_ANALYTICS](../backend/ADMIN_ANALYTICS.md)。新增QUERY_TOO_LARGE为有界查询错误；数据缺失/未成熟通过指标状态表达，不返回虚构零。
