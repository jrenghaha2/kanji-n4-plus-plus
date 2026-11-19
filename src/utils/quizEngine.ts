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

export const HAS_KANJI_RE = /[一-龯々ヶヵ]/;
const SENTENCE_PUNCT_RE = /[、。？！?!]/;
const KATAKANA_RE = /[ァ-ヴー]/;

export interface FuriganaParts {
  prefix: string;
  base: string;
  ruby: string;
  suffix: string;
}

/**
 * Splits a Japanese surface term and its hiragana reading into shared leading/trailing
 * kana (`prefix`/`suffix`) plus the kanji-containing core (`base`) and its aligned reading (`ruby`).
 * Returns `null` when the surface has no Kanji or matches its reading verbatim.
 */
export function splitFuriganaParts(surface: string, reading: string): FuriganaParts | null {
  const s = surface.trim();
  const r = reading.trim();
  if (!s || !r || s === r || !HAS_KANJI_RE.test(s)) return null;

  let prefixLen = 0;
  while (
    prefixLen < s.length &&
    prefixLen < r.length &&
    s[prefixLen] === r[prefixLen] &&
    !HAS_KANJI_RE.test(s[prefixLen])
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < s.length - prefixLen &&
    suffixLen < r.length - prefixLen &&
    s[s.length - 1 - suffixLen] === r[r.length - 1 - suffixLen] &&
    !HAS_KANJI_RE.test(s[s.length - 1 - suffixLen])
  ) {
    suffixLen++;
  }

  const base = s.slice(prefixLen, s.length - suffixLen);
  const ruby = r.slice(prefixLen, r.length - suffixLen);
  if (!base || !ruby || !HAS_KANJI_RE.test(base)) {
    return { prefix: '', base: s, ruby: r, suffix: '' };
  }

  return {
    prefix: s.slice(0, prefixLen),
    base,
    ruby,
    suffix: suffixLen > 0 ? s.slice(s.length - suffixLen) : '',
  };
}

/**
 * Determines whether a vocabulary entry is appropriate for a specific quiz model.
 * - `k2r` (Kanji → Hiragana) and `r2k` (Hiragana → Kanji) require at least one Kanji,
 *   a reading distinct from the surface form, no sentence punctuation, and a non-outlier
 *   reading length (<= 13) so kana-only words and full announcements never produce
 *   pointless hiragana→hiragana or obvious length-giveaway questions.
 * - `k2m`, `m2k`, and `ex2k` remain available for all entries (including kana-only words
 *   and polite expressions).
 */
