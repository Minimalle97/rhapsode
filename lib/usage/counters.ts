// lib/usage/counters.ts
//
// En räknare som håller när flera anrop kommer samtidigt.
//
// Det naiva sättet — läs antalet, jämför med taket, skriv antalet + 1 —
// går sönder exakt när det spelar roll. Tio parallella anrop läser alla
// "4 av 5 använda", alla ser att det finns plats, och alla skriver 5.
// Elva generationer, betalt för fem.
//
// Lösningen är att låta databasen göra jämförelsen i samma statement som
// ökningen. INSERT … ON CONFLICT DO UPDATE … WHERE used < limit är
// atomär: raden låses under uppdateringen, och villkoret utvärderas mot
// det låsta värdet. Får vi ingen rad tillbaka var taket redan nått.

import { prisma } from "@/lib/db";

export type CounterScope =
  | "ai_month"
  | "ai_burst"
  | "http_burst"
  /** Djupstadningar per manad. Egen ranson, skild fran generationerna. */
  | "cleanup_month"
  /** Drillkort per dygn. Gratisplanens ranson — se LIMITS.drillsDaily. */
  | "drill_day";

export interface ConsumeResult {
  allowed:   boolean;
  used:      number;
  limit:     number;
  remaining: number;
  /** När fönstret nollställs. */
  resetsAt:  Date;
}

interface Window {
  start:     Date;
  expiresAt: Date;
}

/** Kalendermånad i UTC. Samma gräns för alla, oberoende av tidszon. */
export function monthWindow(now: Date = new Date()): Window {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const expiresAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, expiresAt };
}

/** Fast fönster om N sekunder. Grovt men förutsägbart. */
/**
 * Dygnet, raknat i UTC.
 *
 * UTC och inte lokal tid, av samma skal som manadsfonstret: en anvandare
 * som reser over en tidszon ska inte fa en extra ranson pa kopet, och
 * servern ska inte behova veta var nagon befinner sig.
 */
export function dayWindow(now: Date = new Date()): Window {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const expiresAt = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, expiresAt };
}

export function slidingWindow(seconds: number, now: Date = new Date()): Window {
  const ms = seconds * 1000;
  const start = new Date(Math.floor(now.getTime() / ms) * ms);
  return { start, expiresAt: new Date(start.getTime() + ms) };
}

/**
 * Försöker ta ett steg ur räknaren.
 *
 * Returnerar allowed: false utan att räkna upp när taket är nått, så att
 * ett blockerat försök inte skjuter fönstret framåt.
 */
export async function consume(
  scope: CounterScope,
  key: string,
  limit: number,
  window: Window
): Promise<ConsumeResult> {
  // Ett obegränsat tak behöver ingen rad alls.
  if (!Number.isFinite(limit) || limit >= Number.MAX_SAFE_INTEGER) {
    return { allowed: true, used: 0, limit, remaining: limit, resetsAt: window.expiresAt };
  }
  if (limit <= 0) {
    return { allowed: false, used: 0, limit, remaining: 0, resetsAt: window.expiresAt };
  }

  const id = crypto.randomUUID();

  const rows = await prisma.$queryRaw<{ used: number }[]>`
    INSERT INTO "UsageCounter" ("id", "scope", "key", "windowStart", "used", "expiresAt", "updatedAt")
    VALUES (${id}, ${scope}, ${key}, ${window.start}, 1, ${window.expiresAt}, NOW())
    ON CONFLICT ("scope", "key", "windowStart")
    DO UPDATE SET "used" = "UsageCounter"."used" + 1, "updatedAt" = NOW()
    WHERE "UsageCounter"."used" < ${limit}
    RETURNING "used"
  `;

  if (rows.length === 0) {
    // Villkoret föll — taket var redan nått. Läs av för att kunna visa hur mycket.
    const current = await peek(scope, key, window);
    return {
      allowed: false, used: current, limit, remaining: 0, resetsAt: window.expiresAt,
    };
  }

  const used = Number(rows[0].used);
  return {
    allowed: true, used, limit,
    remaining: Math.max(0, limit - used),
    resetsAt: window.expiresAt,
  };
}

/**
 * Lämnar tillbaka ett steg. Anropas när anropet som räknaren betalade för
 * gick sönder — ett tekniskt fel ska inte äta någons månadskvot.
 *
 * Går aldrig under noll.
 */
export async function release(
  scope: CounterScope,
  key: string,
  window: Window
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "UsageCounter"
    SET "used" = GREATEST(0, "used" - 1), "updatedAt" = NOW()
    WHERE "scope" = ${scope} AND "key" = ${key} AND "windowStart" = ${window.start}
  `;
}

/** Läser av utan att räkna upp. */
export async function peek(
  scope: CounterScope,
  key: string,
  window: Window
): Promise<number> {
  const row = await prisma.usageCounter.findUnique({
    where: {
      scope_key_windowStart: { scope, key, windowStart: window.start },
    },
    select: { used: true },
  });
  return row?.used ?? 0;
}

/**
 * Städar bort utgångna fönster. Anropas opportunistiskt från
 * webhook-routen, som ändå körs sällan — appen har ingen schemaläggare.
 */
export async function pruneExpired(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.usageCounter.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return count;
}
