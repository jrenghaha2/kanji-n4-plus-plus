import type {
  DifficultyLevel,
  IrodoriChapterFilter,
  IrodoriChapterMeta,
  IrodoriChapterNumber,
  KanjiEntry,
  RawIrodoriTuple,
} from '../types/kanji';

export const IRODORI_CHAPTER_NUMBERS: readonly IrodoriChapterNumber[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
] as const;

export const IRODORI_TOPIC_COLORS: readonly string[] = [
  '#2563eb', // Topik 1 (Bab 1-2)
  '#ea580c', // Topik 2 (Bab 3-4)
  '#0d9488', // Topik 3 (Bab 5-6)
  '#7c3aed', // Topik 4 (Bab 7-8)
  '#dc2626', // Topik 5 (Bab 9-10)
  '#16a34a', // Topik 6 (Bab 11-12)
  '#9a3412', // Topik 7 (Bab 13-14)
  '#4338ca', // Topik 8 (Bab 15-16)
  '#be185d', // Topik 9 (Bab 17-18)
] as const;

export function chapterToDifficulty(ch: IrodoriChapterNumber): DifficultyLevel {
  if (ch <= 6) return 'easy';
  if (ch <= 12) return 'medium';
  return 'hard';
}

export function buildIrodoriEntries(
  rawTuples: readonly RawIrodoriTuple[],
  idPrefix: string
): KanjiEntry[] {
  return rawTuples.map(
    ([chapter, k, r, accent, m, subSection, ex, exi], idx) => ({
      id: `${idPrefix}${idx + 1}`,
      k,
      r,
      m,
      ex,
      exi,
      lv: 'N4',
      dif: chapterToDifficulty(chapter),
      chapter,
      accent,
      subSection,
    })
  );
}

export function getIrodoriPoolIndicesForDataset(
  chapterFilter: IrodoriChapterFilter,
  dataset: readonly KanjiEntry[]
): number[] {
  const out: number[] = [];
  for (let i = 0; i < dataset.length; i++) {
    if (chapterFilter === 'all' || dataset[i].chapter === chapterFilter) {
      out.push(i);
    }
  }
  return out;
}

export function createPlaceholderIrodoriChapters(
  bookTitle: string
): Record<IrodoriChapterNumber, IrodoriChapterMeta> {
  const result = {} as Record<IrodoriChapterNumber, IrodoriChapterMeta>;

  for (const chapter of IRODORI_CHAPTER_NUMBERS) {
    const topicIndex = Math.floor((chapter - 1) / 2);
    result[chapter] = {
      chapter,
      label: `Bab ${chapter}`,
      shortLabel: `Bab ${chapter}`,
      jpTitle: `第${chapter}課（準備中）`,
      idTitle: `Materi Bab ${chapter} (${bookTitle})`,
      topicJp: `トピック ${topicIndex + 1}`,
      topicId: `Topik ${topicIndex + 1}`,
      dotColor: IRODORI_TOPIC_COLORS[topicIndex] ?? '#2563eb',
    };
  }

  return result;
}
