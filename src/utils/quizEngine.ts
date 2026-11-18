import { KANJI } from '../data/kanjiData';
import type {
  IrodoriChapterFilter,
  KanjiEntry,
  LevelFilter,
  QuizModelKey,
  QuizOption,
  QuizQuestion,
  QuizTypeChoice,
  SentenceBlank,
} from '../types/kanji';
import { analyzeSentenceBlank, conjugateWord, getWordMeta } from './morphology';

export interface QuizModelMeta {
  key: QuizModelKey;
  short: string;
  label: string;
  prompt: string;
}

export const QTYPES: Record<QuizModelKey, QuizModelMeta> = {
  k2r: {
    key: 'k2r',
    short: '漢→あ',
    label: 'Kanji → Hiragana',
    prompt: 'Pilih cara baca (hiragana) yang benar untuk:',
  },
  k2m: {
    key: 'k2m',
    short: '漢→ID',
    label: 'Kanji → Arti',
    prompt: 'Pilih arti yang tepat untuk:',
  },
  m2k: {
    key: 'm2k',
    short: 'ID→漢',
    label: 'Arti → Kanji',
    prompt: 'Pilih kanji yang artinya:',
  },
  r2k: {
    key: 'r2k',
    short: 'あ→漢',
    label: 'Hiragana → Kanji',
    prompt: 'Pilih kanji yang dibaca:',
  },
  ex2k: {
    key: 'ex2k',
    short: '📖→漢',
    label: 'Kalimat → Kanji',
    prompt: 'Kanji mana yang melengkapi kalimat ini?',
  },
};

export const CORE_4_KEYS: QuizModelKey[] = ['k2r', 'k2m', 'm2k', 'r2k'];
export const ALL_5_KEYS: QuizModelKey[] = ['k2r', 'k2m', 'm2k', 'r2k', 'ex2k'];
export const ABC_LABELS = ['A', 'B', 'C', 'D'] as const;

export function shuffled<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getPoolIndices(
  levelFilter: LevelFilter,
  dataset: readonly KanjiEntry[] = KANJI,
  chapterFilter?: IrodoriChapterFilter
): number[] {
  const out: number[] = [];
  for (let i = 0; i < dataset.length; i++) {
    if (chapterFilter !== undefined) {
      if (chapterFilter === 'all' || dataset[i].chapter === chapterFilter) {
        out.push(i);
      }
    } else if (levelFilter === 'all' || dataset[i].dif === levelFilter) {
      out.push(i);
    }
  }
  return out;
}

export function getActiveTypeKeys(choice: QuizTypeChoice): QuizModelKey[] {
  if (choice === 'random') return CORE_4_KEYS;
  if (choice === 'random5') return ALL_5_KEYS;
  return QTYPES[choice] ? [choice] : CORE_4_KEYS;
}

export interface QuizBankEntry {
  kanjiIdx: number;
  typeKey: QuizModelKey;
}

export function buildQuizBank(
  levelFilter: LevelFilter,
  choice: QuizTypeChoice,
  dataset: readonly KanjiEntry[] = KANJI,
  chapterFilter?: IrodoriChapterFilter
): QuizBankEntry[] {
  const indices = getPoolIndices(levelFilter, dataset, chapterFilter);
  const keys = getActiveTypeKeys(choice);
  const bank: QuizBankEntry[] = [];
  for (const kanjiIdx of indices) {
    for (const typeKey of keys) {
      bank.push({ kanjiIdx, typeKey });
    }
  }
  return bank;
}

export function dispOf(item: KanjiEntry, key: QuizModelKey, exMeta: SentenceBlank | null): string {
  if (key === 'k2r') return item.r;
  if (key === 'k2m') return item.m;
  if (key === 'ex2k' && exMeta) return conjugateWord(item, exMeta.form);
  return item.k;
}

