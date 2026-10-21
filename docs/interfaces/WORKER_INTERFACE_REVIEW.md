# Worker 与其他模块接口评审

日期：2026-10-20。用户要求先确认接口清晰，再开始代码开发。结论：现有设计已清楚规定职责和恢复策略；开发前发现的内部类型、首次领取标志和跨仓库版本交付缺口已补为代码契约，足以推进供应商无关的第一版实现。真实模型端点能力尚未确认，不能据此开启商业生成。

| 边界 | 结论/落实 |
|---|---|
| Web→PG→Worker | 不变快照为唯一生成输入；Web负责用户校验/Prompt/预留；不引入Web可靠HTTP触发依赖 |
| 契约分发 | packages/contracts是唯一权威；新增私有RPC响应/数据类型，包1.1.0；公开HTTP仍1.0.0。Worker固定vendor包和摘要，无兄弟目录依赖 |
| 领取与恢复 | claim新增fresh_submission与checkpoint；仅首次事务新attempt可以submit；恢复必须查询同一request key |
| 数据/积分 | 追加202610200400_worker.sql，复用现有账户/账本。owner advisory→job锁，token+version+DB时限，终态幂等确认 |
| 结果与R2 | 固定输入manifest/hash；PNG result与JPEG preview内容寻址；登记生成资产及consume同一PG事务 |
| 供应商 | Adapter协议清楚；provider/model/adapter版本固定。真实端点未选定，registry为空且启用拒绝启动 |
| Scheduler/IAM | HTTP字段已执行校验；IAM由Cloud Run平台负责，尚待云端证明 |
| GPU推荐 | Worker无直接依赖，Web将已选模板/模型固化进快照 |

首版明确收窄：每job一个attempt；预算为provider/model/adapter累计上限，不按周期自动重置；未知成本继续占预留；complete/fail可确认终态重放，其他写回响应丢失走数据库重新领取；供应商必须能返回可恢复ResultRef。详细类型与RPC参数见工作区Worker设计第7节；落实差异和测试见Worker仓库docs/INTERFACES.md、TESTING.md。

Web的SQL与原生并发测试已同时加载基础和Worker增量migration。Worker独立固定两份SQL测试快照，并执行真实SQL集成和原生PG多连接测试。权威migration尚未用于线上，不能把本地测试等同Supabase/Cloud Run联调。

仍待：真实供应商能力/计费/幂等证据；孤儿R2对象定期列举对账；外部成本核对和告警；Cloud Run IAM、实际超时/资源/恢复演练；20工具人工效果evaluation。主程序不含测试供应商，不改Web生成开关。
