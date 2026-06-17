// Single source of truth for which roles can see which dashboards.
//
// Pure frontend gating: edit this file, redeploy. There is no DB, no API, and
// no admin UI to flip these — the modal in AccountManagement is read-only.
//
// Real security is still enforced server-side by middleware.ts. This file
// controls UI visibility (sidebar items, dashboard cards) so users don't see
// links they can't reach.

import { ROLES, normalizeRole, type Role } from "./roles";

// ─── Tree definition ────────────────────────────────────────────────────────

export interface DashboardNode {
  /** Stable key. Parents and children share the same prefix: "hrms", "hrms.attendance". */
  key: string;
  label: string;
  /** Target route. Omit on group-only parents that have no landing page. */
  href?: string;
  icon?: string;
  children?: DashboardNode[];
}

// Mirrors the Sidebar + DashboardHome trees. When you add a new dashboard or
// sub-page anywhere, add it here too — otherwise it won't appear for anyone
// except SUPER_ADMIN / ADMIN (which get the "*" wildcard).
export const DASHBOARD_TREE: DashboardNode[] = [
  { key: "home", label: "Home", href: "/home", icon: "🏠" },

  {
    key: "library",
    label: "Library",
    href: "/dashboards/library",
    icon: "📚",
    children: [
      { key: "library.documents", label: "Documents", href: "#" },
      { key: "library.resources", label: "Resources", href: "#" },
    ],
  },

  {
    key: "internal-dashboard",
    label: "Internal Dashboard",
    href: "/dashboards/internal-dashboard",
    icon: "📊",
    children: [
      { key: "internal-dashboard.analytics", label: "Analytics", href: "#" },
      { key: "internal-dashboard.reports",   label: "Reports",   href: "#" },
    ],
  },

  {
    key: "hrms",
    label: "HRMS",
    href: "/dashboards/hrms",
    icon: "👥",
    children: [
      { key: "hrms.employee",         label: "Employee Dashboard",   href: "/dashboard-employee-management" },
      { key: "hrms.manpower-planning",label: "Manpower Planning",    href: "/manpower-schedule" },
      { key: "hrms.claims",           label: "Claims",               href: "/claim" },
      { key: "hrms.attendance",       label: "Attendance",           href: "/attendance" },
      { key: "hrms.onboarding",       label: "Onboarding",           href: "/onboarding" },
      { key: "hrms.offboarding",      label: "Offboarding",          href: "/offboarding" },
      { key: "hrms.hr-dashboard",     label: "HR Dashboard",         href: "/hr-dashboard" },
      { key: "hrms.manpower-cost",    label: "Manpower Cost Report", href: "/manpower-cost-report" },
      { key: "hrms.staff-directory",  label: "Staff Directory",      href: "/staff-directory" },
      { key: "hrms.account",          label: "Account Management",   href: "/account-management" },
    ],
  },

  {
    key: "crm",
    label: "CRM",
    href: "/dashboards/crm",
    icon: "📰",
    children: [
      { key: "crm.lead",   label: "Lead",   href: "/crm/dashboard" },
      { key: "crm.ticket", label: "Ticket", href: "/crm/tickets/dashboard" },
    ],
  },

  {
    key: "sms",
    label: "SMS",
    href: "/dashboards/sms",
    icon: "💬",
    children: [
      { key: "sms.messages",  label: "Messages",  href: "#" },
      { key: "sms.templates", label: "Templates", href: "#" },
      { key: "sms.burnlist",  label: "Burnlist",  href: "/burnlist" },
    ],
  },

  {
    key: "inventory",
    label: "Inventory",
    href: "/dashboards/inventory",
    icon: "📦",
    children: [
      { key: "inventory.stock",     label: "Stock Management", href: "#" },
      { key: "inventory.warehouse", label: "Warehouse",        href: "#" },
    ],
  },

  {
    key: "academy",
    label: "Academy",
    href: "/academy",
    icon: "🎓",
    children: [
      { key: "academy.events",  label: "Event Management", href: "/academy" },
      { key: "academy.courses", label: "Courses",          href: "#" },
    ],
  },

  // FA System lives as its own top-level tile on the home dashboard (was
  // previously a sub-item under HRMS). The internal route /fa-system has
  // its own SessionSync-driven nav so we don't list children here.
  {
    key: "fa-system",
    label: "FA System",
    href: "/fa-system",
    icon: "🎗️",
  },

  // PCM System — academy-owned counterpart of FA. Mirrors the same
  // event/session/invitation shape but with its own pcm_* DB tables and
  // pcm_progress_json on studentrecords. The internal /pcm-system route
  // has its own SessionSync-driven nav (ACADEMY / ADMIN / SUPER_ADMIN
  // get the Academy view, BRANCH_MANAGER gets the BM view).
  {
    key: "pcm-system",
    label: "PCM System",
    href: "/pcm-system",
    icon: "🎯",
  },

  {
    key: "annual-showcase",
    label: "Annual Showcase",
    href: "/annual-showcase",
    icon: "🎪",
    children: [
      { key: "annual-showcase.oc",           label: "Organizing Committee", href: "/annual-showcase/oc" },
      { key: "annual-showcase.procurement",  label: "Procurement",          href: "/annual-showcase/procurement" },
      { key: "annual-showcase.sponsorship",  label: "Sponsorship & VVIP",   href: "/annual-showcase/sponsorship" },
      { key: "annual-showcase.media",        label: "Media & Publicity",    href: "/annual-showcase/media" },
      { key: "annual-showcase.showcase",     label: "Showcase & Production",href: "/annual-showcase/showcase" },
      { key: "annual-showcase.logistics",    label: "Logistics",            href: "/annual-showcase/logistics" },
      { key: "annual-showcase.youthpreneur", label: "Youthpreneur",         href: "/annual-showcase/youthpreneur" },
      { key: "annual-showcase.ceo",          label: "CEO Unit",             href: "/annual-showcase/ceo" },
    ],
  },
];

