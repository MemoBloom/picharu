# SEO 与最新主分支的集成

2026-10-21。用户授权在SEO分支集成最新main，保留现有前端、认证和看板，完成完整测试，暂不开索引。目标为`worktrees/picjp-web-seo / feat/seo-platform`。

## 输入与连接点

- SEO输入`ed0b30305583d378d06b015fa41925f1b6701189`；通过fetch及GitHub只读查询确认main输入`2117eb44c54088d0b8917aa4826eb3f0c9176967`，包含已合并品牌UI、登录/邮件和双看板。
- 保留main的云朵/A1、Zen Kaku Gothic New正文/按钮及Zen Maru Gothic标题、移动编辑、图片查看器、18项工具选择、显式POST下载/反馈及八类管理员页面。
- 根布局保留AuthProvider、AnalyticsProvider和完整字体/样式。动态查询仅在登录导航内使用局部Suspense，页面正文保留服务端输出；保留桌面与移动账户入口、编辑页单层导航，并增加教程入口。
- API客户端保留owner检查、刷新边界、取消/keepalive、严格DTO和设备字段；SEO同意请求头独立附加，不能替代产品采集开关。SEO下载观察仅在成功的POST下载响应后发送，普通GET兼容读取不重复记录。
- 产品管理员与`/admin/seo`保持独立角色/路由；登录返回白名单合并产品后台、SEO后台和教程，继续拒绝外部/未知/循环返回地址。
- 当前公开18方向，历史20个Tool ID和名称继续可查。保留main的历史名称helper，公开路径统一使用findPublicToolContent，退役页/旧DB发布仍无法恢复公开展示。
- 合并共享契约和OpenAPI注册，保留新看板/Worker能力；从可执行契约重新导出43条路径/46个操作，不手改生成JSON。现有SQL迁移不重写，原生测试在同一临时数据库覆盖十份迁移共存。

## 浏览器发现的登录问题与修复

认证成功会改变AuthProvider中的用户身份。原统计Provider以用户ID作为整个子树的key，会重建已经移除一次性code的回调页，最终出现登录失败。隔离Google替身重现了交换一次、账户读取一次、回调留在错误页的情况。

本次让统计Provider自身保持挂载，以每次owner变化产生的独立取消/config scope隔离事件；旧scope被取消后不能继续发送。登录页和认证回调页在身份更新时保留实例，其他产品/账户页仍按owner重置子树，保留跨账户数据清理。Google、邮箱、初始化重试和过期链接四种浏览器场景随后全部通过，个人账户切换及撤权场景也复验通过。认证核心/邮件字节未改。

Vitest4/Vite8与新加入的真实TSX渲染测试存在JSX preserve兼容问题，测试配置显式使用OXC automatic JSX runtime；未为解决合并而降级SEO依赖。

## 最终源码验证

| 范围 | 结果 |
|---|---|
| 独立依赖安装 | `npm ci --offline --include=dev`通过，审计0已知漏洞 |
| 统一检查 | `npm run verify`通过：41文件/398测试、OpenAPI一致、TypeScript、90基础SQL断言及生产构建 |
| 原生PostgreSQL17 | 同一隔离库中基础/Worker/Console/SEO迁移共存，165断言；真实20/10连接并发、幂等、快照、撤权、退款及SEO发布/事件队列 |
| Web→Worker离线链路 | 12场景通过，使用固定Worker测试桥；网络/付费模型调用0，Worker源文件未改 |
| SEO生产原始HTTP | disabled/enabled/preview各42项通过；enabled仅在独立临时副本测试，正常构建为disabled/noindex |
| SEO真实Next+SQL发布 | 96项通过；本机TLS Auth/PostgREST替身与真实SQL，审核/发布/观察/回滚、ISR、样例两版与同版本正文/metadata |
| Google诊断离线回归 | Python两个测试方法/11离线场景通过 |
| 管理员浏览器 | 71检查：八页/24指标、同快照筛选/比较/分页/CSV/钻取、成本与版本、撤权、SEO独立角色、曝光/选择/结果/反馈/POST下载 |
| 个人与用户定位浏览器 | 18+24检查：流水/历史/作品过滤、故障不伪造0、账户切换、精确定位/脱敏/范围及撤权 |
| 编辑器浏览器 | 16检查：18项选择器、可见曝光/关联选择、390/320px日语搜索与真实参数切换、无页面溢出及重复底部导航 |
| 登录浏览器 | 四场景通过：Google→账户、邮箱→账户、初始化失败重试、过期链接→返回登录；认证供应商均为替身，不发送真实邮件 |

浏览器使用现有Playwright/Chromium（本会话无Browser插件），实际集成源码/路由与临时PGlite；外网阻断。覆盖1360/1536桌面、1440登录、1280个人，以及390/320px移动视口。无非预期console/pageerror或框架覆盖；主动注入的400/403/404/503单独记录。已实看移动编辑与账户截图，品牌/字体与布局保留。

详细临时脚本、输入/保留快照、日志、JSON和截图位于`/private/tmp/picmoko-seo-main-integration-20261021`，不作为部署源码。测试构建使用临时副本和明确标记的合成素材，正常样例清单仍为空；首次发布回归与统一构建并行导致BUILD_ID隔离断言失败，固定正常构建后顺序重跑96项通过，不把该失败忽略为通过。

## 保留与发布边界

- 526个主分支文件逐字节相同，包括公共品牌/字体/邮件素材、批准邮件HTML、认证核心、编辑器/选择器/结果页、看板主体和看板契约。
- 原Web main、认证、Console和Worker checkout的HEAD/status及已快照源文件保持不变。另一个main-merge工作树有并行任务自行新增的未提交修改，本任务仅读取、未恢复或混入，具体观察在临时preservation.json中。
- 本次只保存SEO分支集成。主分支尚不合并，不执行Supabase迁移/授权、Vercel生产发布、Scheduler或邮件/模型调用。
- `.env.example`、正常构建和运行检查均保持`SEO_INDEXING_ENABLED=false`；Preview强制noindex。测试用索引开启只存在于临时进程/副本，不构成正式索引批准。
- 当前采集云镜像仍为已验证的`seo-ed0b30305583`，未因Web集成重新构建或替换。真实样例/日语evaluation、标签接收、自然调度/告警收件和正式发布继续按[剩余任务](../seo/REMAINING_TASKS.md)独立验收。

推送后的GitHub CI与集成提交以对应commit/Actions结果为准，不能用本机结果冒充远端成功。
