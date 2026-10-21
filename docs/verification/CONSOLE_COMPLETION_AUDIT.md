# 双看板三阶段完成审计

日期：2026-10-21。目标是分三阶段交付代码并逐阶段验证：数据与权限基础 → 用户个人控制台 → 管理员完整产品分析看板。目标仓库为 PicJP Web，分支 `feat/console-analytics`，独立 checkout 为 `worktrees/picjp-web-console`。阶段历史证据见 [分阶段记录](CONSOLE_VERIFICATION.md)。

本审计核对的是上述代码交付，不把产品规划中的账户注销、资金写操作、规模化数仓、实验分配或云端上线自动纳入完成声明。当前公开目录为18方向，历史20个 Tool ID、任务快照及幂等重放继续有效。

## 1. 阶段与权威证据

| 要求 | 权威实现 | 验证证据 |
|---|---|---|
| 阶段1：服务端受控角色、分离财务权限、撤权立即生效 | `server/console.ts`、210100/210300迁移 | `console-foundation`、`admin-analytics-api`、`admin-analytics-db`测试及PG17独立连接撤权回归 |
| 默认无管理员、普通JWT不能直接读写管理事实或RPC | 角色表/RLS/GRANT、API认证 | foundation、upload-provenance、version-release-db的anon/authenticated/service_role测试；浏览器撤权 |
| 环境、内部账户及历史未知归属 | 业务记录和上传首次完成时冻结来源 | `analytics-upload-provenance`真实迁移6项；engine混合环境/标签回归，历史未知不回填 |
| 曝光/选择/结果查看/反馈的白名单、归属、时钟和去重 | `console.ts`、`analytics-provider.tsx` | foundation10项；实际可见1秒、真实图片load、选择关联和反馈落库的浏览器链路 |
| 显式POST下载、先pending后签发确认、GET不算保存 | 下载路由、动作表/事务 | 签名失败/确认失败/删除竞态/重复请求测试；浏览器按钮真实POST与SQL回执 |
| 审计只追加，不记录照片、自由输入、Prompt、Token或签名URL | SQL权限、公开DTO及字段映射 | foundation/API敏感字段与CSV测试；浏览器无私有照片接口 |
| 阶段2：本人总览、余额/预留、30日任务/消费、最近任务/作品和付款入口 | `personal-console.ts`、210200迁移、`personal-console.tsx` | `personal-console`8项及基础账务SQL；桌面实际总览 |
| 稳定流水分页、任务状态/工具/日期筛选、作品可用性 | 个人读模型、微秒+UUID游标 | personal-console8项、personal-filters3项、真实20→25条分页与6→4→2任务筛选 |
| 两用户隔离、切换账户清理、失败不置零、日语/320px可用 | Account owner-key、API强制owner、局部CSS | 客户端隔离测试及个人浏览器18项；含故障重试、键盘End标签和账户切换 |
| 阶段3：8页、24指标及前一等长区间 | `admin-console-sections.tsx`、`analytics/engine.ts` | engine49项、HTTP→RPC→SQL→严格DTO11项，浏览器8页同report/as_of |
| 全局筛选、今日/昨日/7日/30日/自定义、小时/日/周及IANA时区 | AnalyticsQuery、受限SQL、AdminConsole | API非法窗口/时区/重复参数测试；DST/半小时区/自然周测试；快捷范围交互 |
| 完整用户ID/邮箱精确定位、脱敏/不回显、重邮箱歧义、快照范围外提示 | `console.ts`、`app_console_resolve_user`、AdminConsole | `console-user-lookup`6项真实HTTP/SQL；组合浏览器桌面/320px定位、未找到/歧义/范围外/撤权24项验证 |
| 同快照分页/排序/用户及特效钻取、敏感表每次授权 | report缓存、view query、API/SQL | API隔离/分页/旧快照撤财务角色/绕section测试，PG并发读取及浏览器钻取 |
| 同筛选CSV、脱敏、公式防护、审计 | `admin-analytics.ts`、Bearer Blob下载 | API的report/as_of/filters/drill/审计/恶意邮箱/后写事实测试；实际浏览器下载 |
| 按日期和特效堆叠、Top N之外的其他、图表不依赖当前页 | 完整trend、全局user_usage_ranking、chart-data | chart-data9项、SSR渲染6项；未来12个Tool ID、同名/缺名、全局Top15与零用户测试 |
| 新用户/保存行为用户/积分/成功率/耗时P50与P95可切换 | UsageTrend、LatencyTrend、RateTrend | SSR绘制及空SVG标题回归；浏览器切换与可访问图名 |
| 版本选择、版本稀疏趋势和真实发布时间/范围 | 完整版本分组、`console_version_releases` | engine版本创建/完成/跨期consume/无财务归因/2000点上限；release-db5项；浏览器实际发布标记 |
| 不用首次流量伪造发布、不同环境发布不串用 | 明确维护的release事实及时间/环境过滤 | release-db无记录/同版本多次/未来记录/不同环境/权限与审计；无记录UI提示 |
| 复盘产物保留筛选/口径/as_of/样本/覆盖/结论/下一步/负责人/检查日期和图表摘要 | 本地JSON导出 | 浏览器实际JSON解析，含section/pagination/趋势/全局排名/分群/版本/漏斗/前期指标；分页部分明确标记 |
| 运行质量和未知成本独立呈现，不自动处置 | operations/finance、分币种Money | 退款36项、付款历史5项、积压/未知费用/未采集/不支持归因测试；工具筛选仍可见invoice成本 |
| 初期目录不是长期上限，停用不破坏历史 | lifecycle、activeTools、公共详情路由 | public-catalog7项、catalog-lifecycle4项；18公开详情、历史20查询及旧key重放 |

