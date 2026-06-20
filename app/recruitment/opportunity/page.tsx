import { PageHeader } from '../_components/placeholders'

// The real recruitment pipeline (29 stages, confirmed from HR's GHL board). The
// colours are placeholders for now ("random" per HR) — the live board will read
// stage colours from the recruitment data once the schema is connected. Shown
// here so the board's layout + emerald theme are visible against the real flow.
const PREVIEW_STAGES: Array<{ name: string; code: string; color: string }> = [
  { name: 'Candidate',            code: 'CD',   color: 'bg-slate-400' },
  { name: 'Intern',               code: 'INT',  color: 'bg-slate-400' },
  { name: 'Full Time',            code: 'FT',   color: 'bg-slate-400' },
  { name: 'Part Timer',           code: 'PT',   color: 'bg-slate-400' },
  { name: 'Buffer Resume',        code: 'BR',   color: 'bg-zinc-400' },
  { name: 'Resume Submission',    code: 'RS',   color: 'bg-sky-400' },
  { name: 'Buffer Video',         code: 'BV',   color: 'bg-zinc-400' },
  { name: 'Complete Submission',  code: 'VS',   color: 'bg-sky-400' },
  { name: 'Health Declaration',   code: 'HD',   color: 'bg-cyan-400' },
  { name: 'Google Search',        code: 'GS',   color: 'bg-cyan-400' },
  { name: 'Interview Date',       code: 'ID',   color: 'bg-indigo-400' },
  { name: 'Follow Up',            code: 'FUP',  color: 'bg-violet-400' },
  { name: 'Shortlisted',          code: 'SL',   color: 'bg-violet-400' },
  { name: 'Reschedule',           code: 'RSD',  color: 'bg-amber-400' },
  { name: 'Interviewed',          code: 'INT2', color: 'bg-indigo-500' },
  { name: 'Hired',                code: 'HRD',  color: 'bg-emerald-500' },
  { name: '1st Day Trial',        code: 'DT1',  color: 'bg-teal-400' },
  { name: '2nd Day Trial',        code: 'DT2',  color: 'bg-teal-400' },
  { name: '3rd Day Trial',        code: 'DT3',  color: 'bg-teal-400' },
  { name: 'Send Agreement Letter',code: 'SAL',  color: 'bg-teal-500' },
  { name: 'Rejected',             code: 'RJT',  color: 'bg-rose-400' },
  { name: '1st Training Day',     code: 'TR1',  color: 'bg-green-400' },
  { name: '2nd Training Day',     code: 'TR2',  color: 'bg-green-400' },
  { name: '3rd Training Day',     code: 'TR3',  color: 'bg-green-400' },
  { name: 'Access To Payroll',    code: 'PAY',  color: 'bg-green-500' },
  { name: 'IOP Sessions 2 week',  code: 'IOP1', color: 'bg-lime-500' },
  { name: 'IOP Sessions 2nd month',code: 'IOP2',color: 'bg-lime-500' },
  { name: 'IOP Sessions 3rd month',code: 'IOP3',color: 'bg-lime-600' },
  { name: 'Buffer (For OD Use)',  code: 'OD',   color: 'bg-slate-400' },
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
