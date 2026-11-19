import { KANJI } from './kanjiData';

/**
 * Matches standard Unicode Kanji characters (CJK Unified Ideographs,
 * Extension A, and Compatibility Ideographs), ignoring hiragana, katakana,
 * iteration marks (々), romaji, meanings, and punctuation.
 */
export const UNICODE_KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

/**
 * 967 unique Kanji characters extracted from the attached master reference:
 * `master_lengkap_kanji_kotoba_n5_n4_dan_esensial_jft` (430 N5/N4/JFT-A2
 * Kanji + vocabulary sections II & III).
 */
export const JFT_MASTER_TXT_KANJI =
  '来一二三四五六七八九十百千万円半日月火水木金土年週時分間毎今午先上下左右中前後外北南東西人男女子父母' +
  '友名目耳口手足山川田雨天気空電花魚大小長高安新古多少白国学校語本車駅道社店行出入立休見聞書読話言食飲' +
  '買生何春夏秋冬朝昼夕夜曜世界度去風光海池森林野鳥犬牛肉茶飯菜米味料理赤青黒色明暗広強弱重軽太悪良正低' +
  '近遠早楽静便利有無同特別家族親兄姉弟妹夫妻主員者客自私頭顔首心体声病院薬医死元力意思考知急注切仕事業' +
  '用町村市区都県京場所室館堂屋門戸地図公園寺橋港船銀建物内方漢字文研究試験質問題答習教勉紙画映計写真音' +
  '歌旅遊運動会働作使借貸売送持待歩走止乗降発着帰転通進集開閉始終起寝洗住昨晩回階番号台窓郵局席駐停満混' +
  '並案経品商払札改券税消費込給割引換交替両予約定報束申付受取証登録許免押越渡届返戻変過残念忘覚決選続調' +
  '連絡落折曲増減遅欠勤練説紹介護結婚痛熱治忙危険禁煙喫災害防避難震情警察診救服洋和鉄靴傘机皿酒塩砂糖頼' +
  '願助祝礼失勝負敗細雲曇冷蔵庫暖暑寒涼咲泳撮踊笑泣怒困疲眠怖嬉悲寂恥汚狭甘辛苦好嫌欲違慣壊拾捨焼浴居要' +
  '置被散締吸座濯掃除飛鳴脱履貼晴弾吹磨呼腹預謝致頂祈植伺打移慮驚飼飾片乾喉頑張比暮故障探差誘騒触叱配滑' +
  '済産相談育卒退倒確訪尋房射捕漬伝包釣泊直亡投逃似盗塗濡拝踏褒参合迎向召貰役痩辞喜寄沸揚炒刻加憩招認記' +
  '提達煮茹蒸拭干畳断信感応援節貯充印刷保存検索温厚薄美面可愛黄速丸短優易若浅硬固厳詳酸素深珍柔懐丈賑暇' +
  '派全懸命簡単構最由敵丁寧適当得必不複雑普駄鮮誰勢頃初実部然突再平末晦誕季将昔現在未期限翌営隣横反対角' +
  '隅端奥辺周位域僕俺君彼皆性供齢祖伯叔従婦息娘孫戚恋様留師徒課司僚輩務歯看官巡泥棒犯髪毛鼻舌肩腕指爪胸' +
  '背腰脚膝肌皮膚血骨汗涙健康具邪咳怪我傷虫症状処箋査術身科児眼麺弁寿刺噌汁豆腐納華豚鶏貝老卵玉根果桃菓' +
  '飴湯氷紅乳醤油酢胡椒材匂賞放衣帽袋鏡輪鞄財布鍵石鹸粉櫛箱灯携帯器封筒荷誌漫贈機械燃資源粗玄関廊段呂庭' +
  '壁床井椅棚団枕凍炊扇碗椀箸鍋賃街舎管署等博泉銭神城容議工倉農幹線汽非常符往復各表路点渋滞観到宿景授講' +
  '義格成績数解例識専奨葉英仮章法典鉛筆板職就歴接類鑑告準備技貿輸値価代与帳振抜額領収陽星雪雷梅湿岸浜島' +
  '湖桜草枝畑猫馬羊猿熊蚊津波洪趣興組球撲絵化史祭式舞挨拶守嘘冗籍規則律影臨清原因的係功努協希望夢迷惑順' +
  '以形種量個枚冊匹羽杯軒歳秒訳労魔久';

function buildJftKanjiWhitelist(): Set<string> {
  const whitelist = new Set<string>();

  for (const ch of JFT_MASTER_TXT_KANJI.match(UNICODE_KANJI_RE) ?? []) {
    whitelist.add(ch);
  }

  // Merge all Kanji from JLPT N4 dataset as a safety net so no base N5/N4 Kanji is missed
  for (const entry of KANJI) {
    for (const ch of entry.k.match(UNICODE_KANJI_RE) ?? []) {
      whitelist.add(ch);
    }
  }

  return whitelist;
}

/**
 * Combined whitelist of N5/N4/JFT-essential Kanji (master .txt + kanjiData.ts).
 */
export const JFT_KANJI_WHITELIST: ReadonlySet<string> = buildJftKanjiWhitelist();
export const JFT_KANJI_WHITELIST_LIST: readonly string[] = Array.from(JFT_KANJI_WHITELIST);
