import { KANJI } from '../data/kanjiData';
import type {
  IrodoriChapterNumber,
  IrodoriChapterSelection,
  KanjiEntry,
  LevelFilter,
  QuizModelKey,
  QuizOption,
  QuizQuestion,
  QuizTypeChoice,
  SentenceBlank,
} from '../types/kanji';
import {
  analyzeSentenceBlank,
  conjugateWord,
  getWordMeta,
  matchTemplateSurface,
  stripEdgeTildes,
} from './morphology';

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

export function matchesChapterSelection(
  chapter: IrodoriChapterNumber | undefined,
  chapterFilter?: IrodoriChapterSelection
): boolean {
  if (chapterFilter === undefined || chapterFilter === 'all') return true;
  if (Array.isArray(chapterFilter)) {
    return chapter !== undefined && chapterFilter.includes(chapter);
  }
  return chapter === chapterFilter;
}

function isAllChaptersSelected(chapterFilter?: IrodoriChapterSelection): boolean {
  if (chapterFilter === 'all') return true;
  if (Array.isArray(chapterFilter)) return chapterFilter.length >= 18;
  return false;
}

/**
 * Formats a multi-chapter selection into a concise Indonesian label, e.g.
 * `Semua Bab (1–18)`, `Bab 3`, `Bab 1–3, 5, 8–9`.
 */
export function formatChapterSelectionLabel(
  chapters: readonly IrodoriChapterNumber[],
  totalChapters = 18
): string {
  const unique = Array.from(new Set(chapters)).sort((a, b) => a - b);
  if (unique.length === 0) return 'Belum ada bab dipilih';
  if (unique.length >= totalChapters) return `Semua Bab (1–${totalChapters})`;
  if (unique.length === 1) return `Bab ${unique[0]}`;

  const ranges: string[] = [];
  let start = unique[0];
  let end = unique[0];

  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === end + 1) {
      end = unique[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`);
      start = unique[i];
      end = unique[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`);

  if (ranges.length <= 4) {
    return `Bab ${ranges.join(', ')}`;
  }
  return `${unique.length} Bab (Bab ${ranges.slice(0, 3).join(', ')}, …)`;
}

