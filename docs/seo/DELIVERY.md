# SEO S0–S4 工程交付与验收

2026-10-21集成：SEO分支已整合最新main `2117eb4`，保留品牌UI/认证/双看板；398测试、90基础SQL、165原生并发断言、三模式各42HTTP、96发布及浏览器回归通过。修复统计Provider在身份变化时重建认证回调的问题，普通产品页仍按owner重置。见[连接点与验证边界](../integration/SEO_MAIN_INTEGRATION.md)。正常构建保持noindex，尚未合入main或生产发布。

当前待办与上线顺序见[SEO剩余任务清单](REMAINING_TASKS.md)，按最新用户回传区分链路健康、网站标签、内容评价和正式部署。

当前健康反馈（2026-10-21）：用户报告healthy=true、四组各7天成功、missing_days/alerts均为空，见[反馈证据](../verification/SEO_HEALTH_2026-10-21.json)。按用户反馈健康检查通过，未补造原始JSON/执行ID。下一步按[每日采集与告警指南](SCHEDULING_AND_ALERTS.md)建立独立每日Job、最小权限Scheduler身份与三项告警；配置、调度触发及通知收件均待用户执行验收。

当前七日回补进度（2026-10-21）：用户报告GSC/GA4各7天complete、容器exit(0)，见[七日回补反馈](../verification/SEO_DAILY_IMPORT_2026-10-21.json)。尚未提供原始日期/执行ID；下一步运行health并回传JSON，以核对28窗口、缺日、陈旧及质量告警。health仅读取Supabase并计算状态，不重新拉取Google报表或写入导入数据；无需开启collection开关。健康通过以healthy=true、is_fixture=false及四组各7个成功日、missing_days/alerts为空为准。

当前验收（2026-10-21）：用户已回传[Supabase四窗口只读结果](../verification/SEO_IMPORT_READBACK_2026-10-21.json)，GSC 2026-10-17的property/page/query_page及GA4 2026-10-18的landing_event，资源/时区均正确；四项status与successful_status均empty，完成时间及成功时间齐全，limited=false、dropped_rows=0。指定日期的真实Google→Cloud Run→Supabase→只读回查链路通过。empty表示可导入结果为空，不代表网站无访问；GSC不保证完整行、GA4仍不保证最终性。下一步执行第5节七日回补，再检查健康状态；标签接收、调度/监控、内容人工评价和正式部署仍待。下文构建/首次运行记录保留为操作历史，以本段为当前状态。

最新GA4反馈（2026-10-21）：用户报告GA4也为`status:complete`、容器`exit(0)`，见[按反馈保存的证据边界](../verification/SEO_GA4_IMPORT_2026-10-21.json)。两来源运行已按反馈通过，下一步只读核对目标日期/资源下四窗口的状态/完成时间及质量；尚未取得GA4原始日志日期和数据库回读，不宣称已完成四窗口验收或真实标签收数。

最新GSC运行进度（2026-10-21）：用户回传Cloud Logging中`source:gsc`、2026-10-17 `status:complete`及`Container called exit(0)`，见[真实运行摘要及原始日志](../verification/SEO_GSC_IMPORT_2026-10-21.json)。按当前采集器语义，全部GSC窗口的Supabase RPC导入完成后才输出complete；运行链路按反馈通过，但数据库三粒度的complete/empty、行数/质量回读及GA4仍待，不宣称已有自然流量或全面上线。

最新云端进度（2026-10-21）：用户已回传独立SEO镜像构建/上传成功，源码ed0b303，镜像`asia-northeast1-docker.pkg.dev/picjp-staging/picjp/seo-collector:seo-ed0b30305583`，见[原样构建摘要及证明边界](../verification/SEO_IMAGE_BUILD_2026-10-21.json)。后续独立Job/运行身份、真实报表导入和数据库回读尚未验收；下文较早“云构建待执行”为历史记录。

