export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type LevelFilter = 'all' | DifficultyLevel;
export type AppTab = 'card' | 'list' | 'quiz';

export interface KanjiEntry {
  id: string;
  k: string;
  r: string;
  m: string;
  ex: string;
  exi: string;
  lv: 'N4';
  dif: DifficultyLevel;
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
