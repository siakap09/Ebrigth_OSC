'use client'

import Link from 'next/link'
import { GripVertical, User } from 'lucide-react'
import { cn, formatMYR, formatDate } from '@/lib/crm/utils'
import { getAgeCategory, ageCategoryClasses } from '@/lib/crm/age-category'
import type { OpportunityCard } from '@/server/queries/opportunities'
import { formatDistanceToNow } from 'date-fns'

// ─── Lead source icons ────────────────────────────────────────────────────────

function LeadSourceIcon({ name }: { name: string }) {
  const lower = name.toLowerCase()

  if (lower.includes('facebook') || lower.includes('meta')) {
    return (
      <span
        title={name}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
      >
        fb
      </span>
    )
  }
  if (lower.includes('tiktok')) {
    return (
      <span
        title={name}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold bg-slate-900 text-white"
      >
        tt
      </span>
    )
  }
  if (lower.includes('instagram')) {
    return (
      <span
        title={name}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300"
      >
        ig
      </span>
    )
  }
  if (lower.includes('walk') || lower.includes('referral')) {
    return (
      <span
        title={name}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
      >
        rf
      </span>
    )
  }
  if (lower.includes('whatsapp') || lower.includes('wa')) {
    return (
      <span
        title={name}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
      >
        wa
      </span>
    )
  }
  return (
    <span
      title={name}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
    >
      ?
    </span>
  )
}

// ─── Color coding by age in stage ────────────────────────────────────────────

function getAgeColor(
  lastStageChangeAt: Date,
  stuckHoursYellow = 24,
  stuckHoursRed = 48,
): string {
  const hoursElapsed =
    (Date.now() - new Date(lastStageChangeAt).getTime()) / (1000 * 60 * 60)

  if (hoursElapsed < stuckHoursYellow) return 'border-l-green-400'
  if (hoursElapsed < stuckHoursRed) return 'border-l-yellow-400'
  return 'border-l-red-400'
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({
  user,
}: {
  user: { name: string | null; email: string; image: string | null }
}) {
  const initials = user.name
    ? user.name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('')
    : user.email.slice(0, 2).toUpperCase()

  return (
    <div
      title={user.name ?? user.email}
      className="relative group"
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt={user.name ?? user.email}
          className="h-6 w-6 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-[9px] font-semibold">
          {initials}
        </div>
      )}
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20">
        <div className="rounded bg-slate-900 text-white text-xs px-2 py-1 whitespace-nowrap shadow-lg">
          {user.name ?? user.email}
        </div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  opportunity: OpportunityCard
  stageShortCode?: string
  stageName?: string
  stuckHoursYellow?: number
  stuckHoursRed?: number
  isSelected?: boolean
  dragHandleProps?: Record<string, unknown>
  isDragging?: boolean
  onClick?: () => void
  /**
   * Toggle this card's bulk-selection state. When omitted the checkbox isn't
   * rendered (e.g. read-only views). Wired up through the kanban board so the
   * shared `selectedIds` set stays the source of truth.
   */
  onToggleSelect?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KanbanCard({
  opportunity,
  stageShortCode,
  stageName,
  stuckHoursYellow = 24,
  stuckHoursRed = 48,
  isSelected = false,
  dragHandleProps,
  isDragging = false,
  onClick,
  onToggleSelect,
}: KanbanCardProps) {
  const { contact } = opportunity

  // With master_leads_base as the source of truth, the contact's first/last
  // name IS the child when parentFullName is set (sibling-exploded row), or
  // the parent themself otherwise. childAge1 still holds the child's age in
  // both flows (legacy childName1 is unused for new ingest).
  const isChild = !!contact.parentFullName
  const primaryChildName = isChild
    ? `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''}`
    : contact.childName1
  const primaryChildAge = contact.childAge1

  const ageColor = getAgeColor(
    opportunity.lastStageChangeAt,
    stuckHoursYellow,
    stuckHoursRed,
  )

  const relativeTime = formatDistanceToNow(new Date(opportunity.lastStageChangeAt), {
    addSuffix: true,
  })

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-l-4 bg-white dark:bg-slate-800',
        'border-slate-200 dark:border-slate-700 shadow-sm',
        'transition-all duration-150',
        ageColor,
        isDragging && 'shadow-xl rotate-1 opacity-90 scale-[1.02]',
        isSelected && 'ring-2 ring-indigo-500 ring-offset-1',
        'hover:shadow-md cursor-pointer',
      )}
      onClick={(e) => {
        // Don't trigger click if the user was dragging or clicked the drag handle
        const target = e.target as HTMLElement
        if (target.closest('[data-drag-handle="true"]')) return
        onClick?.()
      }}
    >
      <div className="flex items-start gap-1 p-2.5">
        {/* Bulk-select checkbox — hidden until hover, sticky once selected. */}
        {onToggleSelect && (
          <label
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'flex shrink-0 items-center justify-center self-start mt-0.5 cursor-pointer',
              'transition-opacity',
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            )}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation()
                onToggleSelect()
              }}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-700"
              aria-label={`Select ${contact.firstName}`}
            />
          </label>
        )}

        {/* Drag handle */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center justify-center self-stretch -ml-1 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Child name + age category */}
          {primaryChildName ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                href={`/crm/opportunities/${opportunity.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-slate-900 dark:text-white truncate hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-2"
                title="Open lead detail"
              >
                {primaryChildName}
              </Link>
              {primaryChildAge && (() => {
                const category = getAgeCategory(primaryChildAge)
                if (category) {
                  return (
                    <span
                      title={`${primaryChildAge} — ${category}`}
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        ageCategoryClasses(category),
                      )}
                    >
                      {category}
                    </span>
                  )
                }
                return (
                  <span className="shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                    {primaryChildAge}
                  </span>
                )
              })()}
            </div>
          ) : (
            <Link
              href={`/crm/opportunities/${opportunity.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-slate-900 dark:text-white truncate hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-2"
              title="Open lead detail"
            >
              {contact.firstName} {contact.lastName ?? ''}
            </Link>
          )}

          {/* Parent name — shown below child name when this contact represents a child */}
          {primaryChildName && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {isChild
                ? contact.parentFullName
                : `${contact.firstName} ${contact.lastName ?? ''}`}
            </p>
          )}

          {/* Tags */}
          {contact.contactTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contact.contactTags.slice(0, 3).map(({ tag }) => (
                <span
                  key={tag.id}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
              {contact.contactTags.length > 3 && (
                <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                  +{contact.contactTags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Bottom row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {/* Lead source */}
              {contact.leadSource && (
                <LeadSourceIcon name={contact.leadSource.name} />
              )}

              {/* Value */}
              {Number(opportunity.value) > 0 && (
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  {formatMYR(Number(opportunity.value))}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Time in stage */}
              <span
                className="text-[10px] text-slate-400 dark:text-slate-500"
                title={`Last moved: ${formatDate(opportunity.lastStageChangeAt)}`}
              >
                {relativeTime}
              </span>

              {/* Assigned user avatar */}
              {opportunity.assignedUser ? (
                <UserAvatar user={opportunity.assignedUser} />
              ) : (
                <div
                  title="Unassigned"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400"
                >
                  <User className="h-3 w-3" />
                </div>
              )}
            </div>
          </div>

          {/* Stage abbreviation pill at the bottom */}
          {stageShortCode && (
            <div className="mt-1 flex justify-end">
              <span
                title={stageName}
                className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200"
              >
                {stageShortCode}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