// ─── Role allowlists ────────────────────────────────────────────────────────

/**
 * "*" = full access (every dashboard, including ones added later).
 *
 * Otherwise a list of keys. Listing a parent key (e.g. "hrms") grants every
 * descendant ("hrms.attendance", "hrms.claims", ...). To be more granular,
 * list specific child keys instead of the parent.
 *
 * Roles not listed here fall through to an empty allowlist (no access).
 */
export const ROLE_ACCESS: Record<Role, readonly string[] | "*"> = {
  [ROLES.SUPER_ADMIN]:    "*",
  [ROLES.ADMIN]:          "*",

  // Matches the original DashboardDetail rule "HR sees everything in HRMS
  // except manpower-planning" — granting the whole "hrms" branch then it's
  // narrowed by the user-specific override map if needed.
  [ROLES.HR]: [
    "home",
    "hrms.employee",
    "hrms.claims",
    "hrms.attendance",
    "hrms.onboarding",
    "hrms.offboarding",
    "hrms.hr-dashboard",
    "hrms.manpower-cost",
    "fa-system",
    "hrms.account",
    "internal-dashboard",
    "library",
  ],

  [ROLES.HOD]: [
    "home",
    "hrms",                       // HODs see the whole HRMS branch
    "fa-system",                  // explicit since fa-system is now top-level
    "library",
  ],

  // Original BM rule was "manpower-planning + fa-system" inside HRMS, plus
  // other tiles outside HRMS. Kept narrow so overrides can extend per-BM.
  // BMs also get pcm-system (they're the branch-side of every assessment).
  [ROLES.BRANCH_MANAGER]: [
    "home",
    "hrms.manpower-planning",
    "hrms.manpower-cost",         // branch-scoped cost report + Branch Team roster
    "fa-system",
    "pcm-system",
    "crm",
    "inventory",
    "sms",
  ],

  // Regional managers are a CRM-only role: they reach the portal solely to get
  // into the CRM (regional dashboard). Home shell + the CRM tile, nothing else.
  [ROLES.REGIONAL_MANAGER]: [
    "home",
    "crm",
  ],

  [ROLES.EXECUTIVE]: [
    "home",
    "hrms.attendance",
    "hrms.claims",
    "library",
  ],

  [ROLES.ACADEMY]: [
    "home",
    "hrms.employee",
    "inventory",
    "academy",
    "fa-system",                  // Academy has full FA access (matches SessionSync)
    "pcm-system",                 // PCM is academy-owned — full access
    "annual-showcase",            // Annual Showcase is academy-managed
  ],

  [ROLES.INTERN]:    ["home", "hrms.attendance", "hrms.claims", "library"],
  [ROLES.FULL_TIME]: ["home", "hrms.manpower-cost"],
  [ROLES.PART_TIME]: ["home", "hrms.manpower-cost"],

  // Marketing department — full FA access (matches SessionSync's back-office
  // role rule). Same baseline tiles as Academy until requirements diverge.
  [ROLES.MARKETING]: [
    "home",
    "fa-system",
    "crm",
    "inventory",
  ],
};

// ─── Access check ──────────────────────────────────────────────────────────

/**
 * Keys that are visible to every role by default — no need to list them in
 * each role's allowlist. Per-user DENIED overrides still hide them.
 *
 * Use sparingly: only add keys here that genuinely belong to "everyone in
 * the company can see this" (e.g. the staff directory).
 */
const PUBLIC_KEYS: ReadonlySet<string> = new Set([
  "hrms.staff-directory",
]);

/** Per-user override map. Missing key = no override; falls through to role default. */
export type DashboardOverrides = Record<string, "ALLOWED" | "DENIED">;

