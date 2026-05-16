// ============================================================================
// FA System — Core Domain Types
// ============================================================================

/** All 20 eBright branches. Code is the shortform used throughout the app. */
export const BRANCHES = [
  { code: "ONL", name: "Online" },
  { code: "ST",  name: "Subang Taipan" },
  { code: "SA",  name: "Setia Alam" },
  { code: "SP",  name: "Sri Petaling" },
  { code: "KD",  name: "Kota Damansara" },
  { code: "PJY", name: "Putrajaya" },
  { code: "AMP", name: "Ampang" },
  { code: "CJY", name: "Cyberjaya" },
  { code: "KLG", name: "Klang" },
  { code: "DA",  name: "Denai Alam" },
  { code: "BBB", name: "Bandar Baru Bangi" },
  { code: "DK",  name: "Danau Kota" },
  { code: "SHA", name: "Shah Alam" },
  { code: "BTHO",name: "Bandar Tun Hussein Onn" },
  { code: "EGR", name: "Eco Grandeur" },
  { code: "BSP", name: "Bandar Seri Putra" },
  { code: "RBY", name: "Bandar Rimbayu" },
  { code: "TSG", name: "Taman Sri Gombak" },
  { code: "KW",  name: "Kota Warisan" },
  { code: "KTG", name: "Kajang TTDI" },
] as const;

export type BranchCode = typeof BRANCHES[number]["code"];

// ----------------------------------------------------------------------------
// Users & Auth
// ----------------------------------------------------------------------------
export type Role = "MKT" | "BM";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** For BM users — the branch they manage. Null for MKT. */
  branch: BranchCode | null;
}

// ----------------------------------------------------------------------------
// Event
// ----------------------------------------------------------------------------
export type EventStatus =
  | "draft"      // Being set up by marketing, not visible to BMs yet
  | "open"       // BMs can now invite students
  | "closed"     // Invitation window closed, waiting for event day
  | "ongoing"    // Happening right now (between startDate and endDate)
  | "completed"; // Finished

export interface FAEvent {
  id: string;
  name: string;                 // e.g. "April 2026 Foundation Appraisal"
  month: number;                // 1–12
  year: number;
  venue: string;                // Free text — e.g. "eBright HQ Subang"
  startDate: string;            // ISO date
  endDate: string;              // ISO date (== startDate for 1-day events)
  numberOfDays: 1 | 2 | 3;
  invitationOpenDate: string;   // When BMs can start inviting
  invitationCloseDate: string;  // Deadline for invitations
  status: EventStatus;
  createdBy: string;            // User id
  createdAt: string;            // ISO timestamp
  notes?: string;
}

// ----------------------------------------------------------------------------
// Session — a time slot within an event day
// ----------------------------------------------------------------------------
export interface Session {
  id: string;
  eventId: string;
  dayNumber: 1 | 2 | 3;         // Which day of the event
  sessionNumber: number;        // 1, 2, 3... within the day
  startTime: string;            // "09:00"
  endTime: string;              // "10:00"
  /** Optional label — e.g. "Morning Batch A" */
  label?: string;
}

// ----------------------------------------------------------------------------
// Session Quota — per-branch allocation for a given session
// e.g. Session 1 → ST: 7 slots, SA: 5 slots, SP: 2 slots
// ----------------------------------------------------------------------------
export interface SessionQuota {
  id: string;
  sessionId: string;
  branch: BranchCode;
  quota: number;                // How many students this branch can invite
}

// ----------------------------------------------------------------------------
// Student
// ----------------------------------------------------------------------------
/** Age band stored on the student record (independent of curriculum grade —
 *  an older student joining at grade 1 still carries their real age band). */
export type AgeCategory = "Junior" | "Middler" | "Senior";

export interface Student {
  id: string;
  name: string;
  branch: BranchCode;
  grade: number;                // 1–8 (curriculum level)
  ageCategory: AgeCategory;     // age band — independent of grade
  credit: number;               // 1–12. Credit 12 IS the showcase itself.
  /** Record of past FA completions by grade. e.g. {1: true, 2: true, 3: false} */
  faHistory: Record<number, boolean>;
  parentName: string;
  parentPhone: string;
  enrolmentDate: string;        // ISO date
  active: boolean;
}

