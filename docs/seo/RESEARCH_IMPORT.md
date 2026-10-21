# CSV 研究数据与采集健康检查

更新：2026-10-21。命令在本 Web 仓库根执行。JSON/API 导入保留；新增 CSV 入口只读取操作者导出的文件，不调用 Google Ads、Trends 或收费排名 API。

## 明确映射导出列

```sh
npm run seo:collect -- research /secure/path/keywords.csv /secure/path/keywords-config.json
```

Keyword Planner 配置示例（列名必须替换成文件内实际表头）：

```json
{
  "source": "keyword_planner",
  "export_id": "jp-photo-keywords",
  "exported_at": "2026-10-20T10:00:00+09:00",
  "as_of": "2026-10-20",
  "period_start": "2026-09-01",
  "period_end": "2026-09-30",
  "country": "JP",
  "locale": "ja",
  "search_type": "web",
  "delimiter": "tab",
  "skip_rows": 2,
  "keyword_column": "キーワード",
  "value_column": "月間平均検索ボリューム",
  "is_fixture": true
}
```

`is_fixture` 必须显式填写：示例为测试数据；真实、已核实来源的文件才使用 false。`skip_rows` 是表头前的物理行数；没有说明行就填 0。支持 UTF-8/BOM、带 BOM 的 UTF-16 LE/BE，以及逗号、制表符、分号；不猜测其他编码或本地化列名。最多 5 MiB、100 列、展开后 10 万行，每条记录最大 65536 字符。

搜索量 `1,000`、`1K` 解析为估计值，`100–1K` 保存上下界且 volume=null；空值/不明保存 null，确实的 0 保留 0。Ads 竞争性与出价列不导入为 SEO 难度。[Google 指标说明](https://support.google.com/google-ads/answer/7337243)中的搜索量和广告竞争性有不同含义。

Trends 原生多列时间序列配置示例：

```json
{
  "source": "trends",
  "export_id": "jp-photo-trends",
  "exported_at": "2026-10-20T10:00:00+09:00",
  "as_of": "2026-10-20",
  "period_start": "2026-09-01",
  "period_end": "2026-09-30",
  "country": "JP",
  "locale": "ja",
  "search_type": "web",
  "delimiter": "comma",
  "skip_rows": 2,
  "date_column": "週",
  "interval": "week",
  "series": [
    { "query": "写真 AI", "value_column": "写真 AI: (日本)", "term_type": "query" },
    { "query": "写真 加工", "value_column": "写真 加工: (日本)", "term_type": "query" }
  ],
  "is_fixture": true
}
```

也可使用长表，填写 keyword_column/value_column、term_type，省略 series。主题需要 term_type=topic 和实际 topic_id；不能把主题与文字查询混为同一口径。日期必须在声明窗口内；日/周使用 YYYY-MM-DD，月使用 YYYY-MM 或 YYYY-MM-DD。

Trends CSV 是相对兴趣指标，不是搜索量；`<1` 保存 trend=null 和排他的上界 1，空值不会转成 0。配置记录比较词集合、国家、语言、搜索类型、周期和导出时间；范围/词集合变化会形成不同 property，不把不同归一化结果相加。[导出方法](https://support.google.com/trends/answer/4365538?hl=en)、[Trends 数据口径](https://support.google.com/trends/answer/4365533?hl=en)。

## 导入事务和来源

解析、列映射、重复行、公共路径和数值范围先完整校验，再进入现有批次事务；同一窗口成功后替换旧事实，失败保留旧事实。多日期导出按天分别提交，整个文件不是跨日单一事务；中断后可重跑，不会累加同窗事实。文件 SHA256、明确导出参数保留在 quality，未映射的 CSV 单元格不进入数据库。表头缺失、空文件、重复列/行、非法编码会拒绝；不会用空研究文件清掉已有数据。

## 健康报告与告警出口

```sh
npm run seo:collect -- health
npm run seo:collect -- health --fixture
```

使用 Supabase 服务端凭据读取 `seo_ingestion_health`，不请求 Google。检查 GSC 三粒度与 GA4 落地事件粒度各 7 天的成熟窗口（各自日历 D-9 至 D-3）。成功空窗为 empty；缺日、从未成功、最新失败、等待/超过30分钟的 pending、超过48小时未重读以及上限/阈值/其他行损失分别输出代码和严重程度。保留“上次成功”和“最近重试”两个状态，失败不会让旧成功伪装成最新健康结果。

输出 JSON；全部可用才退出 0，否则退出 1，适合由 Cloud Run Job 日志和现有监控按退出码/alerts 建告警。本次没有创建调度、监控规则或发送外部通知。普通 Auth 用户不能执行此 RPC。API 管理员 overview 在角色校验后返回 health；GSC property/page 最近成熟窗口不可用时不生成规则候选。该门槛不证明28天历史完整，也不证明因果关系或排名改善；检查 observed_days 和原始口径后再审核。

管理页已有健康摘要、告警及缺失日期详情；完整机器可读报告仍可通过 CLI 或授权 overview JSON 检查。测试数据永远与真实视图分开。未配置 GA4 数字 Property ID 会报告 not_configured；“配置了编号”不等于云端授权完成。
