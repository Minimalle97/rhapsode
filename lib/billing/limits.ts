// lib/billing/limits.ts
//
// Taket på antal verk. Kontrolleras på servern, i varje väg som kan
// skapa ett verk — formuläret, JSON-importen och det äldre API:et.
//
// Free rymmer några texter med flit. Poängen är inte att göra Free trång
// utan att någon som kommit så långt att de vill bära tio verk samtidigt
// redan har fått svar på om Rhapsode är värt något för dem.

import { prisma } from "@/lib/db";
import { FeatureLockedError, type Entitlements } from "./entitlements";
import { FEATURE } from "./plans";

export class WorkLimitError extends Error {
  readonly limit: number;
  readonly used:  number;
  constructor(used: number, limit: number) {
    super(`Work limit reached (${used}/${limit})`);
    this.name = "WorkLimitError";
    this.used = used;
    this.limit = limit;
  }
}

export async function countWorks(userId: string): Promise<number> {
  return prisma.work.count({ where: { userId } });
}

/** Hur många verk som får plats till. Infinity för Pro. */
export async function remainingWorkSlots(
  userId: string,
  ent: Entitlements
): Promise<number> {
  const limit = ent.limits.savedWorks;
  if (!Number.isFinite(limit) || limit >= Number.MAX_SAFE_INTEGER) return Infinity;
  return Math.max(0, limit - (await countWorks(userId)));
}

/** Kastar om det inte finns plats. Anropas innan något arbete görs. */
export async function assertWorkAllowance(
  userId: string,
  ent: Entitlements
): Promise<void> {
  if (!ent.features.has(FEATURE.SAVED_CUSTOM_TEXTS)) {
    throw new FeatureLockedError(FEATURE.SAVED_CUSTOM_TEXTS);
  }

  const limit = ent.limits.savedWorks;
  if (!Number.isFinite(limit) || limit >= Number.MAX_SAFE_INTEGER) return;

  const used = await countWorks(userId);
  if (used >= limit) throw new WorkLimitError(used, limit);
}
