# Web → Worker → R2 → 积分 → 结果

2026-10-20：本地代码及跨仓库离线验收完成；未部署这些增量、未追加收费模型调用。Web在`feat/picmoko-ui`，Worker在`feat/worker-foundation`。本轮没有修改共享契约或数据库迁移；仍为`@picjp/contracts@1.1.0`、HTTP `1.0.0`。

## 执行与交付

1. 浏览器调用`/api/images/upload-url`，向私有R2签名地址上传；`/api/images/complete`在Web服务端校验、规范PNG、生成预览并固定hash。
2. `/api/edit`校验owner、参数和模型能力，编译服务端Prompt。`app_create_job`同一事务固定快照、输入顺序和价格并预留积分。相同幂等key重放原任务，不再预留。
3. Worker通过共享PG领取任务。Scheduler的IAM/OIDC `POST /internal/v1/drain`负责唤醒；**Web无需持有Google凭据或等待模型完成**。数据库中的任务是持久队列，浏览器关闭不丢任务。当前没有配置或启用云端Scheduler。
4. 只有新attempt的`fresh_submission=true`可提交模型。正式同步适配器`yomi-sync-v1`固定`https://api.yomiapi.com/v1/images/edits`和`gpt-image-2.5`，首期仅单primary、standard、1:1。Prompt始终来自已创建快照。
5. HTTP200响应先保存在私有R2的`_worker-provider-cache/yomi-sync-v1/<数据库request-key>/response.json`，再记录ResultRef。跨进程恢复只读该缓存；缓存缺失、超时、HTTP错误均不表示未收费，不自动重提。缓存与一次性探测guard完全分开。
6. `storing`生成去元数据PNG与最长边768的JPEG，使用owner/job/attempt/hash结果key，写后读回核验。`settling`重新核验已登记对象后，数据库原子创建结果图片、标记完成并消费预留积分。
7. 前端按JobView轮询，completed后按`result_image_id`取得ImageView预览；每次下载重新获取签名地址。原有比较、继续编辑、取消、删除功能继续使用同源API。补齐waiting_provider、storing和needs_reconciliation的日文状态提示。

30分钟恢复期限耗尽时释放用户积分一次；无法核销的供应商成本仍占供应商预算。成功出图不等于已获取准确账单：`actual_cost=null`保留，不用积分价格或模拟金额冒充实际费用。累计预算上限、保守估计和人工核销仍须配置。

## 可重复离线检查

在父工作区安装好两个仓库依赖后执行：

```sh
bash scripts/test-full-flow.sh
```

根脚本只做编排，Web业务测试在本仓库`tests/full-flow.integration.ts`，Worker的测试桥在其仓库`tests/full-flow-driver.ts`。运行两个仓库各自的模块与固定契约，不添加兄弟仓库部署依赖。Worker在独立进程使用自己的原生媒体库，模拟实例重启；同一个PGlite数据库执行权威的两份migration。测试使用合成JPEG/PNG、S3命令替身、私有内存对象和固定供应商响应；默认fetch被禁止，子进程不继承云密钥环境。没有监听端口、真实网络请求或收费调用。

12个场景覆盖成功交付、响应缓存写成功但应答丢失、结果写成功但应答丢失、预览写失败、结算前DB故障、结算提交后应答丢失、对象损坏阻止结算、供应商响应丢失、无效媒体、取消/开关/预算、输入篡改、能力/余额不足。还验证：重复创建与完成只消费一次、外人读结果/任务均404、签名下载更新、继续编辑正确预留、删除后重放不复活、未知供应商成本不被清零。

每个仓库自己的`npm run verify`仍可独立执行；本套跨仓库测试必须显式运行根脚本，不在单仓库CI中偷偷寻找兄弟路径。远端跨仓库CI需另行固定两库revision，当前未配置。

## 下一次云端联调准备

- 保持`GENERATION_ENABLED=false`与`WORKER_ENABLED=false`，先部署本次代码。现有Cloud Run的成功预检不证明新同步适配器已部署。
- 两端使用同一个Supabase项目与R2桶。Web支持`SUPABASE_SECRET_KEY`，兼容原`SUPABASE_SERVICE_ROLE_KEY`；浏览器只配置publishable/anon key。新secret只发apikey，真实用户JWT鉴权保留。
- Web的`R2_ACCOUNT_ID`对应Worker的`R2_ENDPOINT`账户域名；桶名相同。Web浏览器上传还需桶CORS允许实际Web origin、签名要求的方法/头部；桶保持私有。
- 给`_worker-provider-cache/yomi-sync-v1/`配置**1天自动删除**的R2生命周期，长于30分钟恢复窗口；不要覆盖`_worker-yomi-once/`或删除其guard。此规则尚未在云端设置。
- 显式选择Worker的`WORKER_PROVIDER=yomi-sync-v1`、`YOMI_MODEL_ID=gpt-image-2.5`并映射YOMI_API_KEY；生成仍关闭。Web模型profile必须匹配provider/adapter/model/能力，只选择经过人工评价的工具；离线fixture的verified_tool_ids不用于生产，不默认开放20工具。
- 配置同一provider/model/adapter的预算行与IAM Scheduler（300秒deadline，服务240秒、drain200秒、模型180秒、lease270秒）；保持关闭，下一次有明确调用额度授权后再启用并验证真实链路。

本轮验证的是离线路由、持久事务、Worker、S3对象字节与前端消费的数据/状态；未新增浏览器完整生成交互验收，未验证云端排程、R2生命周期、真实Web Auth/CORS、最终账单核销或全部工具效果。
