'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  useAutomations, useToggleAutomation, useDuplicateAutomation, useDeleteAutomation,
} from '@/hooks/crm/useAutomations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBranchContext } from '@/components/crm/branch-context'
import {
  Zap, Plus, Copy, Trash2, Edit, CheckCircle, XCircle, Loader2, Clock,
  Cog, ChevronRight, FileCode,
} from 'lucide-react'
import { useState } from 'react'
import {
  SYSTEM_AUTOMATIONS,
  SYSTEM_AUTOMATION_CATEGORY_LABELS,
  type SystemAutomation,
  type SystemAutomationCategory,
} from '@/lib/crm/system-automations'

const TRIGGER_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  STAGE_CHANGED: 'Stage Changed',
  TAG_ADDED: 'Tag Added',
  TAG_REMOVED: 'Tag Removed',
  TIME_IN_STAGE: 'Time in Stage',
  SCHEDULED: 'Scheduled',
  FORM_SUBMITTED: 'Form Submitted',
  INCOMING_MESSAGE: 'Incoming Message',
  CUSTOM_FIELD_CHANGED: 'Field Changed',
  APPOINTMENT_BOOKED: 'Appointment Booked',
  CONTACT_REPLIED: 'Contact Replied',
  NO_REPLY_AFTER: 'No Reply After',
}

interface AutomationsListClientProps {
  userId: string
}

export function AutomationsListClient({ userId: _userId }: AutomationsListClientProps) {
  const router = useRouter()
  const { selectedBranch } = useBranchContext()
  const { data, isLoading } = useAutomations(selectedBranch?.id)
  const toggle = useToggleAutomation()
  const duplicate = useDuplicateAutomation()
  const remove = useDeleteAutomation()

  const automations = (data as { id: string; name: string; triggerType: string; enabled: boolean; runs?: { status: string; startedAt: string }[] }[] | undefined) ?? []

  async function handleToggle(id: string, current: boolean) {
    try {
      await toggle.mutateAsync({ id, enabled: !current })
      toast.success(current ? 'Automation disabled' : 'Automation enabled')
    } catch {
      toast.error('Failed to toggle automation')
    }
  }

  async function handleDuplicate(id: string) {
    try {
      await duplicate.mutateAsync(id)
      toast.success('Automation duplicated')
    } catch {
      toast.error('Failed to duplicate')
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await remove.mutateAsync(id)
      toast.success('Automation deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Automations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visual workflows that run automatically on triggers.</p>
        </div>
        <Button onClick={() => router.push('/crm/automations/new')}>
          <Plus className="h-4 w-4 mr-2" /> New Automation
        </Button>
      </div>

      <SystemAutomationsSection />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && automations.length === 0 && (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed">
          <Zap className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No automations yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first workflow to automate lead communication.</p>
          <Button className="mt-4" onClick={() => router.push('/crm/automations/new')}>
            <Plus className="h-4 w-4 mr-2" /> Create Automation
          </Button>
        </div>
      )}

      {!isLoading && automations.length > 0 && (
        <div className="space-y-2">
          {automations.map((a) => {
            const lastRun = a.runs?.[0]
            return (
              <div
                key={a.id}
                className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`p-2 rounded-lg ${a.enabled ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                    <Zap className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{a.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-xs">{TRIGGER_LABELS[a.triggerType] ?? a.triggerType}</Badge>
                      {lastRun && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {lastRun.status === 'COMPLETED' && <CheckCircle className="h-3 w-3 text-green-500" />}
                          {lastRun.status === 'FAILED' && <XCircle className="h-3 w-3 text-red-500" />}
                          {lastRun.status === 'RUNNING' && <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />}
                          {lastRun.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleToggle(a.id, a.enabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${a.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${a.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => router.push(`/crm/automations/${a.id}`)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDuplicate(a.id)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(a.id, a.name)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── System automations section ──────────────────────────────────────────────
// Read-only catalogue of hard-coded automations / flows that run in the
// backend. Sourced from lib/crm/system-automations.ts. Each row expands to
// show trigger / actions / source files so super-admins can audit the
// full automation surface area without spelunking the codebase.

function SystemAutomationsSection() {
  const [expanded, setExpanded] = useState<string | null>(null)

  // Group by category in the canonical display order. Iterate
  // SYSTEM_AUTOMATION_CATEGORY_LABELS so empty categories silently drop out
  // and order stays stable across renders.
  const byCategory: Record<SystemAutomationCategory, SystemAutomation[]> = {
    'lead-ingestion':     [],
    'lead-source-flow':   [],
    'stage-transition':   [],
    'notifications':      [],
    'branch-management':  [],
    'sibling-handling':   [],
  }
  for (const a of SYSTEM_AUTOMATIONS) byCategory[a.category].push(a)

  return (
    <section className="mb-8 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <header className="mb-3 flex items-center gap-2">
        <Cog className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          System Automations
        </h2>
        <Badge variant="secondary" className="text-[10px]">Built-in</Badge>
        <p className="ml-auto text-[11px] italic text-slate-500 dark:text-slate-400">
          Hard-coded flows that run automatically. Read-only.
        </p>
      </header>

      <div className="space-y-4">
        {(Object.keys(byCategory) as SystemAutomationCategory[]).map((cat) => {
          const items = byCategory[cat]
          if (items.length === 0) return null
          return (
            <div key={cat}>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {SYSTEM_AUTOMATION_CATEGORY_LABELS[cat]}
              </h3>
              <ul className="space-y-1.5">
                {items.map((a) => {
                  const isOpen = expanded === a.id
                  return (
                    <li
                      key={a.id}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : a.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                            {a.name}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {a.summary}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {SYSTEM_AUTOMATION_CATEGORY_LABELS[a.category]}
                        </Badge>
                      </button>

                      {isOpen && (
                        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-3 py-3 text-xs dark:border-slate-700 dark:bg-slate-800/30">
                          <div>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Trigger
                            </p>
                            <p className="text-slate-700 dark:text-slate-300">{a.trigger}</p>
                          </div>
                          <div>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Actions
                            </p>
                            <ol className="list-decimal space-y-0.5 pl-4 text-slate-700 dark:text-slate-300">
                              {a.actions.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              <FileCode className="h-3 w-3" /> Source files
                            </p>
                            <ul className="space-y-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              {a.sources.map((src) => (
                                <li key={src} className="truncate" title={src}>{src}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
