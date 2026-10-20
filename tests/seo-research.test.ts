import { describe,it,expect } from 'vitest';
import { researchWindows,decodeResearchCsv } from '../scripts/seo/research';
import { aggregateSearch,MetricRow } from '../apps/web/src/server/seo/metrics';
const planner={source:'keyword_planner',export_id:'jp-keywords',exported_at:'2026-10-20T10:00:00+09:00',as_of:'2026-10-20',period_start:'2026-09-01',period_end:'2026-09-30',country:'JP',locale:'ja',search_type:'web',delimiter:'comma',keyword_column:'キーワード',value_column:'月間平均検索ボリューム',is_fixture:true};
const trends={...planner,source:'trends',export_id:'jp-trends',date_column:'週',interval:'week',term_type:'query',value_column:'関心度'};
const parse=(csv:string,config:unknown=planner)=>researchWindows(Buffer.from(csv),config);
describe('explicit Japanese CSV research imports',()=>{
 it('preserves estimated ranges, unknowns and exact zero without using Ads competition as SEO difficulty',()=>{
  const [window]=parse('キーワード,月間平均検索ボリューム,競合性\n写真 人 消す,"1,000",高\n画像 AI,100 – 1K,低\n写真 補正,—,高\n背景 消す,0,低\n');
  expect(window.rows.map(r=>r.measures)).toEqual([{volume:1000},{volume:null,volume_lower:100,volume_upper:1000},{volume:null},{volume:0}]);
  expect(window.rows[0].dimensions.query).toBe('写真 人 消す');expect(JSON.stringify(window)).not.toContain('競合性');
  expect(window).toMatchObject({source:'keyword_planner',grain:'keyword_estimate',is_fixture:true,quality:{volume_is_estimate:true,ads_competition_is_not_seo_difficulty:true}});
 });
 it('reads UTF-16 Japanese TSV with an explicitly skipped preamble and quoted cells',()=>{
  const text='期間: 2026/09\r\nキーワード\t月間平均検索ボリューム\r\n"写真, 加工"\t"1,200"\r\n';
  const bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]);
  const [w]=researchWindows(bytes,{...planner,delimiter:'tab',skip_rows:1});
  expect(w.rows[0]).toMatchObject({dimensions:{query:'写真, 加工'},measures:{volume:1200}});
  expect(parse('\ufeffキーワード,月間平均検索ボリューム\n写真,20')[0].rows[0].measures.volume).toBe(20);
 });
 it('accepts native wide Trends timelines, declares topics and retains less-than-one as an upper bound',()=>{
  const config={...trends,keyword_column:undefined,value_column:undefined,term_type:undefined,series:[{query:'写真 AI',value_column:'写真 AI: (日本)',term_type:'query'},{query:'写真加工',value_column:'写真加工: (日本)',term_type:'topic',topic_id:'/m/0123'}]};
  const windows=parse('週,写真 AI: (日本),写真加工: (日本)\n2026-09-06,<1,100\n2026-09-13,0,\n',config);
  expect(windows).toHaveLength(2);expect(windows[0].rows[0].measures).toEqual({trend:null,trend_upper_bound:1});
  expect(windows[0].rows[1].dimensions).toMatchObject({term_type:'topic',topic_id:'/m/0123'});
  expect(windows[1].rows.map(r=>r.measures)).toEqual([{trend:0},{trend:null}]);
  expect(windows[0].quality).toMatchObject({trend_is_relative_not_volume:true,trend_upper_bound_is_exclusive:true});
 });
 it('keeps incompatible normalization sets, geography, search type and windows in different series',()=>{
  const csv='週,キーワード,関心度\n2026-09-06,写真 AI,50\n';
  const first=parse(csv,trends)[0];
  expect(parse(csv+'2026-09-06,写真 加工,40\n',trends)[0].property).not.toBe(first.property);
  for(const change of [{country:'US'},{search_type:'image'},{period_start:'2026-08-01'}])expect(parse(csv,{...trends,...change})[0].property).not.toBe(first.property);
  expect(parse(csv,{...trends,exported_at:'2026-10-21T10:00:00+09:00'})[0].property).toBe(first.property);
  expect(first.quality.source_file_sha256).toMatch(/^[a-f0-9]{64}$/);
 });
 it('supports explicit monthly date labels and public landing paths',()=>{
  const [w]=parse('月,キーワード,関心度,ページ\n2026-09,写真,20,/ja/tools/remove_person',{...trends,date_column:'月',interval:'month',page_column:'ページ'});
  expect(w.day).toBe('2026-09-01');expect(w.rows[0].dimensions.page).toBe('/ja/tools/remove_person');
  expect(()=>parse('キーワード,月間平均検索ボリューム,ページ\n写真,20,/ja/account',{...planner,page_column:'ページ'})).toThrow();
 });
 it('rejects invalid or ambiguous exports before any database write',()=>{
  for(const csv of ['','キーワード,月間平均検索ボリューム\n','キーワード,キーワード\n写真,1','語,数\n写真,1','キーワード,月間平均検索ボリューム\n写真,20\n写真,20','キーワード,月間平均検索ボリューム\n写真,1000-100','キーワード,月間平均検索ボリューム\n写真,unknown','キーワード,月間平均検索ボリューム\nuser@example.invalid,20'])expect(()=>parse(csv)).toThrow();
  expect(()=>decodeResearchCsv(Buffer.from([0xc3,0x28]))).toThrow('INVALID_ENCODING');
  expect(()=>decodeResearchCsv(Buffer.alloc(5242881))).toThrow('TOO_LARGE');
  expect(()=>parse('キーワード,月間平均検索ボリューム\n写真,1',{...planner,is_fixture:undefined})).toThrow();
  expect(()=>parse('週,キーワード,関心度\n2026-10-01,写真,20',trends)).toThrow('OUTSIDE_PERIOD');
  expect(()=>parse('週,キーワード,関心度\n2026-09-06,写真,101',trends)).toThrow('INVALID_VALUE');
  expect(()=>parse('週,キーワード,関心度\n2026-09-06,写真,20',{...trends,term_type:'topic'})).toThrow();
 });
 it('does not convert unknown positions into improved average rankings',()=>{
  const rows=[{dimensions:{page:'/ja'},measures:{impressions:100,clicks:2,position:10}},{dimensions:{page:'/ja'},measures:{impressions:100,clicks:1,position:null}}];
  expect(aggregateSearch(rows)).toMatchObject({impressions:200,clicks:3,ctr:0.015,position:null});
  expect(MetricRow.safeParse({dimensions:{page:'/ja/edit'},measures:{events:1}}).success).toBe(false);
 });
});
