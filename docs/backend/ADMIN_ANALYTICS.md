# 管理员数据看板实现

代码位于Web应用：页面`src/app/admin`，交互`src/components/admin-console*`与`analytics-charts.tsx`，API`src/server/admin-analytics.ts`，纯统计引擎`src/server/analytics/engine.ts`。公开字段唯一权威为`packages/contracts/src/analytics.ts`，OpenAPI运行`npm run contracts:export`生成。初期目录20工具不是图表上限，按稳定ID及任务冻结版本分析。

## 页面与接口

8类页面：`/admin`总览，以及`/admin/users|tools|funnel|retention|versions|finance|data-quality`。默认先选范围再查询；没有权限、未采集、未成熟、无样本、覆盖不足和未知费用各自显示，不填示例数字。个人控制台仍在`/ja/account`，只查询本人事实。

- `GET /api/admin/session`：当前角色和权限，服务端复核、审计。
- `POST /api/admin/analytics/reports`：创建15分钟有效的固定数据库快照，201返回报告。开始/结束为UTC半开区间；IANA时区决定日/周/cohort，最多366天，小时粒度最多31天。
- `GET /api/admin/analytics/reports/:id`：同一报告8页面、钻取、排序及分页。`section`控制分析视图；`table`独立指定users/tools/versions/retention/jobs/orders/ledger/costs/refunds；`offset`和`limit`控制该表，其他表也限量。默认25、最大100条。全部图表不是把当前页明细重新当作总体；局部特效排行明确标注当前页。
- `GET .../:id/export?section=users|tools|jobs|orders|ledger|costs`：同一快照及钻取的脱敏CSV，最多5000行，超限请缩窄范围。包含as_of、metric_version、原筛选及导出类别；公式前导字符加安全前缀。浏览器携带Bearer拉Blob，不把Token放URL。
- `GET /api/analytics/config`、`POST /api/analytics/events`：登录后粗粒观察配置及白名单事件；配置默认关闭。

每类源事实最多20000条，超限明确返回`QUERY_TOO_LARGE`，不会截断后提供貌似正确的总量。工具/模型等维度由引擎在有界事实快照内筛选；大数据场景先缩短区间，未来可增加同口径分区/小时汇总。缓存到期不可读，下一次创建清理过期快照；稀疏用户日热力图仅Top20，所有用户仍可分页和钻取。

## 指标映射与证据

指标版本`1.0.0`，每项包含状态、样本、分子/分母、覆盖起点、辅助成熟/缺失计数；同时返回前一等长区间。下面所有算法位于engine.ts，合成数据的独立预期见`tests/analytics-engine.test.ts`，实际SQL→HTTP数值见`tests/admin-analytics-api.test.ts`。

| 指标 | 实现/展示要点 |
|---|---|
| M01–M04 | 注册用户、去重生成用户/任务、人均及P50/P90；0用量分布包含指定注册用户集合，不冒充全部访问DAU |
| M05–M06 | 分用户状态/工具/积分，近30天及累计与期间分列；consume取真实账本，不把预留当消费 |
| M07–M09 | completed/(completed+failed)，在途/取消单列；特效任务份额与可重叠用户覆盖分开 |
| M10 | 开放特效可见曝光→首次选择，按page/tool/exposure关联；匿名及未显示的原生select选项不造曝光 |
| M11–M13 | 同一成功完成cohort成熟24h；查看、显式下载链接签发、先查看后下载；缺失窗口、未知顺序、提前资产损失单列 |
| M14 | 按动作发生的自然周去重保存行为用户，不能累加日UV；跨周/窗口不满足时显式限制 |
| M15 | 注册后24h首次成功激活；未满24h不混入最终比例 |
| M16–M17 | 首次成功自然日cohort的D1/D7与第7–13天W1；等对应日结束，历史左截断标不完整 |
| M18–M19 | 成功父任务24h继续编辑、成功端到端P50/P95；缺阶段时间不编造排队/供应商耗时 |
| M20–M22 | 使用用户期间付款、按实际paid_at/退款created时间分币种金额、成熟30天复购；累计退款不冒充当日事实 |
| M23 | provider_report/invoice实际成本分开，estimate/null另列；全局当前预算明确scope，不冒充期间或某环境花费 |
| M24 | 成熟7天任务最后有效显式评分，分母为已评分任务，同时展示评分覆盖；下载/继续编辑不自动算好评 |

任务/设备/版本筛选不能解释注册或订单归因时，相关指标返回`unsupported_filters`。不同币种从不相加；退款覆盖不完整时净额为null，实际已观测退款仅作明细；未知成本不归零或伪造利润。版本对比属于观察，不宣称因果/显著性。

## 采集、退款与权限

新增迁移必须按顺序安装：基础190001、Worker200400、控制台210100、个人控制台210200、管理员210300、设备210400。所有权限/配置变更均由受控服务端/运维SQL完成；没有网页自助授权或财务写操作。

- `console_roles`的analyst可读分析；finance和administrator有finance:read。每次查询/导出重新授权，快照仅创建者可读。撤掉财务角色后旧快照金额/成本立即脱敏；不能用section/table绕过。事件/管理表对anon/authenticated无直接访问权。
- `console_settings`默认environment=unclassified、collection_enabled=false。部署后由人工选择test/live并启用才声明新覆盖区间。历史GET下载、旧未知环境不回填归类，停采有区间缺口。
- 浏览器卡片至少50%连续可见1秒才报曝光；结果图片实际onLoad并可见后才报查看；事件最多3次有界重试，同event_id不变，账号切换会中止旧队列。反馈须服务端归属及完成后7天校验。
- 下载按钮使用带稳定action_id的POST。先持久化意图，签URL后确认；签名失败不算签发，确认失败留pending质量缺口且链接可用。计量代表下载链接签发，不能确认用户写入相册/磁盘。
- 新编辑请求的可选`X-Picjp-Device`只记录视口粗分类，首次任务创建事务冻结；旧客户端/历史为unknown。它不参与业务请求哈希，换设备重放不再次扣积分。
- Stripe退款收集独立于浏览器开关。Webhook验证原始签名、读取权威Charge，再分页读取Refund真实id/created/amount/currency/status，最多100条/8页；五种退款状态均保留，只有succeeded计实际退款。失败记录缺口并返回503让原签名事件重试；账务事务不重复入账或回收。订单累计与实际成功退款双向差异会提示，不自动改账。
- 退款覆盖开关`console_refund_settings.enabled`默认false。部署新代码及迁移、配置并验证退款Webhook订阅后，才由人工声明启用覆盖；没有历史回填时不声称过去完整。订阅保留checkout.session.completed/async_payment_succeeded、charge.refunded、charge.dispute.created，并接入refund.created/updated/failed、charge.refund.updated以追踪未结状态。
- 前端看不到完整Prompt、对象存储键/签名URL、provider request ID、Stripe支付ID；退款公共ID为稳定哈希。照片不随管理员查询公开，脱敏邮箱只保留首字及域名。

## 交付边界

本地测试使用合成用户/事实和离线端口，未连接真实支付/照片/模型。迁移、Vercel部署、云端联调、PAY-001、自然24h/7d/30d采集及人工模型evaluation继续独立验收。账户注销生命周期、受控调账/退款操作、第三方告警和规模化汇总不在本次只读看板实现中。
