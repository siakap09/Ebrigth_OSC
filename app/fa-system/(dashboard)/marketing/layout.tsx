"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";

/** Route-group guard: any visitor under /fa-system/marketing/* must be MKT.
 *  BMs are bounced to their own home; signed-out users to login. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    } else if (user.role !== "MKT") {
      router.replace("/fa-system/bm");
    }
  }, [user, router]);

  if (!user || user.role !== "MKT") return null;
  return <>{children}</>;
}
