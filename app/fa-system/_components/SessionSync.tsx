"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useFAStore } from "@fa/_lib/store";
import { BRANCHES } from "@fa/_types";
import { useFATheme } from "@fa/_lib/theme";

/** Bridges NextAuth (the real auth) to the FA system's zustand store.
 *
 *  Mapping rules by NextAuth role:
 *    SUPER_ADMIN / ADMIN  → if no FA user is set, default to FA Marketing
 *                           (u-mkt). If a FA user IS already set (because the
 *                           admin picked one via /fa-system/login), leave it
 *                           alone — admins can act as marketing OR any BM.
 *    BRANCH_MANAGER       → forced to FA BM for the branch whose name matches
 *                           the User.branchName column. Re-asserted on every
 *                           render so a BM can never end up impersonating
 *                           marketing or a different branch.
 *    anything else        → no FA login.
 */
export function SessionSync() {
  const { data: session, status } = useSession();
  const login = useFAStore(s => s.login);
  const logout = useFAStore(s => s.logout);
  const currentUserId = useFAStore(s => s.currentUserId);
  // Side-effect only: re-applies the user's saved FA theme to <html> on every
  // FA page load (including the picker screen, which has no AppShell footer).
  useFATheme();

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user) {
      if (currentUserId !== null) logout();
      return;
    }

    const role = (session.user as { role?: string }).role;
    const branchName = (session.user as { branchName?: string }).branchName;

    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      // Default once on first arrival; never override a manual pick.
      if (currentUserId === null) login("u-mkt");
      return;
    }

    if (role === "BRANCH_MANAGER" && branchName) {
      const branch = BRANCHES.find(b => b.name === branchName);
      const required = branch ? `u-bm-${branch.code.toLowerCase()}` : null;
      if (required && currentUserId !== required) login(required);
      else if (!required && currentUserId !== null) logout();
      return;
    }

    // Unrecognised role → no FA access.
    if (currentUserId !== null) logout();
  }, [session, status, currentUserId, login, logout]);

  return null;
}
