import type {
  DecodedLiveQuizOption,
  DecodedLiveQuizQuestion,
  LiveQuizQuestionSnapshot,
} from '../types/admin';
import type { QuizDatasetId, QuizModelKey } from '../types/kanji';
import { analyzeSentenceBlank } from './morphology';
import { ABC_LABELS, QTYPES, dispOf, resolvePromptHint } from './quizEngine';
import { getQuizDatasetEntries, getQuizDatasetMap } from './quizHistorySync';

// Volumetric & regex boundaries synchronized verbatim with firebase-blueprint.json & firestore.rules
export const QUIZ_CURRENT_TOKEN_MAX_LENGTH = 120;
export const QUIZ_LIVE_LOG_MAX_LENGTH = 15000;

const LIVE_ITEM_ID_RE_SRC = '(n|irp|ir|ir2_)[1-9][0-9]{0,3}';
const LIVE_CURRENT_BODY = `[1-9][0-9]{0,2}\\|(k2r|k2m|m2k|r2k|ex2k)\\|${LIVE_ITEM_ID_RE_SRC}\\|${LIVE_ITEM_ID_RE_SRC}(,${LIVE_ITEM_ID_RE_SRC}){0,3}\\|(-1|[0-3])`;
const LIVE_ANSWERED_BODY = `[1-9][0-9]{0,2}\\|(k2r|k2m|m2k|r2k|ex2k)\\|${LIVE_ITEM_ID_RE_SRC}\\|${LIVE_ITEM_ID_RE_SRC}(,${LIVE_ITEM_ID_RE_SRC}){0,3}\\|[0-3]`;

export const QUIZ_CURRENT_TOKEN_PATTERN = new RegExp(`^(|${LIVE_CURRENT_BODY})$`);
export const QUIZ_LIVE_LOG_PATTERN = new RegExp(
  `^(|${LIVE_ANSWERED_BODY}(;${LIVE_ANSWERED_BODY})*)$`
);

const VALID_QUIZ_MODEL_KEYS = new Set<QuizModelKey>(['k2r', 'k2m', 'm2k', 'r2k', 'ex2k']);

function isValidQuizModelKey(raw: string): raw is QuizModelKey {
  return VALID_QUIZ_MODEL_KEYS.has(raw as QuizModelKey);
}

/**
 * Encodes a single active quiz question snapshot into a compact pure-ASCII ID-reference token.
 * Returns `''` if the snapshot is null or fails strict blueprint validation.
 */
export function encodeLiveQuizToken(
  snapshot: LiveQuizQuestionSnapshot | null | undefined,
  datasetId: QuizDatasetId
): string {
  if (!snapshot) return '';
  if (!Number.isInteger(snapshot.no) || snapshot.no < 1 || snapshot.no > 500) return '';
  if (!isValidQuizModelKey(snapshot.type)) return '';
  if (
    !Number.isInteger(snapshot.chosenIdx) ||
    snapshot.chosenIdx < -1 ||
    snapshot.chosenIdx > 3
  ) {
    return '';
  }

  const byId = getQuizDatasetMap(datasetId);
  if (!byId.has(snapshot.itemId)) return '';

  const validOptions = snapshot.optionIds
    .filter(id => typeof id === 'string' && byId.has(id))
    .slice(0, 4);
  if (validOptions.length === 0) return '';

  const safeChosenIdx =
    snapshot.chosenIdx >= 0 && snapshot.chosenIdx < validOptions.length
      ? snapshot.chosenIdx
      : -1;

  const token = `${snapshot.no}|${snapshot.type}|${snapshot.itemId}|${validOptions.join(',')}|${safeChosenIdx}`;
  if (
    token.length > QUIZ_CURRENT_TOKEN_MAX_LENGTH ||
    !QUIZ_CURRENT_TOKEN_PATTERN.test(token)
  ) {
    return '';
  }
  return token;
}

/**
 * Encodes all answered questions of the current running/finished quiz session into a
 * semicolon-separated pure-ASCII string guaranteed to stay within `QUIZ_LIVE_LOG_MAX_LENGTH`.
 */
export function encodeLiveQuizLog(
  snapshots: readonly LiveQuizQuestionSnapshot[] | null | undefined,
  datasetId: QuizDatasetId
): string {
  if (!snapshots || snapshots.length === 0) return '';

  const tokens: string[] = [];
  const seenQuestionNos = new Set<number>();

  for (const snap of snapshots) {
    if (snap.chosenIdx < 0 || snap.chosenIdx > 3) continue;
    if (seenQuestionNos.has(snap.no)) continue;
    const tok = encodeLiveQuizToken(snap, datasetId);
    if (!tok || tok.endsWith('|-1')) continue;
    seenQuestionNos.add(snap.no);
    tokens.push(tok);
  }

  if (tokens.length === 0) return '';

  // Keep the most recent answered questions if an extraordinarily large session nears 15 KB
  const kept: string[] = [];
  let usedLen = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    const extra = kept.length > 0 ? tok.length + 1 : tok.length;
    if (usedLen + extra > QUIZ_LIVE_LOG_MAX_LENGTH) break;
    kept.push(tok);
    usedLen += extra;
  }
  kept.reverse();

  const joined = kept.join(';');
  if (joined.length > QUIZ_LIVE_LOG_MAX_LENGTH || !QUIZ_LIVE_LOG_PATTERN.test(joined)) {
    return '';
  }
  return joined;
}

