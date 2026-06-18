"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/nextauth";
import { hrfsPrisma } from "@/lib/hrfs";
import { ADMIN_ROLES, normalizeRole } from "@/lib/roles";

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface BatchSaveResult extends SaveResult {
  count?: number;
}

interface DaySlot {
  start: string;
  end: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayKey = (typeof DAYS)[number];

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The date a saved schedule starts applying from. The editor sends one
 *  (defaulting to the current week's Monday); if it's missing or malformed we
 *  fall back to today so a version is always recorded. */
function resolveEffectiveFrom(input: unknown): string {
  if (typeof input === "string" && DATE_RE.test(input.trim())) return input.trim();
  return new Date().toISOString().slice(0, 10);
}

function sanitize(input: unknown): Record<DayKey, DaySlot | null> | null {
  if (!input || typeof input !== "object") return null;
  const out = {} as Record<DayKey, DaySlot | null>;
  for (const day of DAYS) {
    const v = (input as Record<string, unknown>)[day];
    if (v === null || v === undefined) {
      out[day] = null;
      continue;
    }
    if (typeof v !== "object") return null;
    const slot = v as Record<string, unknown>;
    const start = typeof slot.start === "string" ? slot.start.trim() : "";
    const end = typeof slot.end === "string" ? slot.end.trim() : "";
    if (!start && !end) { out[day] = null; continue; }
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return null;
    if (start >= end) return null;
    out[day] = { start, end };
  }
  return out;
}

// v1 has no employment table; the BranchStaff.id maps 1:1 to the
// DirectoryPerson.id passed back from the client. Permission is gated by
// v1's role taxonomy — SUPER_ADMIN / ADMIN / HR (ADMIN_ROLES) can edit.
export async function saveWorkingHours(
  branchStaffId: number,
  schedule: unknown,
  effectiveFrom?: string,
): Promise<SaveResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };

  const role = normalizeRole((session.user as { role?: string }).role);
  if (!role || !ADMIN_ROLES.includes(role)) {
    return { ok: false, error: "Not authorized to edit working hours." };
  }

  if (!Number.isInteger(branchStaffId) || branchStaffId <= 0) {
    return { ok: false, error: "Invalid staff id." };
  }

  const sanitized = sanitize(schedule);
  if (!sanitized) {
    return { ok: false, error: "Invalid schedule. Use HH:MM format and ensure end > start." };
  }

  try {
    // Raw write avoids depending on a freshly regenerated Prisma client —
    // schema.prisma was just updated, and the typed client may lag until the
    // dev server restarts and triggers `prisma generate`.
    //
    // Unqualified table name resolves via the connection's search_path:
    // public."BranchStaff" under hrfsPrisma, or crm."BranchStaff" (an updatable
    // view / FDW that forwards to the same row) when falling back to
    // DATABASE_URL. UPDATE works through either.
    const affected = await hrfsPrisma.$executeRaw`
      UPDATE "BranchStaff"
      SET "workingHours" = ${JSON.stringify(sanitized)}::jsonb,
          "updatedAt"    = NOW()
      WHERE id = ${branchStaffId}
    `;
    if (affected === 0) return { ok: false, error: "Staff record not found." };

    // Record this as a dated version in the schedule history so the attendance
    // report judges each day by the hours active that day. Re-saving the same
    // effective-from date overwrites that version rather than duplicating it.
    const effFrom = resolveEffectiveFrom(effectiveFrom);
    await hrfsPrisma.$executeRaw`
      INSERT INTO "BranchStaffSchedule" ("branchStaffId", "effectiveFrom", schedule)
      VALUES (${branchStaffId}, ${effFrom}::date, ${JSON.stringify(sanitized)}::jsonb)
      ON CONFLICT ("branchStaffId", "effectiveFrom")
      DO UPDATE SET schedule = EXCLUDED.schedule
    `;

    revalidatePath("/staff-directory");
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save." };
  }
}

// Batch variant: apply one schedule to many BranchStaff rows at once. Used by
// the directory's "Batch edit" modal, where an admin targets a group of staff
// (by branch / department / role) and sets a shared working-week. Same auth
// and sanitisation rules as the single-row save — only the WHERE clause differs.
export async function saveWorkingHoursBatch(
  branchStaffIds: number[],
  schedule: unknown,
  effectiveFrom?: string,
): Promise<BatchSaveResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };

  const role = normalizeRole((session.user as { role?: string }).role);
  if (!role || !ADMIN_ROLES.includes(role)) {
    return { ok: false, error: "Not authorized to edit working hours." };
  }

  const ids = Array.from(
    new Set(
      (Array.isArray(branchStaffIds) ? branchStaffIds : []).filter(
        (n) => Number.isInteger(n) && n > 0,
      ),
    ),
  );
  if (ids.length === 0) return { ok: false, error: "No staff selected." };

  const sanitized = sanitize(schedule);
  if (!sanitized) {
    return { ok: false, error: "Invalid schedule. Use HH:MM format and ensure end > start." };
  }

  try {
    const affected = await hrfsPrisma.$executeRaw`
      UPDATE "BranchStaff"
      SET "workingHours" = ${JSON.stringify(sanitized)}::jsonb,
          "updatedAt"    = NOW()
      WHERE id IN (${Prisma.join(ids)})
    `;

    // Record a dated version for each targeted employee (same effective-from).
    const effFrom = resolveEffectiveFrom(effectiveFrom);
    const scheduleJson = JSON.stringify(sanitized);
    await hrfsPrisma.$executeRaw`
      INSERT INTO "BranchStaffSchedule" ("branchStaffId", "effectiveFrom", schedule)
      SELECT id, ${effFrom}::date, ${scheduleJson}::jsonb
        FROM "BranchStaff" WHERE id IN (${Prisma.join(ids)})
      ON CONFLICT ("branchStaffId", "effectiveFrom")
      DO UPDATE SET schedule = EXCLUDED.schedule
    `;

    revalidatePath("/staff-directory");
    return { ok: true, count: Number(affected) };
  } catch {
    return { ok: false, error: "Failed to save." };
  }
}