export function getPoolIndices(
  levelFilter: LevelFilter,
  dataset: readonly KanjiEntry[] = KANJI,
  chapterFilter?: IrodoriChapterSelection
): number[] {
  const out: number[] = [];
  for (let i = 0; i < dataset.length; i++) {
    if (chapterFilter !== undefined) {
      if (matchesChapterSelection(dataset[i].chapter, chapterFilter)) {
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
  chapterFilter?: IrodoriChapterSelection
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
  if (key === 'ex2k' && exMeta) {
    if (exMeta.form === 'dict' && /[～〜~▲]/.test(item.k)) {
      const matched = matchTemplateSurface(item.k, exMeta.targetSurface);
      if (matched === exMeta.targetSurface) return exMeta.targetSurface;
    }
    const surface = conjugateWord(item, exMeta.form);
    if (exMeta.form === 'dict' && /[()（）]/.test(surface) && !/[()（）]/.test(exMeta.targetSurface)) {
      const expanded = surface.replace(/[()（）]/g, '');
      const shortened = surface.replace(/[（(][^）)]*[）)]/g, '').trim();
      if (item.k === exMeta.targetSurface) return surface;
      if (shortened === exMeta.targetSurface) return shortened;
      return expanded;
    }
    if (exMeta.form === 'dict' && /[～〜~]/.test(surface)) {
      return stripEdgeTildes(surface);
    }
    return surface;
  }
  return item.k;
}

/**
 * Normalizes Japanese terms or readings for homograph/homophone collision checks.
 */
export function normalizeTermText(text: string): string {
  return text
    .replace(/[()（）～〜~▲。、！？!?…\s・,./／]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Extracts normalized Indonesian meaning glosses from a meaning string so
 * overlapping synonyms (e.g. `"menggunakan; memakai"` vs `"memakai"`) are detected.
 */
export function extractMeaningGlosses(meaning: string): Set<string> {
  const withoutParens = meaning
    .replace(/\([^)]*\)/g, ' ')
    .replace(/（[^）]*）/g, ' ');
  const source = withoutParens.trim() ? withoutParens : meaning;
  const parts = source.split(/[;；,/／]/);
  const glosses = new Set<string>();

  for (const part of parts) {
    const cleaned = part
      .replace(/[～〜~…\.?!。！？'"「」『』()（）]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (cleaned) {
      glosses.add(cleaned);
    }
  }

  return glosses;
}

/**
 * Returns true if two Indonesian meanings share any normalized gloss or full meaning,
 * preventing two valid answers from appearing in the same multiple-choice question.
 */
export function hasMeaningCollision(a: string, b: string): boolean {
  const fullA = a.replace(/\s+/g, ' ').trim().toLowerCase();
  const fullB = b.replace(/\s+/g, ' ').trim().toLowerCase();
  if (fullA === fullB) return true;

  const glossesA = extractMeaningGlosses(a);
  const glossesB = extractMeaningGlosses(b);
  for (const g of glossesA) {
    if (glossesB.has(g)) return true;
  }
  return false;
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

interface EntryCollisionMeta {
  normK: string;
  normR: string;
  fullM: string;
  glosses: Set<string>;
}

interface DatasetCollisionIndex {
  byId: Map<string, EntryCollisionMeta>;
  sameKReadings: Map<string, Set<string>>;
  sameKMeanings: Map<string, EntryCollisionMeta[]>;
  sameRKs: Map<string, Set<string>>;
}

const datasetIndexCache = new WeakMap<readonly KanjiEntry[], DatasetCollisionIndex>();

function getDatasetCollisionIndex(dataset: readonly KanjiEntry[]): DatasetCollisionIndex {
  const cached = datasetIndexCache.get(dataset);
  if (cached) return cached;

  const byId = new Map<string, EntryCollisionMeta>();
  const sameKReadings = new Map<string, Set<string>>();
  const sameKMeanings = new Map<string, EntryCollisionMeta[]>();
  const sameRKs = new Map<string, Set<string>>();

  for (const e of dataset) {
    const meta: EntryCollisionMeta = {
      normK: normalizeTermText(e.k),
      normR: normalizeTermText(e.r),
      fullM: e.m.replace(/\s+/g, ' ').trim().toLowerCase(),
      glosses: extractMeaningGlosses(e.m),
    };
    byId.set(e.id, meta);

    if (meta.normK) {
      let rSet = sameKReadings.get(meta.normK);
      if (!rSet) {
        rSet = new Set<string>();
        sameKReadings.set(meta.normK, rSet);
      }
      if (meta.normR) rSet.add(meta.normR);

      let mList = sameKMeanings.get(meta.normK);
      if (!mList) {
        mList = [];
        sameKMeanings.set(meta.normK, mList);
      }
      mList.push(meta);
    }

    if (meta.normR) {
      let kSet = sameRKs.get(meta.normR);
      if (!kSet) {
        kSet = new Set<string>();
        sameRKs.set(meta.normR, kSet);
      }
      if (meta.normK) kSet.add(meta.normK);
    }
  }

  const index: DatasetCollisionIndex = { byId, sameKReadings, sameKMeanings, sameRKs };
  datasetIndexCache.set(dataset, index);
  return index;
}

function getEntryMeta(item: KanjiEntry, index: DatasetCollisionIndex): EntryCollisionMeta {
  const found = index.byId.get(item.id);
  if (found) return found;
  return {
    normK: normalizeTermText(item.k),
    normR: normalizeTermText(item.r),
    fullM: item.m.replace(/\s+/g, ' ').trim().toLowerCase(),
    glosses: extractMeaningGlosses(item.m),
  };
}

function metaHasMeaningCollision(a: EntryCollisionMeta, b: EntryCollisionMeta): boolean {
  if (a.fullM === b.fullM) return true;
  for (const g of a.glosses) {
    if (b.glosses.has(g)) return true;
  }
  return false;
}

export function pickDistractors(
  item: KanjiEntry,
  key: QuizModelKey,
  count: number,
  exMeta: SentenceBlank | null,
  levelFilter: LevelFilter = 'all',
  dataset: readonly KanjiEntry[] = KANJI,
  rng: () => number = Math.random,
  chapterFilter?: IrodoriChapterSelection
): KanjiEntry[] {
  const index = getDatasetCollisionIndex(dataset);
  const targetDisp = dispOf(item, key, exMeta);
  const targetMeta = getEntryMeta(item, index);
  const targetNormK = targetMeta.normK;
  const targetNormR = targetMeta.normR;

  const sameKReadings = index.sameKReadings.get(targetNormK);
  const sameKMeanings = index.sameKMeanings.get(targetNormK);
  const sameRKs = index.sameRKs.get(targetNormR);

  const checkMeaning = key === 'k2m' || key === 'm2k' || key === 'ex2k';

  const isEligibleBase = (candidate: KanjiEntry): boolean => {
    if (candidate.id === item.id) return false;
    if (dispOf(candidate, key, exMeta) === targetDisp) return false;

    const candMeta = getEntryMeta(candidate, index);
    const candNormK = candMeta.normK;
    const candNormR = candMeta.normR;

    // Block homographs & homophones across ALL 5 models so two options never represent the same word/reading.
    if (candNormK && candNormK === targetNormK) return false;
    if (candNormR && candNormR === targetNormR) return false;

    if (key === 'k2r' && sameKReadings?.has(candNormR)) return false;
    if (key === 'r2k' && sameRKs?.has(candNormK)) return false;

    if (checkMeaning) {
      if (metaHasMeaningCollision(candMeta, targetMeta)) return false;
      if (key === 'k2m' && sameKMeanings?.some(m => metaHasMeaningCollision(candMeta, m))) {
        return false;
      }
    }

    return true;
  };

  const matchesActiveScope = (it: KanjiEntry): boolean => {
    if (chapterFilter !== undefined) {
      return matchesChapterSelection(it.chapter, chapterFilter);
    }
    return levelFilter === 'all' || it.dif === levelFilter;
  };

  // Prioritize candidates from the active level/chapter filter so focused quizzes keep relevant distractors.
  const sameLevelAll = dataset.filter(it => matchesActiveScope(it) && isEligibleBase(it));
  const crossLevelAll =
    (chapterFilter !== undefined ? isAllChaptersSelected(chapterFilter) : levelFilter === 'all')
      ? []
      : dataset.filter(it => !matchesActiveScope(it) && isEligibleBase(it));

  const scoreCandidate = (it: KanjiEntry, isSameLevel: boolean): number => {
    let s = isSameLevel ? 100 : 0;
    if (key === 'k2r') {
      s += sharedKanji(item.k, it.k) * 3 + kanaSim(item.r, it.r);
    } else if (key === 'r2k') {
      s += kanaSim(item.r, it.r) * 2.5 + sharedKanji(item.k, it.k) * 1.5;
    } else if (key === 'm2k') {
      s +=
        sharedKanji(item.k, it.k) * 1.5 +
        (it.dif === item.dif ? 0.5 : 0) +
        (Math.abs(item.k.length - it.k.length) <= 1 ? 0.4 : 0);
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
      // k2m: prefer plausible length & difficulty without biasing toward synonymous meanings
      s +=
        (it.dif === item.dif ? 0.5 : 0) +
        (Math.abs(item.m.length - it.m.length) <= 8 ? 0.4 : 0) +
        kanaSim(item.r, it.r) * 0.25;
    }
    return s + rng() * 0.6;
  };

  // Build tiered pools so grammatical compatibility and level/chapter isolation are both respected:
  // Tier 1: Same scope + grammatically compatible (for ex2k)
  // Tier 2: Cross scope + grammatically compatible (only if active scope has < count items in that rare subPos)
  // Tier 3: Same scope fallback
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
  const seenNormKs = new Set<string>(targetNormK ? [targetNormK] : []);
  const seenNormRs = new Set<string>(targetNormR ? [targetNormR] : []);
  const out: KanjiEntry[] = [];
  const outMetas: EntryCollisionMeta[] = [];

  const fillFromTiers = (enforceDistractorMeaningDistinct: boolean) => {
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
        const candMeta = getEntryMeta(it, index);
        if (candMeta.normK && seenNormKs.has(candMeta.normK)) continue;
        if (candMeta.normR && seenNormRs.has(candMeta.normR)) continue;
        if (
          enforceDistractorMeaningDistinct &&
          checkMeaning &&
          outMetas.some(prev => metaHasMeaningCollision(prev, candMeta))
        ) {
          continue;
        }

        seenLabels.add(label);
        seenIds.add(it.id);
        if (candMeta.normK) seenNormKs.add(candMeta.normK);
        if (candMeta.normR) seenNormRs.add(candMeta.normR);
        out.push(it);
        outMetas.push(candMeta);
        if (out.length === count) break;
      }
    }
  };

  fillFromTiers(true);
  if (out.length < count) {
    fillFromTiers(false);
  }

  return out;
}

function resolvePromptHint(
  item: KanjiEntry,
  typeKey: QuizModelKey,
  dataset: readonly KanjiEntry[]
): string | undefined {
  const index = getDatasetCollisionIndex(dataset);
  const meta = getEntryMeta(item, index);

  if (typeKey === 'k2r') {
    const distinctReadings = index.sameKReadings.get(meta.normK);
    if (distinctReadings && distinctReadings.size > 1) {
      return `Arti: ${item.m}`;
    }
  } else if (typeKey === 'k2m') {
    const distinctReadings = index.sameKReadings.get(meta.normK);
    if (distinctReadings && distinctReadings.size > 1) {
      return `Baca: ${item.r}`;
    }
  } else if (typeKey === 'r2k') {
    const distinctForms = index.sameRKs.get(meta.normR);
    if (distinctForms && distinctForms.size > 1) {
      return `Arti: ${item.m}`;
    }
  }

  return undefined;
}

export function makeQuestion(
  item: KanjiEntry,
  typeKey: QuizModelKey,
  levelFilter: LevelFilter = 'all',
  dataset: readonly KanjiEntry[] = KANJI,
  rng: () => number = Math.random,
  chapterFilter?: IrodoriChapterSelection
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
  const promptHint = resolvePromptHint(item, typeKey, dataset);

  return {
    item,
    type: typeKey,
    exMeta,
    options,
    ...(promptHint ? { promptHint } : {}),
  };
}

export function buildQuizSession(
  levelFilter: LevelFilter,
  choice: QuizTypeChoice,
  requestedCount: number | 'all',
  dataset: readonly KanjiEntry[] = KANJI,
  rng: () => number = Math.random,
  chapterFilter?: IrodoriChapterSelection
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