export function isEntryEligibleForQuizModel(item: KanjiEntry, typeKey: QuizModelKey): boolean {
  if (typeKey === 'k2r' || typeKey === 'r2k') {
    if (!HAS_KANJI_RE.test(item.k)) return false;
    if (SENTENCE_PUNCT_RE.test(item.k)) return false;
    if (item.r.length > 13) return false;
    const normK = normalizeTermText(item.k);
    const normR = normalizeTermText(item.r);
    if (!normK || !normR || normK === normR) return false;
  }
  return true;
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
    const item = dataset[kanjiIdx];
    for (const typeKey of keys) {
      if (isEntryEligibleForQuizModel(item, typeKey)) {
        bank.push({ kanjiIdx, typeKey });
      }
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
 * Curated Indonesian synonym / near-synonym equivalence classes audited across
 * JLPT N4 and JF Irodori (Pemula, Dasar 1, Dasar 2).
 *
 * Any two vocabulary items whose normalized glosses map to the same concept ID
 * are prevented from competing as options in the same `k2m`, `m2k`, or `ex2k`
 * question (e.g. `だいたい: biasanya; kira-kira` vs `たいてい: umumnya; kebanyakan`,
 * or `～ごろ: sekitar ～` vs `～ぐらい: sekitar ～; kurang lebih ～`).
 *
 * Distinct antonyms and contrasting categories (e.g. `enak` vs `tidak enak`,
 * `selamat pagi` vs `selamat malam`, `musim panas` vs `musim dingin`) are kept
 * strictly separate.
 */
export const MEANING_SYNONYM_GROUPS: Readonly<Record<string, readonly string[]>> = {
  approx_usual: [
    'biasa',
    'biasanya',
    'seperti biasanya',
    'reguler',
    'umum',
    'umumnya',
    'pada umumnya',
    'kebanyakan',
    'lazimnya',
    'rata-rata',
    'sebagian besar',
    'hampir semua',
  ],
  approx_about: [
    'kira-kira',
    'sekitar',
    'kurang lebih',
    'hampir',
    'sudah hampir',
    'mendekati',
  ],
  near_here: ['sekitar sini', 'dekat sini', 'di dekat sini', 'dekat', 'di sebelah'],
  freq_often: ['sering', 'kerap', 'acap kali'],
  freq_sometimes: ['kadang', 'kadang-kadang', 'terkadang', 'sesekali'],
  freq_always: [
    'selalu',
    'senantiasa',
    'selamanya',
    'terus-menerus',
    'terus menerus',
    'sepanjang waktu',
    'tanpa henti',
  ],
  freq_rarely: ['jarang', 'langka', 'jarang ada'],
  time_soon: [
    'segera',
    'lekas',
    'sebentar lagi',
    'langsung',
    'secara langsung',
    'langsung dekat',
  ],
  time_now: [
    'sekarang',
    'saat ini',
    'untuk saat ini',
    'sementara ini',
    'kini',
    'sampai saat ini',
    'sejauh ini',
  ],
  time_later: [
    'nanti',
    'setelah ini',
    'setelah itu',
    'setelahnya',
    'kemudian',
    'lalu',
    'dan kemudian',
    'kelak',
    'suatu hari nanti',
  ],
  time_first: ['mula-mula', 'pertama-tama', 'awalnya', 'aslinya', 'pertama', 'paling awal'],
  time_while: ['sebentar', 'untuk sementara', 'sejenak', 'sesaat'],
  time_just_now: ['tadi', 'baru saja'],
  time_suddenly: ['tiba-tiba', 'mendadak'],
  time_finally: ['akhirnya', 'pada akhirnya'],
  time_anytime: ['kapan pun', 'kapan saja'],
  time_next: ['lain kali', 'kali berikutnya', 'kedatangan berikutnya'],
  deg_very: [
    'sangat',
    'banget',
    'amat',
    'sekali',
    'benar-benar',
    'sungguh',
    'sungguh-sungguh',
    'sepenuhnya',
    'sampai tuntas',
  ],
  deg_moderate: ['cukup', 'lumayan', 'agak'],
  deg_many: ['banyak', 'melimpah'],
  deg_various: ['bermacam-macam', 'berbagai', 'berbagai macam', 'aneka'],
  deg_only: ['hanya', 'cuma', 'saja'],
  deg_all: ['semua', 'seluruh', 'seluruhnya', 'segalanya'],
  deg_all_people: ['semua orang', 'semuanya'],
  deg_gradual: ['sedikit demi sedikit', 'pelan-pelan', 'perlahan', 'lambat'],
  qual_great: [
    'bagus',
    'baik',
    'sangat bagus',
    'luar biasa',
    'menakjubkan',
    'mengagumkan',
    'hebat',
    'terbaik',
    'paling tinggi',
    'bagus ya',
    'itu mengagumkan',
    'hebat sekali ya',
  ],
  qual_beautiful: ['indah', 'cantik', 'elok', 'bagus indah kan'],
  qual_stylish: ['modis', 'bergaya', 'stylish', 'keren'],
  qual_not_great: ['tidak begitu bagus', 'kurang oke', 'tidak cukup bagus'],
  qual_delicious: ['enak', 'lezat', 'nikmat', 'rasanya enak'],
  qual_bad_taste: ['tidak enak', 'tidak lezat'],
  qual_skilled: ['mahir', 'pandai', 'pintar', 'terampil'],
  qual_unskilled: ['tidak pandai', 'tidak mahir', 'kurang mahir', 'payah'],
  qual_hard: [
    'sulit',
    'susah',
    'sukar',
    'rumit',
    'kompleks',
    'menyusahkan',
    'merepotkan',
    'kesulitan',
    'repot',
  ],
  qual_easy: ['mudah', 'dengan mudah', 'gampang', 'sederhana', 'simpel'],
  qual_severe: ['parah', 'keterlaluan'],
  qual_special: ['spesial', 'khusus', 'istimewa'],
  qual_important: ['penting', 'berharga', 'utama', 'hal-hal penting'],
  qual_noisy: ['berisik', 'bising'],
  qual_crowded: ['ramai', 'penuh', 'penuh sesak'],
  qual_calm: ['tenang', 'sepi', 'sunyi', 'lega', 'santai', 'bersantai', 'dengan santai'],
  qual_dirty: ['kotor', 'berantakan', 'menjadi kotor'],
  qual_clean: ['bersih', 'rapi', 'bersih-bersih'],
  qual_durable: ['tahan lama', 'awet', 'tahan'],
  qual_soft: ['empuk', 'lunak', 'lembut'],
  qual_tired: ['lelah', 'capek', 'letih', 'lemas', 'terlalu letih dan lesu', 'kelelahan', 'rasa lemas'],
  qual_happy: ['senang', 'gembira', 'bergembira', 'bahagia', 'ceria', 'menyenangkan'],
  qual_sad: ['sedih', 'murung', 'kesepian'],
  qual_scary: ['takut', 'seram', 'menyeramkan', 'menakutkan'],
  qual_surprised: ['kaget', 'terkejut'],
  qual_kind: ['ramah', 'baik hati'],
  qual_strict: ['tegas', 'ketat'],
  qual_diligent: ['rajin', 'serius', 'tekun', 'antusias', 'bekerja keras', 'berusaha'],
  qual_cute: ['lucu', 'imut', 'manis'],
  qual_boring: ['bosan', 'membosankan'],
  qual_warm: ['hangat', 'suam kuku'],
  qual_sunny: ['cerah', 'menjadi cerah', 'cuacanya cerah', 'cuacanya baik'],
  qual_cloudy: ['berawan', 'mendung'],
  qual_cheap: ['murah', 'terjangkau', 'masuk akal'],
  qual_big: ['besar', 'luas'],
  qual_small: ['kecil', 'sempit', 'mungil'],
  qual_hard_solid: ['keras', 'kaku'],
  qual_wrong: ['salah', 'keliru', 'kesalahan', 'berbuat salah', 'gagal', 'kegagalan'],
  qual_right: ['benar', 'betul', 'tepat', 'pas', 'dengan benar', 'sebagaimana mestinya'],
  qual_different: ['berbeda', 'lain', 'lainnya', 'yang lain', 'tidak sama'],
  qual_same: ['sama', 'serupa', 'mirip'],
  qual_dangerous: ['bahaya', 'berbahaya'],
  qual_wasteful: ['mubazir', 'sayang sekali', 'mengecewakan'],
  qual_sick: ['kurang fit', 'tidak enak badan', 'merasa sakit', 'sakit', 'nyeri'],
  qual_detailed: ['rinci', 'mendetail', 'paham betul', 'detail', 'rincian'],
  qual_strange: ['aneh', 'ganjil', 'mengherankan'],
  qual_dislike: ['benci', 'tidak suka', 'tidak menyukai'],
  qual_useful: ['berguna', 'bermanfaat'],
  qual_wireless: ['wireless', 'nirkabel', 'tanpa kabel', 'cordless'],
  qual_fast: ['cepat', 'lebih awal', 'lekas'],
  qual_condition: ['kondisi', 'keadaan'],
  mod_maybe: ['mungkin', 'barangkali', 'tampaknya', 'sepertinya', 'kelihatannya'],
  mod_sure: ['pasti', 'mutlak', 'tentu', 'tentu saja', 'pastikan', 'jangan sampai tidak'],
  mod_moreover: ['selain itu', 'apalagi', 'tambahan lagi'],
  mod_therefore: ['karena itu', 'karena itulah', 'oleh karena itu', 'maka', 'jadi'],
  mod_if_so: ['kalau begitu', 'jika demikian'],
  mod_if_possible: [
    'kalau memungkinkan',
    'bila memungkinkan',
    'kalau bisa',
    'sedapat mungkin',
    'jika berkenan',
    'jika anda ingin',
    'kalau mau',
  ],
  mod_ok: ['tidak apa-apa', 'tidak masalah', 'oke', 'boleh'],
  mod_not_ok: ['tidak bisa', 'tidak boleh', 'tidak dapat'],
  mod_agree: ['ya', 'ya benar', 'benar juga', 'iya ya', 'saya setuju'],
  mod_isee: ['oh begitu', 'gitu ya'],
  mod_understand: ['mengerti', 'paham', 'saya mengerti', 'baik saya mengerti'],
  mod_dont_know: ['saya belum tahu', 'saya kurang tahu'],
  mod_hesitate: ['apa ya', 'hmm', 'hmm apa ya', 'hmmm'],
  mod_sorry: [
    'maaf',
    'permisi',
    'sori',
    'saya mohon maaf',
    'mohon maaf',
    'maaf bisa minta waktunya sebentar',
    'bisa minta waktu sebentar',
  ],
  mod_thanks: ['terima kasih', 'terima kasih banyak', 'makasih', 'terima kasih untuk hidangannya'],
  mod_welcome: ['selamat datang', 'silakan masuk'],
  mod_no_thanks: ['tidak terima kasih', 'tidak usah'],
  mod_why: ['mengapa', 'kenapa'],
  mod_how: ['bagaimana', 'seperti apa', 'bagaimana caranya'],
  mod_which: ['yang mana', 'yang mana pun'],
  mod_about: ['tentang', 'mengenai'],
  mod_simultaneous: ['sekalian', 'sekaligus'],
  mod_together: ['bersama-sama', 'bersama'],
  mod_pronoun_i: ['aku', 'saya'],
  mod_here: ['di sini', 'sini', 'yang ini'],
  mod_there_near: ['di situ', 'situ'],
  mod_there_far: ['di sana', 'sana'],
  mod_for_that: ['untuk itu', 'untuk mencapai itu'],
  mod_anyway: ['pokoknya', 'bagaimanapun juga'],
  mod_and_formal: ['dan', 'serta'],
  v_use_wear: ['memakai', 'menggunakan', 'mengenakan', 'memanfaatkan', 'penggunaan', 'pemakaian'],
  v_help: ['membantu', 'menolong', 'tolong bantu'],
  v_start: ['mulai', 'memulai', 'berawal', 'dimulai'],
  v_finish: ['selesai', 'berakhir', 'rampung', 'tamat', 'tuntas'],
  v_stop: ['berhenti', 'reda', 'menghentikan', 'membatalkan', 'batal', 'dibatalkan', 'pembatalan'],
  v_postpone: ['menunda', 'menangguhkan', 'ditunda', 'diundur'],
  v_prepare: ['mempersiapkan', 'menyiapkan', 'persiapan'],
  v_drive: ['berkendara', 'mengemudi'],
  v_run: ['lari', 'berlari'],
  v_tidy: ['membereskan', 'merapikan', 'tolong rapikan'],
  v_announce: ['pengumuman', 'pemberitahuan', 'notifikasi'],
  v_receive: ['menerima', 'mendapat', 'mendapatkan'],
  v_give: ['memberi', 'memberikan'],
  v_bring: ['membawa', 'membawakan', 'memindahkan', 'mengangkut'],
  v_put: ['menaruh', 'meletakkan', 'menyimpan', 'menitipkan', 'tolong letakkan'],
  v_check: ['memeriksa', 'mengecek', 'memastikan', 'pengecekan', 'konfirmasi'],
  v_search: ['mencari', 'mencari tahu', 'sedang mencari', 'pencarian'],
  v_inform: ['menginformasikan', 'memberi tahu', 'memberitahu', 'mengajarkan', 'mengajar'],
  v_speak: [
    'berbicara',
    'bercakap-cakap',
    'berbincang',
    'bincang-bincang',
    'obrolan',
    'mengobrol',
    'bercerita',
    'mengatakan',
    'mengucapkan',
    'menyapa',
    'berbicara kepada',
  ],
  v_think: ['berpikir', 'mengira'],
  v_look: ['melihat', 'memandang', 'menonton', 'menatap', 'melihat ke sekeliling'],
  v_buy: ['membeli', 'berbelanja'],
  v_meet: ['bertemu', 'berjumpa', 'janjian bertemu'],
  v_rest: ['istirahat', 'rehat', 'istirahat sejenak', 'libur', 'liburan', 'cuti'],
  v_fix: ['memperbaiki', 'membetulkan', 'perbaikan', 'servis'],
  v_remember: ['mengingat', 'menghafal', 'hafal'],
  v_arrive: ['sampai', 'tiba'],
  v_deliver: ['mengantarkan', 'menyampaikan', 'mengirim', 'mengirimkan', 'pengiriman'],
  v_make: ['membuat', 'menciptakan', 'memproduksi'],
  v_take: ['mengambil', 'menarik', 'tolong ambilkan'],
  v_recommend: ['rekomendasi', 'direkomendasikan', 'merekomendasikan'],
  v_cooperate: ['kerja sama', 'bekerja sama'],
  v_interact: ['interaksi', 'berinteraksi', 'komunikasi timbal balik'],
  v_treat: ['menjamu', 'mentraktir'],
  v_named: ['disebut', 'dinamakan'],
  v_sprain: ['keseleo', 'terkilir'],
  v_bump: ['terantuk', 'terbentur', 'menabrak'],
  v_succeed: ['berjalan lancar', 'sukses', 'kesuksesan'],
  v_gather: ['mengumpulkan', 'merangkum'],
  v_crush: ['mengempiskan', 'menghancurkan'],
  v_tilt: ['miring', 'melengkung'],
  n_portion: ['porsi', 'jumlah'],
  n_injury: ['luka', 'cedera'],
  n_clothes: ['pakaian', 'baju'],
  n_face: ['wajah', 'muka'],
  n_doc: ['dokumen', 'berkas'],
  n_tool: ['alat', 'perkakas'],
  n_greeting: ['salam', 'sapaan', 'sambutan'],
  n_guest: ['tamu', 'pengunjung'],
  n_bandage: ['plester', 'perban luka'],
  n_joke: ['candaan', 'gurauan'],
  n_lie: ['bohong', 'dusta'],
  n_thunder: ['petir', 'guntur'],
  n_seed: ['biji', 'benih'],
  n_branch: ['ranting', 'dahan pohon'],
  n_wall: ['dinding', 'tembok'],
  n_temp: ['suhu', 'temperatur'],
  n_order: ['giliran', 'urutan'],
  n_smell: ['bau', 'aroma'],
  n_receipt: ['kuitansi', 'tanda terima'],
  n_fridge: ['kulkas', 'lemari es', 'lemari pendingin'],
  n_boat: ['kapal', 'perahu'],
  n_crossroads: ['perempatan', 'persimpangan'],
  n_rule: ['peraturan', 'hukum'],
  n_contact: ['kabar', 'kontak'],
  n_body: ['badan', 'tubuh'],
  n_souvenir: ['oleh-oleh', 'cendera mata'],
  n_registration: ['pendaftaran', 'registrasi'],
  n_group: ['grup', 'kelompok'],
  n_tourist: ['turis', 'wisatawan'],
};

const GLOSS_TO_CONCEPTS = new Map<string, string[]>();
for (const [conceptId, phrases] of Object.entries(MEANING_SYNONYM_GROUPS)) {
  for (const phrase of phrases) {
    const key = phrase.replace(/\s+/g, ' ').trim().toLowerCase();
    let list = GLOSS_TO_CONCEPTS.get(key);
    if (!list) {
      list = [];
      GLOSS_TO_CONCEPTS.set(key, list);
    }
    list.push(conceptId);
  }
}

const BENIGN_GLOSS_PREFIX_RE = /^(?:pada|seperti|secara|dengan|sudah|sedang|untuk|sangat|agak)\s+/;

/**
 * Maps a meaning string to its semantic concept tags (via exact glosses and
 * benign adverbial prefix stripping, never stripping negation markers).
 */
export function extractMeaningConceptTags(meaning: string): Set<string> {
  const glosses = extractMeaningGlosses(meaning);
  const concepts = new Set<string>();

  for (const gloss of glosses) {
    const direct = GLOSS_TO_CONCEPTS.get(gloss);
    if (direct) {
      for (const c of direct) concepts.add(c);
    }
    const stripped = gloss.replace(BENIGN_GLOSS_PREFIX_RE, '').trim();
    if (stripped && stripped !== gloss) {
      const fromStripped = GLOSS_TO_CONCEPTS.get(stripped);
      if (fromStripped) {
        for (const c of fromStripped) concepts.add(c);
      }
    }
  }

  return concepts;
}

/**
 * Returns true if two Indonesian meanings share any normalized gloss, full meaning,
 * or Indonesian synonym concept group — preventing ambiguous/synonymous options
 * from appearing in the same multiple-choice question.
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

  const conceptsA = extractMeaningConceptTags(a);
  if (conceptsA.size > 0) {
    const conceptsB = extractMeaningConceptTags(b);
    for (const c of conceptsA) {
      if (conceptsB.has(c)) return true;
    }
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

type ScriptClass = 'kanji' | 'katakana' | 'hiragana';

function classifyScript(text: string): ScriptClass {
  if (HAS_KANJI_RE.test(text)) return 'kanji';
  if (KATAKANA_RE.test(text)) return 'katakana';
  return 'hiragana';
}

function isLengthPlausible(targetLabel: string, candLabel: string, key: QuizModelKey): boolean {
  const tLen = targetLabel.length;
  const cLen = candLabel.length;
  const diff = Math.abs(tLen - cLen);
  const minLen = Math.max(1, Math.min(tLen, cLen));
  const maxLen = Math.max(tLen, cLen);
  const ratio = maxLen / minLen;

  if (key === 'k2m') {
    if (diff <= 6) return true;
    if (tLen >= 28) {
      return cLen >= Math.floor(tLen * 0.5) && ratio <= 2.2;
    }
    return ratio <= 1.65 && diff <= 12;
  }

  // Japanese option labels (k2r, r2k, m2k, ex2k)
  if (diff <= 2) return true;
  if (tLen >= 10) {
    return cLen >= Math.max(7, Math.floor(tLen * 0.62)) && ratio <= 1.65;
  }
  return ratio <= 1.45 && diff <= 3;
}

function sharedEndingBonus(a: string, b: string): number {
  const endings = [
    '(ください)',
    'ください',
    'でしょうか',
    'ませんか',
    'ですか',
    'ました',
    '(でした)',
    'でした',
    'します',
    'ます',
    'する',
  ];
  for (const suffix of endings) {
    if (a.endsWith(suffix) && b.endsWith(suffix)) {
      return suffix.length >= 4 ? 4.5 : 2.5;
    }
  }
  return 0;
}

function formatParityScore(targetLabel: string, candLabel: string): number {
  let score = 0;
  const tHasQ = /[？?]/.test(targetLabel);
  const cHasQ = /[？?]/.test(candLabel);
  if (tHasQ && cHasQ) score += 5;
  else if (tHasQ !== cHasQ) score -= 4;

  const tHasParen = /[()（）]/.test(targetLabel);
  const cHasParen = /[()（）]/.test(candLabel);
  if (tHasParen && cHasParen) score += 4;
  else if (tHasParen !== cHasParen) score -= 3;

  const tHasTilde = /[～〜~]/.test(targetLabel);
  const cHasTilde = /[～〜~]/.test(candLabel);
  if (tHasTilde && cHasTilde) score += 3.5;
  else if (tHasTilde !== cHasTilde) score -= 2.5;

  const tHasExcl = /[！!]/.test(targetLabel);
  const cHasExcl = /[！!]/.test(candLabel);
  if (tHasExcl && cHasExcl) score += 3;
  else if (tHasExcl !== cHasExcl) score -= 2;

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
  concepts: Set<string>;
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
      concepts: extractMeaningConceptTags(e.m),
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
    concepts: extractMeaningConceptTags(item.m),
  };
}

function metaHasMeaningCollision(a: EntryCollisionMeta, b: EntryCollisionMeta): boolean {
  if (a.fullM === b.fullM) return true;
  for (const g of a.glosses) {
    if (b.glosses.has(g)) return true;
  }
  for (const c of a.concepts) {
    if (b.concepts.has(c)) return true;
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
  const targetScript = classifyScript(targetDisp);

  const isEligibleBase = (candidate: KanjiEntry): boolean => {
    if (candidate.id === item.id) return false;
    const candDisp = dispOf(candidate, key, exMeta);
    if (candDisp === targetDisp) return false;

    const candMeta = getEntryMeta(candidate, index);
    const candNormK = candMeta.normK;
    const candNormR = candMeta.normR;

    // Block homographs & homophones across ALL 5 models so two options never represent the same word/reading.
    if (candNormK && candNormK === targetNormK) return false;
    if (candNormR && candNormR === targetNormR) return false;

    // In r2k (Hiragana → Kanji), every distractor must also contain Kanji so kana-only options
    // never appear as instant visual giveaways.
    if (key === 'r2k' && (!HAS_KANJI_RE.test(candidate.k) || candNormK === candNormR)) {
      return false;
    }

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
    const candDisp = dispOf(it, key, exMeta);
    const lenDiff = Math.abs(targetDisp.length - candDisp.length);
    const minLen = Math.max(1, Math.min(targetDisp.length, candDisp.length));
    const maxLen = Math.max(targetDisp.length, candDisp.length);
    const lenRatio = maxLen / minLen;

    let s = isSameLevel ? 100 : 0;

    if (key === 'k2r') {
      const lengthScore =
        (lenDiff <= 1 ? 4.5 : lenDiff === 2 ? 2.0 : 0) -
        lenDiff * 2.4 -
        (lenRatio > 1.5 && lenDiff >= 3 ? 12 : 0);
      s +=
        lengthScore +
        formatParityScore(targetDisp, candDisp) +
        sharedEndingBonus(targetDisp, candDisp) +
        sharedKanji(item.k, it.k) * 2.2 +
        kanaSim(item.r, it.r) * 1.1;
    } else if (key === 'r2k') {
      const lengthScore =
        (lenDiff <= 1 ? 4.5 : lenDiff === 2 ? 2.0 : 0) -
        lenDiff * 2.4 -
        (lenRatio > 1.5 && lenDiff >= 3 ? 12 : 0);
      s +=
        lengthScore +
        formatParityScore(targetDisp, candDisp) +
        sharedEndingBonus(targetDisp, candDisp) +
        kanaSim(item.r, it.r) * 2.0 +
        sharedKanji(item.k, it.k) * 1.5;
    } else if (key === 'm2k') {
      const candScript = classifyScript(candDisp);
      const scriptScore = candScript === targetScript ? 4.0 : -4.0;
      const lengthScore =
        (lenDiff <= 1 ? 4.0 : lenDiff === 2 ? 1.8 : 0) -
        lenDiff * 2.2 -
        (lenRatio > 1.5 && lenDiff >= 3 ? 12 : 0);
      s +=
        lengthScore +
        scriptScore +
        formatParityScore(targetDisp, candDisp) +
        sharedEndingBonus(targetDisp, candDisp) +
        sharedKanji(item.k, it.k) * 1.5 +
        (it.dif === item.dif ? 0.5 : 0);
    } else if (key === 'ex2k' && exMeta) {
      const itMeta = getWordMeta(it);
      const exactSubPos = itMeta.subPos === exMeta.subPos;
      const compatible = isCompatibleForBlank(it, exMeta);
      const candScript = classifyScript(candDisp);
      const scriptScore = candScript === targetScript ? 3.5 : -3.5;
      const lengthScore =
        (lenDiff <= 1 ? 3.5 : lenDiff === 2 ? 1.5 : 0) -
        lenDiff * 2.0 -
        (lenRatio > 1.5 && lenDiff >= 3 ? 10 : 0);
      s +=
        (compatible ? 50 : -50) +
        (exactSubPos ? 12 : 0) +
        lengthScore +
        scriptScore +
        formatParityScore(targetDisp, candDisp) +
        sharedKanji(item.k, it.k) * 1.8 +
        kanaSim(item.r, it.r) +
        (it.dif === item.dif ? 0.5 : 0);
    } else {
      // k2m: strongly match meaning length & punctuation/parenthesis style so long explanations
      // or parenthesized notes never stand out as obvious giveaways.
      const lengthScore =
        (lenDiff <= 4 ? 4.5 : lenDiff <= 8 ? 2.0 : 0) -
        lenDiff * 0.65 -
        (lenRatio > 1.75 && lenDiff >= 7 ? 10 : 0);
      s +=
        lengthScore +
        formatParityScore(targetDisp, candDisp) +
        (it.dif === item.dif ? 0.5 : 0) +
        kanaSim(item.r, it.r) * 0.2;
    }
    return s + rng() * 0.6;
  };

  // Build tiered pools balancing scope isolation, grammatical compatibility, and length plausibility:
  // - In chapter-scoped quizzes (Irodori), borrowing plausible same-length distractors from other
  //   chapters of the same book beats showing 1 long phrase against 3 short words from a small chapter.
  // - In JLPT N4 difficulty-filtered quizzes (Easy/Medium/Hard), keep strict level isolation first
  //   (only crossing levels if an ex2k rare subPos lacks enough candidates, e.g. Hard na-adjectives).
  const isChapterScoped = chapterFilter !== undefined;
  const isPlausible = (it: KanjiEntry) => isLengthPlausible(targetDisp, dispOf(it, key, exMeta), key);

  const tiers: KanjiEntry[][] =
    key === 'ex2k' && exMeta
      ? isChapterScoped
        ? [
            sameLevelAll.filter(it => isCompatibleForBlank(it, exMeta) && isPlausible(it)),
            crossLevelAll.filter(it => isCompatibleForBlank(it, exMeta) && isPlausible(it)),
            sameLevelAll.filter(it => isCompatibleForBlank(it, exMeta)),
            crossLevelAll.filter(it => isCompatibleForBlank(it, exMeta)),
            sameLevelAll.filter(isPlausible),
            crossLevelAll.filter(isPlausible),
            sameLevelAll,
            crossLevelAll,
          ]
        : [
            sameLevelAll.filter(it => isCompatibleForBlank(it, exMeta)),
            crossLevelAll.filter(it => isCompatibleForBlank(it, exMeta)),
            sameLevelAll,
            crossLevelAll,
          ]
      : isChapterScoped
        ? [
            sameLevelAll.filter(isPlausible),
            crossLevelAll.filter(isPlausible),
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
