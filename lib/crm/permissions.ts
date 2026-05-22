/**
 * CRM RBAC permission system.
 *
 * Roles map 1-to-1 with the `CrmUserRole` enum in schema.prisma.
 *
 * Usage:
 *   if (!hasPermission(userRole, 'contacts:delete')) return forbidden()
 *   requirePermission(userRole, 'settings:write')  // throws CrmPermissionError
 */

export type CrmRole =
  | 'SUPER_ADMIN'
  | 'AGENCY_ADMIN'
  | 'BRANCH_MANAGER'
  | 'BRANCH_STAFF'

export type CrmUserRole = CrmRole

export type CrmPermission =
  // Contacts
  | 'contacts:read'
  | 'contacts:write'
  | 'contacts:delete'
  | 'contacts:export'
  // Opportunities
  | 'opportunities:read'
  | 'opportunities:write'
  | 'opportunities:delete'
  // Automations
  | 'automations:read'
  | 'automations:write'
  | 'automations:delete'
  // Settings
  | 'settings:read'
  | 'settings:write'
  // Team management
  | 'team:read'
  | 'team:write'
  | 'team:delete'
  // Branch management
  | 'branches:read'
  | 'branches:write'
  | 'branches:delete'
  // Pipelines
  | 'pipelines:read'
  | 'pipelines:write'
  // Audit logs
  | 'audit:read'
  // Integrations
  | 'integrations:read'
  | 'integrations:write'
  // API keys
  | 'api_keys:read'
  | 'api_keys:write'
  // Messaging
  | 'messages:read'
  | 'messages:write'
  // Dashboard & reports
  | 'dashboard:read'
  | 'reports:read'
  // Tickets (ticketing module)
  | 'tickets:read'
  | 'tickets:write'
  | 'tickets:delete'
  | 'tickets:admin'    // approve / reject / assign
  // Ticket platforms management
  | 'tkt_platforms:read'
  | 'tkt_platforms:write'
  | 'tkt_platforms:delete'
  // Ticket branches management
  | 'tkt_branches:read'
  | 'tkt_branches:write'
  | 'tkt_branches:delete'
  // Ticket users management
  | 'tkt_users:read'
  | 'tkt_users:write'
  | 'tkt_users:delete'

// ─── All permissions for convenience ─────────────────────────────────────────

const ALL_PERMISSIONS: CrmPermission[] = [
  'contacts:read',
  'contacts:write',
  'contacts:delete',
  'contacts:export',
  'opportunities:read',
  'opportunities:write',
  'opportunities:delete',
  'automations:read',
  'automations:write',
  'automations:delete',
  'settings:read',
  'settings:write',
  'team:read',
  'team:write',
  'team:delete',
  'branches:read',
  'branches:write',
  'branches:delete',
  'pipelines:read',
  'pipelines:write',
  'audit:read',
  'integrations:read',
  'integrations:write',
  'api_keys:read',
  'api_keys:write',
  'messages:read',
  'messages:write',
  'dashboard:read',
  'reports:read',
  'tickets:read',
  'tickets:write',
  'tickets:delete',
  'tickets:admin',
  'tkt_platforms:read',
  'tkt_platforms:write',
  'tkt_platforms:delete',
  'tkt_branches:read',
  'tkt_branches:write',
  'tkt_branches:delete',
  'tkt_users:read',
  'tkt_users:write',
  'tkt_users:delete',
]

// ─── Role → permission matrix ─────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<CrmRole, ReadonlyArray<CrmPermission>> = {
  // Full platform access
  SUPER_ADMIN: ALL_PERMISSIONS,

  // Full access within their tenant
  AGENCY_ADMIN: ALL_PERMISSIONS,

  // Manages their branch(es) — can run automations, read settings, see team
  BRANCH_MANAGER: [
    'contacts:read',
    'contacts:write',
    'contacts:delete',
    'contacts:export',
    'opportunities:read',
    'opportunities:write',
    'opportunities:delete',
    'automations:read',
    'automations:write',
    'automations:delete',
    'settings:read',
    'team:read',
    'branches:read',
    'pipelines:read',
    'pipelines:write',
    'messages:read',
    'messages:write',
    'dashboard:read',
    'reports:read',
  ],

  // Front-line staff — contact & opportunity management + messaging only
  BRANCH_STAFF: [
    'contacts:read',
    'contacts:write',
    'opportunities:read',
    'opportunities:write',
    'messages:read',
    'messages:write',
    'dashboard:read',
    // Ticket module: all staff can submit and view their own tickets
    'tickets:read',
    'tickets:write',
  ],
}

// ─── Ticket module role system ────────────────────────────────────────────────
// Separate from CRM roles — stored in tkt_user_profile.role

export type TktRole = 'super_admin' | 'platform_admin' | 'user'

export function hasTktPermission(role: TktRole, action: 'read' | 'write' | 'admin' | 'super'): boolean {
  if (role === 'super_admin') return true
  if (role === 'platform_admin') return action !== 'super'
  // 'user' role: own tickets only (read + write own)
  return action === 'read' || action === 'write'
}

// ─── Lookup sets (O(1) checks) ────────────────────────────────────────────────

const PERMISSION_SETS: Record<CrmRole, ReadonlySet<CrmPermission>> = {
  SUPER_ADMIN: new Set(ROLE_PERMISSIONS.SUPER_ADMIN),
  AGENCY_ADMIN: new Set(ROLE_PERMISSIONS.AGENCY_ADMIN),
  BRANCH_MANAGER: new Set(ROLE_PERMISSIONS.BRANCH_MANAGER),
  BRANCH_STAFF: new Set(ROLE_PERMISSIONS.BRANCH_STAFF),
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns `true` if `role` is granted `permission`.
 */
export function hasPermission(role: CrmRole, permission: CrmPermission): boolean {
  return PERMISSION_SETS[role].has(permission)
}

/**
 * Error thrown by `requirePermission` when access is denied.
 */
export class CrmPermissionError extends Error {
  public readonly role: CrmRole
  public readonly permission: CrmPermission
  public readonly statusCode = 403

  constructor(role: CrmRole, permission: CrmPermission) {
    super(`[CRM] Role '${role}' does not have permission '${permission}'`)
    this.name = 'CrmPermissionError'
    this.role = role
    this.permission = permission
  }
}

/**
 * Assert that `role` has `permission`. Throws `CrmPermissionError` if denied.
 * Use this inside server actions / API handlers after resolving the user's role.
 *
 * @throws {CrmPermissionError}
 */
export function requirePermission(role: CrmRole, permission: CrmPermission): void {
  if (!hasPermission(role, permission)) {
    throw new CrmPermissionError(role, permission)
  }
}

/**
 * Return the full list of permissions granted to `role`.
 */
export function getPermissionsForRole(role: CrmRole): ReadonlyArray<CrmPermission> {
  return ROLE_PERMISSIONS[role]
}

/**
 * Return all defined CRM roles.
 */
export function getAllRoles(): CrmRole[] {
  return ['SUPER_ADMIN', 'AGENCY_ADMIN', 'BRANCH_MANAGER', 'BRANCH_STAFF']
}
