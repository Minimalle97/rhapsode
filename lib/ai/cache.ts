// lib/ai/cache.ts
//
// Samma fråga om samma text ska kosta ett anrop, inte ett per person.
//
// Nästan allt Rhapsode arbetar med är gammalt och fritt: Odysséen,
// Coriolanus, Invictus. Två användare som laddar upp samma Gutenberg-fil
// och ber om samma ordlista ställer bokstavligen samma fråga. Nyckeln
// räknas därför fram ur INNEHÅLLET — inte ur vem som frågar — och raden
// kan delas.
//
// Personliga svar (en studieplan byggd på din egen historik) får userId i
// nyckeln och shared = false. De två fallen får aldrig blandas ihop, för
// det vore ett läckage mellan konton.

import { createHash } from "crypto";
import { prisma } from "@/lib/db";

export interface CacheHit<T> {
  payload:      T;
  inputTokens:  number;
  outputTokens: number;
  model:        string;
}

/** Stabil sträng ur ett objekt — nycklar sorteras, annars ändras hashen godtyckligt. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export interface KeyParts {
  feature: string;
  model:   string;
  /** Höjs när prompten ändras, så att gamla svar inte serveras för en ny fråga. */
  promptVersion: number;
  /** Allt som påverkar svaret: texten, språket, svårighetsgraden … */
  input: unknown;
  /** Sätts bara för personliga svar. Gör raden privat. */
  userId?: string;
}

export function cacheKey(parts: KeyParts): string {
  const basis = stableStringify({
    f: parts.feature,
    m: parts.model,
    v: parts.promptVersion,
    i: parts.input,
    u: parts.userId ?? null,
  });
  return createHash("sha256").update(basis).digest("hex");
}

export async function readCache<T>(key: string, now: Date = new Date()): Promise<CacheHit<T> | null> {
  const row = await prisma.aiCache.findUnique({ where: { cacheKey: key } });
  if (!row) return null;

  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    await prisma.aiCache.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }

  // Räkningen är ren statistik. Att den kan tappa en ökning vid samtidiga
  // träffar spelar ingen roll, så den får inte kosta en transaktion.
  prisma.aiCache
    .update({
      where: { id: row.id },
      data:  { hits: { increment: 1 }, lastUsed: now },
    })
    .catch(() => {});

  return {
    payload:      row.payload as T,
    inputTokens:  row.inputTokens,
    outputTokens: row.outputTokens,
    model:        row.model,
  };
}

export async function writeCache(
  key: string,
  data: {
    feature: string;
    model:   string;
    payload: unknown;
    inputTokens:  number;
    outputTokens: number;
    shared:  boolean;
    ttlDays?: number;
  }
): Promise<void> {
  const expiresAt = data.ttlDays
    ? new Date(Date.now() + data.ttlDays * 86_400_000)
    : null;

  await prisma.aiCache
    .upsert({
      where:  { cacheKey: key },
      create: {
        cacheKey: key,
        feature:  data.feature,
        model:    data.model,
        payload:  data.payload as object,
        inputTokens:  data.inputTokens,
        outputTokens: data.outputTokens,
        shared:   data.shared,
        expiresAt,
      },
      update: {
        payload:  data.payload as object,
        model:    data.model,
        lastUsed: new Date(),
        expiresAt,
      },
    })
    // En cache som inte går att skriva till får inte fälla anropet som
    // redan lyckats. Användaren har fått sitt svar.
    .catch(() => {});
}
