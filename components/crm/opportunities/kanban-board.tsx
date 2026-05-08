'use client'

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { Plus, Search, X, Loader2, ChevronDown, Users, CalendarRange, AlertTriangle, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import { cn, formatMYR, formatDate } from '@/lib/crm/utils'
import { useKanban, useMoveOpportunity, useOpportunity, useDeleteOpportunity } from '@/hooks/crm/useOpportunities'
import { getAgeCategory, ageCategoryClasses, formatChildAge } from '@/lib/crm/age-category'
import { Trash2 } from 'lucide-react'
import { useBranchContext } from '../branch-context'
import { KanbanCard } from './kanban-card'
import { StageChangeModal } from './stage-change-modal'
import { OpportunityModal } from './opportunity-modal'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import type { KanbanStage, OpportunityCard } from '@/server/queries/opportunities'

// ─── Lead transition rules ───────────────────────────────────────────────────
// Maps each stage to the set of stages a lead is allowed to move to next, as
// defined by the business flow chart. Short codes are normalized (uppercase,
// underscores stripped) so UR_W1 and URW1 compare equal. Missing key = no
// rule applies (used for HR/non-lead pipelines). Empty array = terminal stage.

function normalizeStageCode(code: string): string {
  return code.toUpperCase().replace(/_/g, '')
}

const ALLOWED_LEAD_TRANSITIONS: Record<string, string[]> = {
  NL: ['FU1'],
  FU1: ['FU2', 'CT', 'DND'],
  FU2: ['FU3', 'CT', 'DND'],
  FU3: ['RSD', 'URW1', 'CT', 'DND'],
  RSD: ['CT', 'DND'],
  CT: ['SU', 'CNS'],
  CNS: ['URW1'],
  URW1: ['URW2', 'CL', 'DND'],
  URW2: ['FU3M', 'CL', 'DND'],
  FU3M: ['CL', 'DND'],
  SU: ['ENR', 'SNE'],
  SNE: ['CL'],
  ENR: [],
  CL: [],
  DND: [],
  // Self-Generated is an entry state — allow hand-off into early/confirmed stages.
  SG: ['NL', 'FU1', 'FU2', 'FU3', 'CT'],
}

function isLeadTransitionAllowed(fromShortCode: string, toShortCode: string): boolean {
  const from = normalizeStageCode(fromShortCode)
  const to = normalizeStageCode(toShortCode)
  const allowed = ALLOWED_LEAD_TRANSITIONS[from]
  if (allowed === undefined) return true
  return allowed.includes(to)
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

// ─── Virtual list for a column ────────────────────────────────────────────────

const CARD_HEIGHT = 96 // approximate px height per card
const CARD_GAP = 8

function VirtualColumnList({
  items,
  stuckHoursYellow,
  stuckHoursRed,
  selectedIds,
  stageShortCode,
  stageName,
  onCardClick,
  onToggleSelect,
}: {
  items: OpportunityCard[]
  stuckHoursYellow: number
  stuckHoursRed: number
  selectedIds: Set<string>
  stageShortCode?: string
  stageName?: string
  onCardClick?: (opp: OpportunityCard) => void
  onToggleSelect?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerHeight(el.clientHeight)
    const obs = new ResizeObserver(() => setContainerHeight(el.clientHeight))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const itemHeight = CARD_HEIGHT + CARD_GAP

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2)
  const visibleCount = Math.ceil(containerHeight / itemHeight) + 4
  const endIndex = Math.min(items.length, startIndex + visibleCount)

  const visibleItems = items.slice(startIndex, endIndex)
  const topSpacer = startIndex * itemHeight
  const bottomSpacer = (items.length - endIndex) * itemHeight

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto pr-1"
      style={{ minHeight: 80 }}
    >
      {/* Top spacer keeps scroll position accurate */}
      {topSpacer > 0 && (
        <div style={{ height: topSpacer }} aria-hidden="true" />
      )}
      {visibleItems.map((opp, localIdx) => {
        const index = startIndex + localIdx
        return (
          <Draggable key={opp.id} draggableId={opp.id} index={index}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                style={{
                  ...provided.draggableProps.style,
                  marginBottom: CARD_GAP,
                }}
              >
                <KanbanCard
                  opportunity={opp}
                  stageShortCode={stageShortCode}
                  stageName={stageName}
                  stuckHoursYellow={stuckHoursYellow}
                  stuckHoursRed={stuckHoursRed}
                  isSelected={selectedIds.has(opp.id)}
                  dragHandleProps={provided.dragHandleProps as unknown as Record<string, unknown>}
                  isDragging={snapshot.isDragging}
                  onClick={() => onCardClick?.(opp)}
                  onToggleSelect={onToggleSelect ? () => onToggleSelect(opp.id) : undefined}
                />
              </div>
            )}
          </Draggable>
        )
      })}
      {/* Bottom spacer */}
      {bottomSpacer > 0 && (
        <div style={{ height: bottomSpacer }} aria-hidden="true" />
      )}
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  selectedIds,
  onAddCard,
  onCardClick,
  onToggleSelect,
}: {
  stage: KanbanStage
  selectedIds: Set<string>
  onAddCard: (stageId: string) => void
  onCardClick?: (opp: OpportunityCard) => void
  onToggleSelect?: (id: string) => void
}) {
  const totalValue = stage.opportunities.reduce(
    (sum, o) => sum + Number(o.value),
    0,
  )

  return (
    <div className="flex flex-col w-72 shrink-0 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700">
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: stage.color || '#6366f1' }}
        />
        <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-white">
          {stage.name}
        </span>
        <span className="shrink-0 rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
          {stage.shortCode}
        </span>
        <span className="shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
          {stage.opportunities.length}
        </span>
        <button
          onClick={() => onAddCard(stage.id)}
          title="Add opportunity"
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Value summary */}
      <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {formatMYR(totalValue)} total
        </p>
      </div>

      {/* Cards */}
      <Droppable droppableId={stage.id} type="CARD">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex flex-col p-2 flex-1 min-h-20 transition-colors',
              snapshot.isDraggingOver &&
                'bg-indigo-50 dark:bg-indigo-950/30',
            )}
            style={{ minHeight: 80 }}
          >
            <VirtualColumnList
              items={stage.opportunities}
              stuckHoursYellow={stage.stuckHoursYellow}
              stuckHoursRed={stage.stuckHoursRed}
              selectedIds={selectedIds}
              stageShortCode={stage.shortCode}
              stageName={stage.name}
              onCardClick={onCardClick}
              onToggleSelect={onToggleSelect}
            />
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

