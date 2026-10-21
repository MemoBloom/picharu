# SEO 采集镜像与首次真实导入

2026-10-21，目标为`picjp-web-seo / feat/seo-platform`。Google服务账号两项报表读取及Supabase SQL角色读取已通过；本页是后续操作步骤，不是云执行成功记录。

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

本次仍需验证Node完整报表字段的兼容性、ADC的实际scope及PostgREST访问；先前Python简化报表和SQL Editor角色检查不能代替这些运行结果。Google返回失败可能记录失败窗口，不覆盖既有成功事实。若出现`SEO_COLLECTION_FAILED`或`status:failed`，返回脱敏摘要进一步定位，不打印Secret或原始Google响应。

## 4. 核对数据库中的四个真实窗口

两次执行成功后，在同一个Supabase SQL Editor运行以下只读查询，日期与上面一致：

```sql
begin read only;
set local role service_role;
select public.seo_ingestion_health(false,'sc-domain:picmoko.com','559730643',
  '2026-10-17'::date,'2026-10-17'::date,'2026-10-18'::date,'2026-10-18'::date)
  as seo_import_readback;
rollback;
```

这里返回同一数组中的GSC三种粒度及GA4一种粒度，按每行`source/property/grain/day`核对范围。参数`false`只选择真实窗口；每项`status`及`successful_status`应为`complete`或`empty`，`completed_at`和`successful_at`有值，`quality`/`successful_quality`保留来源时区与质量说明。缺窗时状态为null，失败状态不能当作成功。成功后才筹备每日采集和监控；本步骤不创建Scheduler，不调用`daily/deliver/reconcile/rank`。

## 参考与验收边界

- [Cloud Build提交配置](https://docs.cloud.google.com/sdk/gcloud/reference/builds/submit)、[指定构建服务账号与日志](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)。
- [Cloud Run Job部署](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy)、[执行参数覆盖与等待](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/execute)、[Job访问Secret](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets)。

本地检查与CI验证见[交付记录](DELIVERY.md)。用户真实构建、Job执行及数据库回读须另存证据；空窗导入成功也不代表网站GA4标签收数、正式部署、搜索收录或效果评价已完成。
