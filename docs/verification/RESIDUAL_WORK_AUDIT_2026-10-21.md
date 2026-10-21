# UI合并后剩余19文件逐项审计

2026-10-21。目标仓库repos/picjp-web，复用worktrees/picjp-web-main-merge；分支fix/picmoko-residual-audit。比较基线main 2117eb4（PR #7），保存来源为stash 46ed8935df7c3e03361a3ce300cb43e799ecf09f及工作区archive/local-wip/2026-10-21-picmoko-ui。19份原文件SHA256全部核对通过；[机器可读清单](RESIDUAL_WORK_AUDIT_2026-10-21.json)保存每份来源/基线摘要和处理结论。

## 结论与逐项处理

19份是合并UI前保存的残留文件，不是19项都未开发/未合并：3份与main逐字节相同，7份已等效实现或被main的新实现取代，9份提取有效增量。第19项移入已有测试，不恢复旧同名文件；实际补丁含1行路由配置、2个数据库回归及目录一致性断言、7份文档（含本审计）与审计JSON。

| 原文件 | 结论 | 内容与处理 |
|---|---|---|
| `.env.example` | 等效已覆盖 | 浏览器Supabase公开URL/publishable/anon变量已经存在；差异仅注释，保留main。 |
| `.gitignore` | 字节相同 | 私有Prompt忽略规则已随PR #7合入。 |
| `README.md` | 等效已覆盖 | 当前main已含品牌、字体、18活动/20历史、移动编辑与看板的更新说明。 |
| `apps/web/src/app/ja/legal/[document]/page.tsx` | 提取补入 | 遗漏dynamicParams=false；线上未知法律路径实测200，本次补回并验证404。 |
| `apps/web/src/app/ja/tools/[toolId]/page.tsx` | 等效已覆盖 | main已有静态参数限制，另强化公开工具与metadata的404；保留新版本。 |
| `apps/web/src/lib/auth.tsx` | 字节相同 | useSyncExternalStore hydration保护已在main。 |
| `apps/web/src/lib/tool-content.ts` | 等效已覆盖 | 18项公开与20项历史目录已经实现；main的findPublicToolContent/历史lookup拆分更完整。 |
| `apps/web/src/server/router.ts` | 等效已覆盖 | 活动目录/新退役任务拒绝/旧key优先重放已存在；旧副本缺看板、设备冻结及退款事实，禁止覆盖。 |
| `docs/README.md` | 提取补入 | 补退役说明与本审计入口，保留看板、邮件、字体等现有链接。 |
| `docs/backend/AUTH_SETUP.md` | 提取补入 | 归并入口/注册方式/异常与退出、历史QA及用户真实邮件验收；更新主站及完整品牌模板入口。 |
| `docs/backend/VERCEL_BACKEND.md` | 提取补入 | 补前端已接入、浏览器配置和支付页面状态；修正无前端/Worker仅设计/从未部署等过时描述。 |
| `docs/interfaces/FRONTEND_API_GUIDE.md` | 提取补入 | 将页面/客户端/支付回跳从待开发更新为已实现；保留双看板接口增量。 |
| `docs/verification/TOOL_RETIREMENT_2026-10-21.md` | 提取补入 | 新增退役行为与分层证据文档，按main当前实现更新，历史未发布描述不当作现状。 |
| `docs/verification/VERIFICATION.md` | 提取补入 | 整理UI/Logo/字标/字体/登录入口各阶段历史QA；标明历史范围与当前证据入口。 |
| `packages/tool-config/package.json` | 字节相同 | 主入口及./lifecycle导出已在main。 |
| `packages/tool-config/src/index.ts` | 等效已覆盖 | activeTools和生命周期导出完全同效；仅注释有差异。 |
| `packages/tool-config/src/lifecycle.ts` | 等效已覆盖 | 退役两ID与判断完全同效；仅注释/缩进不同。 |
| `tests/backend.test.ts` | 提取补入 | 提取两项真实PGlite退役拒绝/历史重放与积分断言；不覆盖当前测试文件。 |
| `tests/tool-retirement.test.ts` | 提取补入 | 有价值的前后端目录一致性断言迁入console-public-catalog.test.ts；历史/公开名称断言按main新helper语义保留，不恢复旧重复测试文件。 |

## 关键判断

1. 法律路径的遗漏确有线上影响：补丁前https://picmoko.com/ja/legal/residual-audit-unknown返回200；恢复dynamicParams=false后，本地生产构建返回404。三份合法法律页仍200。未改合法页面的内容/样式。
2. 新增数据库回归有独立价值：main原生命周期测试使用隔离端口检查不调用写RPC；本次补入真实PGlite创建旧任务/预留积分后再重放，检查实际表和余额，补齐事务证据。
3. 不将旧文件“冲突选旧版”：旧router会丢掉看板/设备采集与退款事实；旧findToolContent会导致历史任务名称缺失。现有main实现与相应测试继续保留。
4. 文档按最新证据归并：真实邮箱登录和收件Logo已由用户确认；网站已发布不等于Google最终授权/退出重登/初始化五项/支付/完整生成全部通过。原记录与所有源文件仍可从快照/stash追溯。

## 本次验证

- npm run verify通过：25文件/317测试、90条PGlite SQL断言、OpenAPI一致、TypeScript及Next16.4.2生产构建。新增2测试，未增依赖或SQL迁移。
- 本地生产服务127.0.0.1:3194：三合法法律页和头像详情200；未知法律、__proto__与两个退役工具路径404，共8项HTTP检查。
- Browser插件未提供；渲染验证使用CUA/IAB：privacy有效内容→未知法律404页→点击「ホームに戻る」回首页，页面身份/非空/无框架遮罩通过，控制台无error/warn。截图在本任务visualizations/picmoko-residual-audit/legal-404.png；未重新做移动布局，补丁仅改路由配置。
- git diff --check通过；认证核心、router、契约、SQL、邮件HTML/资产、品牌字体、编辑器与看板源码未改变。历史QA与本次重跑分开记录。

GitHub CI/最终合并与部署状态另记工作区context；此处不预先宣称云检查成功。无云SQL、SMTP修改、真实OAuth/邮件或付费模型请求；独立SEO/Auth/Worker工作树未修改。原19文件stash保留作恢复档案，不代表还有19项待开发。
