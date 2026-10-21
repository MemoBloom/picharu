# picmoko SEO 云端接入

更新：2026-10-21。此文档随 `feat/seo-platform` 独立开发分支保存；不表示已部署。

## 已确认的信息

| 配置 | 用户确认值 | 状态 |
|---|---|---|
| 主站 | `https://picmoko.com` | SEO 主站规划；www 页面跳转主站 |
| GA4 资源名称 | `picmoko` | 名称，不是 Property ID |
| GA4 Property ID | `559730643` | 已提供，报表 API 使用此数字 |
| GA4 Measurement ID | `G-RGY24MR7LP` | 已提供，网站采集使用此编号 |
| GSC Domain property | `sc-domain:picmoko.com` | 用户报告已验证；服务账号真实读取HTTP200空数据通过 |
| 专用采集服务账号 | `picmoko-seo-reader@picjp-staging.iam.gserviceaccount.com` | GSC受限/GA4查看者；Cloud Shell短期服务账号读取已获200响应摘要 |

这些编号不属于密钥。服务账号私钥、SMTP/API 密钥、Supabase Secret 和 OAuth 令牌不放进文档、聊天或 Git。

## 1. 验证 Search Console

1. 打开 [Google Search Console](https://search.google.com/search-console/welcome)，选择左侧「网域」，填写 **`picmoko.com`**，不带 `https://`、`www` 或路径。
2. 复制 Google 提供的整段 `google-site-verification=…` TXT 值。
3. 阿里云控制台 → 云解析 DNS → `picmoko.com` → 添加记录：记录类型 **TXT**；主机记录 **`@`**；记录值为刚复制的完整文字；TTL 默认即可。此处不是 `www`、`mail`，也不填邮箱服务商的 DKIM 名称。
4. 保存后返回 Search Console 点击「验证」。未成功时等待 DNS 更新后重试，不重复创建资源。保留该 TXT；不要删除或替换现有 Resend 的 DKIM/SPF/CNAME 记录。
5. 成功后反馈「GSC 已验证」即可，无需提供令牌。工程尚未部署前，不要把本地 `127.0.0.1` 地址提交给 Google。
6. SEO正式部署且索引开关批准开启后，在「站点地图」提交 `https://picmoko.com/sitemap.xml`。当前18工具与3教程仍有样例和审校门槛，站点地图不会自动包含这21个页面。两项退役消除工具及旧教程始终排除。

参考：[Google 所有权验证指南](https://support.google.com/webmasters/answer/9008080?hl=zh-Hans)。验证成功与有搜索展示是两件事，数据需要时间积累。

## 2. GA4 后台复核

1. [Google Analytics](https://analytics.google.com/) → 管理 → 确认选中 `picmoko`，资源详情显示 **559730643**。
2. 数据收集和修改 → 数据流 → 网站流，确认网站网址为主站，Measurement ID 是 **G-RGY24MR7LP**。建议资源时区 Asia/Tokyo、货币 JPY。
3. 不需要重新建立第二个资源。创建资源和网站实际发出事件分别验收；当前仅保存编号，没有据此宣称已接入。
4. 网站第一方采集、手动 GA4 标签和服务器业务事件传输已实现，默认关闭，尚未部署或真实接收验收。先进入该网站流，把「增强型衡量」整个开关关闭（包括网页历史变化、站内搜索、表单、出站点击、文件下载）。网站按白名单手动发事件，避免重复统计以及自动采集账户/回调的 URL。代码中的 send_page_view=false 不能代替这项后台操作，见 [Google 手动网页浏览说明](https://developers.google.com/analytics/devguides/collection/ga4/views)。
5. 网站流 → Measurement Protocol API 密钥 → 创建一个用途明确的密钥。只把值存到发送进程的 `SEO_GA4_MEASUREMENT_API_SECRET`，不要发到聊天；它与只读 Data API 授权不同。配置 `NEXT_PUBLIC_GA4_ENABLED=true` 前，还要在测试环境检查网络请求确实只有脱敏后的公开页面路径；没有照片、邮箱、编辑文字、token_hash、code 或签名链接。
6. `page_view/tool_view/editor_open/upload_start/login_start/login_complete/result_download` 由浏览器手动测量；业务数据库独立记录 job_create/generate_success/purchase_paid。标签真实生成的 client_id/session_id 与已同意会话绑定后，后台发送器只领取业务事件，避免浏览器事件重复。GA4 的 key event 可将 generate_success/purchase_paid 标为关键事件；不拿 result_download 当作实际写盘成功。
7. 标签识别符是随机测量标识，不使用 Supabase 用户 UUID。拒绝时不加载标签，撤回后停止后续测量并清理该标签 Cookie。网络不可用的撤回会显示需重试；已发往 Google 的历史数据不会因退出自动撤销。
8. Measurement Protocol 不能独立替代完整的网站标签采集，参见 [Google 说明](https://developers.google.com/analytics/devguides/collection/protocol/ga4)。

## 3. 采集身份授权（只读报表）

后台验证完成后，给一个专用 Google 服务账号授权。建议沿用 `picjp-staging` 项目，新建用途明确的 SEO 采集账号，不复用持有模型/支付权限的账号。

- Google Cloud 启用 Search Console API、Google Analytics Data API。
- GSC → 设置 → 用户和权限：添加采集服务账号的完整邮箱，只给予读取所需的受限权限；若实际 API 拒绝，按 API 所需权限核对，不默认授予所有者。
- GA4 → 管理 → 资源访问权限管理：在 **559730643** 资源为同一个账号添加「查看者」。
- 在 Cloud Run Job 上使用该运行服务账号和 ADC 身份；不需要下载 JSON 私钥。Vercel 的环境变量不会自动把 Google 资源授权给 Cloud Run。
- 采集进程需要只在服务端配置 Supabase URL/Secret，用于调用受限 SEO RPC；不交给浏览器。

这一步只有知道编号还不够；后台成员授权完成后才可以读到数据。

### 3.1 首次真实只读连通检查（Cloud Shell）

2026-10-21 用户已反馈两项报表权限/API配置完成。修正版Cloud Shell测试已获用户回传：GSC 2026-10-17 HTTP200/ok:true/empty，GA4 2026-10-18 HTTP200/ok:true/empty，证明两项报表真实读取与空结果处理通过；摘要见 [实际读取记录](../verification/SEO_GOOGLE_READ_2026-10-21.json)。未取得原始报表或令牌；尚未证明标签真实收数、数据库导入或Cloud Run运行身份。旧脚本曾返回TOKEN_SETUP_FAILED。当前修正版移除了稳定版gcloud不支持的--scopes，改用IAM generateAccessToken请求只读scope。此检查只验证Google身份与报表读取，不需要Supabase凭据，不写入数据库或启动采集排程。读取日期按GSC美国太平洋/GA4日本日期分别取D-3；当前GA4资源时区如非Asia/Tokyo，应按后台时区调整测试日期。空数据不代表失败，200也不代表已完成真实流量或采集导入验收。

打开Google Cloud控制台顶部的Cloud Shell终端，用你自己的项目管理Google账号操作。为避免下载JSON私钥，本次使用短期服务账号模拟。先启用IAM Service Account Credentials API，再允许当前登录用户仅在这个专用服务账号上使用Token Creator。它让你的登录账号取得该服务账号的短期令牌，不会给该服务账号增加Cloud项目Owner/Editor权限。后台授权由用户执行；若已有对应权限，可跳过重复授权。

```sh
gcloud services enable iamcredentials.googleapis.com --project=picjp-staging
seo_operator=$(gcloud config get-value account)
gcloud iam service-accounts add-iam-policy-binding \
  picmoko-seo-reader@picjp-staging.iam.gserviceaccount.com \
  --project=picjp-staging \
  --member="user:${seo_operator}" \
  --role=roles/iam.serviceAccountTokenCreator
```

上述命令成功后，上传仓库内的 [google-read-preflight.py](../../scripts/seo/google-read-preflight.py) 到Cloud Shell主目录。通过终端右上角菜单的“上传文件”选择该文件；不要复制长段Python到终端。令牌仅在进程内存使用，不打印/保存，报表原文不输出。

```sh
python3 ~/google-read-preflight.py
```

脚本为唯一可执行来源：gcloud获取当前登录用户令牌，再由官方IAM接口在JSON `scope`字段指定GSC/GA4只读范围，申请900秒服务账号令牌。不要把`--scopes`加到`gcloud auth print-access-token`；当前稳定版命令不支持该参数。

预期分别有一行gsc和ga4，`http_status:200`、`ok:true`；新站可出现`data_state:empty`。只反馈这两行摘要即可。403需核对身份/权限/API，不能凭截图添加用户成功认定API已连通；先排查，不把账号升级为所有者。若失败，反馈包含stage、http_status和reasons的摘要。cloud_shell_login表示当前Cloud Shell登录阶段；service_identity表示IAM生成服务账号令牌阶段；gsc/ga4表示各报表阶段。旧脚本TOKEN_SETUP_FAILED不能单独证明权限缺失，不要据此升级资源权限。

如果Token Creator是专为本次检查新增、后续也不需要用该登录身份调试，可在测试结束后撤销这一条授权；已有授权不要盲目移除。未来Cloud Run运行身份与本次Cloud Shell调试身份分别验收。

参考：[Google服务账号模拟](https://cloud.google.com/docs/authentication/use-service-account-impersonation)、[IAM指定scope生成令牌](https://cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken)、[Search Console只读scope](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)。本地模拟只证明脚本输出和错误处理，不能代替真实云执行。

## 4. 环境变量与数据库

在目标部署环境设置（代码库示例见 `.env.example`）：

```dotenv
SEO_GA4_PROPERTY_ID=559730643
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-RGY24MR7LP
NEXT_PUBLIC_GA4_ENABLED=false
SEO_GSC_PROPERTY=sc-domain:picmoko.com
SEO_CONTENT_BACKEND=git
SEO_INDEXING_ENABLED=false
SEO_ANALYTICS_ENABLED=false
NEXT_PUBLIC_ANALYTICS_ENABLED=false
```

`NEXT_PUBLIC_` 变量在构建时固定。Preview 环境强制 noindex。开启采集前，服务端还需独立生成至少 32 字符的 `SEO_EVENT_SECRET`；发布回调另用独立的 `SEO_REVALIDATE_SECRET`。密钥仅在部署后台保存。

先在已有Supabase项目的SQL Editor新建查询，复制并运行 [只读结构盘点](../../scripts/seo/inspect-schema.sql)，把结果`seo_inventory`返回。它仅查询系统目录，核对四份SEO迁移涉及的表、函数精确参数签名和启用触发器，以及基础依赖；不读取用户记录，不创建对象或修改权限。

- `BASE_DEPENDENCIES_MISSING`：先核对项目与基础迁移，不能直接执行SEO迁移。
- `NO_SEO_OBJECTS`：预期SEO对象均未发现，可据迁移历史确定首次执行顺序。
- `PARTIAL_SEO_STRUCTURE`：只应用了部分对象或对象损坏；按`missing`与迁移历史定位，不整套重复执行。
- `SEO_STRUCTURE_PRESENT`：列出的结构已存在，后续仍需核对函数版本/权限、运行身份和真实导入，不代表全部云端验收。

数据库顺序：现有 Web 基础迁移 → 现有 Worker 迁移（若已使用）→ `20261020153000_seo.sql` → `20261020160000_seo_analytics.sql` → `20261020163245_seo_health.sql` → `20261020164700_seo_observation.sql`。不要重复运行已应用迁移；先检查迁移历史，在测试环境演练。SEO 表和 RPC 不直接授权给普通用户，BFF 验证 Supabase JWT 后再执行角色检查。

### 4.1 本次盘点后执行顺序

2026-10-21 用户返回`NO_SEO_OBJECTS`：base 6/6，core 0/20、analytics 0/17、health 0/1、observation 0/9。见[盘点摘要与源文件SHA256](../verification/SEO_SCHEMA_PREFLIGHT_2026-10-21.json)。随后用户已回传`SEO_STRUCTURE_PRESENT`、所有53项齐全，见[迁移后结构记录](../verification/SEO_SCHEMA_AFTER_2026-10-21.json)。四份迁移预期结构已落库，不再重跑本节；下面执行顺序仅作本次操作记录。

沿用该项目此前的SQL Editor手动部署方式，每份文件单独新建一个查询，完整复制并依次执行，前一份成功再进行下一份：

| 顺序 | 源文件 | 内容 |
|---|---|---|
| 1 | [20261020153000_seo.sql](../../supabase/migrations/20261020153000_seo.sql) | 内容版本、审核发布、指标导入 |
| 2 | [20261020160000_seo_analytics.sql](../../supabase/migrations/20261020160000_seo_analytics.sql) | 同意会话、事件、业务关联；向已有任务/订单表添加统计触发器 |
| 3 | [20261020163245_seo_health.sql](../../supabase/migrations/20261020163245_seo_health.sql) | 采集健康检查、看板聚合更新 |
| 4 | [20261020164700_seo_observation.sql](../../supabase/migrations/20261020164700_seo_observation.sql) | 优化计划、基线与观察复盘 |

每份文件自带BEGIN/COMMIT事务；正常可显示Success/No rows returned。若某一步报错，保留完整错误，先不要继续后续文件或重跑已成功文件。基础Web/Worker迁移已经有先前执行反馈，本次不重新执行。执行成功本身不打开网站生成、索引或采集开关。

四份成功后，重新运行[只读盘点](../../scripts/seo/inspect-schema.sql)，预期`SEO_STRUCTURE_PRESENT`、base 6/6、core 20/20、analytics 17/17、health 1/1、observation 9/9；将新结果返回，再验运行身份/权限和真实导入。

SQL Editor手动执行不会自动写入Supabase CLI迁移历史。本次保留源文件和执行结果记录；以后改用CLI部署前，先核对`supabase_migrations.schema_migrations`并对齐已实际应用的版本，不能直接db push重放基础或SEO建表文件，也不能把本次盘点当成已完成历史修复。参考[官方迁移历史说明](https://supabase.com/docs/guides/deployment/database-migrations)。

### 4.2 迁移后只读权限和函数检查

2026-10-21 用户已回传本节检查通过，见[真实SQL角色读取摘要](../verification/SEO_DB_READ_2026-10-21.json)：13张表均启用RLS、29个函数授权检查通过，anon/authenticated无有效表/列或函数授权，service_role具备读取/执行权限；两个读取RPC成功。发布内容和成功导入窗仍为0，不再重复本节检查；下一步按[独立采集镜像与真实导入](COLLECTOR_CLOUD_RUN.md)推进。

在同一项目SQL Editor新建查询，完整执行 [verify-database-read.sql](../../scripts/seo/verify-database-read.sql)，返回`seo_db_readiness`。该脚本使用只读事务和SET LOCAL ROLE service_role，仅检查系统权限并调用seo_get_published、seo_ingestion_health，最后ROLLBACK恢复身份。没有创建或修改业务数据、角色授权、照片或Prompt。

预期execution_role为service_role，transaction_read_only及五项权限布尔值均为true；rls_disabled_tables、browser_table_exposure、browser_function_exposure应为空。当前迁移对应13张SEO表、29个函数，health_window_entries为4（一天的GSC三粒度加GA4一粒度）。新库published_page_count和successful_import_windows可为0，不是读取失败，也不能伪装为数据已导入。

若SQL报错或布尔值不符合，保留原错误/摘要，先定位；不用重新运行迁移。这个SQL测试不证明HTTP运行身份、真实数据导入或所有函数逻辑均已验收。若事务中途失败，需先ROLLBACK后再执行新查询。

### 4.3 SEO操作身份

负责人需要给至少两个独立身份分配 SEO 角色（例如自动化编辑身份和你的审核账号，或先用两个测试账号演练），在 Supabase SQL Editor 执行以下结构，替换成已核实的 Auth 用户 UUID：

```sql
insert into public.seo_members(user_id,role) values
  ('<编辑的真实Auth用户UUID>', 'editor'),
  ('<另一位审核人的真实Auth用户UUID>', 'reviewer');
```

这是手工授权模板，不直接执行占位文字。作者身份不能审核自己的内容，不要求额外雇用一位人工编辑。切换 `SEO_CONTENT_BACKEND=database` 并验证公共读取后，后台才允许发布/回滚。

## 5. 每日采集与回补

现有Google/SQL读取前置已完成。首次Cloud Build和Cloud Run操作见[逐步指南](COLLECTOR_CLOUD_RUN.md)，先只构建镜像，构建通过再配置独立Job及两天人工导入；不直接开启每日调度。

在本仓库根运行，进程通过 ADC 获取 Google 只读身份，通过部署环境获取 Supabase 凭据；CLI 不自动读取 Next 的 `.env.local`：

```sh
npm run seo:collect -- gsc 2026-10-17
npm run seo:collect -- ga4 2026-10-17
# 回补最多31天，按天顺序执行
npm run seo:collect -- gsc 2026-10-01 2026-10-17
```

业务事件发送进程另外运行 `npm run seo:collect -- deliver`，每次最多25条。必须先配置真实标签及服务器 Secret；未绑定标签识别符的会话不会伪造 GA4 身份。收到 2xx 仅记为 sent（HTTP 已接收），并非报表入库确认；超时记 unknown、进程中断可能停在 claimed，不自动重发。管理员需结合 GA4 报表核对，不能为了清队列盲目重放。超过72小时的事件跳过 Google，第一方事实仍保留；GA4 的会话维度有时间限制，不能承诺长期异步任务仍能精确归入原会话。退款/争议净额以业务数据库报表为准，不伪造逐词收入。

`npm run seo:collect -- reconcile` 每批最多修复100个已关联任务/订单的漏记事实。它保留原业务时间，不重新生成、扣款或给未知来源补归因。

每日入口 `npm run seo:collect -- daily` 需设置 `SEO_COLLECTION_ENABLED=true`；按 GSC 的 PT 日历和 `SEO_GA4_TIME_ZONE`（默认 Asia/Tokyo）分别重读 D-9 到 D-3，共7天。该时区必须与实际 GA4 资源设置一致。GSC 使用 final、美国太平洋日期，并分开保存 property/page/query_page 三种粒度；GA4 使用资源时区。不能把三种 GSC 数据相加，不能把不同时区日数据当作逐会话归因。GSC 也不保证返回全部低频词。

失败只写失败记录、保留上次事实；真实空窗标 empty；fixture 独立保存。先人工运行、看采集状态，再配置 Cloud Run Job/Scheduler；本轮没有自动创建云资源或收费调度。

独立容器文件为仓库根 `Dockerfile.seo`：

```sh
docker build -f Dockerfile.seo -t picmoko-seo .
docker run --rm --network none picmoko-seo --help
```

构建上下文排除 `.env`、证书/私钥、`.vercel`、依赖和构建产物。默认仅显示帮助，不采集、不发送事件。Cloud Run Job 使用专用运行身份，通过 Secret Manager 配置 Supabase Secret 等服务端变量，任务数1、并行1、平台重试0，初次只传 `gsc YYYY-MM-DD` 验证；确认权限和日志后才考虑 `daily`。Google 标签、业务发送 `deliver`、漏记修复 `reconcile` 与只读报表是不同入口。不要在 Job 参数里放密钥，不复用图片生成 Worker 命令。镜像构建和云执行分别验收；本机 Docker daemon 当前未启动。

## 6. 排名来源

S4 提供 SerpApi 真实适配器，固定 Google 日本、日语、Tokyo、mobile/desktop 和深度。尚未购买服务、配置 Key 或调用收费接口。需要时在服务器配置 `SEO_SERPAPI_KEY`，明确设置 `SEO_RANK_API_ENABLED=true`，再人工运行：

```sh
npm run seo:collect -- rank /secure/path/reviewed-targets.json 2026-10-20 --allow-paid-requests
```

目标 JSON 数组最多 20 项，示例项：`{"query":"写真から人を消す","path":"/ja/tools/remove_person","device":"mobile","location":"Tokyo, Japan","depth":10}`。每项最多 depth/10 次请求；不自动重试收费请求。未在范围内观察到时 rank 为 null，不能记作第 0 名。此来源与 GSC 平均位置分开比较。

## 7. 上线验收与仍待完成

- 代码：S0–S4 工程基线已有本地测试；S3计划/观察报告已离线验证，实际观察与复盘待验收；真实验收也有下列门槛；合并/部署状态以交付与 PR 记录为准。
- Google：GSC受限/GA4查看者及API配置后，用户回传两项Cloud Shell服务账号HTTP200空结果摘要；真实读取通过。数据导入、标签收数及Cloud Run身份/调度仍待验收。
- GA4：编号已确认；标签/业务传输已实现，同意机制真实浏览器和后台接收待验收。
- 内容：18 工具和 3 篇教程有正文基线；真实授权样例、模型版本/效果证据和日语审校待完成，保持 noindex。
- 发布：先测试库演练独立审核、并发冲突、缓存失效、回滚，再批准正式环境索引。

验收不以「后台创建成功」替代事件/报表实际接收，也不以测试 fixture 替代真实流量和效果。

CSV导出导入、健康检查和监控出口见 [RESEARCH_IMPORT.md](RESEARCH_IMPORT.md)。先运行 `npm run seo:collect -- health` 核对缺日与失败；非零退出表示尚不能当作完整数据。云监控规则需另外配置验收。

内容优化的操作、计划与复盘接口见 [OBSERVATION_REVIEW.md](OBSERVATION_REVIEW.md)。先用测试库演练完整fixture，真实流量数据与人工结论分开。
