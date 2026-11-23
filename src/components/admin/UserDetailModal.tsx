import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  GraduationCap,
  Loader2,
  Shield,
  X,
  XCircle,
} from 'lucide-react';
import { LEVELS } from '../../data/kanjiData';
import type {
  MonitoredUserRow,
  UserDetailData,
  UserDetailQuizEntry,
} from '../../types/admin';
import type { QuizDatasetId } from '../../types/kanji';
import {
  DATASET_SHORT_LABELS,
  formatAbsoluteTimeId,
  formatRelativeTimeId,
} from '../../utils/adminMonitor';
import { getRoleDisplayBadgeLabel } from '../../utils/rbac';
import { getQuizModelLabel } from '../quiz/quizHelpers';
import { LiveQuizMonitorCard } from './LiveQuizMonitorCard';

interface UserDetailModalProps {
  row: MonitoredUserRow | null;
  detail: UserDetailData | null;
  loading: boolean;
  error: string | null;
  nowMs: number;
  onClose: () => void;
}

const DATASET_FILTER_OPTIONS: readonly { key: 'all' | QuizDatasetId; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'n4', label: 'Kanji N4' },
  { key: 'pemula', label: 'Pemula' },
  { key: 'dasar1', label: 'Dasar 1' },
  { key: 'dasar2', label: 'Dasar 2' },
];

const QUIZ_MODE_LABELS: Record<string, string> = {
  random: 'Acak 4 Model',
  random5: 'Acak 5 Model',
  k2r: 'Kanji → Bacaan',
  k2m: 'Kanji → Arti',
  m2k: 'Arti → Kanji',
  r2k: 'Bacaan → Kanji',
  ex2k: 'Kalimat → Kanji',
};

function getSessionKey(session: UserDetailQuizEntry): string {
  return `${session.datasetId}:${session.id}`;
}

