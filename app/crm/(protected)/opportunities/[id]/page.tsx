import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MapPin, User, Tag, Clock, ArrowRight, Plus, GraduationCap, Users } from 'lucide-react'
import { format } from 'date-fns'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { getOpportunityById } from '@/server/queries/opportunities'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { getAgeCategory, ageCategoryClasses, formatChildAge, type AgeCategory } from '@/lib/crm/age-category'

export const metadata = {
  title: 'Lead Detail | Ebright CRM',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/login')

  const access = await resolveBranchAccess(session.user.id)
  if (!access) redirect('/crm/awaiting-access')

  const opp = await getOpportunityById(access.tenantId, id)
  if (!opp) notFound()

  // Branch-scope guard: non-elevated users can only view leads in their branches.
  if (!access.elevated && !access.branchIds.includes(opp.branchId)) {
    notFound()
  }

  const branch = await prisma.crm_branch.findUnique({
    where: { id: opp.branchId },
    select: { name: true },
  })

  const contact = opp.contact
  const childOwnName = `${contact.firstName} ${contact.lastName ?? ''}`.trim() || '(No name)'

  // With master_leads_base as source of truth, the contact's first/last name
  // IS the child when parentFullName is set (sibling-exploded row), or IS the
  // parent themself otherwise. childAge1 holds the child's age in both flows.
  type CExt = typeof contact & {
    parentFullName:     string | null
    campaignName:       string | null
    childName1:         string | null
    childAge1:          string | null
    externalSourceTable: string | null
    externalSourceId:    string | null
  }
  const cExt = contact as CExt
  const isChild = !!cExt.parentFullName
  const parentDisplay = isChild ? (cExt.parentFullName ?? '—') : childOwnName
  const studentName = isChild
    ? childOwnName
    : (cExt.childName1?.trim() || childOwnName)
  const studentAge  = cExt.childAge1?.trim() || null
  const studentLevel: AgeCategory | null = getAgeCategory(studentAge)

  // Siblings — for sibling-exploded imports (raw_wix_leads OR master_leads_base),
  // every sibling shares the same parent UUID prefix in externalSourceId. The
  // pattern is "<parent_uuid>#<sibling_index>".
  let siblings: Array<{
    id: string
    name: string
    age: string | null
    level: AgeCategory | null
    opportunityId: string | null
    stageCode: string | null
  }> = []

  if (
    (cExt.externalSourceTable === 'raw_wix_leads' ||
     cExt.externalSourceTable === 'master_leads_base' ||
     cExt.externalSourceTable === 'trial_form') &&
    cExt.externalSourceId?.includes('#')
  ) {
    const parentUuid = cExt.externalSourceId.split('#')[0]
    const rows = await prisma.crm_contact.findMany({
      where: {
        tenantId: access.tenantId,
        externalSourceTable: cExt.externalSourceTable,
        externalSourceId: { startsWith: `${parentUuid}#` },
        id: { not: contact.id },
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        childAge1: true,
        opportunities: {
          where: { deletedAt: null },
          select: { id: true, stage: { select: { shortCode: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { externalSourceId: 'asc' },
    })

    siblings = rows.map((r) => {
      const name = `${r.firstName} ${r.lastName ?? ''}`.trim()
      const age = r.childAge1?.trim() || null
      const opportunity = r.opportunities[0] ?? null
      return {
        id: r.id,
        name,
        age,
        level: getAgeCategory(age),
        opportunityId: opportunity?.id ?? null,
        stageCode: opportunity?.stage?.shortCode ?? null,
      }
    })
  }

  // Build the timeline. Source events:
  //   - Opportunity creation (from opp.createdAt)
  //   - Each stage history row
  // Sorted DESC so the newest event appears at the top, GHL-style.
  type TimelineEvent =
    | { kind: 'created'; at: Date; toStage: string; toCode: string }
    | { kind: 'moved'; at: Date; fromStage: string | null; fromCode: string | null; toStage: string; toCode: string; by: string | null; note: string | null }

  const events: TimelineEvent[] = []
  events.push({
    kind: 'created',
    at: opp.createdAt,
    toStage: opp.stage.name,
    toCode: opp.stage.shortCode,
  })
  for (const h of opp.stageHistory) {
    events.push({
      kind: 'moved',
      at: h.changedAt,
      fromStage: h.fromStage?.name ?? null,
      fromCode: h.fromStage?.shortCode ?? null,
      toStage: h.toStage.name,
      toCode: h.toStage.shortCode,
      by: h.changedByUser?.name ?? h.changedByUser?.email ?? null,
      note: h.note ?? null,
    })
  }
  events.sort((a, b) => b.at.getTime() - a.at.getTime())

  // Group events by calendar day for date dividers in the feed.
  const groupedByDay = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const key = format(e.at, 'yyyy-MM-dd')
    const list = groupedByDay.get(key) ?? []
    list.push(e)
    groupedByDay.set(key, list)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      {/* Back link */}
      <Link
        href="/crm/opportunities"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" /> Back to opportunities
      </Link>

      {/* Header */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                {studentName}
              </h1>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
                {opp.stage.shortCode}
              </span>
            </div>
            {isChild && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Parent: <span className="text-slate-700 dark:text-slate-200">{cExt.parentFullName}</span>
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Stage: <span className="text-slate-700 dark:text-slate-200">{opp.stage.name}</span>
              {' · '}
              Pipeline: <span className="text-slate-700 dark:text-slate-200">{opp.pipeline.name}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Left rail — contact + opportunity facts */}
        <aside className="space-y-4">
          {/* Student — name, age, and the Junior/Mid/Senior level pill. */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Student
            </h3>
            <div className="space-y-2 text-sm">
              <Row icon={<GraduationCap className="h-3.5 w-3.5" />} label="Name" value={studentName} />
              <Row icon={<User className="h-3.5 w-3.5" />} label="Age" value={studentAge ? formatChildAge(studentAge) : '—'} />
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-slate-400"><GraduationCap className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Level</p>
                  {studentLevel ? (
                    <span
                      title={studentLevel}
                      className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${ageCategoryClasses(studentLevel)}`}
                    >
                      {studentLevel[0]}
                    </span>
                  ) : (
                    <p className="text-slate-700 dark:text-slate-200">—</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contact
            </h3>
            <div className="space-y-2 text-sm">
              <Row icon={<User className="h-3.5 w-3.5" />}    label="Parent" value={parentDisplay} />
              <Row icon={<Mail className="h-3.5 w-3.5" />}    label="Email"  value={contact.email ?? '—'} />
              <Row icon={<Phone className="h-3.5 w-3.5" />}   label="Phone"  value={contact.phone ?? '—'} />
              <Row icon={<MapPin className="h-3.5 w-3.5" />}  label="Branch" value={branch?.name ?? '—'} />
              {contact.leadSource && (
                <Row icon={<Tag className="h-3.5 w-3.5" />}   label="Source" value={contact.leadSource.name} />
              )}
              <Row icon={<Tag className="h-3.5 w-3.5" />}     label="Campaign" value={cExt.campaignName || '-'} />
            </div>
          </section>

          {opp.assignedUser && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Owner
              </h3>
              <div className="text-sm text-slate-700 dark:text-slate-200">
                {opp.assignedUser.name ?? opp.assignedUser.email}
              </div>
            </section>
          )}

          {contact.contactTags.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {contact.contactTags.map(({ tag }) => (
                  <span
                    key={tag.id}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Siblings — only shown for Wix sibling-exploded imports. Each
              sibling links to its own lead detail; rows without an active
              opportunity are rendered disabled. */}
          {siblings.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Users className="h-3 w-3" /> Siblings ({siblings.length})
              </h3>
              <ul className="space-y-2">
                {siblings.map((s) => {
                  const inner = (
                    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition-colors hover:bg-indigo-50 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-indigo-950/30 dark:hover:border-indigo-700">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {(s.name[0] ?? '?').toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{s.name || '(No name)'}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {s.age ? formatChildAge(s.age) : '—'}
                        </p>
                      </div>
                      {s.level && (
                        <span
                          title={s.level}
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ageCategoryClasses(s.level)}`}
                        >
                          {s.level[0]}
                        </span>
                      )}
                      {s.stageCode && (
                        <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {s.stageCode}
                        </span>
                      )}
                    </div>
                  )
                  return (
                    <li key={s.id}>
                      {s.opportunityId ? (
                        <Link href={`/crm/opportunities/${s.opportunityId}`} className="block">
                          {inner}
                        </Link>
                      ) : (
                        // No active opportunity → render disabled visual but keep the row visible.
                        <div className="opacity-60 cursor-not-allowed" title="No active opportunity for this sibling">
                          {inner}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </aside>

        {/* Right column — Activity timeline */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <header className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <Clock className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Activity
            </h2>
            <span className="ml-auto text-xs text-slate-400">{events.length} event{events.length === 1 ? '' : 's'}</span>
          </header>

          <div className="max-h-[70vh] overflow-y-auto">
            {Array.from(groupedByDay.entries()).map(([day, list]) => (
              <div key={day}>
                {/* Date divider */}
                <div className="sticky top-0 z-10 flex items-center justify-center bg-slate-50 px-5 py-2 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm dark:bg-slate-900">
                    {format(new Date(day), 'MMM d, yyyy')}
                  </span>
                </div>

                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((e, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          e.kind === 'created'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                            : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
                        }`}
                      >
                        {e.kind === 'created' ? <Plus className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        {e.kind === 'created' ? (
                          <p className="text-slate-700 dark:text-slate-200">
                            <span className="font-semibold">Lead created</span> in stage{' '}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {e.toCode}
                            </span>
                          </p>
                        ) : (
                          <p className="text-slate-700 dark:text-slate-200">
                            <span className="font-semibold">Stage moved</span> from{' '}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {e.fromCode ?? '—'}
                            </span>{' '}
                            <ArrowRight className="inline h-3 w-3 text-slate-400" />{' '}
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                              {e.toCode}
                            </span>
                            {e.by && <span className="text-xs text-slate-500"> by {e.by}</span>}
                          </p>
                        )}
                        {e.kind === 'moved' && e.note && (
                          <p className="mt-0.5 text-xs italic text-slate-500 dark:text-slate-400">
                            “{e.note}”
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {format(e.at, 'HH:mm')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {events.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No activity yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className="truncate text-slate-700 dark:text-slate-200">{value}</p>
      </div>
    </div>
  )
}
