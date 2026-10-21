# SEO 每日采集与告警配置

2026-10-21，目标 `worktrees/picjp-web-seo / feat/seo-platform`。用户已报告七日回补和健康检查通过，见[健康反馈](../verification/SEO_HEALTH_2026-10-21.json)。本文是待用户执行的配置步骤，尚未创建定时任务、告警或发送通知。

## 方案与时间

每天日本时间10:00（北京时间09:00），独立Cloud Run Job先执行`daily`，成功后立即执行`health`。任一步失败则Job失败；采集失败时不会把旧健康结果当作本次成功。定时身份仅可启动该Job，运行仍使用现有SEO读取账号；复用已验证镜像，不需要重新上传源码或构建。按实际云用量计费，不调用图片模型、业务事件投递或收费排名。

| 资源 | 名称/配置 |
|---|---|
| Cloud Run Job | `picmoko-seo-daily-staging` |
| Scheduler Job | `picmoko-seo-daily-trigger-staging` |
| Scheduler调用身份 | `picmoko-seo-scheduler@picjp-staging.iam.gserviceaccount.com` |
| 运行身份 | `picmoko-seo-reader@picjp-staging.iam.gserviceaccount.com` |
| 项目/区域 | `picjp-staging` / `asia-northeast1` |
| Cron /时区 | `0 10 * * *` / `Asia/Tokyo` |

以下命令逐块在Cloud Shell执行，前一步成功再继续。若资源已存在，先describe核对其身份、镜像、命令、目标和开关，不重复创建或盲目覆盖。权限错误返回脱敏错误定位，不授Owner/Editor绕过。

## 1. 启用API，创建定时调用身份

```sh
gcloud services enable cloudscheduler.googleapis.com monitoring.googleapis.com \
  --project=picjp-staging
```

```sh
gcloud iam service-accounts create picmoko-seo-scheduler \
  --project=picjp-staging \
  --display-name='Picmoko SEO Scheduler'
```

该新账号不需要GSC/GA4成员资格、Supabase Secret读取或项目级Run权限。操作者需有创建服务账号/Job/Scheduler及对相关身份actAs的权限；Cloud Scheduler服务代理使用API启用时自动配置的权限，不把该代理拿来充当调用账号。

## 2. 创建每日采集Job

使用`/bin/sh -c`按顺序执行现有两个CLI命令；`^@^`是gcloud列表参数的自定义分隔符，使整段shell表达式作为一个参数。900秒是整个回补及健康检查的总上限。

```sh
gcloud run jobs deploy picmoko-seo-daily-staging \
  --project=picjp-staging --region=asia-northeast1 \
  --image=asia-northeast1-docker.pkg.dev/picjp-staging/picjp/seo-collector:seo-ed0b30305583 \
  --service-account=picmoko-seo-reader@picjp-staging.iam.gserviceaccount.com \
  --command=/bin/sh \
  --args='^@^-c@node --import tsx scripts/seo/collect.ts daily && node --import tsx scripts/seo/collect.ts health' \
  --set-env-vars=SUPABASE_URL=https://oltbspdxgrnrqhkupuco.supabase.co,SEO_GSC_PROPERTY=sc-domain:picmoko.com,SEO_GA4_PROPERTY_ID=559730643,SEO_GA4_TIME_ZONE=Asia/Tokyo,SEO_COLLECTION_ENABLED=true,SEO_ANALYTICS_ENABLED=false,SEO_INDEXING_ENABLED=false,SEO_RANK_API_ENABLED=false,GENERATION_ENABLED=false \
  --set-secrets=SUPABASE_SECRET_KEY=picjp-supabase-secret:1 \
  --tasks=1 --parallelism=1 --max-retries=0 \
  --task-timeout=900s --cpu=1 --memory=512Mi --quiet
```

本Job的采集开关持续开启；原`picmoko-seo-import-staging`保留人工指定日期/诊断用途。当前标签尚未取得镜像digest证据，后续固定部署可从Artifact Registry记录实际digest。此处不替换镜像或隐式拉取新构建。

先人工检查组合命令，尚未开启定时：

```sh
gcloud run jobs execute picmoko-seo-daily-staging \
  --project=picjp-staging --region=asia-northeast1 --wait
```

```sh
gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="picmoko-seo-daily-staging"' \
  --project=picjp-staging --freshness=1h --limit=30 \
  --format='json(timestamp,severity,textPayload,jsonPayload)'
```

应有同次执行的GSC/GA4各7天complete、后续health JSON `healthy=true`、`is_fixture=false`，以及容器exit(0)。若失败先检查同次执行，不能因重跑旧Job正常而跳过新Job验收。