/**
 * Returns true if the dashboard with `key` is visible.
 *
 * Resolution order (most specific wins):
 *   1. Exact-key override on `key` (ALLOWED or DENIED).
 *   2. Override on the closest ancestor key (e.g. an override on "crm"
 *      cascades to "crm.lead" / "crm.ticket"). Longer prefix beats shorter.
 *   3. Role default from ROLE_ACCESS.
 *
 * Why ancestor cascade: when an admin ticks "CRM" in the permission modal,
 * intuitively that should grant every CRM sub-page. Storing one row per leaf
 * would work but bloats the JSON; one parent row + cascade is the same idea
 * with less data. A child can still be overridden individually because exact
 * matches win.
 *
 * Fail-closed: an unknown / missing role returns false.
 */
export function canAccess(
  rawRole: unknown,
  key: string,
  overrides?: DashboardOverrides | null,
): boolean {
  // Step 1: exact override
  const exact = overrides?.[key];
  if (exact === "ALLOWED") return true;
  if (exact === "DENIED")  return false;

  // Step 2: closest ancestor override
  if (overrides) {
    let bestPrefix = "";
    let bestValue: "ALLOWED" | "DENIED" | undefined;
    for (const [overrideKey, value] of Object.entries(overrides)) {
      if (key.startsWith(overrideKey + ".") && overrideKey.length > bestPrefix.length) {
        bestPrefix = overrideKey;
        bestValue  = value;
      }
    }
    if (bestValue === "ALLOWED") return true;
    if (bestValue === "DENIED")  return false;
  }

  // Step 3: public keys — visible to every role. Skipped if either of the
  // override steps above already returned (so a per-user DENIED still wins).
  if (PUBLIC_KEYS.has(key)) return true;

  // Step 4: role default
  return resolveRoleDefault(rawRole, key);
}

/** Pure role-default lookup, ignoring overrides. Useful for "what does this role get?" UI. */
export function resolveRoleDefault(rawRole: unknown, key: string): boolean {
  const role = normalizeRole(rawRole);
  if (!role) return false;

  const allow = ROLE_ACCESS[role];
  if (allow === "*") return true;
  if (!allow) return false;

  for (const granted of allow) {
    if (key === granted) return true;
    if (key.startsWith(granted + ".")) return true;
  }
  return false;
}

/**
 * True when the parent itself is allowed OR any of its children are.
 * Use this when rendering a group header that should appear whenever the user
 * can reach anything inside the group.
 */
export function isParentVisible(
  rawRole: unknown,
  parent: DashboardNode,
  overrides?: DashboardOverrides | null,
): boolean {
  if (canAccess(rawRole, parent.key, overrides)) return true;
  return (parent.children ?? []).some((child) => canAccess(rawRole, child.key, overrides));
}

// Build a quick lookup once so canSeeKey() doesn't re-walk the tree on every
// sidebar render.
const NODE_BY_KEY: Record<string, DashboardNode> = (() => {
  const out: Record<string, DashboardNode> = {};
  for (const parent of DASHBOARD_TREE) {
    out[parent.key] = parent;
    for (const child of parent.children ?? []) out[child.key] = child;
  }
  return out;
})();

/**
 * Visibility check for UI surfaces (sidebar items, dashboard tiles).
 *
 * Differs from `canAccess` in one important way: if `key` names a parent node
 * with children, this returns true when ANY of its children are accessible —
 * not only when the parent's own key is granted. This is what lets a FT/PT
 * user (granted only `hrms.manpower-cost`) still see the HRMS card so they
 * can click into it.
 *
 * For routing/middleware decisions, keep using `canAccess` — it answers the
 * stricter "does this exact route apply" question.
 */
export function canSeeKey(
  rawRole: unknown,
  key: string,
  overrides?: DashboardOverrides | null,
): boolean {
  if (canAccess(rawRole, key, overrides)) return true;
  const node = NODE_BY_KEY[key];
  if (node?.children?.length) {
    return node.children.some((c) => canAccess(rawRole, c.key, overrides));
  }
  return false;
}

/**
 * Coerce arbitrary JSON into a DashboardOverrides map. Anything that doesn't
 * match the shape is dropped — never throws. Use this on the response of any
 * API that returns the column straight from Prisma.
 */
export function parseOverrides(raw: unknown): DashboardOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DashboardOverrides = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === "ALLOWED" || v === "DENIED") out[k] = v;
  }
  return out;
}

/** Flatten the tree into one ordered list of (parent, child?) pairs. */
export function flattenTree(): Array<{ parent: DashboardNode; child?: DashboardNode }> {
  const out: Array<{ parent: DashboardNode; child?: DashboardNode }> = [];
  for (const node of DASHBOARD_TREE) {
    out.push({ parent: node });
    for (const child of node.children ?? []) out.push({ parent: node, child });
  }
  return out;
}
