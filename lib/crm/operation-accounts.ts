/**
 * Operation / marketing-oversight accounts.
 *
 * These are elevated accounts (they can view across branches) but with a
 * deliberately trimmed experience:
 *   - sidebar limited to lead oversight (see components/crm/sidebar.tsx)
 *   - topbar shows "Operation View" only — NO Agency View toggle, NO super-admin
 *     tooling
 *   - branch lists / filters exclude the internal "OD" and "Marketing" branches
 *
 * Gated by email so we don't have to mint a dedicated role. Add addresses here
 * to grant the same treatment.
 */
export const OPERATION_EMAILS = new Set<string>([
  'operation@ebright.my',
  'nuraihanhanisah2002@gmail.com',
])

export function isOperationAccount(email: string | null | undefined): boolean {
  return !!email && OPERATION_EMAILS.has(email.trim().toLowerCase())
}

/**
 * Branch names hidden from operation accounts everywhere a branch list is shown
 * (topbar switcher, Day Distribution, etc.) — the internal OD + Marketing
 * branches, which aren't part of lead operations.
 */
export const OPERATION_HIDDEN_BRANCHES = new Set<string>([
  '00 Ebright (OD)',
  'Ebright Marketing',
])

/** True when a branch name should be hidden from operation accounts. */
export function isHiddenForOperation(branchName: string | null | undefined): boolean {
  return !!branchName && OPERATION_HIDDEN_BRANCHES.has(branchName.trim())
}