## 2. 24项指标逐项核对

每项实现位于同一个纯统计引擎；公开结果含 `metric_version`、固定 `as_of`、值/分子/分母/样本、状态、原因、覆盖起点及辅助计数。UI字典和前期对比使用相同结果，不从当前分页重新计算总体。

| 指标 | 证明关键点 | 呈现入口 |
|---|---|---|
| M01 注册用户 | 注册时间归期；下游维度不伪造注册归因 | 用户页、新用户趋势、字典 |
| M02 使用用户 | 创建任务去重owner；不当作访问DAU | 总览、用户趋势 |
| M03 请求量 | job_id去重，轮询/attempt/幂等重放不增加 | 状态柱图、任务明细 |
| M04 人均/P50/P90 | 指定使用用户集合；无样本非0% | 用户页/字典 |
| M05 逐用户 | 期间/30日/累计分开，含0用量 | 用户表、档案、Top15及其他 |
| M06 积分消费 | consume的-reserved_delta，非reserve/release | 用户表、积分趋势、流水 |
| M07 成功率 | completed/(completed+failed)，取消/在途单列 | KPI、状态/比例趋势 |
| M08 特效份额 | 完整任务分母，稳定ID，其他桶不丢量 | 日期×特效图、特效表 |
| M09 用户覆盖 | distinct用户可跨特效重叠 | 特效页当前明细覆盖图/表 |
| M10 曝光点击 | 同page/tool/exposure，首次选择 | 特效/漏斗字典，真实采集链路 |
| M11 查看率 | 同一成功完成cohort、成熟24h | 漏斗、特效查看率 |
| M12 保存行为率 | 本人显式动作后链接签发，按job去重；不是系统写盘 | KPI、特效表、保存率趋势 |
| M13 查看→保存 | 同任务先后顺序，不把pending确认当确定流失 | 任务漏斗/字典 |
| M14 保存行为用户 | 动作自然周去重，不累加日UV | 总览、按周保存用户趋势 |
| M15 激活 | 同注册cohort成熟24h首次成功 | 注册漏斗/字典 |
| M16 D1/D7 | 首次成功自然日，等待对应日结束，筛选后人数同分母 | 留存cohort表/热力图 |
| M17 W1 | 第7–13日，非D7替代 | 留存表/字典 |
| M18 继续编辑 | 成功父任务24h内创建子任务 | 特效、版本矩阵、漏斗字典 |
| M19 耗时 | 成功任务创建至完成P50/P95，缺值不伪造阶段耗时 | KPI及全局/版本耗时趋势 |
| M20 付费转化 | 使用用户实际付款；不支持归因/付款历史未知明确标注 | 资金页/分群 |
| M21 付款/退款 | paid_at和Refund真实created，跨期、分币种，不用累计退款代替发生事实 | 资金图表和退款明细 |
| M22 复购 | 成熟30日；付款历史完整性独立于任务历史 | 资金页/字典 |
| M23 成本 | provider_report/invoice/estimate/null分别展示，不与异币种收入直接相减 | 成本图表和attempt证据 |
| M24 反馈 | 任务7日窗最后有效明确评分，覆盖率单列 | 特效表、版本矩阵、字典 |