// ─── Filters bar ─────────────────────────────────────────────────────────────

interface Pipeline {
  id: string
  name: string
  branchId: string
  stages: { id: string; name: string; order: number }[]
}

interface BranchUser {
  id: string
  name: string | null
  email: string
}

export type WeekFilter = 'this' | 'next' | 'last' | 'custom' | 'all'

/**
 * Resolve the selected preset into a concrete {from, to} Date range (inclusive
 * on both ends). Returns null when no filter should be applied (i.e. "all").
 * Weeks are Monday-start, matching local business convention.
 */
function resolveRange(
  filter: WeekFilter,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date } | null {
  if (filter === 'all') return null
  const now = new Date()
  if (filter === 'this') {
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }),
      to: endOfWeek(now, { weekStartsOn: 1 }),
    }
  }
  if (filter === 'next') {
    const d = addWeeks(now, 1)
    return {
      from: startOfWeek(d, { weekStartsOn: 1 }),
      to: endOfWeek(d, { weekStartsOn: 1 }),
    }
  }
  if (filter === 'last') {
    const d = addWeeks(now, -1)
    return {
      from: startOfWeek(d, { weekStartsOn: 1 }),
      to: endOfWeek(d, { weekStartsOn: 1 }),
    }
  }
  // custom — inclusive range; guard against empty inputs
  if (!customFrom || !customTo) return null
  return {
    from: new Date(`${customFrom}T00:00:00`),
    to: new Date(`${customTo}T23:59:59.999`),
  }
}

interface FiltersBarProps {
  pipelines: Pipeline[]
  selectedPipelineId: string
  onPipelineChange: (id: string) => void
  search: string
  onSearchChange: (s: string) => void
  selectedBranchId: string | undefined
  onBranchChange: (id: string | undefined) => void
  branches: { id: string; name: string }[]
  canSwitchPipelines?: boolean
  /** When true, the pipeline picker is read-only — driven by the topbar branch
   *  switcher selecting a specific branch. */
  pipelineLocked?: boolean
  weekFilter: WeekFilter
  onWeekFilterChange: (f: WeekFilter) => void
  customFrom: string
  customTo: string
  onCustomFromChange: (s: string) => void
  onCustomToChange: (s: string) => void
}

