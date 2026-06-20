"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";
import { ROLES, normalizeRole } from "@/lib/roles";

const ALLOWED = new Set<string>([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD]);

async function requireAccess(): Promise<{ userId: string; email: string }> {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  if (!session?.user || !role || !ALLOWED.has(role)) {
    throw new Error("Not authorized for Recruitment.");
  }
  const u = session.user as { id?: string; email?: string };
  return { userId: String(u.id ?? u.email ?? "unknown"), email: String(u.email ?? "") };
}

export interface MoveResult {
  ok: boolean;
  error?: string;
}

/** Move a recruit to a new stage (kanban drag) + record the transition. */
export async function moveRecruit(recruitId: string, toStageId: string): Promise<MoveResult> {
  try {
    const { userId } = await requireAccess();

    const recruit = await prisma.recRecruit.findFirst({
      where: { id: recruitId, deletedAt: null },
      select: { id: true, stageId: true },
    });
    if (!recruit) return { ok: false, error: "Recruit not found" };
    if (recruit.stageId === toStageId) return { ok: true };

    const toStage = await prisma.recStage.findUnique({ where: { id: toStageId }, select: { id: true } });
    if (!toStage) return { ok: false, error: "Stage not found" };

    await prisma.$transaction([
      prisma.recRecruit.update({ where: { id: recruitId }, data: { stageId: toStageId } }),
      prisma.recStageHistory.create({
        data: { recruitId, fromStageId: recruit.stageId, toStageId, changedBy: userId },
      }),
    ]);

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Move failed" };
  }
}
