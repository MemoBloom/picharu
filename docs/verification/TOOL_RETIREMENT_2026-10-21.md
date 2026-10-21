# 两项消除工具退出一期

2026-10-21。当前18个活动方向；remove_person与remove_object退役。历史Tool ID仍20项，18/20都不是长期能力上限。此文从原UI分支未提交记录提取，并按当前main重新核对，原记录仍在工作区快照中。

## 当前行为

- lifecycle.ts记录两项退役状态，activeTools输出18项；tools、契约与任务快照保留历史20 ID。
- /api/tools、推荐候选与公开页面/编辑选择器使用活动目录；两个旧工具详情404。
- 新的退役任务返回409 UNSUPPORTED_CAPABILITY，即使模型profile声称支持，也不预留积分。旧幂等key在退役/生成关闭判断之前重放，不重复创建或扣费。
- 公开详情使用findPublicToolContent；历史任务/看板使用findToolContent或findHistoricalToolContent。不回填旧版findToolContent仅查公开目录的语义，以免历史名称消失。
- 当前路由同时保留个人/管理员控制台、设备冻结、下载计数和退款事实处理；不恢复没有这些能力的旧router。SQL、OpenAPI结构与Worker契约不因退役变化。

## 验证证据

- main已有console-catalog-lifecycle.test.ts：18活动/20历史、模型允许时公开过滤、新任务拒绝、旧key重放/冲突；console-public-catalog.test.ts覆盖所有历史名称及公开路由/metadata 404。
- 本次补入原backend.test.ts两项真实PGlite事务回归：拒绝新退役任务后余额/队列不变；预置真实旧任务可读，生成关闭时重放仍只有一笔任务与3积分预留。
- 原tool-retirement.test.ts中的前后端目录一致性断言移入当前console-public-catalog.test.ts；其余历史/public判断由已有测试覆盖，避免恢复已过时的helper语义。
- 原候选曾完成126测试/90 SQL与12离线场景，1440/390px首页→18项目录→人物分类→头像详情及旧URL 404。本次结果单列在[19文件审计](RESIDUAL_WORK_AUDIT_2026-10-21.md)，不把历史浏览器记录冒充重新执行。

18方向代码已随看板/UI进入main；此前文档“仍未发布”只描述原开发时点。真实生成开关仍关闭，效果evaluation及完整云链路另行验收；独立SEO任务继续自行同步与审阅，不纳入本次补漏。
