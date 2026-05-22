import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { normalizeRole, ROLES, type Role } from "@/lib/roles";

// Path-prefix-based role rules. First matching prefix wins — so list more
// specific prefixes before shorter ones that would also match.
//
// Any path NOT matched here only needs the user to be logged in (enforced by
// the `authorized` callback below).
//
// SUPER_ADMIN is granted everything via an explicit bypass below; you do not
// need to list SUPER_ADMIN in every allowlist (it's included for clarity).
//
// Per-role intent:
//   BRANCH_MANAGER → /manpower-schedule (+ Inventory tile, gated client-side)
//   HR             → keeps prior management access EXCEPT /manpower-schedule
//   ACADEMY        → keeps prior access (+ Inventory tile, client-side)
//   FULL_TIME / PART_TIME → /manpower-cost-report ONLY (see EMPLOYEE_ONLY_PATH
//                   below — every other path redirects there).
const ROLE_RULES: Array<{ prefix: string; allowed: readonly Role[] }> = [
  { prefix: "/user-management",               allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.ACADEMY] },
  { prefix: "/account-management",            allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR] },
  { prefix: "/register-employee",             allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR] },
  { prefix: "/dashboard-employee-management", allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD, ROLES.ACADEMY] },

  { prefix: "/manpower-schedule",             allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.HOD] },

  { prefix: "/hr-dashboard",                  allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD] },
  { prefix: "/onboarding",                    allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD] },
  { prefix: "/offboarding",                   allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD] },
];

// PT/FT users see the same home/HRMS chrome as everyone else, with the
// locked-tile UI showing every other module as disabled. So we explicitly let
// them VIEW the navigation pages they need to reach the cost report, and
// redirect everything else back to the cost report.
//
// EMPLOYEE_ALLOWED_PATHS is enforced ahead of ROLE_RULES below so it cannot be
// widened accidentally by adding a new ROLE_RULES entry that happens to
// include FULL_TIME / PART_TIME.
const EMPLOYEE_FALLBACK_PATH = "/manpower-cost-report";
const EMPLOYEE_ALLOWED_PATHS = [
  "/home",              // tile dashboard — non-HRMS tiles are locked client-side
  "/dashboards/hrms",   // HRMS hub — only Manpower Cost Report tile is enabled
  "/manpower-cost-report",
  "/profile",           // standard self-service page
  "/burnlist",          // new burnlist page — visible to all roles for preview
];
const EMPLOYEE_LOCKED_ROLES: readonly Role[] = [ROLES.FULL_TIME, ROLES.PART_TIME];

function matchRule(pathname: string) {
  return ROLE_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/")
  );
}

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = normalizeRole(req.nextauth.token?.role);

    // Employee lockdown (PT/FT): allow the navigation shell paths so they can
    // see the locked-tile chrome, and bounce anything else back to the cost
    // report. The matcher already excludes /api, /_next, /login, and
    // /forgot-password so those still work.
    if (role && EMPLOYEE_LOCKED_ROLES.includes(role)) {
      const onAllowedPath = EMPLOYEE_ALLOWED_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
      );
      if (onAllowedPath) return NextResponse.next();
      return NextResponse.redirect(new URL(EMPLOYEE_FALLBACK_PATH, req.url));
    }

    const rule = matchRule(pathname);
    if (!rule) return NextResponse.next();

    if (role === ROLES.SUPER_ADMIN) return NextResponse.next();
    if (role && rule.allowed.includes(role)) return NextResponse.next();

    // Logged in but wrong role — send to /home with a flag so the UI can
    // surface "you don't have access to X" if it wants to.
    const homeUrl = new URL("/home", req.url);
    homeUrl.searchParams.set("forbidden", pathname);
    return NextResponse.redirect(homeUrl);
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|forgot-password).*)",
  ],
};
