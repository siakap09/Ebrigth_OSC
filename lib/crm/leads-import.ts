/**
 * Shared lead-ingest logic.
 *
 * Used by both:
 *   - prisma/seed-from-powerbi.ts (one-shot bulk import)
 *   - server/workers/leadIngestWorker.ts (LISTEN/NOTIFY realtime + polling backstop)
 *
 * Takes one row from the `public.master_leads_unified` view in ebrightleads_db
 * and either creates a new crm_contact + crm_opportunity, or returns a status
 * explaining why it skipped.
 *
 * Idempotency: relies on the @@unique([tenantId, externalSourceTable,
 * externalSourceId]) constraint. A duplicate insert is caught and turned into
 * `{ status: 'duplicate' }` instead of throwing — so the polling backstop
 * can overlap with LISTEN events without breaking.
 */

import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { normalizePhone } from './utils'

// Importing './queue' transitively pulls in BullMQ + ioredis, which try to
// connect at module load. When Redis is unreachable the leadIngest worker
// must still boot — so we accept enqueueAutomation as an injected callback
// instead, and let the caller decide whether the Redis path is available.
type EnqueueAutomationFn = (data: {
  automationId: string
  contactId: string
  tenantId: string
  triggeredBy: string
  triggerPayload?: unknown
}) => Promise<void>

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Shape of one row from `public.master_leads_unified`. The view yields a
 * single nullable schema across Meta / TikTok / Wix submissions.
 */
export interface UnifiedLeadRow {
  source_table: string          // 'meta_leads' | 'social_posts' | 'raw_wix_leads'
  source_id: string             // PK of the source row, stringified.
                                // For Wix: composite "<uuid>#<sibling_idx>" so each child
                                // gets its own idempotency key.
  lead_source: string | null    // 'Meta' | 'TikTok' | 'Wix' | 'Website' | …
  full_name: string | null      // parent's name; for Wix children we override below
                                // from children_details
  phone: string | null
  email: string | null
  clean_branch: string | null   // resolved via branch_mapping in the view
  region: string | null
  submitted_at: Date | null
  children_details: string | null  // raw JSON string from raw_wix_leads
  sibling_index: number | null     // 1-based; >1 only for Wix multi-child submissions
}

export type ImportStatus =
  | 'created'      // contact + opportunity inserted
  | 'duplicate'    // already imported (unique constraint hit)
  | 'no_branch'    // clean_branch couldn't be matched to any crm_branch
  | 'no_pipeline'  // matched branch has no pipeline (seed not run for it)
  | 'no_pii'       // row has no name/email/phone — not worth creating

export interface ImportResult {
  status: ImportStatus
  contactId?: string
  branchId?: string
  reason?: string
}

export interface TenantContext {
  tenantId: string
}

export interface ImportOptions {
  /**
   * Callback that enqueues a NEW_LEAD automation. Pass `enqueueAutomation`
   * from `lib/crm/queue` here when Redis is up; leave undefined to skip
   * automation firing (seed runs, dev environments without Redis).
   */
  enqueueAutomation?: EnqueueAutomationFn
  /**
   * Override the destination stage shortCode (default 'NL').
   * The seed uses this to preserve historical stage progression from
   * ghl_stages — e.g. a lead that already enrolled lands in 'ENR' rather
   * than 'NL'. The realtime worker leaves this unset, so brand-new
   * submissions always start in 'NL'.
   */
  stageShortCode?: string
}

// ─── Caches ────────────────────────────────────────────────────────────────────
// Each call would otherwise do 4 DB lookups (branch, pipeline, NL stage, lead_source).
// For a 6M-row seed that's 24M extra queries. The caches live for the duration of
// one import run (one worker connection / one seed invocation) and are passed in
// explicitly so a long-running worker can reset them when branches are re-named.

export interface ImportCaches {
  /** clean_branch (lower-cased, trimmed) → branch.id */
  branchByCleanKey: Map<string, { id: string; tenantId: string }>
  /** branchId → pipelineId */
  pipelineByBranchId: Map<string, string>
  /** branchId → (NL stage shortCode) → stageId */
  stageByBranchByCode: Map<string, Map<string, string>>
  /** lead-source name (lower-cased) → lead_source.id */
  leadSourceByName: Map<string, string>
}

