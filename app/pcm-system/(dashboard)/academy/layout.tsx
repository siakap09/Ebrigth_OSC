"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";

/** Route-group guard: any visitor under /pcm-system/academy/* must be MKT.
 *  BMs are bounced to their own home; signed-out users to login. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    } else if (user.role !== "MKT") {
      router.replace("/pcm-system/bm");
    }
  }, [user, router]);

  if (!user || user.role !== "MKT") return null;
  return <>{children}</>;
}
