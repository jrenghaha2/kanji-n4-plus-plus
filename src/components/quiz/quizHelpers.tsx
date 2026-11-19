import type { AppDatasetMode, QuizTypeChoice } from '../../types/kanji';
import { QTYPES, splitFuriganaParts } from '../../utils/quizEngine';

export const PRESET_COUNTS = [10, 20, 50, 100, 500] as const;

export const QUIZ_TYPE_OPTIONS: {
  key: QuizTypeChoice;
  short: string;
  label: string;
  fullWidth?: boolean;
}[] = [
  { key: 'random', short: 'Acak 4', label: 'Acak (4 Model Utama)' },
  { key: 'random5', short: 'Acak 5', label: 'Acak Semua (+Kalimat)' },
  { key: 'k2r', short: '漢→あ', label: 'Kanji → Hiragana' },
  { key: 'k2m', short: '漢→ID', label: 'Kanji → Arti' },
  { key: 'm2k', short: 'ID→漢', label: 'Arti → Kanji' },
  { key: 'r2k', short: 'あ→漢', label: 'Hiragana → Kanji' },
  {
    key: 'ex2k',
    short: '📖→漢',
    label: 'Contoh Kalimat → Kanji (Sesuai Konjugasi)',
    fullWidth: true,
  },
];

export const MODE_SHORT_LABEL: Record<QuizTypeChoice, string> = {
  random: 'Acak 4',
  random5: 'Acak 5',
  k2r: '漢→あ',
  k2m: '漢→ID',
  m2k: 'ID→漢',
  r2k: 'あ→漢',
  ex2k: '📖→漢',
};

export function getQuizModelLabel(
  typeKey: keyof typeof QTYPES,
  datasetMode: AppDatasetMode
): string {
  if (datasetMode === 'irodori') {
    if (typeKey === 'k2m') return 'Kosakata → Arti';
    if (typeKey === 'm2k') return 'Arti → Kosakata';
    if (typeKey === 'ex2k') return 'Kalimat → Kosakata';
  }
  return QTYPES[typeKey].label;
}

const QUIZ_FURIGANA_STORAGE_KEY = 'n4kanji_quiz_furigana_v1';

export function loadFuriganaPreference(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(QUIZ_FURIGANA_STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function saveFuriganaPreference(enabled: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(QUIZ_FURIGANA_STORAGE_KEY, enabled ? '1' : '0');
    }
  } catch {
    // Non-fatal if storage is blocked
  }
}

export function renderRubyText(surface: string, reading: string, rtClassName: string) {
  const parts = splitFuriganaParts(surface, reading);
  if (!parts) return surface;
  return (
    <>
      {parts.prefix}
      <ruby>
        {parts.base}
        <rt className={rtClassName}>{parts.ruby}</rt>
      </ruby>
      {parts.suffix}
    </>
  );
}

export function formatQuizTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