function FiltersBar({
  pipelines,
  selectedPipelineId,
  onPipelineChange,
  search,
  onSearchChange,
  canSwitchPipelines = true,
  pipelineLocked = false,
  weekFilter,
  onWeekFilterChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: FiltersBarProps) {
  const pipelineDisabled = !canSwitchPipelines || pipelineLocked
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* Pipeline selector — locked when topbar branch is fixed, or for BMs */}
      <div className="relative">
        <select
          value={selectedPipelineId}
          onChange={(e) => onPipelineChange(e.target.value)}
          disabled={pipelineDisabled}
          title={
            pipelineLocked
              ? 'Locked by topbar branch view'
              : !canSwitchPipelines
                ? 'Locked to your branch'
                : undefined
          }
          className={cn(
            'appearance-none rounded-lg border border-slate-300 dark:border-slate-600',
            'bg-white dark:bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-900 dark:text-white',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500',
            pipelineDisabled && 'cursor-not-allowed opacity-70',
          )}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search contacts..."
          className={cn(
            'rounded-lg border border-slate-300 dark:border-slate-600',
            'bg-white dark:bg-slate-800 pl-8 pr-8 py-1.5 text-sm w-52',
            'text-slate-900 dark:text-white placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500',
          )}
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Week filter */}
      <div className="relative">
        <CalendarRange className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <select
          value={weekFilter}
          onChange={(e) => onWeekFilterChange(e.target.value as WeekFilter)}
          className={cn(
            'appearance-none rounded-lg border border-slate-300 dark:border-slate-600',
            'bg-white dark:bg-slate-800 pl-8 pr-8 py-1.5 text-sm text-slate-900 dark:text-white',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500',
          )}
        >
          <option value="this">This week</option>
          <option value="next">Next week</option>
          <option value="last">Last week</option>
          <option value="custom">Custom range…</option>
          <option value="all">All</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      </div>

      {weekFilter === 'custom' && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-xs text-slate-400">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}
    </div>
  )
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────

function BulkActionBar({
  count,
  stages,
  onMoveAll,
  onDeleteAll,
  onClear,
}: {
  count: number
  stages: KanbanStage[]
  onMoveAll: (toStageId: string) => void
  onDeleteAll: () => void
  onClear: () => void
}) {
  const [targetStage, setTargetStage] = useState('')

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-indigo-600 text-white text-sm font-medium">
      <span>{count} selected</span>
      <div className="flex items-center gap-2 ml-auto">
        <select
          value={targetStage}
          onChange={(e) => setTargetStage(e.target.value)}
          className="rounded bg-white/20 border border-white/30 px-2 py-1 text-sm text-white focus:outline-none"
        >
          <option value="">Move to stage...</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => targetStage && onMoveAll(targetStage)}
          disabled={!targetStage}
          className="rounded bg-white/20 px-3 py-1 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Move all
        </button>
        <button
          onClick={onDeleteAll}
          className="rounded bg-red-500/80 px-3 py-1 hover:bg-red-500 transition-colors"
        >
          Delete all
        </button>
        <button
          onClick={onClear}
          className="rounded bg-white/20 px-3 py-1 hover:bg-white/30 transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

// ─── Main KanbanBoard ─────────────────────────────────────────────────────────

interface KanbanBoardProps {
  initialPipelineId: string
  pipelines: Pipeline[]
  branches: { id: string; name: string }[]
  users: BranchUser[]
  defaultBranchId?: string
  /** When false (BRANCH_MANAGER and below), the pipeline dropdown is locked. */
  canSwitchBranches?: boolean
}

