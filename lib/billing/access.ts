// lib/billing/access.ts
//
// Pro utan betalning: för dig själv, och för dem du väljer.
//
// Två skilda mekanismer, med flit:
//
//   Utvecklarnyckeln (RHAPSODE_DEVELOPER_USER_IDS i miljön) är till för
//   dig. Den ligger utanför databasen, går inte att lösa in, kan inte
//   delas vidare av misstag och överlever att databasen läggs om. Se
//   isDeveloper() i entitlements.ts.
//
//   Inlösbara koder är till för andra — skådespelare, lärare,
//   recensenter, tidiga användare. De skapas från kommandoraden
//   (scripts/access-code.mjs), har ett tak för antal inlösen och kan ges
//   en livslängd. De kan återkallas.
//
// Koder skapas ALDRIG från gränssnittet. Det finns ingen väg från
// webbläsaren som skapar en kod, bara en som löser in en.

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";

// Utan 0/O och 1/I/L — koder läses upp i telefon och skrivs av för hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP = 4;
const GROUPS = 3;

export function generateCode(prefix = "RHAP"): string {
  const bytes = randomBytes(GROUP * GROUPS);
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]);
  const parts: string[] = [];
  for (let i = 0; i < GROUPS; i++) {
    parts.push(chars.slice(i * GROUP, (i + 1) * GROUP).join(""));
  }
  return `${prefix}-${parts.join("-")}`;
}

/** Skrivfel ska inte kosta ett försök: gemener, blanksteg och tankstreck jämnas ut. */
export function normaliseCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s‐-―]/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/^-|-$/g, "");
}

export type RedeemOutcome =
  | { ok: true;  plan: string; expiresAt: Date | null; alreadyHeld: boolean }
  | { ok: false; reason: "not_found" | "inactive" | "expired" | "exhausted" | "already_redeemed" };

/**
 * Löser in en kod.
 *
 * Hela kontrollen och uppräkningen sker i en transaktion. Två samtidiga
 * inlösen av den sista platsen på en kod ska inte kunna ge två Pro —
 * uppräkningen av redemptions villkoras mot taket i samma UPDATE.
 */
export async function redeemCode(userId: string, rawCode: string): Promise<RedeemOutcome> {
  const code = normaliseCode(rawCode);
  if (!code) return { ok: false, reason: "not_found" };

  const now = new Date();

  const record = await prisma.accessCode.findUnique({ where: { code } });
  if (!record)          return { ok: false, reason: "not_found" };
  if (!record.active)   return { ok: false, reason: "inactive" };
  if (record.expiresAt && record.expiresAt <= now) return { ok: false, reason: "expired" };

  const existing = await prisma.accessGrant.findFirst({
    where: { userId, codeId: record.id },
    select: { id: true, revokedAt: true, expiresAt: true },
  });
  if (existing && !existing.revokedAt) {
    return { ok: true, plan: record.plan, expiresAt: existing.expiresAt, alreadyHeld: true };
  }

  const expiresAt = record.durationDays
    ? new Date(now.getTime() + record.durationDays * 86_400_000)
    : null;

  try {
    await prisma.$transaction(async tx => {
      // Villkorad uppräkning. Faller villkoret är koden slut, och då
      // rullas hela transaktionen tillbaka utan att någon behörighet ges.
      const claimed = await tx.$executeRaw`
        UPDATE "AccessCode"
        SET "redemptions" = "redemptions" + 1
        WHERE "id" = ${record.id}
          AND "active" = true
          AND "redemptions" < "maxRedemptions"
      `;
      if (claimed === 0) throw new Error("EXHAUSTED");

      await tx.accessGrant.upsert({
        where:  { userId_codeId: { userId, codeId: record.id } },
        create: {
          userId, codeId: record.id, plan: record.plan,
          source: "code", note: record.note, expiresAt,
        },
        update: { revokedAt: null, expiresAt, startsAt: now },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          plan:               record.plan,
          planSource:         "grant",
          subscriptionStatus: "active",
          currentPeriodEnd:   expiresAt,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "EXHAUSTED") {
      return { ok: false, reason: "exhausted" };
    }
    throw err;
  }

  await track("code_redeemed", userId, { plan: record.plan, permanent: expiresAt === null });
  return { ok: true, plan: record.plan, expiresAt, alreadyHeld: false };
}

export interface CreateCodeInput {
  plan?:           string;
  durationDays?:   number | null;
  maxRedemptions?: number;
  note?:           string;
  expiresInDays?:  number | null;
  prefix?:         string;
}

/** Används av scripts/access-code.mjs. Ingen HTTP-väg leder hit. */
export async function createAccessCode(input: CreateCodeInput = {}) {
  const code = generateCode(input.prefix);
  return prisma.accessCode.create({
    data: {
      code,
      plan:           input.plan ?? "pro",
      durationDays:   input.durationDays ?? null,
      maxRedemptions: input.maxRedemptions ?? 1,
      note:           input.note ?? null,
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null,
    },
  });
}

/** Drar tillbaka en kod och allt den delat ut. */
export async function revokeCode(code: string): Promise<number> {
  const record = await prisma.accessCode.findUnique({
    where:  { code: normaliseCode(code) },
    select: { id: true },
  });
  if (!record) return 0;

  await prisma.accessCode.update({ where: { id: record.id }, data: { active: false } });

  const grants = await prisma.accessGrant.findMany({
    where:  { codeId: record.id, revokedAt: null },
    select: { userId: true },
  });

  await prisma.accessGrant.updateMany({
    where: { codeId: record.id, revokedAt: null },
    data:  { revokedAt: new Date() },
  });

  // Bara de som fick Pro genom just den här koden faller tillbaka.
  // En som hunnit teckna en riktig prenumeration rörs inte.
  if (grants.length) {
    await prisma.user.updateMany({
      where: { id: { in: grants.map(g => g.userId) }, planSource: "grant" },
      data:  { plan: "free", planSource: "none", subscriptionStatus: "free", currentPeriodEnd: null },
    });
  }

  return grants.length;
}
