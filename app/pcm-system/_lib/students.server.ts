import "server-only";
import { pool } from "./db";
import { BRANCHES, BranchCode, Student, AgeCategory, StudentLoadReport } from "@pcm/_types";

const BRANCH_CODES = new Set<string>(BRANCHES.map(b => b.code));

// Accept anything that mentions a grade — chapter optional.
//   "G3 — C5", "G 3 - C 5", "G3", "Grade 3", "g3-c5", etc.
const GRADE_RE = /(?:^|\b)g\s*(\d+)/i;
const CHAPTER_RE = /c\s*(\d+)/i;

function parseGradeChapter(raw: unknown): { grade: number; credit: number } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const gm = trimmed.match(GRADE_RE);
  if (!gm) return null;
  const grade = Number(gm[1]);
  if (!Number.isFinite(grade) || grade < 1 || grade > 12) return null;
  const cm = trimmed.match(CHAPTER_RE);
  const credit = cm ? Number(cm[1]) : 1; // default to chapter 1 if absent
  if (!Number.isFinite(credit)) return null;
  return { grade, credit };
}

// Fallback when the ade_group row is missing for a student — keeps the
// Junior/Middler/Senior label working for legacy records that haven't been
// populated yet. Same thresholds the team has been using historically.
function ageCategoryFromGrade(grade: number): AgeCategory {
  if (grade <= 3) return "Junior";
  if (grade <= 6) return "Middler";
  return "Senior";
}

/** Map an arbitrary string from the Heidi `ade_group` table onto the
 *  AgeCategory enum the rest of the system uses. Accepts lowercase /
 *  uppercase / mixed and a few common synonyms (e.g. "Middle" → Middler). */
function normaliseAgeGroup(raw: unknown): AgeCategory | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("jun")) return "Junior";
  if (s.startsWith("mid")) return "Middler";
  if (s.startsWith("sen")) return "Senior";
  return null;
}

function parseFaHistory(raw: unknown, currentGrade: number): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  if (!Array.isArray(raw)) return out;
  // pcm_progress_json is an array of booleans, index i = FA done for grade (i+1).
  // Keep entries up to AND INCLUDING the student's current grade so the FA
  // invite picker can show the current-grade FA status — matches the
  // dashboard's per-grade FA-progress checkboxes.
  for (let i = 0; i < raw.length && i < currentGrade; i++) {
    out[i + 1] = raw[i] === true;
  }
  return out;
}

function toIsoDate(d: unknown): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  if (typeof d === "string") return d.split("T")[0];
  return "";
}

function normaliseBranch(raw: unknown): BranchCode | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return BRANCH_CODES.has(code) ? (code as BranchCode) : null;
}

interface StudentRow {
  id: number;
  name: string | null;
  status: string | null;
  branch: string | null;
  enrollment_date: Date | string | null;
  grade_chapter: string | null;
  pcm_progress_json: unknown;
  guardian_name: string | null;
  guardian_mobile: string | null;
  /** From LEFT JOIN with `ade_group`. May be null when the table doesn't
   *  have an entry for this student yet. */
  age_group?: string | null;
}

type SkipReason = "missing_branch" | "unknown_branch" | "missing_grade" | "bad_grade_format";

function rowToStudent(row: StudentRow): { student: Student } | { skip: SkipReason } {
  if (!row.branch) return { skip: "missing_branch" };
  const branch = normaliseBranch(row.branch);
  if (!branch) return { skip: "unknown_branch" };
  if (!row.grade_chapter) return { skip: "missing_grade" };
  const gc = parseGradeChapter(row.grade_chapter);
  if (!gc) return { skip: "bad_grade_format" };

  // ade_group is the source of truth when available; fall back to the
  // grade-based heuristic so older records (or local dev DBs without the
  // table) keep working.
  const ageCategory = normaliseAgeGroup(row.age_group) ?? ageCategoryFromGrade(gc.grade);

  return {
    student: {
      id: String(row.id),
      name: row.name ?? "",
      branch,
      grade: gc.grade,
      ageCategory,
      credit: gc.credit,
      faHistory: parseFaHistory(row.pcm_progress_json, gc.grade),
      parentName: row.guardian_name ?? "",
      parentPhone: row.guardian_mobile ?? "",
      enrolmentDate: toIsoDate(row.enrollment_date),
      active: (row.status ?? "").toLowerCase() === "active",
    },
  };
}


/** Pulls every row from `studentrecords` and joins age-group info from
 *  `ade_group` (Heidi). Uses LEFT JOIN so no students are dropped if the
 *  ade_group row is missing. If the ade_group table doesn't exist on this
 *  DB yet, we transparently re-query without the join and log a warning so
 *  the FA pages keep working during the migration window. */
export async function fetchAllStudents(): Promise<{ students: Student[]; report: StudentLoadReport }> {
  // ASSUMPTION about ade_group schema (adjust here if Heidi differs):
  //   - foreign key column linking to studentrecords.id is `student_id`
  //   - the human-readable category lives in `group_name`
  //     (case-insensitive; Junior / Middler / Senior)
  // Other column names are tolerated via normaliseAgeGroup() which only
  // looks at the first few characters.
  let rows: StudentRow[];
  let ageGroupJoinAvailable = true;
  try {
    const result = await pool.query<StudentRow>(
      `SELECT s.id, s.name, s.status, s.branch, s.enrollment_date, s.grade_chapter,
              s.pcm_progress_json, s.guardian_name, s.guardian_mobile,
              ag.group_name AS age_group
         FROM studentrecords s
         LEFT JOIN ade_group ag ON ag.student_id = s.id`
    );
    rows = result.rows;
  } catch (err) {
    ageGroupJoinAvailable = false;
    console.warn(
      "[FA] ade_group join failed (table or column missing?) — falling back to grade-derived age category:",
      err instanceof Error ? err.message : err
    );
    const result = await pool.query<StudentRow>(
      `SELECT id, name, status, branch, enrollment_date, grade_chapter, pcm_progress_json,
              guardian_name, guardian_mobile
         FROM studentrecords`
    );
    rows = result.rows;
  }

  const students: Student[] = [];
  const report: StudentLoadReport = {
    loaded: 0,
    skipped: { missing_branch: 0, unknown_branch: 0, missing_grade: 0, bad_grade_format: 0 },
    samples: [],
    ageGroupJoinAvailable,
  };

  for (const r of rows) {
    const result = rowToStudent(r);
    if ("student" in result) {
      students.push(result.student);
      report.loaded++;
    } else {
      report.skipped[result.skip]++;
      // Keep a handful of samples per reason so the team can see real cases
      // when diagnosing missing students.
      if (report.samples.filter(s => s.reason === result.skip).length < 5) {
        report.samples.push({
          id: r.id,
          reason: result.skip,
          branch: r.branch,
          grade_chapter: r.grade_chapter,
        });
      }
    }
  }

  const totalSkipped =
    report.skipped.missing_branch +
    report.skipped.unknown_branch +
    report.skipped.missing_grade +
    report.skipped.bad_grade_format;
  if (totalSkipped > 0) {
    console.warn(
      `[FA] Loaded ${report.loaded} students; skipped ${totalSkipped} (` +
        `missing_branch=${report.skipped.missing_branch}, ` +
        `unknown_branch=${report.skipped.unknown_branch}, ` +
        `missing_grade=${report.skipped.missing_grade}, ` +
        `bad_grade_format=${report.skipped.bad_grade_format})`
    );
    if (report.samples.length > 0) {
      console.warn("[FA] Sample skipped rows:", report.samples);
    }
  }

  return { students, report };
}