export function KanbanBoard({
  initialPipelineId,
  pipelines,
  branches,
  users,
  defaultBranchId,
  canSwitchBranches = true,
}: KanbanBoardProps) {
  const [selectedPipelineId, setSelectedPipelineId] = useState(initialPipelineId)
  const [searchInput, setSearchInput] = useState('')
  // Branch filter UI was removed — the pipeline selector already implies a single
  // branch. This state is kept in sync with the selected pipeline so the
  // "Add card" modal pre-fills the right branch.
  const [selectedBranchId, setSelectedBranchId] = useState<string | undefined>(defaultBranchId)

  // Keep selectedBranchId aligned with the current pipeline's branch
  useEffect(() => {
    const current = pipelines.find((p) => p.id === selectedPipelineId)
    if (current && current.branchId) setSelectedBranchId(current.branchId)
  }, [selectedPipelineId, pipelines])

  // Cross-page branch switcher — when the super_admin picks a branch from the
  // top-bar switcher, auto-jump to that branch's pipeline (and fall back to the
  // "All Branches" synthetic pipeline when they go back to Agency View).
  const { selectedBranch: contextBranch } = useBranchContext()
  useEffect(() => {
    if (contextBranch) {
      const match = pipelines.find((p) => p.branchId === contextBranch.id && !p.id.startsWith('all:'))
      if (match && match.id !== selectedPipelineId) setSelectedPipelineId(match.id)
    } else {
      const allPipe = pipelines.find((p) => p.id.startsWith('all:'))
      if (allPipe && allPipe.id !== selectedPipelineId) setSelectedPipelineId(allPipe.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextBranch?.id])
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('this')
  const [customFrom, setCustomFrom] = useState<string>('')
  const [customTo, setCustomTo] = useState<string>('')
  const search = useDebounce(searchInput, 350)

  // Always pass undefined for branchId — the pipeline itself already scopes to one branch.
  const { data, isLoading, isError, refetch } = useKanban(
    selectedPipelineId,
    undefined,
    search,
  )

  const moveMutation = useMoveOpportunity()

  // Optimistic local state
  const [localStages, setLocalStages] = useState<KanbanStage[] | null>(null)

  useEffect(() => {
    if (data?.stages) setLocalStages(data.stages)
  }, [data])

  const stages = localStages ?? data?.stages ?? []

  // Pending move (for modal)
  const [pendingMove, setPendingMove] = useState<{
    opportunityId: string
    branchId: string
    fromStageId: string
    toStageId: string
    fromStageName: string
    toStageName: string
    previousStages: KanbanStage[]
  } | null>(null)
  // Blocked move (for invalid-transition popup — non-admins only)
  const [blockedMove, setBlockedMove] = useState<{
    fromStageName: string
    fromShortCode: string
    toStageName: string
    toShortCode: string
    allowedStages: Array<{ id: string; name: string; shortCode: string }>
  } | null>(null)
  const [moveNote, setMoveNote] = useState('')
  const [trialDate, setTrialDate] = useState<string>('')
  const [trialTimeSlot, setTrialTimeSlot] = useState<string>('')
  const [enrollmentMonths, setEnrollmentMonths] = useState<3 | 6 | 9 | 12 | undefined>(undefined)
  const [rescheduleDate, setRescheduleDate] = useState<string>('')
  // Local pending flag scoped to the modal confirm action. Using
  // moveMutation.isPending directly would leak state from any other in-flight
  // fire-and-forget move happening on the board at the same time.
  const [isConfirming, setIsConfirming] = useState(false)

  function resetStageExtras() {
    setMoveNote('')
    setTrialDate('')
    setTrialTimeSlot('')
    setEnrollmentMonths(undefined)
    setRescheduleDate('')
  }

  // Selected cards (bulk)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Add card modal (from stage "+" button — pre-fills stageId)
  const [addCardStageId, setAddCardStageId] = useState<string | null>(null)
  // Global "New Opportunity" modal (from top bar button — full pipeline picker)
  const [showNewOpportunity, setShowNewOpportunity] = useState(false)
  // Card detail modal
  const [detailCard, setDetailCard] = useState<OpportunityCard | null>(null)

  // Filter by creation-week range (client-side)
  const filteredStages = useMemo(() => {
    const range = resolveRange(weekFilter, customFrom, customTo)
    if (!range) return stages
    return stages.map((stage) => ({
      ...stage,
      opportunities: stage.opportunities.filter((o) => {
        const created = new Date(o.createdAt)
        if (created < range.from || created > range.to) return false
        return true
      }),
    }))
  }, [stages, weekFilter, customFrom, customTo])

  // ── Drag & Drop ──────────────────────────────────────────────────────────────

  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result
      if (!destination || source.droppableId === destination.droppableId) return

      const fromStage = stages.find((s) => s.id === source.droppableId)
      const toStage = stages.find((s) => s.id === destination.droppableId)
      if (!fromStage || !toStage) return

      // Lead pipelines follow the business flow chart. Super/agency admins
      // bypass the rule (canSwitchBranches flag); everyone else can only move
      // a lead along the allowed edges and gets an Acknowledge popup otherwise.
      // HR Recruitment is exempt since its flow is non-linear.
      const currentPipelineName = pipelines.find((p) => p.id === selectedPipelineId)?.name ?? ''
      const isLeadPipeline = !/recruitment/i.test(currentPipelineName) && !currentPipelineName.startsWith('Ebright HR')
      if (
        isLeadPipeline &&
        !canSwitchBranches &&
        !isLeadTransitionAllowed(fromStage.shortCode, toStage.shortCode)
      ) {
        const allowedCodes =
          ALLOWED_LEAD_TRANSITIONS[normalizeStageCode(fromStage.shortCode)] ?? []
        const allowedStages = allowedCodes
          .map((code) =>
            stages.find((s) => normalizeStageCode(s.shortCode) === code),
          )
          .filter((s): s is KanbanStage => !!s)
          .map((s) => ({ id: s.id, name: s.name, shortCode: s.shortCode }))
        setBlockedMove({
          fromStageName: fromStage.name,
          fromShortCode: fromStage.shortCode,
          toStageName: toStage.name,
          toShortCode: toStage.shortCode,
          allowedStages,
        })
        return
      }

      // Snapshot for rollback
      const previousStages = JSON.parse(JSON.stringify(stages)) as KanbanStage[]

      // Optimistic update
      const card = fromStage.opportunities.find((o) => o.id === draggableId)
      if (!card) return

      setLocalStages((prev) => {
        if (!prev) return prev
        return prev.map((stage) => {
          if (stage.id === source.droppableId) {
            return {
              ...stage,
              opportunities: stage.opportunities.filter((o) => o.id !== draggableId),
            }
          }
          if (stage.id === destination.droppableId) {
            const newOpps = [...stage.opportunities]
            newOpps.splice(destination.index, 0, {
              ...card,
              stageId: destination.droppableId,
              lastStageChangeAt: new Date(),
            })
            return { ...stage, opportunities: newOpps }
          }
          return stage
        })
      })

      const normalized = toStage.name.trim().toLowerCase()
      const requiresModal =
        normalized === 'confirmed for trial' ||
        normalized === 'enrolled' ||
        normalized === 'reschedule'

      if (requiresModal) {
        // Show popup to collect trial date/slot or enrollment months
        setPendingMove({
          opportunityId: draggableId,
          branchId: card.branchId,
          fromStageId: source.droppableId,
          toStageId: destination.droppableId,
          fromStageName: fromStage.name,
          toStageName: toStage.name,
          previousStages,
        })
        resetStageExtras()
      } else {
        // Fire-and-forget move for every other stage (no confirmation needed)
        void (async () => {
          try {
            await moveMutation.mutateAsync({
              opportunityId: draggableId,
              toStageId: destination.droppableId,
            })
            toast.success(`Moved to ${toStage.name}`)
          } catch {
            setLocalStages(previousStages)
            toast.error('Failed to move opportunity')
          }
        })()
      }
    },
    [stages, moveMutation, pipelines, selectedPipelineId, canSwitchBranches],
  )

  // Confirm move
  async function confirmMove() {
    if (!pendingMove || isConfirming) return
    setIsConfirming(true)

    try {
      await moveMutation.mutateAsync({
        opportunityId: pendingMove.opportunityId,
        toStageId: pendingMove.toStageId,
        note: moveNote || undefined,
        trialDate: trialDate || undefined,
        trialTimeSlot: trialTimeSlot || undefined,
        enrollmentMonths,
        rescheduleDate: rescheduleDate || undefined,
      })
      toast.success('Opportunity moved')
    } catch {
      // Rollback
      setLocalStages(pendingMove.previousStages)
      toast.error('Failed to move opportunity')
    } finally {
      setIsConfirming(false)
      setPendingMove(null)
      resetStageExtras()
    }
  }

  // Cancel move (rollback)
  function cancelMove() {
    if (pendingMove) {
      setLocalStages(pendingMove.previousStages)
    }
    setPendingMove(null)
    resetStageExtras()
  }

  // Bulk move
  async function handleBulkMove(toStageId: string) {
    const ids = Array.from(selectedIds)
    try {
      const res = await fetch('/api/crm/opportunities/bulk/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityIds: ids, toStageId }),
      })
      if (!res.ok) throw new Error('Bulk move failed')
      const data = (await res.json()) as { moved: number }
      toast.success(`Moved ${data.moved} opportunities`)
      setSelectedIds(new Set())
      void refetch()
    } catch {
      toast.error('Bulk move failed')
    }
  }

  // Bulk delete (soft-delete; recoverable from the database via deletedAt).
  // The CONFIRM-typed dialog gates the actual call; this just opens it.
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

  function openBulkDelete() {
    if (selectedIds.size === 0) return
    setBulkDeleteOpen(true)
  }

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      setBulkDeleteOpen(false)
      return
    }
    setBulkDeletePending(true)
    try {
      const res = await fetch('/api/crm/opportunities/bulk/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityIds: ids }),
      })
      if (!res.ok) throw new Error('Bulk delete failed')
      const data = (await res.json()) as { deleted: number }
      toast.success(`Deleted ${data.deleted} opportunit${data.deleted === 1 ? 'y' : 'ies'}`)
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      void refetch()
    } catch {
      toast.error('Bulk delete failed')
    } finally {
      setBulkDeletePending(false)
    }
  }

  // Toggle one card's selection state (called from KanbanCard's checkbox).
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      {/* Top actions bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {/* Count must match the cards rendered. Use filteredStages — which
              has the week-filter and any other client-side filters applied —
              not the raw `data` from the API. */}
          {filteredStages.reduce((acc, s) => acc + s.opportunities.length, 0)} opportunities
        </span>
        <button
          type="button"
          onClick={() => setShowNewOpportunity(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          New Opportunity
        </button>
      </div>

      {/* Filters */}
      <FiltersBar
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        onPipelineChange={setSelectedPipelineId}
        search={searchInput}
        onSearchChange={setSearchInput}
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
        branches={branches}
        canSwitchPipelines={canSwitchBranches}
        // Lock the pipeline dropdown when the topbar branch view is set to a
        // specific branch — otherwise the user could override their own scope.
        pipelineLocked={!!contextBranch}
        weekFilter={weekFilter}
        onWeekFilterChange={setWeekFilter}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          stages={filteredStages}
          onMoveAll={handleBulkMove}
          onDeleteAll={openBulkDelete}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Bulk-delete CONFIRM dialog */}
      <DeleteConfirmDialog
        open={bulkDeleteOpen}
        count={selectedIds.size}
        loading={bulkDeletePending}
        onClose={() => !bulkDeletePending && setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />

      {/* Board */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
            <p className="text-sm">Failed to load kanban board.</p>
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filteredStages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-400 text-sm">
            No stages found for this pipeline.
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex h-full gap-4 p-4 items-start">
              {filteredStages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  selectedIds={selectedIds}
                  onAddCard={(stageId) => setAddCardStageId(stageId)}
                  onCardClick={setDetailCard}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          </DragDropContext>
        )}
      </div>

      {/* Stage change modal */}
      {pendingMove && (
        <StageChangeModal
          branchId={pendingMove.branchId}
          fromStageName={pendingMove.fromStageName}
          toStageName={pendingMove.toStageName}
          note={moveNote}
          onNoteChange={setMoveNote}
          trialDate={trialDate}
          trialTimeSlot={trialTimeSlot}
          enrollmentMonths={enrollmentMonths}
          rescheduleDate={rescheduleDate}
          onTrialDateChange={setTrialDate}
          onTrialTimeSlotChange={setTrialTimeSlot}
          onEnrollmentMonthsChange={setEnrollmentMonths}
          onRescheduleDateChange={setRescheduleDate}
          onConfirm={confirmMove}
          onCancel={cancelMove}
          isPending={isConfirming}
        />
      )}

      {/* Create opportunity modal — from stage "+" button */}
      {addCardStageId && selectedPipeline && (
        <OpportunityModal
          pipelines={[selectedPipeline]}
          users={users}
          defaultPipelineId={selectedPipelineId}
          defaultStageId={addCardStageId}
          onClose={() => setAddCardStageId(null)}
          onSuccess={() => void refetch()}
        />
      )}

      {/* Create opportunity modal — from top bar button (full pipeline picker) */}
      {showNewOpportunity && (
        <OpportunityModal
          pipelines={pipelines}
          users={users}
          defaultPipelineId={
            selectedPipelineId.startsWith('all:') ? pipelines.find((p) => !p.id.startsWith('all:'))?.id : selectedPipelineId
          }
          onClose={() => setShowNewOpportunity(false)}
          onSuccess={() => void refetch()}
        />
      )}

      {/* Card detail modal — opens when a kanban card is clicked */}
      {detailCard && (
        <OpportunityDetailModal
          opportunity={detailCard}
          stageName={stages.find((s) => s.id === detailCard.stageId)?.name ?? '—'}
          stageShortCode={stages.find((s) => s.id === detailCard.stageId)?.shortCode ?? ''}
          branchName={branches.find((b) => b.id === detailCard.branchId)?.name ?? null}
          canDelete={canSwitchBranches}
          onClose={() => setDetailCard(null)}
        />
      )}

      {/* Invalid-transition warning popup — shown when a non-admin drags a
          lead to a stage that isn't allowed by the pipeline flow chart. */}
      {blockedMove && (
        <TransitionBlockedModal
          fromStageName={blockedMove.fromStageName}
          fromShortCode={blockedMove.fromShortCode}
          toStageName={blockedMove.toStageName}
          toShortCode={blockedMove.toShortCode}
          allowedStages={blockedMove.allowedStages}
          onClose={() => setBlockedMove(null)}
        />
      )}
    </div>
  )
}

