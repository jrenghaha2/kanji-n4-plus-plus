import type {
  BlankContextKind,
  ConjugationForm,
  KanjiEntry,
  SentenceBlank,
  WordMeta,
} from '../types/kanji';

/**
 * Words ending in い or る-like kana that are actually nouns, not adjectives or verbs.
 */
export const NOUN_EXCEPTIONS = new Set<string>([
  '答え',
  '気持ち',
  '昼休み',
  '祭り',
  '晴れ',
  'お祝い',
  '引っ越し',
  '曇り',
  '匂い',
  'お土産',
  '手洗い',
  'はい',
  'いいえ',
  'いえ',
  'だいたい',
  'よく',
  '近く',
  'すぐ',
  'もうすぐ',
  'いつ',
  'いくつ',
  'くつ',
  'えんぴつ',
  'いす',
  'こしょう',
  'どう',
  'そう',
  'そうそう',
  'あのう',
  '1つ',
  '2つ',
  '3つ',
  '4つ',
  '5つ',
  '6つ',
  '7つ',
  '8つ',
  '9つ',
  'たい焼き',
  '食べ放題',
  '飲み放題',
  'お祈り',
  '残り',
  '上り',
  '下り',
  '通り',
  'お会計',
  '朝礼',
  '飲み会',
  '試合',
  '夏祭り',
  'おしゃべり',
  'おしぼり',
  'かみそり',
  'おいそぎ',
]);

/**
 * Na-adjectives in the JLPT N4 and Irodori datasets.
 */
export const NA_ADJECTIVES = new Set<string>([
  '安全',
  '親切',
  '便利',
  '不便',
  '元気',
  '有名',
  '特別',
  '大切',
  '大事',
  '必要',
  '自由',
  '安心',
  '心配',
  '十分',
  '危険',
  '簡単',
  '無理',
  '残念',
  '熱心',
  '丁寧',
  '複雑',
  'きれい',
  '静か',
  'にぎやか',
  '大好き',
  '好き',
  'すてき',
  'おしゃれ',
  '変',
  'だいじょうぶ',
  'だめ',
  'まあまあ',
  '大変',
  'いまいち',
  '完全',
]);

/**
 * Suru-nouns (verbal nouns) in the JLPT N4 dataset.
 */
export const SURU_NOUNS = new Set<string>([
  '運動',
  '予習',
  '練習',
  '発表',
  '案内',
  '注文',
  '運転',
  '出発',
  '到着',
  '注意',
  '参加',
  '出席',
  '欠席',
  '相談',
  '報告',
  '残業',
  '合格',
  '失敗',
  '成功',
  '努力',
  '卒業',
  '復習',
  '準備',
  '出張',
  '予約',
  '両替',
  '掃除',
  '駐車',
  '紹介',
  '営業',
  '貯金',
  '故障',
  '修理',
  '確認',
  '変更',
  '遅刻',
  '休憩',
  '募集',
  '契約',
  '注射',
  '提出',
  '記入',
  '検索',
  '保存',
  '送信',
  '充電',
  '招待',
  '引っ越し',
  '洗濯',
  '挨拶',
]);

/**
 * Godan verbs ending in -る whose stem ends in an -i or -e vowel (exceptions to the ichidan heuristic).
 */
export const GODAN_RU_EXCEPTIONS = new Set<string>([
  '走る',
  '帰る',
  '知る',
  '決まる',
  '集まる',
  '始まる',
  '終わる',
  '止まる',
  '閉まる',
  '乗る',
  '通る',
  '変わる',
  '作る',
  '売る',
  '送る',
  '取る',
  '直る',
  '治る',
  '怒る',
  '渡る',
  '曲がる',
  '戻る',
  '減る',
  '塗る',
  '滑る',
  '折る',
  '切る',
  '入る',
  '要る',
  '散る',
  '祈る',
  '参る',
  '鳴る',
  '降る',
  '焦る',
  '蹴る',
  '喋る',
  '滑る',
  '握る',
  '練る',
  '混じる',
  '限る',
  '茂る',
]);

/**
 * Explicit ichidan verbs in the dataset so classification is deterministic first,
 * falling back to phonological rules only for unseen words.
 */
export const KNOWN_ICHIDAN_VERBS = new Set<string>([
  '起きる',
  '考える',
  '決める',
  '集める',
  '始める',
  '止める',
  '開ける',
  '閉める',
  '降りる',
  '着る',
  '教える',
  '借りる',
  '続ける',
  '変える',
  '落ちる',
  '消える',
  '負ける',
  '建てる',
  '寝る',
  '届ける',
  '慣れる',
  '疲れる',
  '忘れる',
  '覚える',
  '調べる',
  '増える',
  '割れる',
  '冷える',
  '遅れる',
  '壊れる',
  '汚れる',
  '褒める',
  '植える',
  '捨てる',
  'いる',
  '入れる',
  '着替える',
  '乗り換える',
  '温める',
  '閉じる',
]);

