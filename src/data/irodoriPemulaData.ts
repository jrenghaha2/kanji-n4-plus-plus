import type {
  IrodoriChapterFilter,
  IrodoriChapterMeta,
  IrodoriChapterNumber,
  KanjiEntry,
} from '../types/kanji';
import {
  IRODORI_CHAPTER_NUMBERS,
  chapterToDifficulty,
  getIrodoriPoolIndicesForDataset,
} from './irodoriShared';
import {
  RAW_IRODORI_PEMULA_PART1,
  type RawIrodoriPemulaTuple,
} from './irodoriPemulaPart1';
import { RAW_IRODORI_PEMULA_PART2 } from './irodoriPemulaPart2';
import { RAW_IRODORI_PEMULA_PART3 } from './irodoriPemulaPart3';
import { RAW_IRODORI_PEMULA_EXTRA } from './irodoriPemulaExtra';

/**
 * Materi lengkap Irodori Pemula (いろどり 入門 · Level A1 · Bab 1–18).
 * Sumber: Daftar Kosakata Tingkat Pemula (Japan Foundation, Ver. 2021/10/01).
 */
export const IRODORI_PEMULA_PDF_PATH =
  'https://drive.google.com/file/d/1Pqbslo4_fbmWlyy7aRdmXZs40DS98p0O/view?pli=1';

export { IRODORI_CHAPTER_NUMBERS };

export const IRODORI_PEMULA_CHAPTERS: Record<
  IrodoriChapterNumber,
  IrodoriChapterMeta
> = {
  1: {
    chapter: 1,
    label: 'Bab 1',
    shortLabel: 'Bab 1',
    jpTitle: 'おはようございます',
    idTitle: 'Selamat Pagi',
    topicJp: 'はじめての日本語',
    topicId: 'Bahasa Jepang Pertama',
    dotColor: '#2563eb',
  },
  2: {
    chapter: 2,
    label: 'Bab 2',
    shortLabel: 'Bab 2',
    jpTitle: 'すみません、よくわかりません',
    idTitle: 'Maaf, Saya Kurang Mengerti',
    topicJp: 'はじめての日本語',
    topicId: 'Bahasa Jepang Pertama',
    dotColor: '#2563eb',
  },
  3: {
    chapter: 3,
    label: 'Bab 3',
    shortLabel: 'Bab 3',
    jpTitle: 'よろしくお願いします',
    idTitle: 'Mohon Kerja Samanya',
    topicJp: '私のこと',
    topicId: 'Tentang Saya',
    dotColor: '#ea580c',
  },
  4: {
    chapter: 4,
    label: 'Bab 4',
    shortLabel: 'Bab 4',
    jpTitle: '東京に住んでいます',
    idTitle: 'Tinggal di Tokyo',
    topicJp: '私のこと',
    topicId: 'Tentang Saya',
    dotColor: '#ea580c',
  },
  5: {
    chapter: 5,
    label: 'Bab 5',
    shortLabel: 'Bab 5',
    jpTitle: 'うどんが好きです',
    idTitle: 'Suka Udon',
    topicJp: '好きな食べ物',
    topicId: 'Makanan Favorit',
    dotColor: '#0d9488',
  },
  6: {
    chapter: 6,
    label: 'Bab 6',
    shortLabel: 'Bab 6',
    jpTitle: 'チーズバーガーください',
    idTitle: 'Minta Cheeseburger',
    topicJp: '好きな食べ物',
    topicId: 'Makanan Favorit',
    dotColor: '#0d9488',
  },
  7: {
    chapter: 7,
    label: 'Bab 7',
    shortLabel: 'Bab 7',
    jpTitle: '部屋が4つあります',
    idTitle: 'Ada 4 Ruangan',
    topicJp: '家と職場',
    topicId: 'Rumah dan Tempat Kerja',
    dotColor: '#7c3aed',
  },
  8: {
    chapter: 8,
    label: 'Bab 8',
    shortLabel: 'Bab 8',
    jpTitle: '山田さんはどこにいますか？',
    idTitle: 'Di Mana Yamada-san?',
    topicJp: '家と職場',
    topicId: 'Rumah dan Tempat Kerja',
    dotColor: '#7c3aed',
  },
  9: {
    chapter: 9,
    label: 'Bab 9',
    shortLabel: 'Bab 9',
    jpTitle: '12時から1時まで昼休みです',
    idTitle: 'Istirahat Siang Jam 12–1',
    topicJp: '毎日の生活',
    topicId: 'Kehidupan Sehari-hari',
    dotColor: '#dc2626',
  },
  10: {
    chapter: 10,
    label: 'Bab 10',
    shortLabel: 'Bab 10',
    jpTitle: 'ホチキス貸してください',
    idTitle: 'Tolong Pinjamkan Stapler',
    topicJp: '毎日の生活',
    topicId: 'Kehidupan Sehari-hari',
    dotColor: '#dc2626',
  },
  11: {
    chapter: 11,
    label: 'Bab 11',
    shortLabel: 'Bab 11',
    jpTitle: 'どんなマンガが好きですか？',
    idTitle: 'Suka Manga Seperti Apa?',
    topicJp: '私の好きなこと',
    topicId: 'Hal yang Saya Sukai',
    dotColor: '#16a34a',
  },
  12: {
    chapter: 12,
    label: 'Bab 12',
    shortLabel: 'Bab 12',
    jpTitle: 'いっしょに飲みに行きませんか？',
    idTitle: 'Mau Pergi Minum Bersama?',
    topicJp: '私の好きなこと',
    topicId: 'Hal yang Saya Sukai',
    dotColor: '#16a34a',
  },
  13: {
    chapter: 13,
    label: 'Bab 13',
    shortLabel: 'Bab 13',
    jpTitle: 'このバスは空港に行きますか？',
    idTitle: 'Apakah Bus Ini ke Bandara?',
    topicJp: '街を歩く',
    topicId: 'Berjalan-jalan di Kota',
    dotColor: '#9a3412',
  },
  14: {
    chapter: 14,
    label: 'Bab 14',
    shortLabel: 'Bab 14',
    jpTitle: '大きな建物ですね',
    idTitle: 'Bangunan yang Besar Ya',
    topicJp: '街を歩く',
    topicId: 'Berjalan-jalan di Kota',
    dotColor: '#9a3412',
  },
  15: {
    chapter: 15,
    label: 'Bab 15',
    shortLabel: 'Bab 15',
    jpTitle: '電池がほしいんですが…',
    idTitle: 'Saya Ingin Baterai…',
    topicJp: '店で',
    topicId: 'Di Toko',
    dotColor: '#4338ca',
  },
  16: {
    chapter: 16,
    label: 'Bab 16',
    shortLabel: 'Bab 16',
    jpTitle: 'これ、いくらですか？',
    idTitle: 'Ini Berapa Harganya?',
    topicJp: '店で',
    topicId: 'Di Toko',
    dotColor: '#4338ca',
  },
  17: {
    chapter: 17,
    label: 'Bab 17',
    shortLabel: 'Bab 17',
    jpTitle: '映画を見に行きました',
    idTitle: 'Pergi Menonton Film',
    topicJp: '休みの日に',
    topicId: 'Di Hari Libur',
    dotColor: '#be185d',
  },
  18: {
    chapter: 18,
    label: 'Bab 18',
    shortLabel: 'Bab 18',
    jpTitle: '温泉に入りたいです',
    idTitle: 'Ingin Berendam di Onsen',
    topicJp: '休みの日に',
    topicId: 'Di Hari Libur',
    dotColor: '#be185d',
  },
};