// ─── Opportunity detail modal ─────────────────────────────────────────────────

type StageLite = { id: string; name: string; shortCode: string; order: number }
type HistoryEntry = {
  id: string
  changedAt: string | Date
  toStage: StageLite | null
  fromStage: StageLite | null
}

/**
 * Build the lead's actual journey from stage-history rows. We walk the history
 * in chronological order and keep each new toStage encountered. If the current
 * stage isn't in the history (stale/inconsistent data) we append it so the
 * strip always ends on where the lead is right now.
 */
function buildJourneyFromHistory(
  history: HistoryEntry[] | undefined,
  currentStage: StageLite | undefined,
  currentStageId: string,
): { stages: StageLite[]; currentIdx: number } {
  const stages: StageLite[] = []
  const seen = new Set<string>()

  if (history && history.length > 0) {
    // Incoming history is ordered desc by changedAt — reverse for chronology.
    const chronological = [...history].reverse()
    for (const h of chronological) {
      const s = h.toStage
      if (!s) continue
      if (seen.has(s.id)) continue
      seen.add(s.id)
      stages.push(s)
    }
  }

  // Ensure the current stage ends the journey, even if history lacks it.
  if (currentStage && !seen.has(currentStage.id)) {
    stages.push(currentStage)
    seen.add(currentStage.id)
  }

  let currentIdx = stages.findIndex((s) => s.id === currentStageId)
  if (currentIdx === -1 && stages.length > 0) {
    // Defensive — if IDs don't line up, highlight the last stage we know of.
    currentIdx = stages.length - 1
  }
  return { stages, currentIdx }
}

