import { JFT_KANJI_WHITELIST, UNICODE_KANJI_RE } from '../data/jftKanjiWhitelist';
import type { IrodoriKanjiScope, KanjiEntry } from '../types/kanji';

export const IRODORI_KANJI_SCOPE_ORDER: readonly IrodoriKanjiScope[] = [
  'all',
  'jft',
  'advanced',
];

export const IRODORI_KANJI_SCOPE_META: Record<
  IrodoriKanjiScope,
  { label: string; shortLabel: string; description: string }
> = {
  all: {
    label: 'Semua',
    shortLabel: 'Semua',
    description: 'Menampilkan seluruh kosakata Irodori (Fokus N4/JFT + Kanji Lanjutan).',
  },
  jft: {
    label: 'Fokus N4/JFT',
    shortLabel: 'Fokus N4/JFT',
    description:
      'Kosakata tanpa Kanji atau yang seluruh Kanjinya termasuk dalam daftar acuan N5/N4/JFT.',
  },
  advanced: {
    label: 'Kanji Lanjutan',
    shortLabel: 'Kanji Lanjutan',
    description: 'Kosakata Irodori yang memuat minimal satu Kanji di luar daftar acuan N4/JFT.',
  },
};

/**
 * Extracts unique Unicode Kanji characters from a Japanese string while
 * ignoring hiragana, katakana, iteration marks (々), romaji, and punctuation.
 */
export function extractUniqueKanji(text: string): string[] {
  const matches = text.match(UNICODE_KANJI_RE);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

/**
 * Returns unique Kanji characters in the entry that fall outside the
 * N5/N4/JFT whitelist.
 */
export function getOutsideWhitelistKanji(
  entryOrText: Pick<KanjiEntry, 'k'> | string
): string[] {
  const text = typeof entryOrText === 'string' ? entryOrText : entryOrText.k;
  return extractUniqueKanji(text).filter(ch => !JFT_KANJI_WHITELIST.has(ch));
}

/**
 * Classifies an Irodori vocabulary item into:
 * - `'jft'` (Fokus N4/JFT): kana-only OR every Kanji is inside `JFT_KANJI_WHITELIST`
 * - `'advanced'` (Kanji Lanjutan): contains >= 1 Kanji outside `JFT_KANJI_WHITELIST`
 */
export function classifyIrodoriKanji(
  entryOrText: Pick<KanjiEntry, 'k'> | string
): 'jft' | 'advanced' {
  return getOutsideWhitelistKanji(entryOrText).length > 0 ? 'advanced' : 'jft';
}

export function isAdvancedKanjiEntry(
  entryOrText: Pick<KanjiEntry, 'k'> | string
): boolean {
  return classifyIrodoriKanji(entryOrText) === 'advanced';
}

export function matchesIrodoriKanjiScope(
  entry: Pick<KanjiEntry, 'k'>,
  scope: IrodoriKanjiScope
): boolean {
  if (scope === 'all') return true;
  const classification = classifyIrodoriKanji(entry);
  return classification === scope;
}

export function countIrodoriKanjiScopes(
  entries: readonly Pick<KanjiEntry, 'k'>[]
): Record<IrodoriKanjiScope, number> {
  let jft = 0;
  let advanced = 0;

  for (const entry of entries) {
    if (isAdvancedKanjiEntry(entry)) {
      advanced++;
    } else {
      jft++;
    }
  }

  return {
    all: entries.length,
    jft,
    advanced,
  };
}
