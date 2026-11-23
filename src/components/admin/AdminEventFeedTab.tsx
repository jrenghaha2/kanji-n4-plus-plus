import { useMemo, useState } from 'react';
import { Award, CheckCircle2, PlayCircle } from 'lucide-react';
import type { ActivityEventData, ActivityEventType } from '../../types/admin';
import {
  DATASET_SHORT_LABELS,
  formatAbsoluteTimeId,
  formatRelativeTimeId,
} from '../../utils/adminMonitor';

interface AdminEventFeedTabProps {
  events: readonly ActivityEventData[];
  nowMs: number;
}

type EventFilter = 'all' | ActivityEventType;

const EVENT_FILTERS: readonly { key: EventFilter; label: string }[] = [
  { key: 'all', label: 'Semua Kejadian' },
  { key: 'quiz_completed', label: 'Selesai Tes' },
  { key: 'quiz_started', label: 'Mulai Tes' },
  { key: 'progress_milestone', label: 'Pencapaian Progres' },
];

export function AdminEventFeedTab({ events, nowMs }: AdminEventFeedTabProps) {
  const [filter, setFilter] = useState<EventFilter>('all');

  const counts = useMemo(() => {
    const c = { all: events.length, quiz_completed: 0, quiz_started: 0, progress_milestone: 0 };
    for (const ev of events) {
      if (ev.eventType === 'quiz_completed') c.quiz_completed += 1;
      else if (ev.eventType === 'quiz_started') c.quiz_started += 1;
      else if (ev.eventType === 'progress_milestone') c.progress_milestone += 1;
    }
    return c;
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter(ev => ev.eventType === filter);
  }, [events, filter]);

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Filter jenis kejadian"
        className="flex flex-wrap items-center gap-1.5"
      >
        {EVENT_FILTERS.map(opt => {
          const active = filter === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(opt.key)}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-slate-900 border-slate-900 text-white dark:bg-indigo-600 dark:border-indigo-500 dark:text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{opt.label}</span>
              <span className="font-mono-num opacity-80">{counts[opt.key]}</span>
            </button>
          );
        })}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Belum ada kejadian real-time yang tercatat untuk kategori ini.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
          {filteredEvents.map(ev => {
            const Icon =
              ev.eventType === 'quiz_completed'
                ? CheckCircle2
                : ev.eventType === 'quiz_started'
                  ? PlayCircle
                  : Award;
            const iconStyle =
              ev.eventType === 'quiz_completed'
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
                : ev.eventType === 'quiz_started'
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800'
                  : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800';
            const typeLabel =
              ev.eventType === 'quiz_completed'
                ? 'Selesai Tes'
                : ev.eventType === 'quiz_started'
                  ? 'Mulai Tes'
                  : 'Pencapaian Progres';

            return (
              <div
                key={ev.id}
                className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    aria-hidden="true"
                    className={`w-9 h-9 rounded-xl border inline-flex items-center justify-center shrink-0 mt-0.5 ${iconStyle}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-50">
                        {ev.displayName || ev.email || 'Pengguna'}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {typeLabel}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {DATASET_SHORT_LABELS[ev.datasetId]}
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">
                      {ev.summary}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                      {ev.scopeLabel ? <span>Cakupan: {ev.scopeLabel}</span> : null}
                      {ev.eventType === 'quiz_completed' && ev.score >= 0 ? (
                        <>
                          {ev.scopeLabel ? <span aria-hidden="true">·</span> : null}
                          <span className="font-mono-num font-semibold text-emerald-700 dark:text-emerald-400">
                            Skor {ev.score}% ({ev.correct}/{ev.total})
                          </span>
                        </>
                      ) : null}
                      {ev.eventType === 'progress_milestone' && ev.totalMastered > 0 ? (
                        <>
                          {ev.scopeLabel ? <span aria-hidden="true">·</span> : null}
                          <span className="font-mono-num font-semibold text-indigo-700 dark:text-indigo-300">
                            Total {ev.totalMastered} hafalan
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div
                  className="text-right shrink-0 text-xs font-mono-num text-slate-500 dark:text-slate-400"
                  title={formatAbsoluteTimeId(ev.createdAtMs)}
                >
                  {formatRelativeTimeId(ev.createdAtMs, nowMs)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
