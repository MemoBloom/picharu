import type { ToolId } from '@picjp/contracts';
import { isRetiredTool } from '@picjp/tool-config/lifecycle';

export const toolCategories = ['日常の写真', '人物・プロフィール', 'イラスト・ペット', '暮らし・アイデア'] as const;
export type ToolCategory = typeof toolCategories[number];
export type PublicToolContent = {
  tool_id: ToolId;
  name_ja: string;
  name_zh: string;
  description: string;
  category_ja: ToolCategory;
  icon: string;
  request_example: string;
  input_tip: string;
  limitation: string;
  faq: { question: string; answer: string };
};

// Public editorial copy only. Execution prompts remain in the server package.
const historicalToolContent: PublicToolContent[] = [
  { tool_id: 'remove_person', name_ja: '写り込んだ人を消す', name_zh: '去除路人', description: '残したい思い出に、視線を集めて。背景に写り込んだ人の除去を依頼できます。', category_ja: '日常の写真', icon: 'person', request_example: '右奥に写っている人を消して、手前の二人は残してください。', input_tip: '残したい人と消したい人が区別できる写真がおすすめです。', limitation: '人が重なっている部分や隠れた背景は、元どおりに再現できない場合があります。', faq: { question: '消す人はどう指定しますか？', answer: '「右奥の赤い服の人」のように、位置と特徴を入力してください。現在、ブラシで範囲を指定する機能はありません。' } },
  { tool_id: 'remove_object', name_ja: '不要なものを消す', name_zh: '去除杂物', description: '電線や小さな写り込みを整理して、写真をすっきりした印象に。', category_ja: '日常の写真', icon: 'eraser', request_example: 'テーブルの左端にある空き缶だけを消してください。', input_tip: '消したいものの位置と見た目を、できるだけ具体的に指定してください。', limitation: '細かい模様や文字がある背景では、補完部分が不自然になることがあります。', faq: { question: '一度に複数のものを指定できますか？', answer: '文章で複数指定できますが、まず一つの対象から試すと結果を確認しやすくなります。' } },
  { tool_id: 'change_background', name_ja: '背景を変える', name_zh: '更换背景', description: '主役はそのままに。写真の背景を、思い描いた場所や色に近づけます。', category_ja: '日常の写真', icon: 'landscape', request_example: '背景を明るい白い壁に変えて、人物の服は残してください。', input_tip: '主役の輪郭が見えやすい写真を選び、希望する背景を入力してください。', limitation: '髪の毛や透明なものの輪郭、光の当たり方が変わることがあります。', faq: { question: '背景用の写真も使えますか？', answer: 'その時点のツール設定で参考画像の追加が可能な場合に使えます。追加できる枚数と役割は編集画面で確認してください。' } },
  { tool_id: 'photo_color_grade', name_ja: '色味を整える', name_zh: '照片调色', description: '少しあたたかく、少し映画のように。写真全体の色の雰囲気を整えます。', category_ja: '日常の写真', icon: 'sliders', request_example: '自然な色を残しながら、少し暖かい色味にしてください。', input_tip: '元の雰囲気に近づけたい場合は、控えめな変化を選んでください。', limitation: '通常のフィルターと異なり、色以外の細部も変わる場合があります。', faq: { question: '元の写真とまったく同じ形を保てますか？', answer: '完全な一致は保証できません。仕上がりを元画像と見比べて確認してください。' } },
  { tool_id: 'weather_season', name_ja: '天気・季節を変える', name_zh: '天气季节转换', description: '桜の季節や雪の景色へ。写真の風景に、別の季節の表情を。', category_ja: '日常の写真', icon: 'sun', request_example: '同じ場所を、晴れた秋の日の雰囲気にしてください。', input_tip: '建物や地形など、残したい特徴を具体的に入力してください。', limitation: '景色の広い範囲が変わるため、実際の場所や季節の記録としては使わないでください。', faq: { question: '季節と天気を一緒に選べますか？', answer: '編集画面の設定で選択できます。矛盾する指定を避けると、意図が伝わりやすくなります。' } },
  { tool_id: 'light_time', name_ja: '光と時間を変える', name_zh: '光线时间转换', description: 'やわらかな朝の光、夕暮れの空。写真の時間帯をイメージして。', category_ja: '日常の写真', icon: 'sunset', request_example: '夕暮れのやわらかい光にして、建物の形は残してください。', input_tip: '朝・昼・夕方・夜から、イメージに近い時間を選んでください。', limitation: '人物と背景の光や影が、必ずしも自然につながらない場合があります。', faq: { question: '暗い写真を昼のようにできますか？', answer: '変更を依頼できますが、元の写真で見えない細部は新しく補完される場合があります。' } },
  { tool_id: 'ai_avatar', name_ja: 'アイコンをつくる', name_zh: '社交头像', description: 'プロフィールに、今の自分らしい一枚。写真からアイコン用の表現を探せます。', category_ja: '人物・プロフィール', icon: 'person', request_example: '自然な雰囲気のアイコンに。顔を中央に、背景はシンプルにしてください。', input_tip: '顔がはっきり写った、使用する権利のある写真を選んでください。', limitation: '顔や髪の細部が変わることがあります。本人確認用の写真には適していません。', faq: { question: '丸いアイコンとして保存されますか？', answer: '出力は画像です。丸い表示や最終的な切り抜きは、利用するサービス側で調整してください。' } },
  { tool_id: 'natural_beauty', name_ja: '自然に肌を整える', name_zh: '自然人像美化', description: 'その人らしい表情を大切に、肌や写真の印象を穏やかに整えます。', category_ja: '人物・プロフィール', icon: 'sparkles', request_example: '肌の質感とほくろを残して、明るさを控えめに整えてください。', input_tip: '変えたくない特徴も一緒に入力してください。', limitation: '希望しない顔の変化が起こる場合があります。小さな変化から確認してください。', faq: { question: '顔の形を変えずに使えますか？', answer: 'そのように依頼できますが、完全な保持は保証できません。生成後の確認が必要です。' } },
  { tool_id: 'hair_color', name_ja: '髪色を試す', name_zh: '更换发色', description: '次のカラーを、写真でイメージ。気になる髪色を言葉で指定できます。', category_ja: '人物・プロフィール', icon: 'palette', request_example: '髪だけを落ち着いたアッシュブラウンに。肌や服の色は変えないでください。', input_tip: '髪全体が写っていて、背景と区別しやすい写真がおすすめです。', limitation: '髪の境界や顔の細部が変わる場合があります。実際の染色結果を示すものではありません。', faq: { question: '色の名前は自由に入力できますか？', answer: '色の名前や明るさを文章で指定できます。特定のカラー剤の仕上がりは保証できません。' } },
  { tool_id: 'hairstyle', name_ja: '髪型を試す', name_zh: '尝试发型', description: 'ボブ、前髪、ゆるいカール。新しい髪型の雰囲気を写真から。', category_ja: '人物・プロフィール', icon: 'scissors', request_example: 'あごの長さのナチュラルなボブにしてください。顔の印象は残してください。', input_tip: '希望する長さ・前髪・カールの有無を入力してください。', limitation: '顔の輪郭や耳の周囲も変わる場合があり、美容室での再現を保証するものではありません。', faq: { question: '今の髪色を残せますか？', answer: '追加の要望に「髪色はそのまま」と記入してください。結果は必ず確認してください。' } },
  { tool_id: 'professional_headshot', name_ja: 'プロフィール写真を整える', name_zh: '职业头像', description: '仕事用のプロフィールに。背景と服装を、落ち着いた印象へ整えます。', category_ja: '人物・プロフィール', icon: 'briefcase', request_example: '明るいグレーの背景で、紺色のジャケットを着た自然なプロフィール写真にしてください。', input_tip: '顔が正面に近く、明るく写った写真を選んでください。', limitation: '証明写真の規格や本人性を保証しません。公的な手続きの用途には使わないでください。', faq: { question: '履歴書や公的書類に使えますか？', answer: '提出先の規則を確認してください。この機能は証明写真の適合性を保証するものではありません。' } },
  { tool_id: 'anime_photo', name_ja: 'アニメ風にする', name_zh: '照片动漫化', description: 'お気に入りの写真を、アニメのワンシーンのような表現に。', category_ja: 'イラスト・ペット', icon: 'wand', request_example: '明るいアニメ風に。二人の位置と服の色を残してください。', input_tip: '残したい人数、服装、小物を追加の要望に書いてください。', limitation: '顔や背景が描き直され、人物や小物の数が変わる場合があります。', faq: { question: '特定の作品そっくりにできますか？', answer: '特定の作品の再現を保証する機能ではありません。色や線の雰囲気など、一般的な特徴を指定してください。' } },
  { tool_id: 'illustration_photo', name_ja: 'イラストにする', name_zh: '照片插画化', description: '水彩や線画など、写真を自分好みのイラストの雰囲気に。', category_ja: 'イラスト・ペット', icon: 'brush', request_example: 'やさしい水彩風にして、花束と服の色は残してください。', input_tip: '水彩、線画などのスタイルと、残したい特徴を選んでください。', limitation: '写真の細部や文字は、正確には残らない場合があります。', faq: { question: '印刷用のサイズで作れますか？', answer: '対応する出力品質と縦横比は編集画面で確認してください。印刷品質や指定の画素数は保証していません。' } },
  { tool_id: 'chibi_person', name_ja: 'ちびキャラにする', name_zh: 'Q版人物', description: '自分や大切な人を、親しみのある小さなキャラクターの表現に。', category_ja: 'イラスト・ペット', icon: 'smile', request_example: '丸い眼鏡と青い服を残して、かわいいちびキャラにしてください。', input_tip: '眼鏡や服の色など、その人らしい特徴を指定してください。', limitation: '頭身や表情が大きく変わるため、本人そっくりにはならない場合があります。', faq: { question: '複数人の写真でも使えますか？', answer: '対応枚数と入力条件は編集画面に表示されます。人数や配置を記入しても、すべてを正確に保持する保証はありません。' } },
  { tool_id: 'pet_illustration', name_ja: 'ペットをイラストに', name_zh: '宠物插画', description: '大切な家族の一枚を、やわらかなイラストの表現に。', category_ja: 'イラスト・ペット', icon: 'paw', request_example: '白い胸元と縞模様を残して、やさしい水彩イラストにしてください。', input_tip: '顔と毛色がはっきり分かる写真がおすすめです。', limitation: '毛の模様や目の色などが変わる場合があります。残したい特徴を指定してください。', faq: { question: '犬や猫以外にも使えますか？', answer: '写真に写った動物の表現を依頼できますが、動物ごとの仕上がりはまだ評価中です。' } },
  { tool_id: 'pet_humanization', name_ja: 'ペットをキャラクターに', name_zh: '宠物拟人', description: '毛色や表情をヒントに、ペットの新しいキャラクター表現を。', category_ja: 'イラスト・ペット', icon: 'paw', request_example: '茶色い毛並みの雰囲気を残して、小さなコートを着たキャラクターにしてください。', input_tip: '動物の姿に服を着せるか、人のキャラクターにするかを選んでください。', limitation: '創作表現のため、元のペットの特徴が大きく変わることがあります。', faq: { question: '動物の姿を残すことはできますか？', answer: '「服を着せる」を選び、姿を残したいことを記入してください。人の姿にする指定とは区別できます。' } },
  { tool_id: 'multi_photo_composite', name_ja: '写真を組み合わせる', name_zh: '多照片合成', description: '別々の写真をもとに、一つの場面をイメージしてつくります。', category_ja: '暮らし・アイデア', icon: 'layers', request_example: '二枚の写真の人物が、公園で並んで立っている一枚にしてください。', input_tip: '最低二枚が必要です。主画像と参考画像の役割を選んでください。', limitation: '顔、人数、大きさの関係や位置が、指定どおりにならない場合があります。', faq: { question: '何枚の写真を使えますか？', answer: '最低二枚です。追加できる最大枚数は利用可能なモデルによって異なるため、編集画面で確認してください。' } },
  { tool_id: 'product_background', name_ja: '商品の背景を整える', name_zh: '商品背景', description: '小物や商品の写真に、シンプルで伝わりやすい背景を。', category_ja: '暮らし・アイデア', icon: 'package', request_example: '商品の形とロゴは変えず、背景を明るいベージュの台にしてください。', input_tip: '商品全体が見える写真を使い、残すべき文字や特徴を入力してください。', limitation: '商品の形、ロゴや文字が変わる場合があります。販売に使う前に実物との一致を確認してください。', faq: { question: '商品は必ずそのまま残りますか？', answer: '完全な保持は保証できません。色、形、表示内容を元画像と見比べてください。' } },
  { tool_id: 'room_redesign', name_ja: '部屋の雰囲気を変える', name_zh: '房间风格改造', description: '家具やインテリアの雰囲気を変えて、暮らしのアイデアを広げます。', category_ja: '暮らし・アイデア', icon: 'home', request_example: '窓と床は残して、木の家具を使った明るい北欧風の部屋にしてください。', input_tip: '部屋全体が見える写真で、残すものと変えるものを分けて指定してください。', limitation: '寸法、構造や家具の配置は正確ではありません。工事や購入の判断には実測が必要です。', faq: { question: '実際に置ける家具を提案しますか？', answer: '画像上の雰囲気をつくる機能です。商品情報や正確な採寸にもとづく設計は行いません。' } },
  { tool_id: 'clothing_recolor', name_ja: '服の色を変える', name_zh: '衣服改色', description: '気になる色の組み合わせを、今ある写真から試してみませんか。', category_ja: '暮らし・アイデア', icon: 'shirt', request_example: '手前の人物のシャツだけを深い緑に。柄と質感は残してください。', input_tip: '誰の、どの服を変えたいかを具体的に入力してください。', limitation: '柄や素材感、肌や背景の一部まで変わることがあります。実際の商品の色の再現ではありません。', faq: { question: '複数の服を別々の色にできますか？', answer: '文章で指定できますが、対象が多いほど意図が伝わりにくくなる場合があります。結果を確認しながら試してください。' } },
];

// Current discovery scope. Historical names remain resolvable for immutable jobs.
export const publicToolContent = historicalToolContent.filter((tool) => !isRetiredTool(tool.tool_id));

export function findToolContent(toolId: string) {
  return historicalToolContent.find((tool) => tool.tool_id === toolId);
}

export const findHistoricalToolContent = findToolContent;

export function findPublicToolContent(toolId: string) {
  return publicToolContent.find((tool) => tool.tool_id === toolId);
}
