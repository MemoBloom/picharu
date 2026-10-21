# SEO 采集镜像与首次真实导入

当前健康反馈（2026-10-21）：用户报告healthy=true、四组各7天成功、missing_days/alerts均为空，见[反馈证据](../verification/SEO_HEALTH_2026-10-21.json)。按用户反馈健康检查通过，未补造原始JSON/执行ID。下一步按[每日采集与告警指南](SCHEDULING_AND_ALERTS.md)建立独立每日Job、最小权限Scheduler身份与三项告警；配置、调度触发及通知收件均待用户执行验收。

当前七日回补进度（2026-10-21）：用户报告GSC/GA4各7天complete、容器exit(0)，见[七日回补反馈](../verification/SEO_DAILY_IMPORT_2026-10-21.json)。尚未提供原始日期/执行ID；下一步运行health并回传JSON，以核对28窗口、缺日、陈旧及质量告警。health仅读取Supabase并计算状态，不重新拉取Google报表或写入导入数据；无需开启collection开关。健康通过以healthy=true、is_fixture=false及四组各7个成功日、missing_days/alerts为空为准。

当前验收（2026-10-21）：用户已回传[Supabase四窗口只读结果](../verification/SEO_IMPORT_READBACK_2026-10-21.json)，GSC 2026-10-17的property/page/query_page及GA4 2026-10-18的landing_event，资源/时区均正确；四项status与successful_status均empty，完成时间及成功时间齐全，limited=false、dropped_rows=0。指定日期的真实Google→Cloud Run→Supabase→只读回查链路通过。empty表示可导入结果为空，不代表网站无访问；GSC不保证完整行、GA4仍不保证最终性。下一步执行第5节七日回补，再检查健康状态；标签接收、调度/监控、内容人工评价和正式部署仍待。下文构建/首次运行记录保留为操作历史，以本段为当前状态。

2026-10-21，目标为`picjp-web-seo / feat/seo-platform`。Google服务账号两项报表读取及Supabase SQL角色读取已通过；本页是后续操作步骤，不是云执行成功记录。

最新进度：用户已回传第1步`SEO_BUILD_OK`及镜像地址，来源为ed0b30305583d378d06b015fa41925f1b6701189，见[构建摘要](../verification/SEO_IMAGE_BUILD_2026-10-21.json)。本次从第2步继续，无需重新构建；Job部署、真实导入及回读仍待执行。未取得Cloud Build ID或镜像digest，不把标签当作不可变digest。

后续进度：用户已回传[首次GSC运行日志](../verification/SEO_GSC_IMPORT_2026-10-21.json)，2026-10-17为`status:complete`，容器`exit(0)`，GSC运行导入流程按反馈通过。下一步运行第3节GA4命令，再做第4节数据库回读；不重跑GSC。此处CLI complete不区分有数据/空窗，不能当作已有真实流量、标签收数或整个SEO上线成功。

最新反馈：用户也报告[GA4 complete/exit(0)](../verification/SEO_GA4_IMPORT_2026-10-21.json)，未提供原始日志日期或execution ID。下一步直接第4节只读回查目标日期/资源与四个窗口，不再重跑两项导入。GA4具体日期、时区及空窗/非空结果以数据库回读为准。

先完成第1步并返回构建结果，再继续第2–4步。Cloud Build、Cloud Run及存储按Google Cloud实际用量计费；本流程不调用图片模型、收费排名或支付接口。

## 1. 在 Cloud Shell 构建镜像

本地提供`artifacts/picmoko-seo-build-source.tar.gz`及同名`.sha256`。归档从已提交的Git版本白名单生成，仅包含容器构建配置、Node清单、服务端源码和采集脚本；不包含本机环境、私钥、照片、Git或依赖目录。`seo-source-revision.txt`记录来源提交。

打开Google Cloud控制台，选中`picjp-staging` → 顶部Cloud Shell → 终端菜单“上传文件”，将这两个文件上传到主目录。在Cloud Shell执行：

```sh
cd "$HOME"
sha256sum -c picmoko-seo-build-source.tar.gz.sha256
```

显示`OK`后再执行：

```sh
seo_build_dir="$(mktemp -d)"
tar -xzf "$HOME/picmoko-seo-build-source.tar.gz" -C "$seo_build_dir"
cd "$seo_build_dir"
bash scripts/seo/build-in-cloud-shell.sh
```

脚本复用现有`picjp`镜像仓库、`picjp-image-builder`构建账号和`picjp-staging-picjp-build-asia-northeast1`源码bucket；只读检查这些资源，然后提交构建。缺少资源或权限就停止，不重新授权、不切换成图片Worker身份。构建读取`Dockerfile.seo`，以Linux/amd64构建并禁网运行`--help`，通过后才上传独立`seo-collector`镜像。

完成后返回`SEO_BUILD_OK`和`image=…`两行。失败时返回错误代码及相关错误文字；不要上传Cloud Shell令牌、环境变量或Secret值。构建过程不读取Supabase Secret，不部署或执行Job，不改变现有Worker。

