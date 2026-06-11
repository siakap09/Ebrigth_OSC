import "server-only";
import { pool } from "@pcm/_lib/db";

/**
 * Renewal drill-down data for the PCM dashboard "PCM Renewal" card.
 *
 * Cash + package come from `finance_renewals` (the actual invoiced renewal
 * money — same source as the internal "Renewal by Branch" dashboard). That
 * table is keyed by `student_name` (free text), with no shared id to the
 * student/invitation tables, so we match the name to `studentrecords` to
 * resolve the coach. Coach preference: the per-renewal coach on the student's
 * most recent renewal invitation (pcm_invitations.coach_name), falling back to
 * the student's assigned coach (studentrecords.coach_name). Name matching is
 * exact-normalised first, then prefix — imperfect by nature (no shared key),
 * so coach/grade may be blank where no confident match exists.
 */
export interface RenewalDetail {
  docNo: string;
  docDate: string | null;
  branch: string;
  studentName: string;
  studentId: string | null;
  gradeChapter: string | null;
  coachName: string | null;
  package: string | null;
  amount: number;
}

export interface RenewalDetailResult {
  rows: RenewalDetail[];
  total: number;
  packs: number;
}

export async function fetchRenewalDetails(opts: {
  branch?: string | null;
  start?: string | null; // ISO yyyy-MM-dd
  end?: string | null;   // ISO yyyy-MM-dd
}): Promise<RenewalDetailResult> {
  const branch = opts.branch && opts.branch !== "all" ? opts.branch : null;
  const start = opts.start || null;
  const end = opts.end || null;

  const { rows } = await pool.query(
    `SELECT fr.doc_no,
            fr.doc_date,
            fr.branch_code,
            fr.student_name,
            fr.package,
            fr.amount::float8 AS amount,
            s.id              AS student_id,
            s.grade_chapter,
            COALESCE(pi.coach_name, s.coach_name) AS coach_name
       FROM finance_renewals fr
       LEFT JOIN LATERAL (
         SELECT id, coach_name, grade_chapter
           FROM studentrecords s
          WHERE upper(btrim(s.name)) = upper(btrim(fr.student_name))
             OR upper(s.name) LIKE upper(btrim(fr.student_name)) || '%'
          ORDER BY (upper(btrim(s.name)) = upper(btrim(fr.student_name))) DESC
          LIMIT 1
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT coach_name
           FROM pcm_invitations pi
          WHERE pi.student_id = s.id::text
            AND pi.coach_name IS NOT NULL AND pi.coach_name <> ''
          ORDER BY pi.created_at DESC
          LIMIT 1
       ) pi ON true
      WHERE ($1::text IS NULL OR fr.branch_code = $1)
        AND ($2::date IS NULL OR fr.doc_date >= $2::date)
        AND ($3::date IS NULL OR fr.doc_date <= $3::date)
      ORDER BY fr.doc_date DESC NULLS LAST, fr.branch_code, fr.student_name`,
    [branch, start, end],
  );

  const detail: RenewalDetail[] = rows.map((r) => ({
    docNo: r.doc_no,
    docDate: r.doc_date ? new Date(r.doc_date).toISOString().slice(0, 10) : null,
    branch: r.branch_code,
    studentName: r.student_name,
    studentId: r.student_id != null ? String(r.student_id) : null,
    gradeChapter: r.grade_chapter,
    coachName: r.coach_name,
    package: r.package,
    amount: Number(r.amount) || 0,
  }));

  const total = detail.reduce((sum, r) => sum + r.amount, 0);
  const packs = new Set(detail.map((r) => r.docNo)).size;
  return { rows: detail, total, packs };
}
