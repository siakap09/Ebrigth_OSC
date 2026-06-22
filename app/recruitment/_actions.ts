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

/** Move many recruits to one stage at once (bulk action) + record each transition. */
export async function bulkMoveRecruits(
  ids: string[],
  toStageId: string,
): Promise<MoveResult & { moved?: number }> {
  try {
    const { userId } = await requireAccess();
    if (!ids.length) return { ok: true, moved: 0 };

    const toStage = await prisma.recStage.findUnique({ where: { id: toStageId }, select: { id: true } });
    if (!toStage) return { ok: false, error: "Stage not found" };

    const recruits = await prisma.recRecruit.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, stageId: true },
    });
    const toMove = recruits.filter((r) => r.stageId !== toStageId);
    if (!toMove.length) return { ok: true, moved: 0 };

    await prisma.$transaction([
      prisma.recRecruit.updateMany({
        where: { id: { in: toMove.map((r) => r.id) } },
        data: { stageId: toStageId },
      }),
      prisma.recStageHistory.createMany({
        data: toMove.map((r) => ({ recruitId: r.id, fromStageId: r.stageId, toStageId, changedBy: userId })),
      }),
    ]);

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/dashboard");
    return { ok: true, moved: toMove.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk move failed" };
  }
}

/** Soft-delete recruits — SUPER_ADMIN only (mirrors the CRM "only superadmin deletes a lead" rule). */
export async function bulkDeleteRecruits(ids: string[]): Promise<MoveResult & { deleted?: number }> {
  try {
    const session = await getServerSession(authOptions);
    const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
    if (role !== ROLES.SUPER_ADMIN) return { ok: false, error: "Only Super Admin can delete recruits." };
    if (!ids.length) return { ok: true, deleted: 0 };

    const res = await prisma.recRecruit.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/contacts");
    revalidatePath("/recruitment/dashboard");
    return { ok: true, deleted: res.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

export interface RecruitDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  position: string | null;
  branch: string | null;
  hired: boolean;
  branchStaffId: number | null;
  ghlOpportunityId: string | null;
  ghlContactId: string | null;
  stageName: string;
  stageShort: string;
  ghlCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  history: { id: string; from: string | null; to: string; changedBy: string | null; note: string | null; changedAt: string }[];
}

/** Full detail for one recruit (card / row click) including its stage history. */
export async function getRecruitDetail(
  recruitId: string,
): Promise<{ ok: boolean; detail?: RecruitDetail; error?: string }> {
  try {
    await requireAccess();
    const r = await prisma.recRecruit.findFirst({
      where: { id: recruitId, deletedAt: null },
      select: {
        id: true, name: true, email: true, phone: true, source: true, position: true,
        branch: true, hired: true, branchStaffId: true, ghlOpportunityId: true,
        ghlContactId: true, ghlCreatedAt: true, createdAt: true, updatedAt: true,
        stage: { select: { name: true, shortCode: true } },
        history: {
          orderBy: { changedAt: "desc" },
          select: { id: true, fromStageId: true, toStageId: true, changedBy: true, note: true, changedAt: true },
        },
      },
    });
    if (!r) return { ok: false, error: "Recruit not found" };

    const stages = await prisma.recStage.findMany({ select: { id: true, name: true } });
    const nameById = new Map(stages.map((s) => [s.id, s.name]));

    return {
      ok: true,
      detail: {
        id: r.id, name: r.name, email: r.email, phone: r.phone, source: r.source,
        position: r.position, branch: r.branch, hired: r.hired, branchStaffId: r.branchStaffId,
        ghlOpportunityId: r.ghlOpportunityId, ghlContactId: r.ghlContactId,
        stageName: r.stage.name, stageShort: r.stage.shortCode,
        ghlCreatedAt: r.ghlCreatedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        history: r.history.map((h) => ({
          id: h.id,
          from: h.fromStageId ? nameById.get(h.fromStageId) ?? null : null,
          to: nameById.get(h.toStageId) ?? h.toStageId,
          changedBy: h.changedBy,
          note: h.note,
          changedAt: h.changedAt.toISOString(),
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load recruit" };
  }
}
