"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";

/** Route-group guard: any visitor under /pcm-system/bm/* must be BM with a branch.
 *  MKT users are bounced to their own home; signed-out users to login. */
export default function BMLayout({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    } else if (user.role !== "BM" && user.role !== "MKT" && user.role !== "RM") {
      router.replace("/pcm-system/academy");
    }
  }, [user, router]);

  if (!user) return null;
  // BM (own branch), RM (their region), and MKT (all) can use the BM-side views.
  if (user.role !== "BM" && user.role !== "MKT" && user.role !== "RM") return null;
  if (user.role === "BM" && !user.branch) return null;
  if (user.role === "RM" && !user.region) return null;
  return <>{children}</>;
}
