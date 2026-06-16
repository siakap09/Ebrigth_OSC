"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";

/** Route-group guard: any visitor under /fa-system/bm/* must be BM with a branch.
 *  MKT users are bounced to their own home; signed-out users to login. */
export default function BMLayout({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    // Don't bounce to /login while the session is still hydrating on refresh
    // (SessionSync populates the FA store right after). Only redirect when the
    // session is definitively unauthenticated.
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (user && user.role !== "BM" && user.role !== "MKT") {
      router.replace("/fa-system/marketing");
    }
  }, [user, status, router]);

  if (!user) return null;
  if (user.role !== "BM" && user.role !== "MKT") return null;
  // BMs must have a branch; MKT can browse without one.
  if (user.role === "BM" && !user.branch) return null;
  return <>{children}</>;
}