export function makeEmptyCaches(): ImportCaches {
  return {
    branchByCleanKey:    new Map(),
    pipelineByBranchId:  new Map(),
    stageByBranchByCode: new Map(),
    leadSourceByName:    new Map(),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitName(full: string | null): { firstName: string; lastName: string | null } {
  if (!full) return { firstName: 'Unknown', lastName: null }
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Unknown', lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

interface WixChildEntry { name?: string | null; age?: string | null }

/**
 * Pick the contact name for one row of master_leads_unified.
 *
 * For Wix multi-child submissions the view yields N rows per submission and
 * sets sibling_index = 1..N. We override the parent's full_name with the
 * i-th child's name from children_details so each kanban card shows the
 * actual student rather than the parent. Falls back to the parent's name if
 * children_details is missing/malformed/short.
 *
 * Returns both the chosen name (split into firstName/lastName) and the
 * sibling's age if we can extract it — caller stores the age in childAge1
 * so it can be surfaced in the lead detail modal.
 */
function pickContactName(row: UnifiedLeadRow): {
  firstName: string
  lastName: string | null
  childAge: string | null
  /**
   * Parent's full name when the contact represents a CHILD (i.e. children_details
   * had a usable entry at sibling_index). Null when the contact already IS the
   * parent (single-row import or null/empty children_details).
   */
  parentFullName: string | null
} {
  const idx = row.sibling_index
  if (idx && idx > 0 && row.children_details) {
    try {
      const parsed = JSON.parse(row.children_details) as WixChildEntry[]
      if (Array.isArray(parsed) && parsed.length >= idx) {
        const child = parsed[idx - 1]
        const childName = (child?.name ?? '').trim()
        if (childName) {
          const { firstName, lastName } = splitName(childName)
          return {
            firstName,
            lastName,
            childAge: child?.age ?? null,
            parentFullName: row.full_name ?? null,
          }
        }
      }
    } catch {
      // children_details was malformed JSON — fall through to parent name.
    }
  }
  // No children in this row → contact IS the parent. Parent column stays null
  // so the card + modal both render firstName + lastName the normal way.
  const { firstName, lastName } = splitName(row.full_name)
  return { firstName, lastName, childAge: null, parentFullName: null }
}

/**
 * Normalise a lead-source label to one of the canonical CRM source rows.
 * Mirrors the seed's behaviour so the same source rows are reused across
 * the seed and the worker.
 */
function normalizeSourceName(raw: string | null): string {
  if (!raw) return 'Others'
  const lower = raw.trim().toLowerCase()
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'Meta'
  if (lower.includes('tiktok')) return 'TikTok'
  if (lower.includes('wix')) return 'Wix'
  if (lower.includes('website') || lower.includes('web')) return 'Website'
  if (lower.includes('walk')) return 'Walk-In'
  if (lower.includes('refer')) return 'Referral'
  if (lower.includes('self')) return 'Self-Generated'
  return 'Others'
}

/**
 * Match the unified view's `clean_branch` against `crm_branch.name`.
 *
 * The view yields values like "Subang Taipan", "Setia Alam", "Online" —
 * branch_mapping.official_name. CRM branches are named "07 Ebright English
 * Speaking (Subang Taipan)". We cache by lower(clean_branch) and resolve via
 * case-insensitive substring match against crm_branch.name.
 */
async function resolveBranch(
  prisma: PrismaClient,
  tenantId: string,
  cleanBranch: string | null,
  caches: ImportCaches,
): Promise<{ id: string; tenantId: string } | null> {
  if (!cleanBranch) return null
  const key = cleanBranch.trim().toLowerCase()
  if (!key) return null

  const cached = caches.branchByCleanKey.get(key)
  if (cached) return cached

  const branch = await prisma.crm_branch.findFirst({
    where: {
      tenantId,
      name: { contains: cleanBranch.trim(), mode: 'insensitive' },
    },
    select: { id: true, tenantId: true },
  })

  if (branch) caches.branchByCleanKey.set(key, branch)
  return branch
}

async function resolvePipelineAndStage(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  caches: ImportCaches,
  shortCode: string,
): Promise<{ pipelineId: string; stageId: string } | null> {
  let pipelineId = caches.pipelineByBranchId.get(branchId)
  if (!pipelineId) {
    const pipeline = await prisma.crm_pipeline.findFirst({
      where: { tenantId, branchId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!pipeline) return null
    pipelineId = pipeline.id
    caches.pipelineByBranchId.set(branchId, pipelineId)
  }

  let stageMap = caches.stageByBranchByCode.get(branchId)
  if (!stageMap) {
    const stages = await prisma.crm_stage.findMany({
      where: { tenantId, pipelineId },
      select: { id: true, shortCode: true },
    })
    stageMap = new Map(stages.map((s) => [s.shortCode, s.id]))
    caches.stageByBranchByCode.set(branchId, stageMap)
  }

  // Fallback chain: requested code → NL → first available stage. Guarantees
  // an opportunity is always parked somewhere even if the requested stage
  // doesn't exist on this branch.
  const stageId = stageMap.get(shortCode) ?? stageMap.get('NL') ?? stageMap.values().next().value
  if (!stageId) return null
  return { pipelineId, stageId }
}

async function resolveLeadSourceId(
  prisma: PrismaClient,
  tenantId: string,
  rawSource: string | null,
  caches: ImportCaches,
): Promise<string> {
  const name = normalizeSourceName(rawSource)
  const key = name.toLowerCase()
  const cached = caches.leadSourceByName.get(key)
  if (cached) return cached

  const existing = await prisma.crm_lead_source.findFirst({
    where: { tenantId, name },
    select: { id: true },
  })
  if (existing) {
    caches.leadSourceByName.set(key, existing.id)
    return existing.id
  }

  const created = await prisma.crm_lead_source.create({
    data: { tenantId, name },
    select: { id: true },
  })
  caches.leadSourceByName.set(key, created.id)
  return created.id
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Import a single unified-view row into the CRM.
 *
 * Returns a status without throwing, except for unexpected errors. The two
 * common "soft skip" cases (`duplicate` and `no_branch`) are not errors —
 * they're the polling backstop overlapping with a recent LISTEN event,
 * and a lead whose form pointed at an unknown branch respectively.
 */
export async function importLead(
  prisma: PrismaClient,
  ctx: TenantContext,
  row: UnifiedLeadRow,
  caches: ImportCaches,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  // Guard: row must have at least one piece of PII to be useful.
  if (!row.full_name && !row.phone && !row.email) {
    return { status: 'no_pii', reason: 'row has no name, phone, or email' }
  }

  const branch = await resolveBranch(prisma, ctx.tenantId, row.clean_branch, caches)
  if (!branch) {
    return {
      status: 'no_branch',
      reason: `clean_branch="${row.clean_branch ?? 'null'}" did not match any crm_branch.name`,
    }
  }

  const pipelineStage = await resolvePipelineAndStage(
    prisma,
    ctx.tenantId,
    branch.id,
    caches,
    opts.stageShortCode ?? 'NL',
  )
  if (!pipelineStage) {
    return {
      status: 'no_pipeline',
      reason: `branch ${branch.id} has no pipeline (seed not run for this branch)`,
    }
  }

  const leadSourceId = await resolveLeadSourceId(prisma, ctx.tenantId, row.lead_source, caches)
  const { firstName, lastName, childAge, parentFullName } = pickContactName(row)
  const phone = row.phone ? normalizePhone(row.phone) : null
  const submittedAt = row.submitted_at ?? new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const contact = await tx.crm_contact.create({
        data: {
          tenantId:            ctx.tenantId,
          branchId:            branch.id,
          firstName,
          lastName,
          email:               row.email,
          phone,
          leadSourceId,
          // childAge1 holds the sibling's age for Wix multi-child submissions
          // so the lead detail modal can show it. The contact itself IS the
          // child, so we don't fill childName1 (that would be redundant).
          childAge1:           childAge,
          // Parent's full_name when this contact represents a child (sibling-
          // exploded row). Null when the contact already IS the parent — in
          // that case firstName/lastName already hold the parent's name.
          parentFullName,
          externalSourceTable: row.source_table,
          externalSourceId:    row.source_id,
          createdAt:           submittedAt,
        },
      })

      await tx.crm_opportunity.create({
        data: {
          tenantId:          ctx.tenantId,
          branchId:          branch.id,
          contactId:         contact.id,
          pipelineId:        pipelineStage.pipelineId,
          stageId:           pipelineStage.stageId,
          value:             0,
          createdAt:         submittedAt,
          lastStageChangeAt: submittedAt,
        },
      })

      return contact.id
    })

    if (opts.enqueueAutomation) {
      // NEW_LEAD trigger — fire any tenant-wide or branch-scoped automations.
      // We swallow enqueue failures; the contact already exists, missing an
      // automation run is recoverable, missing the contact isn't.
      const enqueue = opts.enqueueAutomation
      try {
        const automations = await prisma.crm_automation.findMany({
          where: {
            tenantId: ctx.tenantId,
            enabled:  true,
            triggerType: 'NEW_LEAD',
            OR: [{ branchId: branch.id }, { branchId: null }],
          },
          select: { id: true },
        })
        for (const a of automations) {
          await enqueue({
            automationId:   a.id,
            contactId:      result,
            tenantId:       ctx.tenantId,
            triggeredBy:    `lead_ingest:${row.source_table}`,
            triggerPayload: {
              source: row.lead_source,
              sourceTable: row.source_table,
              sourceId: row.source_id,
            },
          })
        }
      } catch (e) {
        console.warn('[leads-import] Automation enqueue failed:', (e as Error).message)
      }
    }

    return { status: 'created', contactId: result, branchId: branch.id }
  } catch (e) {
    // Unique-constraint hit on (tenantId, externalSourceTable, externalSourceId)
    // means this row is already imported. Treat as a soft skip — the polling
    // backstop and the LISTEN handler can race freely.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { status: 'duplicate', branchId: branch.id }
    }
    throw e
  }
}