function sharedKanji(a: string, b: string): number {
  const isKanji = (ch: string) => /[一-龯]/.test(ch);
  const setA = new Set([...a].filter(isKanji));
  const setB = new Set([...b].filter(isKanji));
  let count = 0;
  setA.forEach(ch => {
    if (setB.has(ch)) count++;
  });
  return count;
}

function kanaSim(a: string, b: string): number {
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const gA = grams(a);
  const gB = grams(b);
  let score = 0;
  gA.forEach(x => {
    if (gB.has(x)) score++;
  });
  if (a[0] && a[0] === b[0]) score += 0.75;
  if (Math.abs(a.length - b.length) <= 1) score += 0.25;
  return score;
}

function meaningSim(a: string, b: string): number {
  const tokenize = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2);
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  let count = 0;
  setA.forEach(w => {
    if (setB.has(w)) count++;
  });
  return count;
}

/**
 * Checks whether a candidate distractor is grammatically compatible with the blank context
 * in `ex2k` so that conjugated verbs only compete with conjugated verbs, i-adj with i-adj, etc.
 */
function isCompatibleForBlank(candidate: KanjiEntry, exMeta: SentenceBlank): boolean {
  const { subPos } = getWordMeta(candidate);
  switch (exMeta.blankContext) {
    case 'verb_conjugated':
      return subPos === 'verb';
    case 'iadj_conjugated':
      return subPos === 'iadj';
    case 'naadj_modifier':
      return subPos === 'naadj';
    case 'suru_verb':
      return subPos === 'suru';
    case 'noun_general':
      return subPos === 'noun' || subPos === 'suru';
  }
}

export function pickDistractors(
  item: KanjiEntry,
  key: QuizModelKey,
  count: number,
  exMeta: SentenceBlank | null,
  levelFilter: LevelFilter = 'all',
  dataset: readonly KanjiEntry[] = KANJI,
  rng: () => number = Math.random,
  chapterFilter?: IrodoriChapterFilter
): KanjiEntry[] {
  const targetDisp = dispOf(item, key, exMeta);

  const isEligibleBase = (candidate: KanjiEntry): boolean => {
    if (candidate.id === item.id) return false;
    if (dispOf(candidate, key, exMeta) === targetDisp) return false;
    if (key === 'r2k' && candidate.r === item.r) return false;
    if ((key === 'm2k' || key === 'k2m') && candidate.m.toLowerCase() === item.m.toLowerCase()) return false;
    if ((key === 'k2r' || key === 'k2m') && candidate.k === item.k) return false;
    return true;
  };

  const matchesActiveScope = (it: KanjiEntry): boolean => {
    if (chapterFilter !== undefined) {
      return chapterFilter === 'all' || it.chapter === chapterFilter;
    }
    return levelFilter === 'all' || it.dif === levelFilter;
  };

  // Prioritize candidates from the active level/chapter filter so focused quizzes keep relevant distractors.
  const sameLevelAll = dataset.filter(it => matchesActiveScope(it) && isEligibleBase(it));
  const crossLevelAll =
    (chapterFilter !== undefined ? chapterFilter === 'all' : levelFilter === 'all')
      ? []
      : dataset.filter(it => !matchesActiveScope(it) && isEligibleBase(it));

  const scoreCandidate = (it: KanjiEntry, isSameLevel: boolean): number => {
    let s = isSameLevel ? 100 : 0;
    if (key === 'k2r') {
      s += sharedKanji(item.k, it.k) * 3 + kanaSim(item.r, it.r);
    } else if (key === 'r2k') {
      s += kanaSim(item.r, it.r) * 2.5 + sharedKanji(item.k, it.k) * 1.5;
    } else if (key === 'm2k') {
      s += meaningSim(item.m, it.m) * 3 + sharedKanji(item.k, it.k) * 1.5 + (it.dif === item.dif ? 0.5 : 0);
    } else if (key === 'ex2k' && exMeta) {
      const itMeta = getWordMeta(it);
      const exactSubPos = itMeta.subPos === exMeta.subPos;
      const compatible = isCompatibleForBlank(it, exMeta);
      s +=
        (compatible ? 50 : -50) +
        (exactSubPos ? 12 : 0) +
        sharedKanji(item.k, it.k) * 2 +
        kanaSim(item.r, it.r) +
        (it.dif === item.dif ? 0.5 : 0);
    } else {
      s += meaningSim(item.m, it.m) * 3 + (it.dif === item.dif ? 0.5 : 0) + kanaSim(item.r, it.r) * 0.25;
    }
    return s + rng() * 0.6;
  };

  // Build tiered pools so grammatical compatibility and level isolation are both respected:
  // Tier 1: Same level + grammatically compatible (for ex2k)
  // Tier 2: Cross level + grammatically compatible (only if active level has < count items in that rare subPos, e.g. Hard na-adj has only 2 items)
  // Tier 3: Same level fallback
  // Tier 4: Global fallback
  const tiers: KanjiEntry[][] =
    key === 'ex2k' && exMeta
      ? [
          sameLevelAll.filter(it => isCompatibleForBlank(it, exMeta)),
          crossLevelAll.filter(it => isCompatibleForBlank(it, exMeta)),
          sameLevelAll,
          crossLevelAll,
        ]
      : [sameLevelAll, crossLevelAll];

  const seenLabels = new Set<string>([targetDisp]);
  const seenIds = new Set<string>([item.id]);
  const out: KanjiEntry[] = [];

    for (let tierIdx = 0; tierIdx < tiers.length && out.length < count; tierIdx++) {
    const tierCandidates = tiers[tierIdx]
      .filter(it => !seenIds.has(it.id))
      .map(it => ({
        it,
        s: scoreCandidate(it, matchesActiveScope(it)),
      }))
      .sort((a, b) => b.s - a.s);

    for (const { it } of tierCandidates) {
      const label = dispOf(it, key, exMeta);
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      seenIds.add(it.id);
      out.push(it);
      if (out.length === count) break;
    }
  }

  return out;
}