function OpportunityDetailModal({
  opportunity,
  stageName,
  stageShortCode,
  branchName,
  canDelete,
  onClose,
}: {
  opportunity: OpportunityCard
  stageName: string
  stageShortCode: string
  /** Resolved from the kanban's branch list. Null when not found (e.g. branch deleted). */
  branchName: string | null
  canDelete: boolean
  onClose: () => void
}) {
  const { contact } = opportunity
  const childOwnName = `${contact.firstName} ${contact.lastName ?? ''}`.trim()
  // With master_leads_base as source of truth, the contact IS the child when
  // parentFullName is set. Header shows the child; the Contact section reveals
  // the parent details (the user's "click the card to see parent" requirement).
  const isChild = !!contact.parentFullName
  const headerName = childOwnName || '(No name)'
  const parentName = isChild ? (contact.parentFullName ?? '—') : childOwnName

  const { data: full, isLoading: loadingFull } = useOpportunity(opportunity.id) as {
    data: {
      stage?: StageLite
      stageId?: string
      stageHistory?: HistoryEntry[]
    } | undefined
    isLoading: boolean
  }
  // Prefer the detail API's stage — in the "All Branches" aggregate view the
  // parent's stage lookup uses reference-pipeline IDs that won't match the
  // opportunity's own stageId.
  const currentStageId = full?.stageId ?? opportunity.stageId
  const displayStageName = full?.stage?.name ?? (stageName !== '—' ? stageName : '')
  const displayShortCode = full?.stage?.shortCode ?? stageShortCode
  const journey = buildJourneyFromHistory(full?.stageHistory, full?.stage, currentStageId)

  const deleteMutation = useDeleteOpportunity()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(opportunity.id)
      setConfirmDeleteOpen(false)
      onClose()
    } catch {
      // useDeleteOpportunity already toasts on failure — stay open so the user
      // can retry or cancel.
    }
  }

  const children: Array<{ name: string; age: string | null }> = []
  for (const i of [1, 2, 3, 4] as const) {
    const name = (contact as unknown as Record<string, string | null>)[`childName${i}`]
    const age = (contact as unknown as Record<string, string | null>)[`childAge${i}`]
    if (name) children.push({ name, age })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-white shadow-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{headerName}</h2>
              {displayShortCode && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
                  {displayShortCode}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Stage: {displayStageName || (loadingFull ? 'Loading…' : '—')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4 text-sm">
          {/* Journey — actual stages this lead has been dragged through */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Journey
            </h3>
            {loadingFull ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
              </div>
            ) : journey.stages.length === 0 ? (
              <p className="text-xs italic text-slate-500 dark:text-slate-400">
                No stage history yet.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                {journey.stages.map((s, i) => (
                  <span key={s.id} className="inline-flex items-center">
                    {i > 0 && (
                      <span className="px-0.5 text-xs leading-none text-slate-300 dark:text-slate-600">
                        ›
                      </span>
                    )}
                    <span
                      title={s.name}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wider',
                        i === journey.currentIdx
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : i < journey.currentIdx || journey.currentIdx === -1
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500',
                      )}
                    >
                      {s.shortCode}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Contact */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contact
            </h3>
            <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
              <div className="text-slate-500 dark:text-slate-400">Parent</div>
              <div className="text-slate-900 dark:text-slate-100">{parentName || '—'}</div>
              {isChild && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Child</div>
                  <div className="text-slate-900 dark:text-slate-100">{childOwnName || '—'}</div>
                </>
              )}
              <div className="text-slate-500 dark:text-slate-400">Email</div>
              <div className="text-slate-900 dark:text-slate-100">{contact.email ?? '—'}</div>
              <div className="text-slate-500 dark:text-slate-400">Parent&apos;s Contact</div>
              <div className="text-slate-900 dark:text-slate-100">{contact.phone ?? '—'}</div>
              {contact.leadSource && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Source</div>
                  <div className="text-slate-900 dark:text-slate-100">{contact.leadSource.name}</div>
                </>
              )}
            </div>
          </section>

          {/* Children */}
          {children.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {children.length === 1 ? 'Child' : `Children (${children.length})`}
              </h3>
              <ul className="space-y-1.5">
                {children.map((c, i) => {
                  const category = getAgeCategory(c.age)
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                      {c.age && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                          {formatChildAge(c.age)}
                        </span>
                      )}
                      {category && (
                        <span
                          title={`Category: ${category}`}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            ageCategoryClasses(category),
                          )}
                        >
                          {category}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Tags */}
          {contact.contactTags.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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

          {/* Meta */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Opportunity
            </h3>
            <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
              {branchName && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Branch</div>
                  <div className="text-slate-900 dark:text-slate-100">{branchName}</div>
                </>
              )}
              <div className="text-slate-500 dark:text-slate-400">Last moved</div>
              <div className="text-slate-900 dark:text-slate-100">
                {formatDate(opportunity.lastStageChangeAt)}
              </div>
              {opportunity.assignedUser && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Owner</div>
                  <div className="text-slate-900 dark:text-slate-100">
                    {opportunity.assignedUser.name ?? opportunity.assignedUser.email}
                  </div>
                </>
              )}
              {Number(opportunity.value) > 0 && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Value</div>
                  <div className="text-slate-900 dark:text-slate-100">{formatMYR(Number(opportunity.value))}</div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
          {canDelete ? (
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-4 w-4" /> Delete lead
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Close
          </button>
        </div>
      </div>

      {/* CONFIRM-typed delete dialog — same component used by bulk delete. */}
      <DeleteConfirmDialog
        open={confirmDeleteOpen}
        count={1}
        loading={deleteMutation.isPending}
        onClose={() => !deleteMutation.isPending && setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ─── Invalid-transition warning modal ─────────────────────────────────────────

function TransitionBlockedModal({
  fromStageName,
  fromShortCode,
  toStageName,
  toShortCode,
  allowedStages,
  onClose,
}: {
  fromStageName: string
  fromShortCode: string
  toStageName: string
  toShortCode: string
  allowedStages: Array<{ id: string; name: string; shortCode: string }>
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="transition-blocked-title"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-amber-200 bg-white shadow-2xl dark:border-amber-800/60 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="transition-blocked-title"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Invalid stage transition
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Leads must follow the pipeline flow — you can&apos;t skip ahead.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-center text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {fromStageName}
              <span className="ml-1 text-slate-400">({fromShortCode})</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-red-500" />
            <span className="flex-1 truncate rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-center text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {toStageName}
              <span className="ml-1">({toShortCode})</span>
            </span>
          </div>

          {allowedStages.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                From {fromShortCode}, this lead can only move to:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allowedStages.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                    title={s.name}
                  >
                    <span className="font-bold">{s.shortCode}</span>
                    <span className="opacity-75">— {s.name}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs italic text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              This is a terminal stage — no further moves are allowed.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            onClick={onClose}
            autoFocus
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 active:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  )
}
