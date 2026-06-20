import { PageHeader } from '../_components/placeholders'

// Placeholder recruitment pipeline. The real stage names/colors will come from
// the recruitment schema (or the existing hidden "Ebright HR" branch pipeline)
// once provided — this is a themed PREVIEW of the board's design so the layout,
// emerald theme, and "same kanban mechanism, different look" are visible now.
const PREVIEW_STAGES: Array<{ name: string; code: string; color: string }> = [
  { name: 'Applied',    code: 'APP', color: 'bg-slate-400' },
  { name: 'Screening',  code: 'SCR', color: 'bg-sky-400' },
  { name: 'Interview',  code: 'INT', color: 'bg-indigo-400' },
  { name: 'Assessment', code: 'ASM', color: 'bg-violet-400' },
  { name: 'Offer',      code: 'OFR', color: 'bg-amber-400' },
  { name: 'Hired',      code: 'HIR', color: 'bg-emerald-500' },
  { name: 'Rejected',   code: 'REJ', color: 'bg-rose-400' },
]

export default function RecruitmentOpportunityPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <PageHeader
          title="Opportunity"
          subtitle="Drag recruit cards across the hiring pipeline"
        />
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Preview pipeline — connects to your schema
        </span>
      </div>

      {/* Board skeleton — same kanban structure as the CRM, emerald HR theme. */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex h-full items-stretch gap-3">
          {PREVIEW_STAGES.map((stage) => (
            <div
              key={stage.code}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-emerald-100 bg-emerald-50/40 dark:border-emerald-950/40 dark:bg-emerald-950/10"
            >
              <div className="flex items-center gap-2 border-b border-emerald-100 px-3 py-2.5 dark:border-emerald-950/40">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stage.color}`} />
                <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-white">
                  {stage.name}
                </span>
                <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {stage.code}
                </span>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                  0
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center p-3 text-center text-[11px] text-slate-400">
                Recruit cards appear here
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
