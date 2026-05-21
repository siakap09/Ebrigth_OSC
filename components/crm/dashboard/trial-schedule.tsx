'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { X, CalendarRange, ExternalLink, Building2, Lock } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { getAgeCategory, ageCategoryClasses } from '@/lib/crm/age-category'
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
  | 'this_week'
  | 'last_week'
  | 'next_week'
  | 'this_month'

const PRESET_OPTIONS: ReadonlyArray<{ key: SchedulePreset; label: string }> = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This week' },
  { key: 'last_week',  label: 'Last week' },
  { key: 'next_week',  label: 'Next week' },
  { key: 'this_month', label: 'This month' },
]

export interface TrialScheduleBranchOption {
  id: string
  name: string
}

interface TrialScheduleProps {
  /**
   * Either a single branch (BM view + admin-as-branch), or null. When null
   * AND `branches` is non-empty, the widget renders its own branch picker
   * so super-admin / agency-admin can browse any branch's trial grid
   * without having to switch the topbar selector.
   */
  branchId: string | null
  /**
   * Branches the picker offers when the parent doesn't bind to a specific
   * branch. Pass the elevated `branches` array from the metrics response.
   * Omit when the parent already binds via `branchId`.
   */
  branches?: TrialScheduleBranchOption[]
  /**
   * When true, count cells render as plain text instead of clickable buttons
   * and the "who's joining" modal is suppressed. Used for super admin —
   * they get visibility into trial bookings without being able to drill in
   * (drill-in tooling lives on the branch-side dashboards).
   */
  readOnly?: boolean
}

export function TrialSchedule({ branchId, branches, readOnly = false }: TrialScheduleProps) {
  const [activeCell, setActiveCell] = useState<{ day: DayBucket; slot: SlotCell } | null>(null)
  const [preset, setPreset] = useState<SchedulePreset>('this_week')
  const [pickedBranchId, setPickedBranchId] = useState<string | null>(null)

  // Resolve effective branch: explicit prop wins; otherwise fall back to the
  // internal picker. When the parent passes a branchId but the elevated user
  // also has a branches list available, we still let the parent's choice take
  // precedence — they've already narrowed scope via the topbar.
  const effectiveBranchId = branchId ?? pickedBranchId

  // Seed the picker with the first branch in the list so the grid isn't
  // blank on initial mount for elevated users.
  useEffect(() => {
    if (!branchId && !pickedBranchId && branches && branches.length > 0) {
      setPickedBranchId(branches[0].id)
    }
  }, [branchId, branches, pickedBranchId])

  const { data, isLoading } = useQuery<TrialScheduleResponse>({
    queryKey: ['crm', 'dashboard', 'trial-schedule', effectiveBranchId ?? 'none', preset],
    queryFn: async () => {
      const params = new URLSearchParams({ preset })
      if (effectiveBranchId) params.set('branchId', effectiveBranchId)
      const res = await fetch(`/api/crm/dashboard/trial-schedule?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load trial schedule')
      return res.json()
    },
    enabled: !!effectiveBranchId,
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
    if (seen.size === 0) return [...TRIAL_ALL_SLOTS]
    return TRIAL_ALL_SLOTS.filter((s) => seen.has(s))
  }, [data])

  const pickerBranches = branches ?? []
  const showPicker = !branchId && pickerBranches.length > 0
  const hasAnyBranchInScope = !!effectiveBranchId

  if (!hasAnyBranchInScope && !showPicker) return null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Trial Class Schedule
            </h2>
            {readOnly && (
              <span
                title="Read-only — super-admin view"
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              >
                <Lock className="h-2.5 w-2.5" /> Read-only
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Students booked into trial classes for the selected range.{' '}
            {readOnly ? 'Drill-in is disabled for super-admin view.' : 'Click a count to see who\'s joining.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showPicker && (
            <label className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[11px] dark:bg-slate-800">
              <Building2 className="h-3 w-3 text-slate-400" />
              <select
                value={pickedBranchId ?? ''}
                onChange={(e) => setPickedBranchId(e.target.value || null)}
                className="bg-transparent text-[11px] font-medium text-slate-700 focus:outline-none dark:text-slate-200"
              >
                {pickerBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}

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
                    const interactive = !readOnly && count > 0
                    return (
                      <td key={d.key} className="min-w-30">
                        <button
                          type="button"
                          onClick={() => interactive && dayBucket && cell && setActiveCell({ day: dayBucket, slot: cell })}
                          disabled={!interactive}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-center transition',
                            count === 0
                              ? 'cursor-default border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-600'
                              : interactive
                                ? 'cursor-pointer border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/50'
                                : 'cursor-default border-indigo-200 bg-indigo-50/60 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300',
                          )}
                        >
                          <span className="block text-xl font-bold tabular-nums">{count}</span>
                          {count > 0 && !readOnly && (
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

      {/* Click-through students modal — readOnly users can't open this. */}
      {activeCell && !readOnly && (
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

// ─── Student-list modal ────────────────────────────────────────────────────────
//
// Polished version of the "who's joining" popover. Each student row shows the
// age-category pill (matches the kanban card), the trial start time prominently,
// and a tappable "Open" link to the lead detail page.

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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 dark:bg-slate-900">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Trial Class
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
              {dayLabel} <span className="text-slate-400">·</span> {slot}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {students.length} student{students.length === 1 ? '' : 's'} joining
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <ul className="divide-y divide-slate-100 overflow-y-auto px-2 dark:divide-slate-800" style={{ maxHeight: 'calc(85vh - 100px)' }}>
          {students.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">
              No students booked into this slot.
            </li>
          )}
          {students.map((s) => {
            const ageCategory = s.childAge ? getAgeCategory(s.childAge) : null
            const startAt = new Date(s.startAt)
            return (
              <li key={s.appointmentId} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 text-sm font-bold text-indigo-700 ring-1 ring-indigo-200 dark:from-indigo-950/40 dark:to-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-900/50">
                  {(s.name[0] ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {s.name}
                    </p>
                    {ageCategory && (
                      <span
                        title={s.childAge ?? undefined}
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          ageCategoryClasses(ageCategory),
                        )}
                      >
                        {ageCategory}
                      </span>
                    )}
                    {!ageCategory && s.childAge && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {s.childAge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {startAt.toLocaleString('en-GB', {
                      weekday: 'short',
                      day:    '2-digit',
                      month:  'short',
                      hour:   '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {s.opportunityId && (
                  <Link
                    href={`/crm/opportunities/${s.opportunityId}`}
                    onClick={onClose}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
