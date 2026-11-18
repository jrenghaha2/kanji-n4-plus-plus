import type { IrodoriBookConfig, IrodoriBookId } from '../types/kanji';
import {
  IRODORI_DASAR2_QUIZ_HISTORY_KEY,
  IRODORI_PEMULA_QUIZ_HISTORY_KEY,
  IRODORI_QUIZ_HISTORY_KEY,
} from '../utils/quizStats';
import {
  IRODORI_DASAR2_HARD_KEY,
  IRODORI_DASAR2_LS_KEY,
  IRODORI_HARD_KEY,
  IRODORI_LS_KEY,
  IRODORI_PEMULA_HARD_KEY,
  IRODORI_PEMULA_LS_KEY,
} from '../utils/storage';
import {
  IRODORI_CHAPTERS,
  IRODORI_DATA,
  IRODORI_PDF_PATH,
  VALID_IRODORI_IDS,
} from './irodoriData';
import {
  IRODORI_DASAR2_CHAPTERS,
  IRODORI_DASAR2_DATA,
  IRODORI_DASAR2_PDF_PATH,
  VALID_IRODORI_DASAR2_IDS,
} from './irodoriDasar2Data';
import {
  IRODORI_PEMULA_CHAPTERS,
  IRODORI_PEMULA_DATA,
  IRODORI_PEMULA_PDF_PATH,
  VALID_IRODORI_PEMULA_IDS,
} from './irodoriPemulaData';

export const IRODORI_BOOK_ORDER: readonly IrodoriBookId[] = [
  'pemula',
  'dasar1',
  'dasar2',
] as const;

export const IRODORI_BOOKS: Record<IrodoriBookId, IrodoriBookConfig> = {
  pemula: {
    id: 'pemula',
    order: 1,
    label: 'Irodori Pemula',
    shortLabel: 'Pemula',
    jpTitle: 'いろどり 入門',
    cefrLevel: 'A1',
    idPrefix: 'irp',
    lsKey: IRODORI_PEMULA_LS_KEY,
    hardKey: IRODORI_PEMULA_HARD_KEY,
    quizHistoryKey: IRODORI_PEMULA_QUIZ_HISTORY_KEY,
    pdfPath: IRODORI_PEMULA_PDF_PATH,
    chapters: IRODORI_PEMULA_CHAPTERS,
    data: IRODORI_PEMULA_DATA,
    validIds: VALID_IRODORI_PEMULA_IDS,
  },
  dasar1: {
    id: 'dasar1',
    order: 2,
    label: 'Irodori Dasar 1',
    shortLabel: 'Dasar 1',
    jpTitle: 'いろどり 初級1',
    cefrLevel: 'A2',
    idPrefix: 'ir',
    lsKey: IRODORI_LS_KEY,
    hardKey: IRODORI_HARD_KEY,
    quizHistoryKey: IRODORI_QUIZ_HISTORY_KEY,
    pdfPath: IRODORI_PDF_PATH,
    chapters: IRODORI_CHAPTERS,
    data: IRODORI_DATA,
    validIds: VALID_IRODORI_IDS,
  },
  dasar2: {
    id: 'dasar2',
    order: 3,
    label: 'Irodori Dasar 2',
    shortLabel: 'Dasar 2',
    jpTitle: 'いろどり 初級2',
    cefrLevel: 'A2',
    idPrefix: 'ir2_',
    lsKey: IRODORI_DASAR2_LS_KEY,
    hardKey: IRODORI_DASAR2_HARD_KEY,
    quizHistoryKey: IRODORI_DASAR2_QUIZ_HISTORY_KEY,
    pdfPath: IRODORI_DASAR2_PDF_PATH,
    chapters: IRODORI_DASAR2_CHAPTERS,
    data: IRODORI_DASAR2_DATA,
    validIds: VALID_IRODORI_DASAR2_IDS,
  },
};

export function getIrodoriBook(bookId: IrodoriBookId): IrodoriBookConfig {
  return IRODORI_BOOKS[bookId];
}

export function isIrodoriBookPopulated(bookId: IrodoriBookId): boolean {
  return IRODORI_BOOKS[bookId].data.length > 0;
}

export function getAvailableIrodoriBooks(): IrodoriBookConfig[] {
  return IRODORI_BOOK_ORDER.map(id => IRODORI_BOOKS[id]).filter(
    book => book.data.length > 0
  );
}