/** Eligibility rule: any active student can be invited to FA. The dashboard
 *  tracks an FA-progress checkbox per grade up to and including the student's
 *  current grade, so the FA invite picker must match — a G1 student can be
 *  invited for G1 FA, a G2 student for G1 or G2, etc. */
export function isStudentEligible(student: Student): boolean {
  return student.active;
}

/** Stats about a single `fetchAllStudents` call — populated by the API and
 *  shipped to the client so the UI can surface dropped rows that need
 *  fixing in Heidi. Lives in the shared types module so both the
 *  server-only loader and the client store can reference it. */
export interface StudentLoadReport {
  loaded: number;
  skipped: {
    missing_branch: number;
    unknown_branch: number;
    missing_grade: number;
    bad_grade_format: number;
  };
  samples: Array<{
    id: number;
    reason: "missing_branch" | "unknown_branch" | "missing_grade" | "bad_grade_format";
    branch: string | null;
    grade_chapter: string | null;
  }>;
  /** True if the `ade_group` join succeeded. When false, age-category labels
   *  are still derived from grade as a fallback. */
  ageGroupJoinAvailable: boolean;
}

/** Check if student has a backlog — any completed grade below current where FA was not done. */
export function hasBacklog(student: Student): boolean {
  for (let g = 1; g < student.grade; g++) {
    if (student.faHistory[g] !== true) return true;
  }
  return false;
}

/** Chapter at which a student becomes eligible for their CURRENT-grade FA.
 *  The classroom rule: a student must have progressed to C9 within their
 *  current grade before they can sit for that grade's Foundation Appraisal.
 *  Grades they've already completed (i.e., grades below current) are always
 *  available — they've moved past, so the tickbox is just recording history. */
export const FA_CURRENT_GRADE_MIN_CHAPTER = 9;

/** The list of grades a student can be invited to appraise right now.
 *    - All grades below current grade are always returned (past grades).
 *    - The current grade is only returned if student.credit >= 9
 *      (the C9 threshold for current-grade FA eligibility).
 *  Returned in ascending order. */
export function invitableGradesFor(student: Student): number[] {
  const grades: number[] = [];
  for (let g = 1; g < student.grade; g++) grades.push(g);
  if (student.credit >= FA_CURRENT_GRADE_MIN_CHAPTER) {
    grades.push(student.grade);
  }
  return grades;
}

// ----------------------------------------------------------------------------
// Invitation — one student invited to one session
// ----------------------------------------------------------------------------
export type InvitationStatus =
  | "invited"       // BM has invited the student (called parent)
  | "confirmed"     // Parent confirmed attendance
  | "declined"      // Parent declined
  | "attended"      // Student showed up on the day
  | "no_show";      // Student did not show up

export interface Invitation {
  id: string;
  eventId: string;
  sessionId: string;
  studentId: string;
  branch: BranchCode;
  /** Grade the student is being appraised for in this invitation.
   *  May differ from student.grade when clearing backlog. */
  targetGrade: number;
  status: InvitationStatus;
  invitedBy: string;            // User id (BM)
  invitedAt: string;
  confirmedAt?: string;
  attendanceMarkedAt?: string;
  attendanceMarkedBy?: string;
  notes?: string;
}

// ----------------------------------------------------------------------------
// Derived / view-model types (used by pages, not stored)
// ----------------------------------------------------------------------------
export interface SessionWithDetails extends Session {
  quotas: SessionQuota[];
  invitations: Invitation[];
  totalQuota: number;
  totalInvited: number;
  totalConfirmed: number;
  totalAttended: number;
}

export interface EventWithStats extends FAEvent {
  totalSessions: number;
  totalQuota: number;
  totalInvited: number;
  totalConfirmed: number;
  totalAttended: number;
}
