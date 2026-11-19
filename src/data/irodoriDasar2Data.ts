import type {
  IrodoriChapterFilter,
  IrodoriChapterMeta,
  IrodoriChapterNumber,
  KanjiEntry,
  RawIrodoriTuple,
} from '../types/kanji';
import {
  IRODORI_CHAPTER_NUMBERS,
  chapterToDifficulty,
  getIrodoriPoolIndicesForDataset,
} from './irodoriShared';
import { RAW_IRODORI_DASAR2_PART1 } from './irodoriDasar2Part1';
import { RAW_IRODORI_DASAR2_PART2 } from './irodoriDasar2Part2';
import { RAW_IRODORI_DASAR2_PART3 } from './irodoriDasar2Part3';

/**
 * Materi lengkap Irodori Dasar 2 (いろどり 初級2 · Level A2 · Bab 1–18).
 * Sumber: Daftar Kosakata Tingkat Dasar 2 (Japan Foundation, Ver. 2021/10/01).
 */
export const IRODORI_DASAR2_PDF_PATH =
  'https://drive.google.com/file/d/13XALHensHPg17psVHBMcODXkRIM19f_E/view';

export { IRODORI_CHAPTER_NUMBERS };

export const IRODORI_DASAR2_CHAPTERS: Record<
  IrodoriChapterNumber,
  IrodoriChapterMeta
