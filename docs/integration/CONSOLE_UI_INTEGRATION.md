# 双看板与最新UI/Auth/SEO的兼容验证

日期：2026-10-21。此记录证明本地组合兼容；不是已合并主分支或已部署声明。

## 冻结输入和结果

- 控制台：`feat/console-analytics`，阶段3基线提交fc4aaa1及本轮收尾修订。
- 主UI：`repos/picjp-web`当前未提交的521个源码/静态资产输入，HEAD228e157。只读读取，逐文件SHA256确认全部保持不变；没有在本任务提交中收入这些未提交产品源码。
- SEO/Auth邮件：已提交的SEO 96c1824，其中包含已合并的认证基线。按真实共同祖先合成，保留控制台/Worker更晚的业务和契约修订。
- 完整输入指纹及最初冲突列表、解决策略、实际QA结果索引见[机器记录](CONSOLE_INTEGRATION_INPUTS.json)。

组合源在`/private/tmp/picjp-console-integrated-ipogacya`，独立离线npm ci安装179包，不引用兄弟仓库node_modules。TypeScript和42条页面构建通过。管理员/品牌/SEO71项、个人18项、工具弹窗8项及用户定位24项浏览器检查通过，均实际使用路由和PGlite；认证及图像为合成fixture，外网阻断，无收费或云写入。

用户定位24项补充验证：完整UUID/去空白忽略大小写邮箱、无匹配/重邮箱歧义、范围外账号不混入旧快照、脱敏响应/无URL回显/审计仅lookup_kind、非法输入400、撤权403立即清除旧数据；同一组合构建的路由/契约/依赖执行，外网阻断。

QA覆盖桌面1360×950/1536×1024、个人1280×950及手机320×840；日本正文实际加载Zen Kaku Gothic New。管理员分析角色撤销时，独立SEO reviewer仍能读取真实SQL报告；SEO缺少成熟数据按缺数显示，不产生产品管理员会话请求。正常管理员路径仍每次重验自身角色。弹窗18项，真实可见1秒曝光后选择关联落库；停用的两个公开详情页真实返回404。历史任务仍支持本人查询/下载。

## 合并时保留的连接点

| 交界文件 | 连接原则 |
|---|---|
| 根layout | 保留主UI字体/CSS、SEO metadataBase及robots；AuthProvider/Suspense内保留AnalyticsProvider |
| SiteShell / admin layout | 品牌与移动账户入口保留；产品admin路径用独立布局，`/admin/seo`由自己的角色和页面处理 |
| API客户端 | 保留expectedOwnerId、bounded signal/keepalive、严格DTO与Bearer CSV；SEO consent header及事件独立，不以SEO同意替代产品采集配置 |
| 登录/回调 | 保留主UI Google提示和已验证认证流程，SEO登录观察事件只作为附加测量 |
| 公共工具卡/目录 | 当前18项，卡片可见曝光与关联选择保留；历史名称通过findHistoricalToolContent查询，不恢复两个停用发现入口 |
| 编辑推荐/工具弹窗 | 推荐按钮调用ObservedToolButton；弹窗每项是独立观察组件，open且可用/未禁用才开始可见计时，不在map回调直接调用hook，不把draft自动恢复当点击 |
| 结果页 | 保留最新ImageViewer与异步owner保护；实际img load+可见后记录查看，保留反馈及带稳定action_id的显式POST下载 |
| 工具详情/导航 | SEO内容页加公开目录校验，dynamicParams=false且仅生成18路径；safeNext合并受限产品admin、SEO和guide路径 |
| 业务router/契约/SQL | 保留控制台、设备与Worker新实现；SEO使用自己的API路由，不用旧SEO分支整体覆盖更新的业务router |
| Next配置/样式 | 合并字体与邮件素材缓存规则、根重定向；只追加SEO专属样式，保留最新品牌全局样式 |

供人工合并参考的**本地适配差异**在`/private/tmp/picjp-console-ui-adapter.patch`；SHA256见机器记录。它以冻结主UI文本为基线，`git -C repos/picjp-web apply --check`只读检查exit0。它包含冲突连接的参考差异，**不应在已经部分合并的分支盲目重复应用**。其他任务未提交代码没有作为生产源文件混入本分支；该参考差异也不收入Git，避免把他人的WIP作为本任务提交。

## 后续实际合并和上线

1. 先将主UI任务自身改动评审成明确提交，再按上述输入/连接点合并控制台；保留每个任务归属，不覆盖其他工作树。
2. 在最终合并的checkout重新运行`npm ci`、`npm run verify`、PG17并发及关键浏览器路径。当前临时组合成功不替代最终Git合并后的检查或GitHub CI。
3. 云端按六迁移顺序及当前安装状态处理，再发布同一套API/页面；角色、采集环境和覆盖启用走受控配置。真实Auth/R2/Stripe PAY-001、自然观察与人工evaluation另行验收。

本任务的三阶段代码及分阶段本地验证已交付；上述Git合并、云配置和上线是接下来的发布工作。GPU/Worker仓库未作本轮修改。