更新：2026-10-21。目标 worktree 为 `worktrees/picjp-web-seo`，分支 `feat/seo-platform`，基线 main `f7f640a`。草稿评审：[PR #6](https://github.com/MemoBloom/picharu/pull/6)，尚未合并。工程在该 worktree 独立实现；原 UI、认证与 Worker checkout 的修改没有混入。

## 阶段状态

| 阶段 | 已实现的工程 | 剩余验收 |
|---|---|---|
| S0 | 初始 HTML 正文、H1/链接；canonical/OG/JSON-LD；robots/sitemap；私有页与占位页 noindex；真实 404；旧域公共页面迁移，保留认证/API/邮件素材路径 | 合并评审及生产域名实测 |
| S1 | 18方向意图映射、独立正文与限制；3个保留重点候选详细说明/FAQ及中日对照包；3篇日语教程（背景/发色/宠物）；真实样例证据Schema及独立审核门槛 | 三个保留候选的真实授权before/after、模型效果evaluation与日语审校；18工具和3教程均noindex；两项消除功能不再列为待评测 |
| S2 | GSC 三种粒度、GA4 事件报表、同意管理和手动标签、任务/支付事实与漏记修复、每日回补/幂等导入/失败状态、Planner/Trends CSV、缺日与质量健康检查、28 天数据库聚合与明细上限提示；独立采集镜像与调度入口 | 迁移结构53项与权限只读检查通过；Cloud Run真实导入/数据库回查指定四窗均成功empty；七日回补获用户7+7天complete/exit(0)反馈；28窗健康获用户通过反馈；真实标签接收、调度/监控及非空对账仍待 |
| S3 | 基于曝光的规则候选；不可变草稿、作者与审核人分离、固定草稿基线的 CAS 发布/回滚、操作 UUID 幂等审计；HMAC 时间戳/nonce 失效回调；版本绑定假设/基线快照、等长观察与不可变复盘 | 运营身份、真实数据下候选判断、实际观察周期与负责人复盘、正式发布演练；规则不是统计显著性结论 |
| S4 | 数据库内容后台、ISR、动态新教程目录、同版本 metadata/正文、真实 SerpApi 协议适配与条件隔离 | 云端访问/部署；排名供应商采购与来源评审另行决定，未调用收费排名接口；BigQuery 尚未启用，当前选用排名来源适配路线 |

“工程通过”与账号接入、部署、内容评价、实际排名提升分开记录。总体 S0–S4 的真实验收尚未完成。

## 入口与实现

- 页面：`/ja/tools/[toolId]`、`/ja/guides`、`/ja/guides/[slug]`；公共内容从同一发布快照生成正文与 metadata。
- 管理员：`/admin/seo`，未登录时保留登录返回地址；Supabase JWT 验证和 SEO 角色检查分别执行。
- 契约：`packages/contracts/src/seo.ts`；生成接口见 [OpenAPI](../interfaces/openapi.json)，新增 SEO 路径不改变原任务/支付字段。
- 数据与事务：`supabase/migrations/20261020153000_seo.sql`、`20261020160000_seo_analytics.sql`、`20261020163245_seo_health.sql`、`20261020164700_seo_observation.sql`。只在服务端经受限 RPC 使用，普通 Auth 用户不能直读/写 SEO 表或执行函数。
- 内容：`apps/web/src/content/seo` 和 `server/seo/content.ts`；当前18方向、历史20个ID保留兼容，Git基线按内容生成指纹，新增内容/模型证据继续走同一版本发布管线，不把效果版本写入工具URL。
- 采集：`scripts/seo`；与图片 Worker 使用不同命令、身份和任务，不启动模型生成。
- 后台示例字段仍须负责人审校。工具页开启索引需真实图像资产；构建校验哈希、格式/体积/动画限制，服务器只读取生成的证据清单，避免把整个文件目录打入函数部署。

## 数据边界

GSC property/page/query_page 分开保存；PT 日期不和 GA4 的资源时区混为同一天。页面级机会在数据库中聚合完整兼容窗口，CTR 按总点击/总展示计算，位置按展示加权。明细最多展示 5000 条、前 50 条查询，不冒充完整词库。低频隐藏词、API 行上限、GA4 阈值/其他行及非最终性均保留质量说明。

同意时创建 30 分钟会话，以第一次同意后的公开落地页作为触点；本地选择最长 30 天。无同意/跨设备/未绑定的情况保留未知，不用账户反向补齐。浏览器只发送白名单事件和公开路径，排除照片、邮箱、编辑文字、回调凭据和完整 query string。GA4 是单独开关，默认关闭；开启前必须关闭 Google 后台增强型衡量。

业务来源是任务/订单真实状态。关联使用 `after` 在响应完成后执行，不让统计拖慢成功响应；关联失败的事实不猜测来源。已关联任务/订单若统计触发器失败，`reconcile` 按原业务时间补齐，不重跑任务或支付。退款/争议净额来自订单，不从成功页或浏览器点击认定收入。下载事件表示取得下载链接，不代表写盘成功。

GA4 服务器队列仅发送业务事件，HTTP 2xx 仅代表收到请求。超时 unknown、进程中断 claimed 均不盲目重发；过期事件跳过 Google。SerpApi 需要环境和命令双重收费开关，固定日本/日语/地区/设备/深度；未观察到的排名为 null。

## 已执行验证

截至本轮：

| 验证 | 证据/结果 |
|---|---|
| `npm run verify` | OpenAPI、类型、197项测试、90条基础SQL断言和40路由生产构建通过；历史ID兼容、退役页面/旧DB发布/后台阻断与优化建议过滤已纳入 |
| 原生 PostgreSQL 17 | 117 条断言通过；10 个真实连接并发发布仅一方成功，10连接重试同一复盘只写一次；操作幂等、20 个队列事件无重复领取、撤回后禁止发送 |
| 生产原始 HTTP | 当前本机默认关闭42项通过；18工具、3教程、退役页及旧教程404、metadata/正文版本、管理员/API拒绝、邮件素材兼容；开/关/Preview三模式由本提交CI再验 |
| 实际数据库发布链路 | 本地 TLS Auth/PostgREST 替身 + 真实 SQL + Next 生产服务，96 项通过：发布/观察/回滚、同版本正文/metadata、新教程缓存；合成样例两版替换/回滚与索引、sitemap、文件哈希和非正方形尺寸；临时副本不修改原构建/清单；不是云端 Supabase 验收 |
| 浏览器 | CUA/IAB 1280、390、320px；FAQ 展开、工具→教程目录→教程、管理员→登录 next 保留；无横向溢出或相关控制台错误 |
| 依赖 | 更新 Vitest 和 Sharp，安装审计 0 已知漏洞；最终锁文件审计见 CI/验证记录 |

本地 Node 为 26；GitHub CI 以 Node22 验证。Docker daemon 本机未运行，采集镜像安排独立 CI 构建及禁网 help 烟测，未冒充本机已通过。浏览器使用现有 CUA 的 Playwright/原生交互能力，未安装外部 Browser 插件或浏览器依赖。一个定位器点击没有导航，使用实际 AX 原生点击后确认成功；未把点击尝试当成验收。

截图保存在 `/private/tmp/picmoko-seo-qa`；原始 HTTP 结果在 `/private/tmp/picmoko-seo-{disabled,enabled,preview}.json`，临时证据不随源码提交。CI 新增对应三模式、发布链路及镜像测试；远端结果需以实际 run 为准。

## 复核补充

新增 [CSV研究导入与健康检查](RESEARCH_IMPORT.md)：日文CSV/TSV、区间/缺值、来源口径隔离、缺日/失败/超时及受限告警；服务端机会在近期GSC数据不可用时暂停输出。新增测试覆盖真实SQL事务、权限、导入重放和缺失位置；[逐项要求复核](REQUIREMENTS_AUDIT.md)明确云端/内容门槛与真实观察/评价门槛，不把工程基线视为整体完成。

## 运行与上线顺序

[云端接入指南](CLOUD_SETUP.md)含已确认编号、阿里云 TXT、Google 权限、数据库、管理员授权及开关。

1. 完成独立 worktree 的代码和 CI 评审；保持索引、第一方采集、GA4 与收费排名默认关闭。
2. 用户完成 GSC 验证；GA4 Property ID `559730643`，Measurement ID `G-RGY24MR7LP`；二者创建/验证不等于 API 已授权。
3. 测试库应用迁移、授予两个独立编辑/审核身份，部署测试环境，演练发布/回滚、撤回、异常与实际报表。
4. 加入真实授权样例和审校记录，构建验证证据清单；数据库模式部署完成后再通过审核发布可索引页。
5. 批准正式部署和索引，提交 sitemap，按真实数据观察；模型或能力变更后复评样例。

当前没有生产部署、收费调用、真实流量提升或新 cron 已启用的声明。

本轮补齐 [S3计划与观察复盘](OBSERVATION_REVIEW.md)。真实Next+SQL历史fixture包括计划、审核、发布、观察和回滚；CUA用隔离身份实际保存计划/提交、自审禁用、手机复盘成功及短周期拒绝。新健康面板置于采集记录前。没有在生产前端加入测试身份或认证绕过。

S1增量：[五个首发候选审校包](S1_REVIEW_PACKET.md)与[人工记录](S1_OWNER_REVIEW.md)已准备，未填通过结论。移除换背景卡片中“主角保持原样”的绝对说法；长文页首增加保留工具的编辑入口，15组桌面/手机布局与5条实际入口跳转通过，FAQ与准备教程链接通过。新教程通过既有工具关联动态进入工具页，已验证缓存刷新；发布测试额外直接核对H1/首段变化，避免仅凭版本标识判定正文更新。`npm run seo:review:check`防止旧译稿套用新内容版本，已纳入verify。

样例尺寸增量：公开图片宽高取自构建校验清单，避免统一600×600导致加载占位比例错误；本地合成样例在1280/390/320px检查，无横溢或相关控制台错误。全部真实工具/教程仍保持noindex，合成图不进入正常源码或部署素材。

Google接入增量（2026-10-21）：用户回传GSC 2026-10-17与GA4 2026-10-18均HTTP200/empty，见[原样摘要及证明边界](../verification/SEO_GOOGLE_READ_2026-10-21.json)。Cloud Shell身份模拟成功不代表Cloud Run ADC/调度或真实标签已验收。独立Python诊断脚本使用官方IAM JSON scope生成短期令牌，避免稳定CLI不支持的--scopes；两个unittest方法覆盖11个离线场景，已加入CI Verify作业。另有只读SQL盘点53项基础/SEO对象，真实PGlite顺序迁移、精确签名与禁用触发器负例通过；它不代替权限/函数正文/实际导入验收。

Supabase结构增量（2026-10-21）：用户先后回传NO_SEO_OBJECTS和迁移后SEO_STRUCTURE_PRESENT，53项全部齐全；前后摘要与源迁移SHA256已归档。只读service_role检查已获[用户真实回传](../verification/SEO_DB_READ_2026-10-21.json)：13表RLS、29函数授权、浏览器有效表/列/函数授权及两个读取RPC通过；发布/成功导入仍为0。本地负例含PUBLIC授权、单列授权、禁用RLS与只读事务拒写；f5495ca的CI39526804780已成功，不把SQL Editor读取当成HTTP/真实采集已通过。

后续操作包：[独立采集构建与Cloud Run首次导入](COLLECTOR_CLOUD_RUN.md)，新增cloudbuild.seo.yaml及仅复用已有资源的构建脚本；禁网help通过后才上传独立SEO镜像，随后分步配置Job和指定日期导入。构建过程不读取运行Secret、不修改IAM或现有Worker；用户真实云构建/执行/数据库回读仍待。

操作包本地验证：完整verify仍为191测试/90基础SQL/42路由构建通过；构建脚本bash语法及3个无网络命令替身场景通过（正确项目/专用构建身份/配置/标签、非法来源版本阻止云命令、资源检查失败不继续构建或报成功）；Cloud Build YAML解析及Dockerfile/禁网help配置检查通过。没有在本机或Cloud Shell执行真实云构建。

18方向同步（2026-10-21）：用户删除两项消除功能后，公开目录/API新任务/SEO意图改为18项；旧工具/消除教程返回404且不从数据库旧发布恢复，后台拒绝新草稿/发布/回滚到退役目标，历史报表事实继续保留但不建议优化退役目的页。历史20个Tool ID、任务名称、同key重放、Worker快照及迁移不变。三个保留候选仍满足3–5页要求，背景教程取代消除教程，总计三篇；中日对照及背景候选指纹同步更新，人工结论仍待确认。新回归197测试/90SQL/40路由、默认关闭42HTTP、临时副本96发布检查通过。Browser插件未列出，复用CUA/IAB内的Playwright；1280×900目录18项→分类4项→背景工具→新教程，390×844无横溢/应用日志错误。截图在/private/tmp/picmoko-seo-retirement-qa，未进入源码/样例清单。云构建/真实导入、授权图像/日语评价与正式部署仍待；未执行新迁移、启用采集或调用模型。