> = {
  1: {
    chapter: 1,
    label: 'Bab 1',
    shortLabel: 'Bab 1',
    jpTitle: '先週、日本に来たばかりです',
    idTitle: 'Baru Datang ke Jepang Minggu Lalu',
    topicJp: '私の周りの人たち',
    topicId: 'Orang-orang di Sekitar Saya',
    dotColor: '#2563eb',
  },
  2: {
    chapter: 2,
    label: 'Bab 2',
    shortLabel: 'Bab 2',
    jpTitle: 'まじめそうな人ですね',
    idTitle: 'Kelihatannya Orang yang Rajin Ya',
    topicJp: '私の周りの人たち',
    topicId: 'Orang-orang di Sekitar Saya',
    dotColor: '#2563eb',
  },
  3: {
    chapter: 3,
    label: 'Bab 3',
    shortLabel: 'Bab 3',
    jpTitle: 'アレルギーがあるので、食べられないんです',
    idTitle: 'Karena Alergi, Jadi Tidak Bisa Makan',
    topicJp: 'レストランで',
    topicId: 'Di Restoran',
    dotColor: '#ea580c',
  },
  4: {
    chapter: 4,
    label: 'Bab 4',
    shortLabel: 'Bab 4',
    jpTitle: 'しょうゆをつけないで食べてください',
    idTitle: 'Silakan Makan Tanpa Kecap Asin',
    topicJp: 'レストランで',
    topicId: 'Di Restoran',
    dotColor: '#ea580c',
  },
  5: {
    chapter: 5,
    label: 'Bab 5',
    shortLabel: 'Bab 5',
    jpTitle: '早く予約したほうがいいですよ',
    idTitle: 'Sebaiknya Cepat Memesan Ya',
    topicJp: '旅行に行こう',
    topicId: 'Ayo Pergi Berwisata',
    dotColor: '#0d9488',
  },
  6: {
    chapter: 6,
    label: 'Bab 6',
    shortLabel: 'Bab 6',
    jpTitle: 'いろいろなところに行けて、よかったです',
    idTitle: 'Senang Bisa Pergi ke Berbagai Tempat',
    topicJp: '旅行に行こう',
    topicId: 'Ayo Pergi Berwisata',
    dotColor: '#0d9488',
  },
  7: {
    chapter: 7,
    label: 'Bab 7',
    shortLabel: 'Bab 7',
    jpTitle: '雨が降ったら、ホールでやります',
    idTitle: 'Kalau Hujan, Diadakan di Aula',
    topicJp: '地域のイベント',
    topicId: 'Acara Daerah Setempat',
    dotColor: '#7c3aed',
  },
  8: {
    chapter: 8,
    label: 'Bab 8',
    shortLabel: 'Bab 8',
    jpTitle: '屋台はどこかわかりますか？',
    idTitle: 'Tahukah Di Mana Kedai Makanan?',
    topicJp: '地域のイベント',
    topicId: 'Acara Daerah Setempat',
    dotColor: '#7c3aed',
  },
  9: {
    chapter: 9,
    label: 'Bab 9',
    shortLabel: 'Bab 9',
    jpTitle: '成人の日は、何をするんですか？',
    idTitle: 'Apa yang Dilakukan di Hari Kedewasaan?',
    topicJp: '年中行事とマナー',
    topicId: 'Acara Tahunan dan Tata Krama',
    dotColor: '#dc2626',
  },
  10: {
    chapter: 10,
    label: 'Bab 10',
    shortLabel: 'Bab 10',
    jpTitle: 'どんな服を着て行けばいいですか？',
    idTitle: 'Pakaian Seperti Apa yang Sebaiknya Dipakai?',
    topicJp: '年中行事とマナー',
    topicId: 'Acara Tahunan dan Tata Krama',
    dotColor: '#dc2626',
  },
  11: {
    chapter: 11,
    label: 'Bab 11',
    shortLabel: 'Bab 11',
    jpTitle: 'ポイントカードを忘れてしまいました',
    idTitle: 'Saya Lupa Membawa Kartu Poin',
    topicJp: '上手な買い物',
    topicId: 'Berbelanja dengan Cermat',
    dotColor: '#16a34a',
  },
  12: {
    chapter: 12,
    label: 'Bab 12',
    shortLabel: 'Bab 12',
    jpTitle: 'この掃除機は軽くて動かしやすいですよ',
    idTitle: 'Penyedot Debu Ini Ringan dan Mudah Digerakkan',
    topicJp: '上手な買い物',
    topicId: 'Berbelanja dengan Cermat',
    dotColor: '#16a34a',
  },
  13: {
    chapter: 13,
    label: 'Bab 13',
    shortLabel: 'Bab 13',
    jpTitle: 'いろいろな資料を展示してあります',
    idTitle: 'Berbagai Materi Dipamerkan',
    topicJp: 'さまざまなサービス',
    topicId: 'Berbagai Layanan',
    dotColor: '#9a3412',
  },
  14: {
    chapter: 14,
    label: 'Bab 14',
    shortLabel: 'Bab 14',
    jpTitle: '前髪は、もう少し短く切ってもらえますか？',
    idTitle: 'Bisakah Poni Dipotong Sedikit Lebih Pendek?',
    topicJp: 'さまざまなサービス',
    topicId: 'Berbagai Layanan',
    dotColor: '#9a3412',
  },
  15: {
    chapter: 15,
    label: 'Bab 15',
    shortLabel: 'Bab 15',
    jpTitle: '会議室の電気がついたままでした',
    idTitle: 'Lampu Ruang Rapat Masih Menyala',
    topicJp: '自然と環境',
    topicId: 'Alam dan Lingkungan',
    dotColor: '#4338ca',
  },
  16: {
    chapter: 16,
    label: 'Bab 16',
    shortLabel: 'Bab 16',
    jpTitle: '地震が来ても、あわてて動かないでください',
    idTitle: 'Meski Gempa Datang, Jangan Panik Bergerak',
    topicJp: '自然と環境',
    topicId: 'Alam dan Lingkungan',
    dotColor: '#4338ca',
  },
  17: {
    chapter: 17,
    label: 'Bab 17',
    shortLabel: 'Bab 17',
    jpTitle: '日本語が前より話せるようになりました',
    idTitle: 'Sekarang Bisa Berbahasa Jepang Lebih Baik',
    topicJp: '私の人生',
    topicId: 'Kehidupan Saya',
    dotColor: '#be185d',
  },
  18: {
    chapter: 18,
    label: 'Bab 18',
    shortLabel: 'Bab 18',
    jpTitle: '将来、自分の会社を作ろうと思います',
    idTitle: 'Di Masa Depan, Ingin Mendirikan Perusahaan Sendiri',
    topicJp: '私の人生',
    topicId: 'Kehidupan Saya',
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

export const RAW_IRODORI_DASAR2: RawIrodoriTuple[] = [
  ...RAW_IRODORI_DASAR2_PART1,
  ...RAW_IRODORI_DASAR2_PART2,
  ...RAW_IRODORI_DASAR2_PART3,
];

export const IRODORI_DASAR2_DATA: KanjiEntry[] = RAW_IRODORI_DASAR2.map(
  ([chapter, k, r, accent, m, subSection, ex, exi], idx) => ({
    id: `ir2_${idx + 1}`,
    k,
    r,
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
);

export const VALID_IRODORI_DASAR2_IDS: Set<string> = new Set(
  IRODORI_DASAR2_DATA.map(it => it.id)
);

export function getIrodoriDasar2PoolIndices(
  chapterFilter: IrodoriChapterFilter,
  dataset: readonly KanjiEntry[] = IRODORI_DASAR2_DATA
): number[] {
  return getIrodoriPoolIndicesForDataset(chapterFilter, dataset);
}