const I_MAP: Record<string, string> = {
  う: 'い',
  く: 'き',
  ぐ: 'ぎ',
  す: 'し',
  つ: 'ち',
  ぬ: 'に',
  ぶ: 'び',
  む: 'み',
  る: 'り',
};

const A_MAP: Record<string, string> = {
  う: 'わ',
  く: 'か',
  ぐ: 'が',
  す: 'さ',
  つ: 'た',
  ぬ: 'な',
  ぶ: 'ば',
  む: 'ま',
  る: 'ら',
};

const E_MAP: Record<string, string> = {
  う: 'え',
  く: 'け',
  ぐ: 'げ',
  す: 'せ',
  つ: 'て',
  ぬ: 'ね',
  ぶ: 'べ',
  む: 'め',
  る: 'れ',
};

const E_OR_I_KANA = 'えけげせてねべめれでぜいきぎしじちひびみり';

export function getWordMeta(item: Pick<KanjiEntry, 'k' | 'r'>): WordMeta {
  const { k, r } = item;
  if (NOUN_EXCEPTIONS.has(k) || k === '手洗い') {
    return { pos: 'noun', subPos: 'noun' };
  }
  if (NA_ADJECTIVES.has(k)) {
    return { pos: 'noun', subPos: 'naadj' };
  }
  if (k === 'する' || (k.endsWith('する') && k.length > 2)) {
    return { pos: 'noun', subPos: 'suru' };
  }
  if (k === '来る' || (k.endsWith('来る') && k.length > 2)) {
    return { pos: 'godan', subPos: 'verb' };
  }
  if (k.endsWith('い')) {
    return { pos: 'iadj', subPos: 'iadj' };
  }
  if (k.endsWith('ます') || k.endsWith('ません') || k.endsWith('ました') || k.endsWith('ください')) {
    return { pos: 'noun', subPos: 'noun' };
  }
  if (KNOWN_ICHIDAN_VERBS.has(k)) {
    return { pos: 'ichidan', subPos: 'verb' };
  }
  if (/[うくぐすつぬぶむる]$/.test(k)) {
    if (k.endsWith('る')) {
      const prev = r.length >= 2 ? r[r.length - 2] : '';
      if (!GODAN_RU_EXCEPTIONS.has(k) && E_OR_I_KANA.includes(prev)) {
        return { pos: 'ichidan', subPos: 'verb' };
      }
    }
    return { pos: 'godan', subPos: 'verb' };
  }
  if (SURU_NOUNS.has(k)) {
    return { pos: 'noun', subPos: 'suru' };
  }
  return { pos: 'noun', subPos: 'noun' };
}

export function conjugateWord(item: Pick<KanjiEntry, 'k' | 'r'>, form: ConjugationForm): string {
  const { pos } = getWordMeta(item);
  const k = item.k;

  if (k === 'する' || (k.endsWith('する') && k.length > 2)) {
    const base = k.slice(0, -2);
    switch (form) {
      case 'masu_stem':
        return base + 'し';
      case 'masu':
        return base + 'します';
      case 'mashita':
        return base + 'しました';
      case 'masen':
        return base + 'しません';
      case 'mashou':
        return base + 'しましょう';
      case 'te':
        return base + 'して';
      case 'nai':
        return base + 'しない';
      case 'passive_mashita':
        return base + 'されました';
      case 'potential_masen':
        return base + 'できません';
      case 'potential_masu':
        return base + 'できます';
      default:
        return k;
    }
  }

  if (k === '来る' || (k.endsWith('来る') && k.length > 2)) {
    const base = k.slice(0, -2);
    switch (form) {
      case 'masu_stem':
        return base + '来';
      case 'masu':
        return base + '来ます';
      case 'mashita':
        return base + '来ました';
      case 'masen':
        return base + '来ません';
      case 'mashou':
        return base + '来ましょう';
      case 'te':
        return base + '来て';
      case 'nai':
        return base + '来ない';
      default:
        return k;
    }
  }

  if (k === '行く' && form === 'te') {
    return '行って';
  }

  if (k === 'いい' || k === '気持ちいい' || k === 'かっこいい') {
    const prefix = k.slice(0, -2);
    if (form === 'i_ku') return prefix + 'よく';
    if (form === 'i_katta') return prefix + 'よかった';
    return k;
  }

  const stem = k.slice(0, -1);
  const last = k.slice(-1);

  if (pos === 'ichidan') {
    switch (form) {
      case 'masu_stem':
        return stem;
      case 'masu':
        return stem + 'ます';
      case 'mashita':
        return stem + 'ました';
      case 'masen':
        return stem + 'ません';
      case 'mashou':
        return stem + 'ましょう';
      case 'te':
        return stem + 'て';
      case 'nai':
        return stem + 'ない';
      case 'passive_mashita':
        return stem + 'られました';
      case 'potential_masen':
        return stem + 'られません';
      case 'potential_masu':
        return stem + 'られます';
      default:
        return k;
    }
  }

  if (pos === 'godan') {
    const iStem = stem + (I_MAP[last] ?? '');
    const aStem = stem + (A_MAP[last] ?? '');
    const eStem = stem + (E_MAP[last] ?? '');

    switch (form) {
      case 'masu_stem':
        return iStem;
      case 'masu':
        return iStem + 'ます';
      case 'mashita':
        return iStem + 'ました';
      case 'masen':
        return iStem + 'ません';
      case 'mashou':
        return iStem + 'ましょう';
      case 'nai':
        return aStem + 'ない';
      case 'passive_mashita':
        return aStem + 'れました';
      case 'potential_masen':
        return eStem + 'ません';
      case 'potential_masu':
        return eStem + 'ます';
      case 'te':
        if ('うつる'.includes(last)) return stem + 'って';
        if ('ぬぶむ'.includes(last)) return stem + 'んで';
        if (last === 'く') return stem + 'いて';
        if (last === 'ぐ') return stem + 'いで';
        if (last === 'す') return stem + 'して';
        return k;
      default:
        return k;
    }
  }

  if (pos === 'iadj') {
    if (form === 'i_ku') return stem + 'く';
    if (form === 'i_katta') return stem + 'かった';
    return k;
  }

  return k;
}

