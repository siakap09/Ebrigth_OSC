import "server-only";
import { pool } from "./db";
import {
  BranchCode,
  EventBranchOverride,
  EventStatus,
  FAEvent,
  Invitation,
  InvitationStatus,
  InviteType,
  Session,
  SessionQuota,
} from "@pcm/_types";

const TENANT = "ebright";

// Sentinels used by createInvitationRow to distinguish business-rule rejects
// from real DB errors. The route translates these to 409 responses with a
// descriptive `reason` string.
export class InvitationRejected extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "InvitationRejected";
  }
}

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
  target_grade: number | null;
  status: string;
  invited_by: string | null;
  invited_at: Date | string;
  confirmed_at: Date | string | null;
  attendance_marked_at: Date | string | null;
  attendance_marked_by: string | null;
  notes: string | null;
  invite_type: string;
  coach_id: string | null;
  coach_name: string | null;
}

interface EventBranchOverrideRow {
  event_id: string;
  branch_code: string;
  granted_by: string;
  granted_at: Date | string;
  reason: string | null;
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
    numberOfDays: r.number_of_days,
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
    dayNumber: r.day_number,
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

function rowToOverride(r: EventBranchOverrideRow): EventBranchOverride {
  return {
    eventId: r.event_id,
    branchCode: r.branch_code as BranchCode,
    grantedBy: r.granted_by,
    grantedAt: isoTimestamp(r.granted_at) ?? new Date().toISOString(),
    reason: r.reason ?? undefined,
  };
}

function rowToInvitation(r: InvitationRow): Invitation {
  return {
    id: r.id,
    eventId: r.event_id,
    sessionId: r.session_id,
    studentId: r.student_id,
    branch: r.branch as BranchCode,
    targetGrade: r.target_grade ?? 0,
    status: r.status as InvitationStatus,
    inviteType: (r.invite_type === "renewal" ? "renewal" : "progress") as InviteType,
    coachId: r.coach_id ?? undefined,
    coachName: r.coach_name ?? undefined,
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
  overrides: EventBranchOverride[];
}> {
  const [eventsRes, sessionsRes, quotasRes, invitationsRes, overridesRes] = await Promise.all([
    pool.query<EventRow>(
      `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
              invitation_open_date, invitation_close_date, status, created_by, created_at, notes
         FROM pcm_events
        WHERE tenant_id = $1
        ORDER BY start_date DESC, created_at DESC`,
      [TENANT]
    ),
    pool.query<SessionRow>(
      `SELECT id, event_id, day_number, session_number, start_time, end_time, label
         FROM pcm_sessions
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<QuotaRow>(
      `SELECT id, session_id, branch, quota
         FROM pcm_session_quotas
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<InvitationRow>(
      `SELECT id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
              invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes, invite_type, coach_id, coach_name
         FROM pcm_invitations
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    // Per-event per-branch multi-grade overrides. The pcm_event_branch_overrides
    // table may not exist on older deploys yet — wrap in a try so the FA
    // dashboard still loads if the migration hasn't been applied.
    pool.query<EventBranchOverrideRow>(
      `SELECT event_id, branch_code, granted_by, granted_at, reason
         FROM pcm_event_branch_overrides`,
    ).catch((err) => {
      if ((err as { code?: string }).code === "42P01") {
        // undefined_table — migration not applied yet
        return { rows: [] as EventBranchOverrideRow[] };
      }
      throw err;
    }),
  ]);

  return {
    events: eventsRes.rows.map(rowToEvent),
    sessions: sessionsRes.rows.map(rowToSession),
    quotas: quotasRes.rows.map(rowToQuota),
    invitations: invitationsRes.rows.map(rowToInvitation),
    overrides: overridesRes.rows.map(rowToOverride),
  };
}

// ----------------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------------

export async function createEventRow(
  ev: Omit<FAEvent, "id" | "createdAt">
): Promise<FAEvent> {
  const { rows } = await pool.query<EventRow>(
    `INSERT INTO pcm_events
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
         FROM pcm_events WHERE id = $1 AND tenant_id = $2`,
      [id, TENANT]
    );
    return rows[0] ? rowToEvent(rows[0]) : null;
  }
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<EventRow>(
    `UPDATE pcm_events SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, name, month, year, venue, start_date, end_date, number_of_days,
               invitation_open_date, invitation_close_date, status, created_by, created_at, notes`,
    values
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function deleteEventRow(id: string): Promise<void> {
  // ON DELETE CASCADE on sessions/quotas/invitations handles cleanup
  await pool.query(`DELETE FROM pcm_events WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

export async function createSessionRow(s: Omit<Session, "id">): Promise<Session> {
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO pcm_sessions
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
    `UPDATE pcm_sessions SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
    values
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function deleteSessionRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM pcm_sessions WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
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
      `DELETE FROM pcm_session_quotas
        WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
      [sessionId, branch, TENANT]
    );
    return null;
  }
  const { rows } = await pool.query<QuotaRow>(
    `INSERT INTO pcm_session_quotas (tenant_id, session_id, branch, quota)
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
  targetGrade: number;
  status: InvitationStatus;
  invitedBy: string;
  /** "progress" (default) or "renewal". Set by the BM at invite time. */
  inviteType?: InviteType;
}): Promise<Invitation> {
  // Multi-step business-rule check, run as one logical transaction:
  //   1. Is this (event, branch) opted into multi-grade invites?
  //   2. Look up existing invitations for this (event, student).
  //      • If none → free to insert.
  //      • If toggle OFF → reject (any prior invite blocks).
  //      • If toggle ON → must be (a) same dayNumber as the new session and
  //        (b) different target_grade.
  //   3. INSERT. The DB still has a final UNIQUE on (event, student, grade)
  //      as a race-condition safety net (23505 trips → "duplicate grade").
  //
  // All rejects surface as InvitationRejected — the route catches it and
  // returns 409 with a descriptive reason.

  // 1. Override check
  const overrideRes = await pool.query<{ branch_code: string }>(
    `SELECT branch_code
       FROM pcm_event_branch_overrides
      WHERE event_id = $1 AND branch_code = $2
      LIMIT 1`,
    [args.eventId, args.branch],
  ).catch((err) => {
    // If the migration hasn't been applied, treat as no overrides.
    if ((err as { code?: string }).code === "42P01") return { rows: [] };
    throw err;
  });
  const multiGradeAllowed = overrideRes.rows.length > 0;

  // 2. Look up prior invites + the new session's day number in one query
  const priorRes = await pool.query<{
    target_grade: number | null;
    day_number: number;
    new_day_number: number;
  }>(
    `SELECT i.target_grade,
            s_existing.day_number,
            s_new.day_number AS new_day_number
       FROM pcm_sessions s_new
       LEFT JOIN pcm_invitations i
         ON i.event_id = $1 AND i.student_id = $2 AND i.tenant_id = $3
       LEFT JOIN pcm_sessions s_existing
         ON s_existing.id = i.session_id
      WHERE s_new.id = $4 AND s_new.tenant_id = $3`,
    [args.eventId, args.studentId, TENANT, args.sessionId],
  );

  if (priorRes.rows.length === 0) {
    throw new InvitationRejected("Session not found");
  }
  const newDayNumber = priorRes.rows[0].new_day_number;
  const priorInvites = priorRes.rows
    .filter((r) => r.target_grade != null)
    .map((r) => ({ grade: r.target_grade as number, day: r.day_number }));

  if (priorInvites.length > 0) {
    // Toggle off → first prior invite wins, reject any second.
    if (!multiGradeAllowed) {
      throw new InvitationRejected("Already invited");
    }
    // Toggle on → enforce same-day + different-grade.
    const otherDay = priorInvites.find((p) => p.day !== newDayNumber);
    if (otherDay) {
      throw new InvitationRejected(`Booked on day ${otherDay.day}`);
    }
    const dupGrade = priorInvites.some((p) => p.grade === args.targetGrade);
    if (dupGrade) {
      throw new InvitationRejected(`Already invited for grade ${args.targetGrade}`);
    }
  }

  // 3. INSERT — final DB safety net via UNIQUE(event, student, target_grade).
  const inviteType: InviteType = args.inviteType === "renewal" ? "renewal" : "progress";
  try {
    const { rows } = await pool.query<InvitationRow>(
      `INSERT INTO pcm_invitations
         (tenant_id, event_id, session_id, student_id, branch, target_grade, status, invited_by, invited_at, confirmed_at, invite_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), CASE WHEN $7 = 'confirmed' THEN now() ELSE NULL END, $9)
       RETURNING id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
                 invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes, invite_type, coach_id, coach_name`,
      [TENANT, args.eventId, args.sessionId, args.studentId, args.branch, args.targetGrade, args.status, args.invitedBy, inviteType]
    );
    return rowToInvitation(rows[0]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      // Race condition: another concurrent insert beat us to this grade.
      throw new InvitationRejected(`Already invited for grade ${args.targetGrade}`);
    }
    throw err;
  }
}

export async function updateInvitationRow(
  id: string,
  patch: {
    status?: InvitationStatus;
    sessionId?: string;
    markedBy?: string;
    /** When the BM assigns/changes the coach for this invitation. Pass
     *  `null` (for coachId) to clear the assignment. */
    coachId?: string | null;
    coachName?: string | null;
    /** Allow the BM to flip Progress ↔ Renewal after the fact. */
    inviteType?: InviteType;
  }
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
  if (patch.coachId !== undefined) {
    fields.push(`coach_id = $${i++}`);
    values.push(patch.coachId);
  }
  if (patch.coachName !== undefined) {
    fields.push(`coach_name = $${i++}`);
    values.push(patch.coachName);
  }
  if (patch.inviteType !== undefined) {
    fields.push(`invite_type = $${i++}`);
    values.push(patch.inviteType);
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<InvitationRow>(
    `UPDATE pcm_invitations SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
               invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes, invite_type, coach_id, coach_name`,
    values
  );
  if (!rows[0]) return null;
  const invitation = rowToInvitation(rows[0]);
  // When attendance is marked, persist the picked grade onto the student's
  // pcm_progress_json so the box-checklist on the BM invite modal updates
  // immediately and the change survives a full page reload.
  if (patch.status === "attended" && invitation.targetGrade > 0) {
    await markPcmProgressForStudent(invitation.studentId, invitation.targetGrade);
  }
  return invitation;
}

/** Mark grade `grade` as completed in a student's pcm_progress_json array.
 *  Called from updateInvitationRow whenever an invitation is marked
 *  `attended`, so the student's PCM box-checklist (rendered in the invite
 *  modal and on the Student List page) reflects the new completion.
 *  The array is indexed 0-based (index `grade-1` = entry for grade `grade`).
 *  Read-modify-write so we handle shorter/null arrays defensively. */
export async function markPcmProgressForStudent(
  studentId: string,
  grade: number,
): Promise<void> {
  const sid = Number(studentId);
  if (!Number.isFinite(sid) || grade < 1) return;
  const { rows } = await pool.query<{ pcm_progress_json: unknown }>(
    `SELECT pcm_progress_json FROM studentrecords WHERE id = $1`,
    [sid]
  );
  if (!rows[0]) return;
  const arr: boolean[] = Array.isArray(rows[0].pcm_progress_json)
    ? (rows[0].pcm_progress_json as unknown[]).map(v => v === true)
    : [];
  while (arr.length < grade) arr.push(false);
  arr[grade - 1] = true;
  await pool.query(
    `UPDATE studentrecords SET pcm_progress_json = $1::jsonb WHERE id = $2`,
    [JSON.stringify(arr), sid]
  );
}

export async function deleteInvitationRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM pcm_invitations WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

export async function countInvitationsForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM pcm_invitations
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return Number(rows[0]?.count ?? "0");
}

export async function getEventStatus(eventId: string): Promise<EventStatus | null> {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM pcm_events WHERE id = $1 AND tenant_id = $2`,
    [eventId, TENANT]
  );
  return rows[0] ? (rows[0].status as EventStatus) : null;
}

// ----------------------------------------------------------------------------
// Event branch overrides (multi-grade exception per event per branch)
// ----------------------------------------------------------------------------

export async function upsertEventBranchOverrideRow(args: {
  eventId: string;
  branchCode: BranchCode;
  grantedBy: string;
  reason?: string;
}): Promise<EventBranchOverride> {
  const { rows } = await pool.query<EventBranchOverrideRow>(
    `INSERT INTO pcm_event_branch_overrides (event_id, branch_code, granted_by, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (event_id, branch_code) DO UPDATE
       SET granted_by = EXCLUDED.granted_by,
           granted_at = now(),
           reason     = EXCLUDED.reason
     RETURNING event_id, branch_code, granted_by, granted_at, reason`,
    [args.eventId, args.branchCode, args.grantedBy, args.reason ?? null]
  );
  return rowToOverride(rows[0]);
}

export async function deleteEventBranchOverrideRow(
  eventId: string,
  branchCode: BranchCode
): Promise<void> {
  await pool.query(
    `DELETE FROM pcm_event_branch_overrides WHERE event_id = $1 AND branch_code = $2`,
    [eventId, branchCode]
  );
}

export async function getQuotaForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number | null> {
  const { rows } = await pool.query<{ quota: number }>(
    `SELECT quota FROM pcm_session_quotas
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return rows[0] ? rows[0].quota : null;
}