## 3. 配置告警邮箱与三项告警

在Google Cloud顶部选`picjp-staging` → Monitoring → Alerting → Edit notification channels / Manage notification channels → Email → Add new，填接收告警的邮箱、显示名`Picmoko SEO alerts`并保存。若要求验证，按邮箱提示完成。Resend/Supabase SMTP继续用于产品认证邮件；运维告警使用Cloud Monitoring通知渠道。

每条策略都选择此渠道。仅配置邮箱不代表已验证收件，按第5节测试。控制台用词可能因语言略有差异，可搜索英文功能名定位。

### A. 运行失败与数据质量/调度错误（日志告警）

打开Logging → Logs Explorer，将下列过滤器完整粘贴，选择Create alert，名称`Picmoko SEO runtime or scheduler error`。通知最小间隔设1小时，自动关闭设1天，选择上述邮箱并保存。过滤器包含明确标记的测试日志入口，供第5节验证通知。

```text
(
  resource.type="cloud_run_job"
  resource.labels.job_name="picmoko-seo-daily-staging"
  (severity>=ERROR OR jsonPayload.healthy=false OR jsonPayload.status="failed")
)
OR
(
  resource.type="cloud_scheduler_job"
  resource.labels.job_id="picmoko-seo-daily-trigger-staging"
  severity>=ERROR
)
OR
(
  log_id("picmoko-seo-alert-test")
  jsonPayload.component="picmoko-seo"
  jsonPayload.test=true
)
```

不只筛选severity：健康JSON可能为默认级别，必须保留`jsonPayload.healthy=false`。只有最近实际新日志才能触发通知，预览历史日志不算通知验收。

### B. Cloud Run执行失败（指标告警）

Monitoring → Alerting → Create policy → Select a metric，关闭只显示活动指标的筛选，选择Cloud Run Job → Completed Executions，指标全名`run.googleapis.com/job/completed_execution_count`。资源筛选`project_id=picjp-staging`、`location=asia-northeast1`、`job_name=picmoko-seo-daily-staging`。指标标签`result`选择失败值；以控制台实际枚举为准，不选择succeeded。

对齐窗口5分钟，窗口内求和；跨时间序列求和。触发条件为大于0，retest window为0/No retest，缺数据不当失败，名称`Picmoko SEO failed execution`。这样覆盖容器无法启动、OOM、超时等没有应用JSON的失败。先在Metrics Explorer看到实际指标并确认枚举；控制台无失败值时保留待验证状态，不把未建立的失败筛选算完成。

### C. 超过一天没有完成执行（PromQL告警）

Monitoring → Alerting → Create policy → PromQL编辑器。使用Cloud Run内建指标检查有无完成记录，不要求网站有流量，也不依赖应用主动报告异常：

```promql
(sum(sum_over_time({"run.googleapis.com/job/completed_execution_count",monitored_resource="cloud_run_job",project_id="picjp-staging",location="asia-northeast1",job_name="picmoko-seo-daily-staging"}[24h30m])) < 1)
or
absent_over_time({"run.googleapis.com/job/completed_execution_count",monitored_resource="cloud_run_job",project_id="picjp-staging",location="asia-northeast1",job_name="picmoko-seo-daily-staging"}[24h30m])
```

评估间隔1分钟，retest window设5分钟，选择邮箱，名称`Picmoko SEO daily execution missing`。无完成记录连续24小时30分后，再持续5分钟触发。选择所有result：失败完成由策略A/B告警；本策略负责漏跑/暂停/没有完成的情况。先用第2节执行建立真实时间序列并在查询编辑器验证语法/资源匹配，不能将“查询无匹配”草率当成正常；可先单独查询`sum(sum_over_time(相同指标选择器[24h30m]))`核对已有完成数应至少为1，保存前恢复原表达式；同时覆盖持续上报0值和整个时间序列消失两种情况。

普通metric-absence规则上限23.5小时，会对每日任务产生误报，故这里用PromQL范围查询。实际策略解析/保存及至少一次自然触发仍是待云端验收，本文静态检查不能代替Google控制台验证。

## 4. 授权调用并创建每日Scheduler

仅在第2节人工组合执行通过、告警渠道和策略就绪后执行。这里只对新每日Job授予Invoker，Scheduler调用不带overrides，因此无需`run.jobs.runWithOverrides`权限。

```sh
gcloud run jobs add-iam-policy-binding picmoko-seo-daily-staging \
  --project=picjp-staging --region=asia-northeast1 \
  --member=serviceAccount:picmoko-seo-scheduler@picjp-staging.iam.gserviceaccount.com \
  --role=roles/run.invoker --quiet
```