const VERB_CONJUGATION_ORDER: ConjugationForm[] = [
  'passive_mashita',
  'potential_masen',
  'potential_masu',
  'mashita',
  'masen',
  'mashou',
  'masu',
  'te',
  'nai',
  'masu_stem',
  'dict',
];

const IADJ_CONJUGATION_ORDER: ConjugationForm[] = ['i_katta', 'i_ku', 'i_dict'];

function replaceAllOccurrences(text: string, needle: string, replacement: string): string {
  if (!needle) return text;
  return text.split(needle).join(replacement);
}

export function analyzeSentenceBlank(item: KanjiEntry): SentenceBlank {
  const { pos, subPos } = getWordMeta(item);
  const ex = item.ex;

  if (pos === 'ichidan' || pos === 'godan' || item.k.endsWith('する')) {
    const blankContext: BlankContextKind =
      item.k.endsWith('する') ? 'suru_verb' : 'verb_conjugated';
    for (const form of VERB_CONJUGATION_ORDER) {
      const surface = conjugateWord(item, form);
      if (ex.includes(surface)) {
        return {
          maskedEx: replaceAllOccurrences(ex, surface, '（　　）'),
          targetSurface: surface,
          form,
          subPos,
          blankContext,
        };
      }
    }
  } else if (pos === 'iadj') {
    for (const form of IADJ_CONJUGATION_ORDER) {
      const surface = conjugateWord(item, form);
      if (ex.includes(surface)) {
        return {
          maskedEx: replaceAllOccurrences(ex, surface, '（　　）'),
          targetSurface: surface,
          form,
          subPos,
          blankContext: 'iadj_conjugated',
        };
      }
    }
  }

  // Noun / na-adj / suru-noun / fixed phrase: inspect following characters to determine grammatical slot
  let targetSurface = item.k;
  if (!ex.includes(targetSurface) && /[()（）]/.test(item.k)) {
    const expanded = item.k.replace(/[()（）]/g, '');
    const shortened = item.k.replace(/[（(][^）)]*[）)]/g, '').trim();
    if (expanded && ex.includes(expanded)) {
      targetSurface = expanded;
    } else if (shortened && ex.includes(shortened)) {
      targetSurface = shortened;
    }
  }

  const idx = ex.indexOf(targetSurface);
  const after = idx >= 0 ? ex.slice(idx + targetSurface.length) : '';

  let blankContext: BlankContextKind = 'noun_general';
  if (
    subPos === 'naadj' &&
    (after.startsWith('な') || after.startsWith('に') || after.startsWith('です') || after.startsWith('だ'))
  ) {
    blankContext = 'naadj_modifier';
  } else if (
    subPos === 'suru' &&
    (after.startsWith('し') || after.startsWith('さ') || after.startsWith('でき') || after.startsWith('中'))
  ) {
    blankContext = 'suru_verb';
  } else if (subPos === 'naadj') {
    blankContext = 'naadj_modifier';
  }

  return {
    maskedEx: replaceAllOccurrences(ex, targetSurface, '（　　）'),
    targetSurface,
    form: 'dict',
    subPos,
    blankContext,
  };
}
