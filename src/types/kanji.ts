export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type LevelFilter = 'all' | DifficultyLevel;
export type AppTab = 'card' | 'list' | 'quiz';
export type AppDatasetMode = 'n4' | 'irodori';

export type IrodoriChapterNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18;

export type IrodoriBookId = 'pemula' | 'dasar1' | 'dasar2';

export type IrodoriChapterFilter = 'all' | IrodoriChapterNumber;

export interface IrodoriChapterMeta {
  chapter: IrodoriChapterNumber;
  label: string;
  shortLabel: string;
  jpTitle: string;
  idTitle: string;
  topicJp: string;
  topicId: string;
  dotColor: string;
}

export type RawIrodoriTuple = [
  IrodoriChapterNumber,
  string, // k (Kotoba / Kanji)
  string, // r (Hiragana / Katakana reading)
  string, // accent (Pitch accent)
  string, // m (Arti Bahasa Indonesia)
  string, // subSection (Bagian dalam bab)
  string, // ex (Contoh kalimat Jepang)
  string, // exi (Terjemahan contoh kalimat)
];

export interface IrodoriBookConfig {
  id: IrodoriBookId;
  order: number;
  label: string;
  shortLabel: string;
  jpTitle: string;
  cefrLevel: string;
  idPrefix: string;
  lsKey: string;
  hardKey: string;
  quizHistoryKey: string;
  pdfPath: string;
  chapters: Record<IrodoriChapterNumber, IrodoriChapterMeta>;
  data: KanjiEntry[];
  validIds: Set<string>;
}

export interface CleanIrodoriJsonItem {
  bab: string;
  kosakata: string;
  romaji: string;
  arti: string;
  kanji: string[];
  r?: string;
  accent?: string;
  subSection?: string;
  ex?: string;
  exi?: string;
}

export interface KanjiEntry {
  id: string;
  k: string;
  r: string;
  m: string;
  ex: string;
  exi: string;
  lv: 'N4';
  dif: DifficultyLevel;
  chapter?: IrodoriChapterNumber;
  accent?: string;
  subSection?: string;
  romaji?: string;
  kanjiList?: string[];
}

export type WordPos = 'ichidan' | 'godan' | 'iadj' | 'noun';
export type WordSubPos = 'verb' | 'iadj' | 'naadj' | 'suru' | 'noun';

export interface WordMeta {
  pos: WordPos;
  subPos: WordSubPos;
}

export type ConjugationForm =
  | 'dict'
  | 'masu_stem'
  | 'masu'
  | 'mashita'
  | 'masen'
  | 'mashou'
  | 'te'
  | 'nai'
  | 'passive_mashita'
  | 'potential_masen'
  | 'potential_masu'
  | 'i_dict'
  | 'i_ku'
  | 'i_katta';

export type BlankContextKind =
  | 'verb_conjugated'
  | 'iadj_conjugated'
  | 'naadj_modifier'
  | 'suru_verb'
  | 'noun_general';

export interface SentenceBlank {
  maskedEx: string;
  targetSurface: string;
  form: ConjugationForm;
  subPos: WordSubPos;
  blankContext: BlankContextKind;
}

export type QuizModelKey = 'k2r' | 'k2m' | 'm2k' | 'r2k' | 'ex2k';
export type QuizTypeChoice = 'random' | 'random5' | QuizModelKey;

export interface QuizOption {
  item: KanjiEntry;
  label: string;
}

export interface QuizQuestion {
  item: KanjiEntry;
  type: QuizModelKey;
  exMeta: SentenceBlank | null;
  options: QuizOption[];
}

export interface QuizRecord {
  no: number;
  item: KanjiEntry;
  type: QuizModelKey;
  exMeta: SentenceBlank | null;
  chosen: KanjiEntry;
  chosenLabel: string;
}

export interface BackupParseResult {
  formatType: 'v1' | 'legacy-storage' | 'legacy-plain';
  exportedAt: string;
  impMastered: string[];
  impHard: string[];
  rejectedIds: string[];
  isEmptyBackup: boolean;
}

export interface StorageMutationResult {
  ok: boolean;
  error?: string;
}

export interface ToastMessage {
  id: number;
  tone: 'success' | 'error' | 'warning' | 'info';
  title: string;
  detail?: string;
}

export interface QuizSessionHistoryEntry {
  id: string;
  completedAt: string;
  level: LevelFilter;
  scopeLabel?: string;
  mode: QuizTypeChoice;
  correct: number;
  total: number;
  score: number;
}