export function UserDetailModal({
  row,
  detail,
  loading,
  error,
  nowMs,
  onClose,
}: UserDetailModalProps) {
  const [datasetFilter, setDatasetFilter] = useState<'all' | QuizDatasetId>('all');
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [answerFilter, setAnswerFilter] = useState<'all' | 'wrong' | 'right'>('all');

  useEffect(() => {
    setDatasetFilter('all');
    setAvatarBroken(false);
    setSelectedSessionKey(null);
    setAnswerFilter('all');
  }, [row?.uid]);

  useEffect(() => {
    if (!row) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedSessionKey) {
          setSelectedSessionKey(null);
          setAnswerFilter('all');
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [row, selectedSessionKey, onClose]);

  const filteredSessions = useMemo(() => {
    if (!detail) return [];
    if (datasetFilter === 'all') return detail.quizSessions;
    return detail.quizSessions.filter(s => s.datasetId === datasetFilter);
  }, [detail, datasetFilter]);

  const selectedSession = useMemo(() => {
    if (!detail || !selectedSessionKey) return null;
    return detail.quizSessions.find(s => getSessionKey(s) === selectedSessionKey) ?? null;
  }, [detail, selectedSessionKey]);

  const summaryStats = useMemo(() => {
    if (!detail) {
      return {
        n4Mastered: 0,
        irodoriMastered: 0,
        n4QuizCount: 0,
        irodoriQuizCount: 0,
        avgScore: null as number | null,
      };
    }
    const n4Mod = detail.modules.find(m => m.datasetId === 'n4');
    const n4Mastered = n4Mod?.masteredCount ?? 0;
    const irodoriMastered = Math.max(0, detail.totalMastered - n4Mastered);

    let n4QuizCount = 0;
    let irodoriQuizCount = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;
    for (const s of detail.quizSessions) {
      if (s.datasetId === 'n4') n4QuizCount += 1;
      else irodoriQuizCount += 1;
      totalCorrect += s.correct;
      totalQuestions += s.total;
    }

    return {
      n4Mastered,
      irodoriMastered,
      n4QuizCount,
      irodoriQuizCount,
      avgScore: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null,
    };
  }, [detail]);

  const selectedAnswers = selectedSession?.answers ?? [];
  const selectedWrongCount = useMemo(
    () => selectedAnswers.filter(a => !a.correct).length,
    [selectedAnswers]
  );
  const selectedRightCount = useMemo(
    () => selectedAnswers.filter(a => a.correct).length,
    [selectedAnswers]
  );
  const filteredAnswers = useMemo(() => {
    if (answerFilter === 'wrong') return selectedAnswers.filter(a => !a.correct);
    if (answerFilter === 'right') return selectedAnswers.filter(a => a.correct);
    return selectedAnswers;
  }, [selectedAnswers, answerFilter]);

  if (!row) return null;

  const initial = row.displayName.charAt(0).toUpperCase() || 'U';
  const roleLabel = getRoleDisplayBadgeLabel(row.role, row.email);

  const openSessionDetail = (session: UserDetailQuizEntry) => {
    setSelectedSessionKey(getSessionKey(session));
    setAnswerFilter('all');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="userDetailModalTitle"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-3 sm:p-5"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {row.avatarUrl && !avatarBroken ? (
              <img
                src={row.avatarUrl}
                alt={row.displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarBroken(true)}
                className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
              />
            ) : (
              <span
                aria-hidden="true"
                className="w-11 h-11 rounded-full border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 font-bold text-base inline-flex items-center justify-center shrink-0"
              >
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <h2
                id="userDetailModalTitle"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 truncate"
              >
                {row.displayName}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="truncate">{row.email || 'Email tidak tersedia'}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300">
                  <Shield className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {roleLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span>Aktif {formatRelativeTimeId(row.lastActiveMs, nowMs)}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal detail pengguna"
            className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        {selectedSession ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Drill-down subheader */}
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSessionKey(null);
                    setAnswerFilter('all');
                  }}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kembali ke Riwayat Sesi</span>
                </button>

                <div className="font-mono-num text-sm font-bold flex items-center gap-2">
                  <span
                    className={
                      selectedSession.score >= 80
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : selectedSession.score >= 60
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-rose-700 dark:text-rose-400'
                    }
                  >
                    {selectedSession.correct}/{selectedSession.total} ({selectedSession.score}%)
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-50">
                    {DATASET_SHORT_LABELS[selectedSession.datasetId]} ·{' '}
                    {QUIZ_MODE_LABELS[selectedSession.mode] ?? selectedSession.mode}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>
                      {selectedSession.scopeLabel || `Level ${LEVELS[selectedSession.level].label}`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {formatAbsoluteTimeId(
                        Number.isNaN(Date.parse(selectedSession.completedAt))
                          ? null
                          : Date.parse(selectedSession.completedAt)
                      )}
                    </span>
                  </div>
                </div>

                {selectedAnswers.length > 0 ? (
                  <div className="flex items-center gap-1.5" role="group" aria-label="Filter jawaban soal">
                    <button
                      type="button"
                      onClick={() => setAnswerFilter('all')}
                      aria-pressed={answerFilter === 'all'}
                      className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                        answerFilter === 'all'
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      Semua ({selectedAnswers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerFilter('wrong')}
                      aria-pressed={answerFilter === 'wrong'}
                      className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                        answerFilter === 'wrong'
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300'
                      }`}
                    >
                      Salah ({selectedWrongCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerFilter('right')}
                      aria-pressed={answerFilter === 'right'}
                      className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                        answerFilter === 'right'
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-emerald-700 dark:hover:text-emerald-300'
                      }`}
                    >
                      Benar ({selectedRightCount})
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Per-question answer list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
              {selectedAnswers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center space-y-1.5">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Detail jawaban per soal belum tersedia untuk sesi ini
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Sesi lama ini hanya menyimpan ringkasan skor. Sesi kuis terbaru secara otomatis
                    menyimpan rincian jawaban untuk setiap soal.
                  </p>
                </div>
              ) : filteredAnswers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {answerFilter === 'wrong'
                    ? 'Tidak ada jawaban salah pada sesi ini. Sempurna!'
                    : 'Tidak ada jawaban benar pada filter ini.'}
                </div>
              ) : (
                filteredAnswers.map(ans => {
                  const datasetMode = selectedSession.datasetId === 'n4' ? 'n4' : 'irodori';
                  const showReading = Boolean(ans.itemR && ans.itemR !== ans.itemK);
                  return (
                    <div
                      key={`${selectedSession.id}-${ans.no}`}
                      className={`rounded-xl border p-3.5 text-sm leading-relaxed ${
                        ans.correct
                          ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/45 dark:bg-emerald-950/30'
                          : 'border-rose-200 dark:border-rose-800/70 bg-rose-50/45 dark:bg-rose-950/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                        <span className="text-slate-500 dark:text-slate-400 font-mono-num">
                          No. {ans.no} · {getQuizModelLabel(ans.type, datasetMode)}
                        </span>
                        <span
                          className={
                            ans.correct
                              ? 'text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1'
                              : 'text-rose-700 dark:text-rose-400 inline-flex items-center gap-1'
                          }
                        >
                          {ans.correct ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Benar</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Salah</span>
                            </>
                          )}
                        </span>
                      </div>

                      {ans.type === 'ex2k' && ans.ex ? (
                        <div className="mt-1.5 space-y-1">
                          <p className="font-jp font-semibold text-slate-900 dark:text-slate-50">
                            {ans.ex}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                            <span>
                              Kunci:{' '}
                              <strong className="text-emerald-700 dark:text-emerald-400 font-jp">
                                {ans.expectedLabel}
                              </strong>{' '}
                              <span className="text-slate-500 dark:text-slate-400">
                                ({ans.itemR}, {ans.itemM})
                              </span>
                            </span>
                            {!ans.correct ? (
                              <span>
                                · Jawaban pengguna:{' '}
                                <strong className="text-rose-700 dark:text-rose-400 font-jp">
                                  {ans.chosenLabel}
                                </strong>
                                {ans.chosenM ? (
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {' '}
                                    ({ans.chosenM})
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1.5 space-y-1">
                          <p className="text-slate-800 dark:text-slate-200">
                            <strong className="font-jp text-base text-slate-900 dark:text-slate-50">
                              {ans.itemK}
                            </strong>
                            {showReading ? (
                              <span className="text-slate-600 dark:text-slate-300 font-jp">
                                {' '}
                                ({ans.itemR})
                              </span>
                            ) : null}
                            <span className="text-slate-400 dark:text-slate-500"> — </span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              {ans.itemM}
                            </span>
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                            <span>
                              Kunci:{' '}
                              <strong className="font-jp text-emerald-700 dark:text-emerald-400">
                                {ans.expectedLabel}
                              </strong>
                            </span>
                            <span>
                              · Jawaban pengguna:{' '}
                              <strong
                                className={`font-jp ${
                                  ans.correct
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {ans.chosenLabel}
                              </strong>
                              {!ans.correct && ans.type !== 'k2m' && ans.chosenM ? (
                                <span className="text-slate-500 dark:text-slate-400">
                                  {' '}
                                  ({ans.chosenM})
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
                <Loader2
                  className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">Memuat rincian progres &amp; riwayat tes...</p>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
                {error}
              </div>
            ) : detail ? (
              <>
                {/* Live Quiz Real-Time Inspector (shown whenever user is actively taking or just finished a quiz) */}
                {row.liveQuizCurrent || row.liveQuizLog.length > 0 ? (
                  <LiveQuizMonitorCard row={row} />
                ) : null}

                {/* Top KPI summary cards (matching clean dark/light dashboard aesthetic) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Total Hafalan
                    </div>
                    <div className="mt-1.5 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
                      {detail.totalMastered}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                      {summaryStats.n4Mastered} N4 · {summaryStats.irodoriMastered} Irodori
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Sesi Kuis
                    </div>
                    <div className="mt-1.5 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
                      {detail.totalQuizSessions}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                      N4: {summaryStats.n4QuizCount} · Irodori: {summaryStats.irodoriQuizCount}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Rata-rata Skor
                    </div>
                    <div className="mt-1.5 text-2xl font-bold font-mono-num text-indigo-700 dark:text-indigo-300">
                      {summaryStats.avgScore !== null ? `${summaryStats.avgScore}%` : '—'}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Akurasi keseluruhan
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Tandai Sulit
                    </div>
                    <div className="mt-1.5 text-2xl font-bold font-mono-num text-amber-700 dark:text-amber-400">
                      {detail.totalHard}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {row.quizInProgress
                        ? `Tes: ${row.quizCurrentQuestion}/${row.quizTotalQuestions}`
                        : row.moduleLabel}
                    </div>
                  </div>
                </div>

                {/* Module progress breakdown */}
                <section aria-labelledby="detailModulesHeading" className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      id="detailModulesHeading"
                      className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
                    >
                      <BookOpen
                        className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                        aria-hidden="true"
                      />
                      Progres per Modul / Buku
                    </h3>
                    <div className="text-xs font-mono-num text-slate-600 dark:text-slate-300">
                      Aktivitas: <span className="font-semibold">{row.moduleLabel}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
                    {detail.modules.map(mod => {
                      const pct =
                        mod.totalItems > 0
                          ? Math.min(100, Math.round((mod.masteredCount / mod.totalItems) * 100))
                          : 0;
                      return (
                        <div key={mod.datasetId} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {mod.label}
                            </span>
                            <span className="font-mono-num text-xs text-slate-600 dark:text-slate-300 shrink-0">
                              {mod.masteredCount}/{mod.totalItems} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 dark:bg-sky-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Quiz history across all datasets */}
                <section aria-labelledby="detailQuizHeading" className="space-y-3 pt-1 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                    <h3
                      id="detailQuizHeading"
                      className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
                    >
                      <GraduationCap
                        className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                        aria-hidden="true"
                      />
                      Riwayat Sesi Kuis ({detail.totalQuizSessions})
                    </h3>

                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Klik sesi untuk melihat detail jawaban per soal
                    </span>
                  </div>

                  {detail.totalQuizSessions > 0 ? (
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 overflow-x-auto w-fit max-w-full">
                      {DATASET_FILTER_OPTIONS.map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setDatasetFilter(opt.key)}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                            datasetFilter === opt.key
                              ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {filteredSessions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      Belum ada riwayat sesi kuis pada cakupan ini.
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
                      {filteredSessions.map(session => {
                        const scoreTone =
                          session.score >= 80
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : session.score >= 60
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400';
                        const ms = Date.parse(session.completedAt);
                        const scopeText =
                          session.scopeLabel || `Level ${LEVELS[session.level].label}`;
                        return (
                          <button
                            key={getSessionKey(session)}
                            type="button"
                            onClick={() => openSessionDetail(session)}
                            className="w-full text-left px-4 py-3.5 bg-white dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-800/70 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                                {DATASET_SHORT_LABELS[session.datasetId]} ·{' '}
                                {QUIZ_MODE_LABELS[session.mode] ?? session.mode}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                                <span>{scopeText}</span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {formatAbsoluteTimeId(Number.isNaN(ms) ? null : ms)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 ml-auto">
                              <span className={`font-mono-num text-sm font-bold ${scoreTone}`}>
                                {session.correct}/{session.total} ({session.score}%)
                              </span>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 group-hover:border-indigo-300 dark:group-hover:border-indigo-600 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50 text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-200 transition-colors">
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Jawaban</span>
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
