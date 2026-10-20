# picmoko SEO 云端接入

更新：2026-10-20。此文档随 `feat/seo-platform` 独立开发分支保存；不表示已部署。

## 已确认的信息

| 配置 | 用户确认值 | 状态 |
|---|---|---|
| 主站 | `https://picmoko.com` | SEO 主站规划；www 页面跳转主站 |
| GA4 资源名称 | `picmoko` | 名称，不是 Property ID |
| GA4 Property ID | `559730643` | 已提供，报表 API 使用此数字 |
| GA4 Measurement ID | `G-RGY24MR7LP` | 已提供，网站采集使用此编号 |
| GSC Domain property | `sc-domain:picmoko.com` | 用户反馈尚未验证；API 权限也未验收 |

这些编号不属于密钥。服务账号私钥、SMTP/API 密钥、Supabase Secret 和 OAuth 令牌不放进文档、聊天或 Git。

## 1. 验证 Search Console

1. 打开 [Google Search Console](https://search.google.com/search-console/welcome)，选择左侧「网域」，填写 **`picmoko.com`**，不带 `https://`、`www` 或路径。
2. 复制 Google 提供的整段 `google-site-verification=…` TXT 值。
3. 阿里云控制台 → 云解析 DNS → `picmoko.com` → 添加记录：记录类型 **TXT**；主机记录 **`@`**；记录值为刚复制的完整文字；TTL 默认即可。此处不是 `www`、`mail`，也不填邮箱服务商的 DKIM 名称。
4. 保存后返回 Search Console 点击「验证」。未成功时等待 DNS 更新后重试，不重复创建资源。保留该 TXT；不要删除或替换现有 Resend 的 DKIM/SPF/CNAME 记录。
5. 成功后反馈「GSC 已验证」即可，无需提供令牌。工程尚未部署前，不要把本地 `127.0.0.1` 地址提交给 Google。
6. SEO 正式部署且索引开关批准开启后，在「站点地图」提交 `https://picmoko.com/sitemap.xml`。当前所有工具/教程仍有样例和审校门槛，站点地图不会自动包含这 23 个页面。

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

数据库顺序：现有 Web 基础迁移 → 现有 Worker 迁移（若已使用）→ `20261020153000_seo.sql` → `20261020160000_seo_analytics.sql`。不要重复运行已应用迁移；先检查迁移历史，在测试环境演练。SEO 表和 RPC 不直接授权给普通用户，BFF 验证 Supabase JWT 后再执行角色检查。

负责人需要给至少两个独立身份分配 SEO 角色（例如自动化编辑身份和你的审核账号，或先用两个测试账号演练），在 Supabase SQL Editor 执行以下结构，替换成已核实的 Auth 用户 UUID：

```sql
insert into public.seo_members(user_id,role) values
  ('<编辑的真实Auth用户UUID>', 'editor'),
  ('<另一位审核人的真实Auth用户UUID>', 'reviewer');
```

这是手工授权模板，不直接执行占位文字。作者身份不能审核自己的内容，不要求额外雇用一位人工编辑。切换 `SEO_CONTENT_BACKEND=database` 并验证公共读取后，后台才允许发布/回滚。

## 5. 每日采集与回补

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

- 代码：S0–S4 工程与本地测试已覆盖，真实验收仍有下列门槛；合并/部署状态以交付与 PR 记录为准。
- Google：GSC 待所有权验证；两个资源的服务账号读取权限待配置；尚无真实采集样本。
- GA4：编号已确认；标签/业务传输已实现，同意机制真实浏览器和后台接收待验收。
- 内容：20 工具和 3 篇教程有正文基线；真实授权样例、模型版本/效果证据和日语审校待完成，保持 noindex。
- 发布：先测试库演练独立审核、并发冲突、缓存失效、回滚，再批准正式环境索引。

验收不以「后台创建成功」替代事件/报表实际接收，也不以测试 fixture 替代真实流量和效果。