/**
 * Deterministically reconstructs a full question (prompt, hint, A-D choices, chosen answer,
 * and correctness verdict) from a pure-ASCII live quiz token and static bundled dictionary.
 */
export function decodeLiveQuizToken(
  token: string | null | undefined,
  datasetId: QuizDatasetId
): DecodedLiveQuizQuestion | null {
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > QUIZ_CURRENT_TOKEN_MAX_LENGTH ||
    !QUIZ_CURRENT_TOKEN_PATTERN.test(token)
  ) {
    return null;
  }

  const parts = token.split('|');
  if (parts.length !== 5) return null;

  const no = Number(parts[0]);
  const rawType = parts[1];
  const itemId = parts[2];
  const optionIds = parts[3].split(',');
  const chosenIdx = Number(parts[4]);

  if (
    !Number.isInteger(no) ||
    no < 1 ||
    no > 500 ||
    !isValidQuizModelKey(rawType) ||
    !Number.isInteger(chosenIdx) ||
    chosenIdx < -1 ||
    chosenIdx > 3
  ) {
    return null;
  }

  const dataset = getQuizDatasetEntries(datasetId);
  const byId = getQuizDatasetMap(datasetId);
  const item = byId.get(itemId);
  if (!item) return null;

  const exMeta = rawType === 'ex2k' ? analyzeSentenceBlank(item) : null;
  const promptHint = resolvePromptHint(item, rawType, dataset);
  const isIrodori = datasetId !== 'n4';

  const promptTitle =
    isIrodori && rawType === 'm2k'
      ? 'Pilih kosakata yang artinya:'
      : isIrodori && rawType === 'ex2k'
        ? 'Kosakata mana yang melengkapi kalimat ini?'
        : QTYPES[rawType].prompt;

  const promptMain =
    rawType === 'k2r' || rawType === 'k2m'
      ? item.k
      : rawType === 'm2k'
        ? item.m
        : rawType === 'r2k'
          ? item.r
          : exMeta?.maskedEx ?? item.ex;

  const promptSub = rawType === 'ex2k' && item.exi ? item.exi : undefined;

  const options: DecodedLiveQuizOption[] = [];
  for (let idx = 0; idx < optionIds.length; idx++) {
    const optItem = byId.get(optionIds[idx]);
    if (!optItem) continue;
    options.push({
      index: idx,
      letter: ABC_LABELS[idx] ?? String(idx + 1),
      itemId: optItem.id,
      label: dispOf(optItem, rawType, exMeta),
      itemK: optItem.k,
      itemR: optItem.r,
      itemM: optItem.m,
      isCorrectOption: optItem.id === item.id,
      isChosen: chosenIdx === idx,
    });
  }

  if (options.length === 0) return null;

  const answered = chosenIdx >= 0 && chosenIdx < options.length;
  const chosenOption = answered ? (options.find(o => o.isChosen) ?? null) : null;
  const correctOption = options.find(o => o.isCorrectOption) ?? null;
  const isCorrect = chosenOption ? chosenOption.isCorrectOption : null;

  return {
    no,
    type: rawType,
    datasetId,
    promptTitle,
    promptMain,
    ...(promptHint ? { promptHint } : {}),
    ...(promptSub ? { promptSub } : {}),
    itemId: item.id,
    itemK: item.k,
    itemR: item.r,
    itemM: item.m,
    options,
    chosenIdx: answered ? chosenIdx : -1,
    answered,
    isCorrect,
    chosenOption,
    correctOption,
  };
}

/**
 * Decodes the semicolon-separated `quizLiveLog` into an ordered array of answered questions.
 */
export function decodeLiveQuizLog(
  rawLog: string | null | undefined,
  datasetId: QuizDatasetId
): DecodedLiveQuizQuestion[] {
  if (
    typeof rawLog !== 'string' ||
    rawLog.length === 0 ||
    rawLog.length > QUIZ_LIVE_LOG_MAX_LENGTH ||
    !QUIZ_LIVE_LOG_PATTERN.test(rawLog)
  ) {
    return [];
  }

  const out: DecodedLiveQuizQuestion[] = [];
  for (const part of rawLog.split(';')) {
    const decoded = decodeLiveQuizToken(part, datasetId);
    if (decoded && decoded.answered) {
      out.push(decoded);
    }
  }
  out.sort((a, b) => a.no - b.no);
  return out;
}
