import type { Tool } from './types';

const primary: Record<string, readonly string[]> = {
 remove_person:['target'],remove_object:['target'],change_background:['background'],photo_color_grade:['style'],weather_season:['weather','season'],light_time:['time'],ai_avatar:['style'],natural_beauty:[],hair_color:['color'],hairstyle:['hairstyle'],professional_headshot:['background','outfit'],anime_photo:['style'],illustration_photo:['style'],chibi_person:['style'],pet_illustration:['style'],pet_humanization:['mode','style'],multi_photo_composite:['composition'],product_background:['background'],room_redesign:['style','preserve'],clothing_recolor:['color'],
};
const labels:Record<string,string>={target:'変更する対象',background:'希望する背景',strength:'変化の強さ',style:'スタイル',weather:'天気',season:'季節',time:'時間帯',composition:'組み合わせ方',color:'希望する色',hairstyle:'希望する髪型',outfit:'希望する服装',mode:'表現の方法',preserve:'残したいもの'};
const targets:Record<string,string>={remove_person:'消したい人物',remove_object:'消したいもの',natural_beauty:'整えたい部分',hair_color:'色を変える人物',hairstyle:'髪型を変える人物',clothing_recolor:'色を変える服',pet_illustration:'イラストにするペット',chibi_person:'キャラクターにする人物'};
const placeholders:Record<string,Record<string,string>>={
 remove_person:{target:'例：右奥に写っている赤い服の人'},remove_object:{target:'例：テーブルの左端にある空き缶'},natural_beauty:{target:'例：頬の肌を自然に整えたい'},hair_color:{target:'例：写真の中央にいる人物',color:'例：落ち着いたアッシュブラウン'},hairstyle:{target:'例：写真の中央にいる人物',hairstyle:'例：肩までの自然なボブ'},clothing_recolor:{target:'例：手前の人物のシャツ',color:'例：やわらかなネイビーブルー'},change_background:{background:'例：明るい白い壁'},product_background:{background:'例：自然光の入る木のテーブル'},professional_headshot:{background:'例：明るいグレーの背景',outfit:'例：シンプルな紺色のジャケット'},multi_photo_composite:{composition:'例：1枚目の人物を、2枚目の風景に自然に配置'},room_redesign:{style:'例：明るい北欧風',preserve:'例：窓の位置とソファはそのまま'},pet_illustration:{target:'例：手前に座っているペット'},
};
export const optionLabels:Record<string,string>={subtle:'控えめ',balanced:'バランス',strong:'はっきり',natural:'自然',anime:'アニメ',watercolor:'水彩',line_art:'線画',chibi:'ちびキャラ',studio:'スタジオ',cinematic:'映画風',sunny:'晴れ',rain:'雨',snow:'雪',cloudy:'くもり',spring:'春',summer:'夏',autumn:'秋',winter:'冬',morning:'朝',day:'昼',sunset:'夕暮れ',night:'夜',costume:'動物の姿に服を着せる',human_character:'人のキャラクターにする'};
export function fieldLabel(toolId:string,name:string){return name==='target'?targets[toolId]||labels.target:labels[name]||name;}
export function fieldPlaceholder(toolId:string,name:string){return placeholders[toolId]?.[name];}
export function partitionFields(tool:Pick<Tool,'tool_id'|'parameter_fields'>){
 const keys=primary[tool.tool_id]||[];
 return {primary:tool.parameter_fields.filter(f=>f.required||keys.includes(f.name)),advanced:tool.parameter_fields.filter(f=>!f.required&&!keys.includes(f.name))};
}
export function missingRequiredFields(tool:Pick<Tool,'parameter_fields'>,parameters:Record<string,string>){return tool.parameter_fields.filter(f=>f.required&&!parameters[f.name]?.trim());}
