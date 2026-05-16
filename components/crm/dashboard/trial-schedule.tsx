'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { X, CalendarRange, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { TRIAL_DAY_ORDER, TRIAL_ALL_SLOTS } from '@/lib/crm/trial-config'

interface Student {
  appointmentId: string
  contactId: string
  opportunityId: string | null
  name: string
  childAge: string | null
  startAt: string
}

interface SlotCell {
  slot: string
  count: number
  students: Student[]
}

interface DayBucket {
  key: string
  label: string
  slots: SlotCell[]
}

interface TrialScheduleResponse {
  range: { from: string | null; to: string | null }
  branchIds: string[]
  days: DayBucket[]
}

type SchedulePreset =
  | 'today'
  | 'yesterday'
  | 'last_week'
  | 'next_week'
  | 'this_month'

const PRESET_OPTIONS: ReadonlyArray<{ key: SchedulePreset; label: string }> = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'last_week',  label: 'Last week' },
  { key: 'next_week',  label: 'Next week' },
  { key: 'this_month', label: 'This month' },
]

interface TrialScheduleProps {
  /** Required — widget is hidden by the parent when no branch is in scope. */
  branchId: string | null
}

export function TrialSchedule({ branchId }: TrialScheduleProps) {
  const [activeCell, setActiveCell] = useState<{ day: DayBucket; slot: SlotCell } | null>(null)
  const [preset, setPreset] = useState<SchedulePreset>('next_week')

  const { data, isLoading } = useQuery<TrialScheduleResponse>({
    queryKey: ['crm', 'dashboard', 'trial-schedule', branchId ?? 'none', preset],
    queryFn: async () => {
      const params = new URLSearchParams({ preset })
      if (branchId) params.set('branchId', branchId)
      const res = await fetch(`/api/crm/dashboard/trial-schedule?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load trial schedule')
      return res.json()
    },
    enabled: !!branchId,
  })

  // Trim slot rows to those that have at least one count somewhere on the grid
  // OR are part of the canonical Wed-Sun list — keeps the table compact when
  // a branch only ever uses evening slots.
  const visibleSlots = useMemo(() => {
    if (!data) return [...TRIAL_ALL_SLOTS]
    const seen = new Set<string>()
    for (const d of data.days) {
      for (const s of d.slots) {
        if (s.count > 0) seen.add(s.slot)
      }
    }
    // If literally nothing scheduled, fall back to showing every slot so the
    // empty grid still has structure.
    if (seen.size === 0) return [...TRIAL_ALL_SLOTS]
    return TRIAL_ALL_SLOTS.filter((s) => seen.has(s))
  }, [data])

  if (!branchId) return null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Trial Class Schedule
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Students booked into trial classes for the selected range.
            Click a count to see who&apos;s joining.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-0.5 text-[11px] dark:bg-slate-800">
          <CalendarRange className="ml-1.5 h-3 w-3 text-slate-400" />
          {PRESET_OPTIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={cn(
                'rounded-full px-2.5 py-1 font-medium transition',
                preset === p.key
                  ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : !data ? (
        <p className="py-6 text-center text-sm text-slate-400">Failed to load schedule.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-1.5 text-sm">
            <thead>
              <tr>
                <th className="w-32 text-left text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Slot
                </th>
                {TRIAL_DAY_ORDER.map((d) => (
                  <th
                    key={d.key}
                    className="text-center text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSlots.map((slot) => (
                <tr key={slot}>
                  <td className="w-32 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {slot}
                  </td>
                  {TRIAL_DAY_ORDER.map((d) => {
                    const dayBucket = data.days.find((x) => x.key === d.key)
                    const cell = dayBucket?.slots.find((s) => s.slot === slot)
                    const count = cell?.count ?? 0
                    return (
                      <td key={d.key} className="min-w-[120px]">
                        <button
                          type="button"
                          onClick={() => count > 0 && dayBucket && cell && setActiveCell({ day: dayBucket, slot: cell })}
                          disabled={count === 0}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-center transition',
                            count === 0
                              ? 'cursor-default border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-600'
                              : 'cursor-pointer border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/50',
                          )}
                        >
                          <span className="block text-xl font-bold tabular-nums">{count}</span>
                          {count > 0 && (
                            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide">
                              View
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Click-through students modal */}
      {activeCell && (
        <StudentListModal
          dayLabel={activeCell.day.label}
          slot={activeCell.slot.slot}
          students={activeCell.slot.students}
          onClose={() => setActiveCell(null)}
        />
      )}
    </section>
  )
}

function StudentListModal({
  dayLabel,
  slot,
  students,
  onClose,
}: {
  dayLabel: string
  slot: string
  students: Student[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[80vh] overflow-y-auto rounded-xl bg-white shadow-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {dayLabel} · {slot}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {students.length} student{students.length === 1 ? '' : 's'} joining
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {students.map((s) => (
            <li key={s.appointmentId} className="flex items-center gap-3 px-5 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {(s.name[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {s.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {s.childAge ?? '—'} · {new Date(s.startAt).toLocaleString('en-GB', {
                    weekday: 'short',
                    day:   '2-digit',
                    month: 'short',
                    hour:  '2-digit',
                    minute:'2-digit',
                  })}
                </p>
              </div>
              {s.opportunityId && (
                <Link
                  href={`/crm/opportunities/${s.opportunityId}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
