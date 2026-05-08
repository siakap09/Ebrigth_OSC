import "server-only";
import { pool } from "./db";
import {
  BranchCode,
  EventStatus,
  FAEvent,
  Invitation,
  InvitationStatus,
  Session,
  SessionQuota,
} from "@fa/_types";

const TENANT = "ebright";

// ----------------------------------------------------------------------------
// Row shapes (snake_case from postgres) and mappers
// ----------------------------------------------------------------------------

interface EventRow {
  id: string;
  name: string;
  month: number;
  year: number;
  venue: string;
  start_date: Date | string;
  end_date: Date | string;
  number_of_days: number;
  invitation_open_date: Date | string;
  invitation_close_date: Date | string;
  status: string;
  created_by: string | null;
  created_at: Date | string;
  notes: string | null;
}

interface SessionRow {
  id: string;
  event_id: string;
  day_number: number;
  session_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
}

interface QuotaRow {
  id: string;
  session_id: string;
  branch: string;
  quota: number;
}

interface InvitationRow {
  id: string;
  event_id: string;
  session_id: string;
  student_id: string;
  branch: string;
  status: string;
  invited_by: string | null;
  invited_at: Date | string;
  confirmed_at: Date | string | null;
  attendance_marked_at: Date | string | null;
  attendance_marked_by: string | null;
  notes: string | null;
}

function isoDate(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).split("T")[0];
}

function isoTimestamp(d: Date | string | null): string | undefined {
  if (d == null) return undefined;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function rowToEvent(r: EventRow): FAEvent {
  return {
    id: r.id,
    name: r.name,
    month: r.month,
    year: r.year,
    venue: r.venue,
    startDate: isoDate(r.start_date),
    endDate: isoDate(r.end_date),
    numberOfDays: (r.number_of_days as 1 | 2 | 3),
    invitationOpenDate: isoDate(r.invitation_open_date),
    invitationCloseDate: isoDate(r.invitation_close_date),
    status: r.status as EventStatus,
    createdBy: r.created_by ?? "",
    createdAt: isoTimestamp(r.created_at) ?? new Date().toISOString(),
    notes: r.notes ?? undefined,
  };
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    eventId: r.event_id,
    dayNumber: r.day_number as 1 | 2 | 3,
    sessionNumber: r.session_number,
    startTime: r.start_time,
    endTime: r.end_time,
    label: r.label ?? undefined,
  };
}

function rowToQuota(r: QuotaRow): SessionQuota {
  return {
    id: r.id,
    sessionId: r.session_id,
    branch: r.branch as BranchCode,
    quota: r.quota,
  };
}

function rowToInvitation(r: InvitationRow): Invitation {
  return {
    id: r.id,
    eventId: r.event_id,
    sessionId: r.session_id,
    studentId: r.student_id,
    branch: r.branch as BranchCode,
    status: r.status as InvitationStatus,
    invitedBy: r.invited_by ?? "",
    invitedAt: isoTimestamp(r.invited_at) ?? new Date().toISOString(),
    confirmedAt: isoTimestamp(r.confirmed_at),
    attendanceMarkedAt: isoTimestamp(r.attendance_marked_at),
    attendanceMarkedBy: r.attendance_marked_by ?? undefined,
    notes: r.notes ?? undefined,
  };
}

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