## 2. 专用运行身份与 Job 配置

第1步成功后执行。本节会给已有SEO账号增加**仅一个Secret**的读取权限，然后创建或更新独立`picmoko-seo-import-staging` Job。Supabase Secret是数据库服务端凭据，权限不局限于SEO；应用只调用SEO RPC，但不能把该应用约束视为凭据权限隔离。长期可评估独立受限数据库身份，本次复用已验证的现有凭据，不向浏览器暴露。

已有`picjp-supabase-secret:1`必须属于此前SQL测试的同一Supabase项目。命令只引用Secret名称，不打印或复制其值；如果已轮换版本，先核对当前有效版本，不能盲目使用旧版本。

```sh
gcloud secrets add-iam-policy-binding picjp-supabase-secret \
  --project=picjp-staging \
  --member=serviceAccount:picmoko-seo-reader@picjp-staging.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor --quiet
```

把构建返回的完整镜像URL填入下方引号内。这个变量保存公开资源地址，不是密钥：

```sh
seo_image='在此填写第1步返回的完整image值，不包含image=前缀'
case "$seo_image" in
  asia-northeast1-docker.pkg.dev/picjp-staging/picjp/seo-collector:seo-*) ;;
  *) echo '请填写SEO镜像URL'; false ;;
esac
```

确认URL正确后部署，默认参数仅显示帮助，**不立即执行**：

```sh
gcloud run jobs deploy picmoko-seo-import-staging \
  --project=picjp-staging --region=asia-northeast1 \
  --image="$seo_image" \
  --service-account=picmoko-seo-reader@picjp-staging.iam.gserviceaccount.com \
  --command=node --args=--import,tsx,scripts/seo/collect.ts,--help \
  --set-env-vars=SUPABASE_URL=https://oltbspdxgrnrqhkupuco.supabase.co,SEO_GSC_PROPERTY=sc-domain:picmoko.com,SEO_GA4_PROPERTY_ID=559730643,SEO_GA4_TIME_ZONE=Asia/Tokyo,SEO_COLLECTION_ENABLED=false,SEO_ANALYTICS_ENABLED=false,SEO_INDEXING_ENABLED=false,SEO_RANK_API_ENABLED=false,GENERATION_ENABLED=false \
  --set-secrets=SUPABASE_SECRET_KEY=picjp-supabase-secret:1 \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=300s \
  --cpu=1 --memory=512Mi --quiet
```

操作者需要部署Job、actAs该服务账号及绑定Secret IAM的权限。若权限错误，保留错误定位，不授Owner/Editor绕过。只读Google权限由已配置的GSC/GA4成员身份提供；Cloud Run使用ADC，不下载私钥。构建账号、SEO运行账号和现有图片Worker运行账号各自独立。

## 3. 分开执行两个指定日期

两条命令**分别执行，前一条成功后再运行后一条**。执行参数只覆盖本次运行，Job默认参数仍是帮助。第一次会写SEO导入批次及经过路径清洗的报表事实，日期沿用已成功预检的两天：

```sh
gcloud run jobs execute picmoko-seo-import-staging \
  --project=picjp-staging --region=asia-northeast1 \
  --args=--import,tsx,scripts/seo/collect.ts,gsc,2026-10-17 --wait
```

```sh
gcloud run jobs execute picmoko-seo-import-staging \
  --project=picjp-staging --region=asia-northeast1 \
  --args=--import,tsx,scripts/seo/collect.ts,ga4,2026-10-18 --wait
```

在Cloud Run → Jobs → `picmoko-seo-import-staging` → 最新执行 → Logs，分别返回采集器输出的JSON摘要。预期`source:gsc/ga4`，`results`内对应日期`status:complete`。这是CLI操作完成标记；真实无报表行时数据库窗口应为`empty`，不能宣称获得了流量。平台重试为0；采集器内部对Google只读请求最多尝试3次，数据库按日期/粒度幂等导入。失败就停止排查，不自动连跑、不扩大权限。

也可在Cloud Shell直接读最近日志（同时保留结构化jsonPayload与普通textPayload，按日期/来源核对，返回采集器JSON摘要即可）：

```sh
gcloud run jobs logs read picmoko-seo-import-staging \
  --project=picjp-staging --region=asia-northeast1 \
  --limit=20 --format='json(timestamp,jsonPayload,textPayload)'
```

如果没有输出，使用上面的Logs界面核对最新执行；不要为了获取日志重跑导入。首次先完成GSC并回传结果，再运行GA4。

2026-10-21 用户已返回执行引用`picmoko-seo-import-staging-dtx6n`，但上述日志读取无JSON。此时成功/失败均未确定，见[执行引用记录](../verification/SEO_GSC_EXECUTION_2026-10-21.json)。先只读检查同一个执行，不重跑或重新部署：

