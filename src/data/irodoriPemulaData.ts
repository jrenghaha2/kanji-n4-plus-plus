import type {
  IrodoriChapterFilter,
  IrodoriChapterMeta,
  IrodoriChapterNumber,
  KanjiEntry,
  RawIrodoriTuple,
} from '../types/kanji';
import {
  IRODORI_CHAPTER_NUMBERS,
  buildIrodoriEntries,
  getIrodoriPoolIndicesForDataset,
} from './irodoriShared';

/**
 * File persiapan materi Irodori Pemula (いろどり 入門 · Level A1).
 *
 * Cara mengisi materi nanti:
 * 1. Lengkapi judul tiap bab di `IRODORI_PEMULA_CHAPTERS` (Bab 1–18).
 * 2. Isi daftar kosakata & kanji di `RAW_IRODORI_PEMULA` dengan format tuple:
 *    [chapter, k, r, accent, m, subSection, ex, exi]
 *    - chapter    : nomor bab 1..18
 *    - k          : bentuk kanji/kotoba utama
 *    - r          : bacaan hiragana/katakana (untuk TTS & kuis)
 *    - accent     : pola aksen nada (contoh: 'にほん○' atau '-')
 *    - m          : arti Bahasa Indonesia
 *    - subSection : sub-bagian bab (contoh: '1. よろしくおねがいします')
 *    - ex         : contoh kalimat bahasa Jepang yang memuat kata `k`
 *    - exi        : terjemahan contoh kalimat dalam Bahasa Indonesia
 * 3. Jika ada file PDF kosakata resmi, letakkan di `public/assets/...` dan isi `IRODORI_PEMULA_PDF_PATH`.
 */
export const IRODORI_PEMULA_PDF_PATH = '';

export { IRODORI_CHAPTER_NUMBERS };

export const IRODORI_PEMULA_CHAPTERS: Record<
  IrodoriChapterNumber,
  IrodoriChapterMeta