function extractUniqueKanji(text: string): string[] {
  const seen = new Set<string>();
  for (const ch of text) {
    if (/[一-龯々]/.test(ch)) {
      seen.add(ch);
    }
  }
  return Array.from(seen);
}

export const RAW_IRODORI_PEMULA: RawIrodoriPemulaTuple[] = [
  ...RAW_IRODORI_PEMULA_PART1,
  ...RAW_IRODORI_PEMULA_PART2,
  ...RAW_IRODORI_PEMULA_PART3,
  ...RAW_IRODORI_PEMULA_EXTRA,
];

export const IRODORI_PEMULA_DATA: KanjiEntry[] = RAW_IRODORI_PEMULA.map(
  ([chapter, k, r, romaji, accent, m, subSection, ex, exi], idx): KanjiEntry => ({
    id: `irp${idx + 1}`,
    k,
    r,
    romaji,
    accent,
    m,
    subSection,
    ex,
    exi,
    kanjiList: extractUniqueKanji(k),
    lv: 'N4',
    dif: chapterToDifficulty(chapter),
    chapter,
  })
).sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));

export const VALID_IRODORI_PEMULA_IDS: Set<string> = new Set(
  IRODORI_PEMULA_DATA.map(it => it.id)
);

export function getIrodoriPemulaPoolIndices(
  chapterFilter: IrodoriChapterFilter,
  dataset: readonly KanjiEntry[] = IRODORI_PEMULA_DATA
): number[] {
  return getIrodoriPoolIndicesForDataset(chapterFilter, dataset);
}
