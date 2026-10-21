# Console v1 数据与权限基础

实现：`apps/web/src/server/console.ts`，通过现有验证JWT的router接入；契约`packages/contracts/src/console.ts`。契约包新增版本1.2.0，HTTP与Worker协议仍1.0.0；Worker继续消费其固定1.1.0包，无需为只读看板升级运行依赖。

## 数据库安装与启用

新增`supabase/migrations/202610210100_console_foundation.sql`，须在基础Web与Worker两份迁移之后应用。只新增表/字段/触发器/函数，不重写旧迁移。**本轮没有应用云端数据库。**

迁移后：采集关闭、environment=unclassified、没有管理员。历史任务/订单/用户环境保留unclassified，不能伪装成测试或生产。新业务事实记录配置的环境；任务/订单内部账号标签取创建时快照；当前设备未知，后续浏览器接入不冒充可信设备识别。任务量来自edit_jobs，不取attempt/轮询事件计数。上传时间由首次uploading→ready转换记录，历史完成时间不臆造。

部署全部浏览器埋点和查询之后，运维在**匹配的独立测试数据库**设置环境，再显式启用采集；Production应使用live，测试流量不能进入正式数据库假装live。示例SQL（人工核对目标后执行，不是自动部署脚本）：

```sql
update public.console_settings set environment='test',collection_enabled=true where id;
-- 停止采集：关闭当前区间；重新启用创建新观察区间，中间缺口不会抹去。
update public.console_settings set collection_enabled=false where id;
```

`console_collection_periods`记录启停和环境切换。安装迁移不等于浏览器已接入；采集关闭或观察窗口不完整时，后续指标必须返回不可计算/覆盖不足。无历史保存数据，不反填0。

## 管理员角色

- analyst：analytics:read。
- finance：analytics:read及finance:read。
- administrator：上述读取权限；此名称不意味着已经有网页角色管理或资金操作接口。

首次授权由受控数据库管理操作完成，不能写用户可编辑metadata；验证目标用户ID后插入console_roles，reason必填，可设置expires_at。撤销使用revoked_at；每次API重新查询当前角色，不缓存授权。变更自动追加database来源审计，API session也追加审计。没有角色时/api/admin/session返回403。

```sql
-- 将示例UUID替换为人工核实的用户，不在应用源码中硬编码管理员。
insert into public.console_roles(user_id,role,reason)
values('00000000-0000-4000-8000-000000000001','analyst','经项目负责人批准的只读运营权限');
update public.console_roles set revoked_at=now()
where user_id='00000000-0000-4000-8000-000000000001' and role='analyst';
```

管理/事件/下载动作表启用RLS且不授予anon/authenticated直接读写权限，RPC仅service_role执行。浏览器持有普通用户JWT，由API验证后传user_id。完整Prompt、密钥、照片、storage_key和签名URL不写入analytics_events。查询/导出阶段须在相应SQL函数内部授权并审计，不能只隐藏导航。

## 事件与下载协议

已提供接口，精确字段见生成OpenAPI：

| 接口 | 语义 |
|---|---|
| GET /api/admin/session | 当前角色/权限及采集设置；无权限403；no-store |
| POST /api/analytics/events | 单条曝光/首次选择/结果查看/正负反馈，严格字段及大小限制；浏览器自报为低信任观测 |
| POST /api/images/:id/download | 显式本人成功结果下载，action_id跨重试稳定；返回recording状态 |
| GET /api/images/:id/download | 原兼容路径，不计保存行为；UI迁移在后续阶段 |

曝光要求已开放工具、同一page/tool仅一次、至少50%可见/1000ms（后两项是浏览器自报，并非服务端证明）；选择要求属于本人同page/tool/exposure且时间不早于曝光。查看/反馈关联本人成功任务，tool及结果ID从服务端补齐；查看拒绝已删/过期图片。反馈在完成7天内，追加事件，后续分析按最后有效反馈计一份。客户端时间允许24h内迟到和最多5分钟未来偏差，保留received_at；漏斗不得把其时钟当权威。无任意JSON属性或自由输入。

event_id重放必须字段一致；跨用户/不同内容冲突409。曝光/查看等还按业务键去重，换新event_id不能增加同一page/tool曝光。模型版本从任务快照关联，客户端不能指定。

显式下载只接受本人仍有效的生成结果并关联completed任务：先持久化pending动作→签短期链接→SQL确认并写server_download事件。重复action不多计。签名失败返回503，不产生保存事件；确认时再次拒绝已删/过期结果。确认写入故障时返回有效下载及recording=unavailable，保留pending动作供质量页识别与复盘，不重发生成任务。下载动作未完整覆盖的窗口不能输出强保存率结论。跨动作重复下载仍可能多条事件，**指标分子必须按job_id去重**。链接签发不证明文件成功写入设备。

阶段1尚未接入真实浏览器埋点或实现聚合看板；这两个增量继续在阶段2、3完成。无Stripe调用、模型调用、云配置、部署或真实用户数据采集。
