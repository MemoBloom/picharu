// Initial hypotheses from the reviewed 20-tool seed worksheet. No fabricated volume or ranking.
import type { ToolId } from '@picjp/contracts';
export const seoIntents: {tool_id:ToolId;intent_zh:string;primary_keyword_ja:string;path:string;priority:string;metrics_status:'unverified'}[] = [
  {
    "tool_id": "remove_person",
    "intent_zh": "去除路人",
    "primary_keyword_ja": "写真から人を消す",
    "path": "/ja/tools/remove_person",
    "priority": "P1_candidate",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "remove_object",
    "intent_zh": "去除杂物",
    "primary_keyword_ja": "写真の不要なものを消す",
    "path": "/ja/tools/remove_object",
    "priority": "P1_candidate",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "change_background",
    "intent_zh": "更换背景",
    "primary_keyword_ja": "写真の背景を変更",
    "path": "/ja/tools/change_background",
    "priority": "P1_candidate",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "photo_color_grade",
    "intent_zh": "照片调色",
    "primary_keyword_ja": "写真の色味を変える",
    "path": "/ja/tools/photo_color_grade",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "weather_season",
    "intent_zh": "天气/季节转换",
    "primary_keyword_ja": "写真の天気・季節を変える",
    "path": "/ja/tools/weather_season",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "light_time",
    "intent_zh": "光线/时间转换",
    "primary_keyword_ja": "写真の雰囲気を変える",
    "path": "/ja/tools/light_time",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "ai_avatar",
    "intent_zh": "AI 社交头像",
    "primary_keyword_ja": "AIアイコン作成",
    "path": "/ja/tools/ai_avatar",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "natural_beauty",
    "intent_zh": "自然人像美化",
    "primary_keyword_ja": "AI美肌加工",
    "path": "/ja/tools/natural_beauty",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "hair_color",
    "intent_zh": "发色更换",
    "primary_keyword_ja": "髪色変更AI",
    "path": "/ja/tools/hair_color",
    "priority": "P1_candidate",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "hairstyle",
    "intent_zh": "发型尝试",
    "primary_keyword_ja": "髪型変更AI",
    "path": "/ja/tools/hairstyle",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "professional_headshot",
    "intent_zh": "职业头像",
    "primary_keyword_ja": "AIプロフィール写真",
    "path": "/ja/tools/professional_headshot",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "anime_photo",
    "intent_zh": "照片动漫化",
    "primary_keyword_ja": "写真をアニメ化",
    "path": "/ja/tools/anime_photo",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "illustration_photo",
    "intent_zh": "照片插画化",
    "primary_keyword_ja": "写真をイラスト化",
    "path": "/ja/tools/illustration_photo",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "chibi_person",
    "intent_zh": "Q版人物",
    "primary_keyword_ja": "ちびキャラ化",
    "path": "/ja/tools/chibi_person",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "pet_illustration",
    "intent_zh": "宠物插画",
    "primary_keyword_ja": "ペットをイラスト化",
    "path": "/ja/tools/pet_illustration",
    "priority": "P1_candidate",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "pet_humanization",
    "intent_zh": "宠物拟人",
    "primary_keyword_ja": "ペットを擬人化",
    "path": "/ja/tools/pet_humanization",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "multi_photo_composite",
    "intent_zh": "多照片合成",
    "primary_keyword_ja": "写真合成AI",
    "path": "/ja/tools/multi_photo_composite",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "product_background",
    "intent_zh": "商品背景美化",
    "primary_keyword_ja": "商品写真背景変更",
    "path": "/ja/tools/product_background",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "room_redesign",
    "intent_zh": "房间风格改造",
    "primary_keyword_ja": "部屋模様替えAI",
    "path": "/ja/tools/room_redesign",
    "priority": "after_validation",
    "metrics_status": "unverified"
  },
  {
    "tool_id": "clothing_recolor",
    "intent_zh": "衣服颜色更换",
    "primary_keyword_ja": "服の色を変えるAI",
    "path": "/ja/tools/clothing_recolor",
    "priority": "after_validation",
    "metrics_status": "unverified"
  }
];