```sh
gcloud scheduler jobs create http picmoko-seo-daily-trigger-staging \
  --project=picjp-staging --location=asia-northeast1 \
  --schedule='0 10 * * *' --time-zone=Asia/Tokyo \
  --uri='https://run.googleapis.com/v2/projects/picjp-staging/locations/asia-northeast1/jobs/picmoko-seo-daily-staging:run' \
  --http-method=POST --headers=Content-Type=application/json \
  --message-body='{}' \
  --oauth-service-account-email=picmoko-seo-scheduler@picjp-staging.iam.gserviceaccount.com \
  --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform \
  --attempt-deadline=180s --max-retry-attempts=0 --max-retry-duration=0s
```

目标是Google API的`:run`，使用OAuth而非OIDC。Scheduler等待的是启动API返回，不是15分钟容器结果；HTTP成功不能代替Job成功。Scheduler与Cloud Run平台重试均0，采集器Google只读请求仍有既有重试。Scheduler至少一次投递语义仍可能重复触发；数据库同窗导入幂等，不能宣称exactly once或跨执行全局互斥。

立即从Scheduler试运行一次，确认调用身份和目标：

```sh
gcloud scheduler jobs run picmoko-seo-daily-trigger-staging \
  --project=picjp-staging --location=asia-northeast1
```

在Cloud Run每日Job中找到此次新Execution，等待完成再读取第2节日志。保留Execution名称以区分人工与定时调用。

```sh
gcloud scheduler jobs describe picmoko-seo-daily-trigger-staging \
  --project=picjp-staging --location=asia-northeast1 \
  --format='yaml(name,state,schedule,timeZone,httpTarget.uri,httpTarget.oauthToken.serviceAccountEmail,lastAttemptTime,status,scheduleTime)'
```

应为ENABLED、`0 10 * * *`、Asia/Tokyo、正确目标及调用身份。实际下一次10:00自然触发后，继续核对该次Execution与健康JSON，不能用Force run代替自然日程验收。

## 5. 测试通知，保存验收结果

告警A保存后，在Cloud Shell写入独立、明确标记的测试日志；这会实际触发你配置的运维通知，不修改任何导入窗口：

```sh
gcloud logging write picmoko-seo-alert-test \
  '{"component":"picmoko-seo","test":true,"message":"Notification delivery test; not a production pipeline failure"}' \
  --project=picjp-staging --payload-type=json --severity=NOTICE
```

在Monitoring → Alerting → Incidents确认测试事件，检查邮箱收到含测试说明的告警。通常需等待数分钟；若无通知，依次看测试日志是否入库、策略是否启用/过滤器命中、是否生成Incident、邮箱渠道及垃圾箱/通知频率限制，先排查再重发。

这个测试验证A策略的匹配→Incident→邮箱链路，不冒充真实运行失败或B/C条件已自然触发。B需核对失败指标和策略条件；C需查询验证、随后持续观察。在staging另做失败演练时使用独立测试资源，不故意破坏正式报表窗口或撤销现有Secret权限。

回传以下安全信息即可：Scheduler状态/频率/时区、Scheduler触发的新Execution名称与结果、health摘要、三条策略名称及是否启用、是否收到明确的测试通知。不要发Token、Secret或邮箱验证码。

暂停定时：

```sh
gcloud scheduler jobs pause picmoko-seo-daily-trigger-staging \
  --project=picjp-staging --location=asia-northeast1
```

计划维护时在Monitoring Snoozes中对相应策略设置有结束时间的静默，避免漏跑告警；完成后resume Scheduler并验证。暂停不会终止已经运行的Execution。

## 官方依据与边界

- [Cloud Run定时执行](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule)、[HTTP目标认证](https://docs.cloud.google.com/scheduler/docs/http-target-auth)。
- [Job部署参数](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy)、[gcloud自定义列表分隔符](https://docs.cloud.google.com/sdk/gcloud/reference/topic/escaping)、[Scheduler创建参数](https://docs.cloud.google.com/sdk/gcloud/reference/scheduler/jobs/create/http)。
- [日志告警及测试](https://docs.cloud.google.com/logging/docs/alerting/log-based-alerts)、[Cloud Run内建指标](https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z)、[PromQL告警](https://docs.cloud.google.com/monitoring/alerts/using-promql)、[metric-absence上限](https://docs.cloud.google.com/monitoring/alerts/metric-absence)。

本地只准备文档/核对命令，不具有本机gcloud/ADC，云配置和邮件收件均待用户实际执行验收。S0–S4的内容样例/日语评价、标签收数、业务/非空对账、发布和观察效果仍独立验收。
