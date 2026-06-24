/**
 * Ebright internal departments that receive **directed tickets**.
 *
 * Each department is modelled as a ticket platform (tkt_platform) whose slug is
 * one of DEPARTMENT_SLUGS below. A branch submits a ticket under **"Others"**
 * and picks the department; the ticket is then visible to the Super Admin and
 * that one department only (the department account is platform_admin of its own
 * department platform — branch-manager-level, never ticket super_admin).
 *
 * Departments are NOT teaching branches. Only Marketing + Operation also get
 * the Lead system; the rest are tickets-only. "Operation" here is its own
 * department and is distinct from the internal "00 Ebright (OD)" branch.
 */

export interface DepartmentDef {
  /** tkt_platform.slug used to identify this department platform. */
  slug: string
  /** Display name (also the tkt_platform.name). */
  name: string
  /** Short code for the ticket number prefix (tkt_platform.code). */
  code: string
  /** The account that triages this department's tickets. */
  email: string
  /** Marketing + Operation also get the CRM Lead system; others are tickets-only. */
  hasLeadSystem: boolean
}

export const DEPARTMENTS: readonly DepartmentDef[] = [
  { slug: 'dept-marketing', name: 'Marketing', code: 'MKT', email: 'marketing@ebright.my', hasLeadSystem: true },
  { slug: 'dept-operation', name: 'Operation', code: 'OPS', email: 'operation@ebright.my', hasLeadSystem: true },
  { slug: 'dept-hr',        name: 'HR',         code: 'HR',  email: 'hr@gmail.com',         hasLeadSystem: false },
  { slug: 'dept-finance',   name: 'Finance',    code: 'FIN', email: 'finance@ebright.my',   hasLeadSystem: false },
  { slug: 'dept-academy',   name: 'Academy',    code: 'ACD', email: 'academy@gmail.com',    hasLeadSystem: false },
  { slug: 'dept-ceo',       name: 'CEO',        code: 'CEO', email: 'kevinkhoo@ebright.my', hasLeadSystem: false },
] as const

export const DEPARTMENT_SLUGS: ReadonlySet<string> = new Set(DEPARTMENTS.map((d) => d.slug))
export const DEPARTMENT_EMAILS: ReadonlySet<string> = new Set(DEPARTMENTS.map((d) => d.email.toLowerCase()))
export const DEPARTMENT_LEAD_EMAILS: ReadonlySet<string> = new Set(
  DEPARTMENTS.filter((d) => d.hasLeadSystem).map((d) => d.email.toLowerCase()),
)

export function isDepartmentSlug(slug: string | null | undefined): boolean {
  return !!slug && DEPARTMENT_SLUGS.has(slug)
}

export function departmentForEmail(email: string | null | undefined): DepartmentDef | null {
  if (!email) return null
  return DEPARTMENTS.find((d) => d.email.toLowerCase() === email.toLowerCase()) ?? null
}

export function departmentForSlug(slug: string | null | undefined): DepartmentDef | null {
  if (!slug) return null
  return DEPARTMENTS.find((d) => d.slug === slug) ?? null
}

/** A department account that should keep the CRM Lead module (Marketing/Operation). */
export function departmentHasLeadSystem(email: string | null | undefined): boolean {
  const d = departmentForEmail(email)
  return !!d && d.hasLeadSystem
}
