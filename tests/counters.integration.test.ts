// tests/counters.integration.test.ts
//
// Kvoträknaren mot en riktig databas.
//
// Det här är testet som inte går att skriva utan Postgres, och det är
// också det enda som bevisar den egenskap hela kostnadsskyddet vilar på:
// att tio samtidiga anrop inte alla kan läsa "fyra av fem använda" och
// sedan alla skriva fem.
//
// Kör med en databas som får skrivas i:
//
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/counters.integration.test.ts
//
// Utan variabeln hoppar filen över sig själv i stället för att ljuga om
// att allt är grönt.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { consume, release, peek, monthWindow, slidingWindow, pruneExpired } from "@/lib/usage/counters";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();

// Nycklarna är märkta så att städningen aldrig kan råka radera riktiga rader.
const KEY = `test-user-${Date.now()}`;

describe.skipIf(!HAS_DB)("usage counters", () => {
  beforeAll(async () => {
    await prisma.usageCounter.deleteMany({ where: { key: { startsWith: "test-user-" } } });
  });

  afterAll(async () => {
    await prisma.usageCounter.deleteMany({ where: { key: { startsWith: "test-user-" } } });
    await prisma.$disconnect();
  });

  it("counts up to the limit and then stops", async () => {
    const window = monthWindow();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await consume("ai_month", KEY, 5, window));

    expect(results.filter(r => r.allowed)).toHaveLength(5);
    expect(results.filter(r => !r.allowed)).toHaveLength(2);
    expect(results[4].remaining).toBe(0);
  });

  it("does not push the window forward on a blocked attempt", async () => {
    const window = monthWindow();
    const before = await peek("ai_month", KEY, window);
    await consume("ai_month", KEY, 5, window);
    expect(await peek("ai_month", KEY, window)).toBe(before);
  });

  it("holds the line against concurrent requests", async () => {
    // Hela poängen. Tjugo anrop på en gång mot ett tak på fem.
    const key = `${KEY}-concurrent`;
    const window = monthWindow();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume("ai_month", key, 5, window))
    );

    expect(results.filter(r => r.allowed)).toHaveLength(5);
    expect(await peek("ai_month", key, window)).toBe(5);

    // Och varje släppt igenom anrop fick ett eget nummer — ingen delade plats.
    const used = results.filter(r => r.allowed).map(r => r.used).sort((a, b) => a - b);
    expect(used).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives the step back when the call failed", async () => {
    const key = `${KEY}-release`;
    const window = monthWindow();

    await consume("ai_month", key, 3, window);
    await consume("ai_month", key, 3, window);
    expect(await peek("ai_month", key, window)).toBe(2);

    await release("ai_month", key, window);
    expect(await peek("ai_month", key, window)).toBe(1);
  });

  it("never goes below zero, however many times it is released", async () => {
    const key = `${KEY}-floor`;
    const window = monthWindow();
    await consume("ai_month", key, 3, window);
    for (let i = 0; i < 5; i++) await release("ai_month", key, window);
    expect(await peek("ai_month", key, window)).toBe(0);
  });

  it("keeps separate windows separate", async () => {
    const key = `${KEY}-windows`;
    const burst = slidingWindow(60);
    const month = monthWindow();

    await consume("ai_burst", key, 3, burst);
    expect(await peek("ai_month", key, month)).toBe(0);
  });

  it("treats an unlimited ceiling as free passage", async () => {
    const r = await consume("ai_month", `${KEY}-unlimited`, Number.MAX_SAFE_INTEGER, monthWindow());
    expect(r.allowed).toBe(true);
  });

  it("refuses everything at a ceiling of zero", async () => {
    const r = await consume("ai_month", `${KEY}-zero`, 0, monthWindow());
    expect(r.allowed).toBe(false);
  });

  it("clears out windows that have expired", async () => {
    const stale = { start: new Date("2020-01-01"), expiresAt: new Date("2020-02-01") };
    await consume("ai_burst", `${KEY}-stale`, 5, stale);
    await pruneExpired();
    expect(await peek("ai_burst", `${KEY}-stale`, stale)).toBe(0);
  });
});