export async function fetchAllEventData(): Promise<{
  events: FAEvent[];
  sessions: Session[];
  quotas: SessionQuota[];
  invitations: Invitation[];
}> {
  const [eventsRes, sessionsRes, quotasRes, invitationsRes] = await Promise.all([
    pool.query<EventRow>(
      `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
              invitation_open_date, invitation_close_date, status, created_by, created_at, notes
         FROM fa_events
        WHERE tenant_id = $1
        ORDER BY start_date DESC, created_at DESC`,
      [TENANT]
    ),
    pool.query<SessionRow>(
      `SELECT id, event_id, day_number, session_number, start_time, end_time, label
         FROM fa_sessions
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<QuotaRow>(
      `SELECT id, session_id, branch, quota
         FROM fa_session_quotas
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<InvitationRow>(
      `SELECT id, event_id, session_id, student_id, branch, status, invited_by,
              invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes
         FROM fa_invitations
        WHERE tenant_id = $1`,
      [TENANT]
    ),
  ]);

  return {
    events: eventsRes.rows.map(rowToEvent),
    sessions: sessionsRes.rows.map(rowToSession),
    quotas: quotasRes.rows.map(rowToQuota),
    invitations: invitationsRes.rows.map(rowToInvitation),
  };
}

// ----------------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------------

export async function createEventRow(
  ev: Omit<FAEvent, "id" | "createdAt">
): Promise<FAEvent> {
  const { rows } = await pool.query<EventRow>(
    `INSERT INTO fa_events
       (tenant_id, name, month, year, venue, start_date, end_date, number_of_days,
        invitation_open_date, invitation_close_date, status, created_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, name, month, year, venue, start_date, end_date, number_of_days,
               invitation_open_date, invitation_close_date, status, created_by, created_at, notes`,
    [
      TENANT, ev.name, ev.month, ev.year, ev.venue, ev.startDate, ev.endDate, ev.numberOfDays,
      ev.invitationOpenDate, ev.invitationCloseDate, ev.status, ev.createdBy || null, ev.notes ?? null,
    ]
  );
  return rowToEvent(rows[0]);
}

export async function updateEventRow(
  id: string,
  patch: Partial<FAEvent>
): Promise<FAEvent | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    name: "name",
    month: "month",
    year: "year",
    venue: "venue",
    startDate: "start_date",
    endDate: "end_date",
    numberOfDays: "number_of_days",
    invitationOpenDate: "invitation_open_date",
    invitationCloseDate: "invitation_close_date",
    status: "status",
    notes: "notes",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(v);
    }
  }
  if (fields.length === 0) {
    const { rows } = await pool.query<EventRow>(
      `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
              invitation_open_date, invitation_close_date, status, created_by, created_at, notes
         FROM fa_events WHERE id = $1 AND tenant_id = $2`,
      [id, TENANT]
    );
    return rows[0] ? rowToEvent(rows[0]) : null;
  }
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<EventRow>(
    `UPDATE fa_events SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, name, month, year, venue, start_date, end_date, number_of_days,
               invitation_open_date, invitation_close_date, status, created_by, created_at, notes`,
    values
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function deleteEventRow(id: string): Promise<void> {
  // ON DELETE CASCADE on sessions/quotas/invitations handles cleanup
  await pool.query(`DELETE FROM fa_events WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

export async function createSessionRow(s: Omit<Session, "id">): Promise<Session> {
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO fa_sessions
       (tenant_id, event_id, day_number, session_number, start_time, end_time, label)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
    [TENANT, s.eventId, s.dayNumber, s.sessionNumber, s.startTime, s.endTime, s.label ?? null]
  );
  return rowToSession(rows[0]);
}

export async function updateSessionRow(
  id: string,
  patch: Partial<Session>
): Promise<Session | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    dayNumber: "day_number",
    sessionNumber: "session_number",
    startTime: "start_time",
    endTime: "end_time",
    label: "label",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(v);
    }
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<SessionRow>(
    `UPDATE fa_sessions SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
    values
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function deleteSessionRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM fa_sessions WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// ----------------------------------------------------------------------------
// Quotas
// ----------------------------------------------------------------------------

export async function upsertQuotaRow(
  sessionId: string,
  branch: BranchCode,
  quota: number
): Promise<SessionQuota | null> {
  if (quota <= 0) {
    await pool.query(
      `DELETE FROM fa_session_quotas
        WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
      [sessionId, branch, TENANT]
    );
    return null;
  }
  const { rows } = await pool.query<QuotaRow>(
    `INSERT INTO fa_session_quotas (tenant_id, session_id, branch, quota)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, branch) DO UPDATE SET quota = EXCLUDED.quota, updated_at = now()
     RETURNING id, session_id, branch, quota`,
    [TENANT, sessionId, branch, quota]
  );
  return rowToQuota(rows[0]);
}

// ----------------------------------------------------------------------------
// Invitations
// ----------------------------------------------------------------------------

export async function createInvitationRow(args: {
  eventId: string;
  sessionId: string;
  studentId: string;
  branch: BranchCode;
  status: InvitationStatus;
  invitedBy: string;
}): Promise<Invitation | null> {
  // Returns null if the (event, student) unique constraint trips (already invited)
  try {
    const { rows } = await pool.query<InvitationRow>(
      `INSERT INTO fa_invitations
         (tenant_id, event_id, session_id, student_id, branch, status, invited_by, invited_at, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), CASE WHEN $6 = 'confirmed' THEN now() ELSE NULL END)
       RETURNING id, event_id, session_id, student_id, branch, status, invited_by,
                 invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes`,
      [TENANT, args.eventId, args.sessionId, args.studentId, args.branch, args.status, args.invitedBy]
    );
    return rowToInvitation(rows[0]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") return null; // unique_violation
    throw err;
  }
}

export async function updateInvitationRow(
  id: string,
  patch: { status?: InvitationStatus; sessionId?: string; markedBy?: string }
): Promise<Invitation | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined) {
    fields.push(`status = $${i++}`);
    values.push(patch.status);
    if (patch.status === "confirmed") {
      fields.push(`confirmed_at = now()`);
    }
    if (patch.status === "attended" || patch.status === "no_show") {
      fields.push(`attendance_marked_at = now()`);
      if (patch.markedBy) {
        fields.push(`attendance_marked_by = $${i++}`);
        values.push(patch.markedBy);
      }
    }
  }
  if (patch.sessionId !== undefined) {
    fields.push(`session_id = $${i++}`);
    values.push(patch.sessionId);
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<InvitationRow>(
    `UPDATE fa_invitations SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, event_id, session_id, student_id, branch, status, invited_by,
               invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes`,
    values
  );
  return rows[0] ? rowToInvitation(rows[0]) : null;
}

export async function deleteInvitationRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM fa_invitations WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

export async function countInvitationsForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM fa_invitations
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return Number(rows[0]?.count ?? "0");
}

export async function getEventStatus(eventId: string): Promise<EventStatus | null> {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM fa_events WHERE id = $1 AND tenant_id = $2`,
    [eventId, TENANT]
  );
  return rows[0] ? (rows[0].status as EventStatus) : null;
}

export async function getQuotaForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number | null> {
  const { rows } = await pool.query<{ quota: number }>(
    `SELECT quota FROM fa_session_quotas
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return rows[0] ? rows[0].quota : null;
}