覆盖的边界包括：同一statement_timestamp新建账号/排队任务仍在as_of快照中，重复事实/下载、多特效、零用量、失败/取消/在途、跨日完成、24h/D7/W1/7d/30d未成熟、提前过期/删除、多输出、迟到/缺数、历史环境、版本切换、跨期退款、多币种/未知费用。`analytics-engine.test.ts`有独立预期，API测试补充真实SQL非零事实与严格DTO验证。

## 3. 本地验证汇总

- 最终完整 `npm run verify`：308项测试、90项基础SQL断言、OpenAPI/TypeScript/Next16.4.2生产构建通过。
- 原生PostgreSQL17：全部六迁移加载、151断言、20个独立连接及真实重叠竞态通过；专用临时Unix socket、随机测试库，无云数据库。
- 管理员浏览器：64项检查通过，1360×950、1536×1024、320×840；实际createRouter+PGlite、纯合成会话/图片，外网阻断。仅主动撤权产生预期403，无pageerror或框架覆盖。
- 个人控制台组合构建：18项检查通过，1280×950及320×840；故障注入503为预期，无pageerror，账户切换后不保留前用户记录。
- 最新主UI/Auth/SEO组合验证：独立离线安装、TypeScript/42页面构建，管理员/品牌/SEO71项、个人18项、工具弹窗8项通过；定位用户另行24项完整浏览器回归通过。输入521个UI文件只读SHA256核对未变，细节见[集成记录](../integration/CONSOLE_UI_INTEGRATION.md)。实际Git合并和部署仍独立执行。

临时脚本、请求记录与截图位于 `/private/tmp/picjp-console-final-qa*`、`/private/tmp/picjp-console-final-personal-qa*`、`/private/tmp/picjp-console-lookup-qa*`；不将合成认证配置/图像加入产品源码。Browser插件未提供，使用已安装Playwright/Chromium，未安装依赖。

## 4. 明确的后续交付边界

- 本轮不操作云迁移、部署、真实账户、Stripe支付或收费模型；PAY-001、自然24h/7d/30d观察及人工模型evaluation仍单独验收。
- 模型发布事实仅供受控记录与观察标记；未开发模型发布流程、实验流量分配或自动回滚。
- 调账/退款执行/主动对账、账户生命周期、完整身份披露/客服写操作和审计浏览器属于后续运营模块；现有角色授予与审计仍走受控SQL。
- 规模化汇总、账单自动核销、已拟定但未获批准的增长/SLO阈值及外部告警另行推进；当前上限内完整计算，超限明确拒绝。
- 主UI/Auth/SEO其他任务的未提交改动不混入本分支提交。组合验证与最终合并/线上验收分别记录。
