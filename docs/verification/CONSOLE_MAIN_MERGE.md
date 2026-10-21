# 双看板合入 main 的验证

2026-10-21。用户要求将三个阶段合入main并推送GitHub，同时保留前端和其他模块改动。本次在独立`worktrees/picjp-web-main-merge`操作main；原前端checkout不切分支、不stash、不重置、不提交WIP。

## 合并输入与保留

- 看板最终输入：`feat/console-analytics` / `0c711425e1ad040600799a66bd3531829e31e6bf`，含阶段1/2/3历史提交及Worker共享SQL/已提交离线链路依赖。
- 远程main输入：`f7f640a`（此前已上线认证修复、邮件Logo/字体及已确认邮件模板）。与看板共同祖先为878383f。
- 六处冲突：auth-pages的登录标题采用main；router保留看板/个人路由；auth集成测试保留Worker迁移；inspect-auth保留main只读说明；文档导航合并；AUTH_SETUP沿用main版。自动合并后Auth组件/流程/公开配置/服务端Supabase兼容与main逐字节相同，批准的两份邮件模板也相同。
- 原前端`repos/picjp-web` / `feat/picmoko-ui` HEAD228e157、认证worktree与Worker仓库：开始/结束HEAD和完整status、616/112/60个文件SHA256一致，原未提交更改/未跟踪文件保留。真实.env不读取或复制。
- SEO另一任务在本轮自行由96c1824推进至ed0b303；保持其新提交原样，未还原、修改或纳入本次main。此前临时组合验证不作为SEO已发布声明。
- 本次没有将前端未提交品牌/字体/交互WIP复制为main发布内容。保留既有main界面及其认证/邮件改动；以后前端WIP合并仍需按连接说明保留看板埋点和owner隔离。

## 最终合并源码的本地验证

| 检查 | 结果 |
|---|---|
| 独立安装 | `npm ci --offline --include=dev`，158包，审计0已知漏洞；无兄弟node_modules依赖 |
| `npm run verify` | 24测试文件/308项通过；90基础SQL断言；OpenAPI一致、TypeScript及Next16.4.2正常34页面构建通过 |
| 原生PostgreSQL17 | 六迁移、151断言、20独立连接并发通过，专用socket/随机临时库；集群已停止 |
| Web→Worker离线链路 | 最终Web源码配固定Worker测试桥，12场景通过，真实网络/付费调用0；Worker源码未改 |
| 管理员浏览器 | 64检查，8页固定report/as_of、24+24指标、分页/CSV/钻取、版本标记/趋势、采集/反馈/POST下载与撤权 |
| 个人控制台浏览器 | 18检查，总览/流水/任务作品筛选、320px、故障不假0、切账户清理 |
| 用户定位浏览器 | 24检查，精确UUID/邮箱、歧义/缺失/范围外、同快照、脱敏/审计、320px及撤权 |
| 认证邮件静态资源 | 5个PNG/WOFF2实际HTTP200、SHA256与源码一致、CORS与immutable缓存；18目录及两项停用详情404 |
| 部署只读盘点脚本 | 7场景：空库、完整六迁移、RLS关闭、列授权、PUBLIC函数授权、service_role缺权限、精确RPC缺失；均正确判定 |

浏览器环境：本机127.0.0.1:3186生产构建，1360×950/1536×1024、个人1280×950及320×840。Browser插件未提供，用现有Playwright/Chromium1232；实际路由/PGlite、合成认证/图片、外网阻断。无pageerror或框架覆盖；console仅主动注入的400/403/404/503。QA脚本/截图/JSON在`/private/tmp/picjp-console-main*-qa*`，部署盘点证据`/private/tmp/picjp-console-main-inventory-result.json`。QA端口已停止，正常生产构建覆盖合成公开认证设置，产物扫描无fixture配置。

`git diff --check`新增源代码/文档通过。main已经存在的两份OFL许可证原文有行尾空白；为保留原文件及公开素材指纹没有格式化它们。

## Git、CI与部署边界

本文件随main合并提交保存。本地验证不代替推送后的GitHub CI或Vercel状态；对应commit的Actions/Checks及工作区context记录实际结果。没有force push、改remote或删除其他分支。

下一步云操作见[Supabase / Vercel部署清单](../backend/CONSOLE_DEPLOYMENT.md)。代码push不会运行数据库迁移，也没有授予管理员或启用采集。四份新增控制台迁移应按依赖安装；先只读盘点，不重复执行已应用Web/Worker建表。PAY-001、真实自然观察及人工evaluation仍单独验收，生成保持关闭。
