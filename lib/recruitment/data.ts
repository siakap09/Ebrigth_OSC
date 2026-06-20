import "server-only";
import { prisma } from "@/lib/prisma";

// Shared server-side data access for the Recruitment module. All reads are
// scoped to non-deleted recruits and ordered by the canonical stage order.

export interface RecCard {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  position: string | null;
  branch: string | null;
  hired: boolean;
  branchStaffId: number | null;
  ghlCreatedAt: Date | null;
  createdAt: Date;
}

export interface RecColumn {
  id: string;
  name: string;
  shortCode: string;
  order: number;
  color: string;
  recruits: RecCard[];
}

const CARD_SELECT = {
  id: true, name: true, email: true, phone: true, source: true, position: true,
  branch: true, hired: true, branchStaffId: true, ghlCreatedAt: true, createdAt: true,
} as const;

/** Stages (ordered) each with their non-deleted recruits — the kanban payload. */
export async function getKanban(): Promise<RecColumn[]> {
  const stages = await prisma.recStage.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true, name: true, shortCode: true, order: true, color: true,
      recruits: {
        where: { deletedAt: null },
        orderBy: [{ ghlCreatedAt: "desc" }, { createdAt: "desc" }],
        select: CARD_SELECT,
      },
    },
  });
  return stages;
}

/** Flat recruit list for the Contacts table. */
export async function getRecruitsList(): Promise<(RecCard & { stageName: string; stageShort: string })[]> {
  const rows = await prisma.recRecruit.findMany({
    where: { deletedAt: null },
    orderBy: [{ ghlCreatedAt: "desc" }, { createdAt: "desc" }],
    select: { ...CARD_SELECT, stage: { select: { name: true, shortCode: true } } },
  });
  return rows.map((r) => ({ ...r, stageName: r.stage.name, stageShort: r.stage.shortCode }));
}

export interface RecMetrics {
  total: number;
  hired: number;
  rate: number; // hired / total
  stages: { name: string; shortCode: string; color: string; order: number; count: number }[];
}

/** Headline metrics + per-stage funnel for the dashboard. */
export async function getDashboardMetrics(): Promise<RecMetrics> {
  const [total, hired, stages, grouped] = await Promise.all([
    prisma.recRecruit.count({ where: { deletedAt: null } }),
    prisma.recRecruit.count({ where: { deletedAt: null, hired: true } }),
    prisma.recStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, shortCode: true, color: true, order: true } }),
    prisma.recRecruit.groupBy({ by: ["stageId"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const countByStage = new Map(grouped.map((g) => [g.stageId, g._count._all]));
  return {
    total,
    hired,
    rate: total ? hired / total : 0,
    stages: stages.map((s) => ({
      name: s.name, shortCode: s.shortCode, color: s.color, order: s.order,
      count: countByStage.get(s.id) ?? 0,
    })),
  };
}

/** Most recently-submitted recruits — drives the Notifications feed. */
export async function getRecentRecruits(limit = 40): Promise<(RecCard & { stageName: string })[]> {
  const rows = await prisma.recRecruit.findMany({
    where: { deletedAt: null },
    orderBy: [{ ghlCreatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { ...CARD_SELECT, stage: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, stageName: r.stage.name }));
}