```sh
gcloud run jobs executions describe picmoko-seo-import-staging-dtx6n \
  --project=picjp-staging --region=asia-northeast1 \
  --format='yaml(status)'
```

再直接查询Cloud Logging，保留启动/系统错误和容器输出，不限定JSON、严重等级或执行标签：

```sh
gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="picmoko-seo-import-staging"' \
  --project=picjp-staging --freshness=7d --limit=30 \
  --format='json(timestamp,severity,textPayload,jsonPayload)'
```

返回两项查询结果，包括空数组或错误文字；日志缺失不等于导入成功。若仍无日志，可在Cloud Run → Jobs → 该Job → 指定执行 → Logs检查，也要保留状态中的失败原因。下一步根据状态和日志定位，不能仅凭执行详情提示扩大IAM权限或重发任务。

本次仍需验证Node完整报表字段的兼容性、ADC的实际scope及PostgREST访问；先前Python简化报表和SQL Editor角色检查不能代替这些运行结果。Google返回失败可能记录失败窗口，不覆盖既有成功事实。若出现`SEO_COLLECTION_FAILED`或`status:failed`，返回脱敏摘要进一步定位，不打印Secret或原始Google响应。

## 4. 核对数据库中的四个真实窗口

两次执行成功后，在同一个Supabase SQL Editor运行以下只读查询，日期与上面一致：

打开此前执行SEO迁移的项目 → SQL Editor → New query，整段执行并返回`seo_import_readback`的JSON单元格。查询只读，并在结束时恢复本次事务的角色设置。

```sql
begin read only;
set local role service_role;
select public.seo_ingestion_health(false,'sc-domain:picmoko.com','559730643',
  '2026-10-17'::date,'2026-10-17'::date,'2026-10-18'::date,'2026-10-18'::date)
  as seo_import_readback;
rollback;
```

这里返回同一数组中的GSC三种粒度及GA4一种粒度，按每行`source/property/grain/day`核对范围。参数`false`只选择真实窗口；每项`status`及`successful_status`应为`complete`或`empty`，`completed_at`和`successful_at`有值，`quality`/`successful_quality`保留来源时区与质量说明。缺窗时状态为null，失败状态不能当作成功。成功后才筹备每日采集和监控；本步骤不创建Scheduler，不调用`daily/deliver/reconcile/rank`。

该函数总会列出四个预期窗口，返回四项本身不表示已导入，必须看状态和完成时间。预期为GSC 2026-10-17的property/page/query_page及GA4 2026-10-18的landing_event。`empty`表示本次可导入结果为空，不等于网站当天没有访问；`failed`/`pending`/null需定位原因。不要因空窗重新执行任务或重装迁移。

## 5. 验证每日七日回补与健康检查

第4节指定窗口已通过后，使用同一镜像/Job执行真实七日回补。按各来源时区计算D-9至D-3共7天，GSC每天3粒度、GA4每天1粒度，共28窗口；与首次验证日期重叠时按原幂等导入逻辑更新。`SEO_COLLECTION_ENABLED=true`与900秒超时只覆盖本次执行。Google报表读取与数据库写入会实际发生。

```sh
gcloud run jobs execute picmoko-seo-import-staging \
  --project=picjp-staging --region=asia-northeast1 \
  --args=--import,tsx,scripts/seo/collect.ts,daily \
  --update-env-vars=SEO_COLLECTION_ENABLED=true \
  --task-timeout=900s --wait
```

完成后用第3节`gcloud logging read`查看最近日志，核对最新`gsc`和`ga4`数组各7天、每项status为complete及容器exit(0)。CLI complete仍可能对应数据库empty。失败先定位实际执行与失败日期。

回补通过后执行健康检查，并读取该次执行日志：

```sh
gcloud run jobs execute picmoko-seo-import-staging \
  --project=picjp-staging --region=asia-northeast1 \
  --args=--import,tsx,scripts/seo/collect.ts,health --wait
```

预期JSON healthy=true、is_fixture=false；sources含GSC property/page/query_page和GA4 landing_event共四组，每组expected_days=7、successful_days=7、missing_days=[]、alerts=[]，status为ready或empty，四个来源/粒度均覆盖各自7日，无缺日、失败、超时、陈旧或质量告警。全部empty可通过链路健康检查，但不构成收数或流量验收。仅首次4个窗口成功不满足28窗健康验收。随后再配置独立每日调度及监控接收；本节两次均为人工触发执行。

## 参考与验收边界

- [Cloud Build提交配置](https://docs.cloud.google.com/sdk/gcloud/reference/builds/submit)、[指定构建服务账号与日志](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)。
- [Cloud Run Job部署](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy)、[执行参数覆盖与等待](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/execute)、[Job访问Secret](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets)。

本地检查与CI验证见[交付记录](DELIVERY.md)。用户真实构建、Job执行及数据库回读须另存证据；空窗导入成功也不代表网站GA4标签收数、正式部署、搜索收录或效果评价已完成。