> = {
  1: {
    chapter: 1,
    label: 'Bab 1',
    shortLabel: 'Bab 1',
    jpTitle: '第1課（未入力）',
    idTitle: 'Bab 1 (Siap diisi)',
    topicJp: 'トピック 1',
    topicId: 'Topik 1',
    dotColor: '#2563eb',
  },
  2: {
    chapter: 2,
    label: 'Bab 2',
    shortLabel: 'Bab 2',
    jpTitle: '第2課（未入力）',
    idTitle: 'Bab 2 (Siap diisi)',
    topicJp: 'トピック 1',
    topicId: 'Topik 1',
    dotColor: '#2563eb',
  },
  3: {
    chapter: 3,
    label: 'Bab 3',
    shortLabel: 'Bab 3',
    jpTitle: '第3課（未入力）',
    idTitle: 'Bab 3 (Siap diisi)',
    topicJp: 'トピック 2',
    topicId: 'Topik 2',
    dotColor: '#ea580c',
  },
  4: {
    chapter: 4,
    label: 'Bab 4',
    shortLabel: 'Bab 4',
    jpTitle: '第4課（未入力）',
    idTitle: 'Bab 4 (Siap diisi)',
    topicJp: 'トピック 2',
    topicId: 'Topik 2',
    dotColor: '#ea580c',
  },
  5: {
    chapter: 5,
    label: 'Bab 5',
    shortLabel: 'Bab 5',
    jpTitle: '第5課（未入力）',
    idTitle: 'Bab 5 (Siap diisi)',
    topicJp: 'トピック 3',
    topicId: 'Topik 3',
    dotColor: '#0d9488',
  },
  6: {
    chapter: 6,
    label: 'Bab 6',
    shortLabel: 'Bab 6',
    jpTitle: '第6課（未入力）',
    idTitle: 'Bab 6 (Siap diisi)',
    topicJp: 'トピック 3',
    topicId: 'Topik 3',
    dotColor: '#0d9488',
  },
  7: {
    chapter: 7,
    label: 'Bab 7',
    shortLabel: 'Bab 7',
    jpTitle: '第7課（未入力）',
    idTitle: 'Bab 7 (Siap diisi)',
    topicJp: 'トピック 4',
    topicId: 'Topik 4',
    dotColor: '#7c3aed',
  },
  8: {
    chapter: 8,
    label: 'Bab 8',
    shortLabel: 'Bab 8',
    jpTitle: '第8課（未入力）',
    idTitle: 'Bab 8 (Siap diisi)',
    topicJp: 'トピック 4',
    topicId: 'Topik 4',
    dotColor: '#7c3aed',
  },
  9: {
    chapter: 9,
    label: 'Bab 9',
    shortLabel: 'Bab 9',
    jpTitle: '第9課（未入力）',
    idTitle: 'Bab 9 (Siap diisi)',
    topicJp: 'トピック 5',
    topicId: 'Topik 5',
    dotColor: '#dc2626',
  },
  10: {
    chapter: 10,
    label: 'Bab 10',
    shortLabel: 'Bab 10',
    jpTitle: '第10課（未入力）',
    idTitle: 'Bab 10 (Siap diisi)',
    topicJp: 'トピック 5',
    topicId: 'Topik 5',
    dotColor: '#dc2626',
  },
  11: {
    chapter: 11,
    label: 'Bab 11',
    shortLabel: 'Bab 11',
    jpTitle: '第11課（未入力）',
    idTitle: 'Bab 11 (Siap diisi)',
    topicJp: 'トピック 6',
    topicId: 'Topik 6',
    dotColor: '#16a34a',
  },
  12: {
    chapter: 12,
    label: 'Bab 12',
    shortLabel: 'Bab 12',
    jpTitle: '第12課（未入力）',
    idTitle: 'Bab 12 (Siap diisi)',
    topicJp: 'トピック 6',
    topicId: 'Topik 6',
    dotColor: '#16a34a',
  },
  13: {
    chapter: 13,
    label: 'Bab 13',
    shortLabel: 'Bab 13',
    jpTitle: '第13課（未入力）',
    idTitle: 'Bab 13 (Siap diisi)',
    topicJp: 'トピック 7',
    topicId: 'Topik 7',
    dotColor: '#9a3412',
  },
  14: {
    chapter: 14,
    label: 'Bab 14',
    shortLabel: 'Bab 14',
    jpTitle: '第14課（未入力）',
    idTitle: 'Bab 14 (Siap diisi)',
    topicJp: 'トピック 7',
    topicId: 'Topik 7',
    dotColor: '#9a3412',
  },
  15: {
    chapter: 15,
    label: 'Bab 15',
    shortLabel: 'Bab 15',
    jpTitle: '第15課（未入力）',
    idTitle: 'Bab 15 (Siap diisi)',
    topicJp: 'トピック 8',
    topicId: 'Topik 8',
    dotColor: '#4338ca',
  },
  16: {
    chapter: 16,
    label: 'Bab 16',
    shortLabel: 'Bab 16',
    jpTitle: '第16課（未入力）',
    idTitle: 'Bab 16 (Siap diisi)',
    topicJp: 'トピック 8',
    topicId: 'Topik 8',
    dotColor: '#4338ca',
  },
  17: {
    chapter: 17,
    label: 'Bab 17',
    shortLabel: 'Bab 17',
    jpTitle: '第17課（未入力）',
    idTitle: 'Bab 17 (Siap diisi)',
    topicJp: 'トピック 9',
    topicId: 'Topik 9',
    dotColor: '#be185d',
  },
  18: {
    chapter: 18,
    label: 'Bab 18',
    shortLabel: 'Bab 18',
    jpTitle: '第18課（未入力）',
    idTitle: 'Bab 18 (Siap diisi)',
    topicJp: 'トピック 9',
    topicId: 'Topik 9',
    dotColor: '#be185d',
  },
};

export const RAW_IRODORI_PEMULA: RawIrodoriTuple[] = [
  // Contoh format:
  // [1, '日本', 'にほん', 'にほ↓ん', 'Jepang', '1. はじめまして', '日本へ来ました。', 'Saya datang ke Jepang.'],
];

export const IRODORI_PEMULA_DATA: KanjiEntry[] = buildIrodoriEntries(
  RAW_IRODORI_PEMULA,
  'irp'
);

export const VALID_IRODORI_PEMULA_IDS: Set<string> = new Set(
  IRODORI_PEMULA_DATA.map(it => it.id)
);

export function getIrodoriPemulaPoolIndices(
  chapterFilter: IrodoriChapterFilter,
  dataset: readonly KanjiEntry[] = IRODORI_PEMULA_DATA
): number[] {
  return getIrodoriPoolIndicesForDataset(chapterFilter, dataset);
}
