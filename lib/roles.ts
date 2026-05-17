// Single source of truth for authentication roles stored on User.role.
//
// These are the values that appear in the `role` column of the User table and
// are copied into the NextAuth JWT / session. They are distinct from the
// employee-facing display labels in lib/constants.ts (CEO / FT HOD / etc.),
// which describe an Employee record, not an auth principal.
//
// Rules:
//   - All role checks in the app MUST go through the predicates below.
//   - Never compare session.user.role to a string literal directly — use a
//     predicate so typos, case drift, and future-added roles are caught once,
//     in one place.
//   - Predicates are fail-closed: an unknown / missing / malformed role
//     returns false, never true.

export const ROLES = {
  SUPER_ADMIN:    "SUPER_ADMIN",
  ADMIN:          "ADMIN",
  BRANCH_MANAGER: "BRANCH_MANAGER",
  HOD:            "HOD",
  HR:             "HR",
  EXECUTIVE:      "EXECUTIVE",
  INTERN:         "INTERN",
  FULL_TIME:      "Full_Time",
  PART_TIME:      "Part_Time",
  ACADEMY:        "ACADEMY",
  MARKETING:      "MARKETING",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

// Tuple form for use with zod's z.enum(), which requires a non-empty tuple
// type rather than a plain array. Keep this in sync with ROLES.
export const ROLE_VALUES = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.BRANCH_MANAGER,
  ROLES.HOD,
  ROLES.HR,
  ROLES.EXECUTIVE,
  ROLES.INTERN,
  ROLES.FULL_TIME,
  ROLES.PART_TIME,
  ROLES.ACADEMY,
  ROLES.MARKETING,
] as const;

// Accepts common drift (case, underscores vs. hyphens, stray whitespace) and
// returns the canonical Role, or null when nothing matches. Any code reading
// session.user.role should route it through this once.
export function normalizeRole(raw: unknown): Role | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  for (const r of ALL_ROLES) if (r === trimmed) return r;

  const key = trimmed.toUpperCase().replace(/[-\s]+/g, "_");
  const aliases: Record<string, Role> = {
    SUPER_ADMIN:    ROLES.SUPER_ADMIN,
    SUPERADMIN:     ROLES.SUPER_ADMIN,
    ADMIN:          ROLES.ADMIN,
    BRANCH_MANAGER: ROLES.BRANCH_MANAGER,
    BRANCHMANAGER:  ROLES.BRANCH_MANAGER,
    BM:             ROLES.BRANCH_MANAGER,
    HOD:            ROLES.HOD,
    HR:             ROLES.HR,
    EXECUTIVE:      ROLES.EXECUTIVE,
    EXEC:           ROLES.EXECUTIVE,
    INTERN:         ROLES.INTERN,
    INT:            ROLES.INTERN,
    FULL_TIME:      ROLES.FULL_TIME,
    FULLTIME:       ROLES.FULL_TIME,
    PART_TIME:      ROLES.PART_TIME,
    PARTTIME:       ROLES.PART_TIME,
    ACADEMY:        ROLES.ACADEMY,
    MARKETING:      ROLES.MARKETING,
    MKT:            ROLES.MARKETING,
  };
  return aliases[key] ?? null;
}

// ─── Role groupings ──────────────────────────────────────────────────────────

export const ADMIN_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR];

export const MANAGEMENT_ROLES: readonly Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.BRANCH_MANAGER,
  ROLES.HOD,
  ROLES.HR,
];

export const EMPLOYEE_ROLES: readonly Role[] = [ROLES.PART_TIME, ROLES.FULL_TIME];

export const TRAINING_EDIT_ROLES: readonly Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.ACADEMY,
];

// ─── Predicates ──────────────────────────────────────────────────────────────

function hasRole(raw: unknown, allowed: readonly Role[]): boolean {
  const r = normalizeRole(raw);
  return r !== null && allowed.includes(r);
}

export const isSuperAdmin    = (raw: unknown) => hasRole(raw, [ROLES.SUPER_ADMIN]);
export const isAdmin         = (raw: unknown) => hasRole(raw, ADMIN_ROLES);
export const isBranchManager = (raw: unknown) => hasRole(raw, [ROLES.BRANCH_MANAGER]);
export const isHOD           = (raw: unknown) => hasRole(raw, [ROLES.HOD]);
export const isHR            = (raw: unknown) => hasRole(raw, [ROLES.HR]);
export const isExecutive     = (raw: unknown) => hasRole(raw, [ROLES.EXECUTIVE]);
export const isIntern        = (raw: unknown) => hasRole(raw, [ROLES.INTERN]);
export const isFullTime      = (raw: unknown) => hasRole(raw, [ROLES.FULL_TIME]);
export const isPartTime      = (raw: unknown) => hasRole(raw, [ROLES.PART_TIME]);
export const isAcademy       = (raw: unknown) => hasRole(raw, [ROLES.ACADEMY]);
export const isMarketing     = (raw: unknown) => hasRole(raw, [ROLES.MARKETING]);
export const isEmployee      = (raw: unknown) => hasRole(raw, EMPLOYEE_ROLES);
export const isManagement    = (raw: unknown) => hasRole(raw, MANAGEMENT_ROLES);

export function hasAnyRole(raw: unknown, allowed: readonly Role[]): boolean {
  return hasRole(raw, allowed);
}