export function makeQuestion(
  item: KanjiEntry,
  typeKey: QuizModelKey,
  levelFilter: LevelFilter = 'all',
  dataset: readonly KanjiEntry[] = KANJI,
  rng: () => number = Math.random,
  chapterFilter?: IrodoriChapterFilter
): QuizQuestion {
  const exMeta = typeKey === 'ex2k' ? analyzeSentenceBlank(item) : null;
  const distractors = pickDistractors(
    item,
    typeKey,
    3,
    exMeta,
    levelFilter,
    dataset,
    rng,
    chapterFilter
  );
  const options: QuizOption[] = shuffled([item, ...distractors], rng).map(optItem => ({
    item: optItem,
    label: dispOf(optItem, typeKey, exMeta),
  }));

  return {
    item,
    type: typeKey,
    exMeta,
    options,
  };
}

export function buildQuizSession(
  levelFilter: LevelFilter,
  choice: QuizTypeChoice,
  requestedCount: number | 'all',
  dataset: readonly KanjiEntry[] = KANJI,
  rng: () => number = Math.random,
  chapterFilter?: IrodoriChapterFilter
): QuizQuestion[] {
  const bank = shuffled(buildQuizBank(levelFilter, choice, dataset, chapterFilter), rng);
  if (bank.length === 0) return [];
  const count =
    requestedCount === 'all'
      ? bank.length
      : Math.max(1, Math.min(Math.floor(requestedCount) || 10, bank.length));

  return bank.slice(0, count).map(entry =>
    makeQuestion(dataset[entry.kanjiIdx], entry.typeKey, levelFilter, dataset, rng, chapterFilter)
  );
}

export function calculateQuizScore(rightCount: number, totalAnswered: number): number {
  if (totalAnswered <= 0) return 0;
  return Math.round((rightCount / totalAnswered) * 100);
}
