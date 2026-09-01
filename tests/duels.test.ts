// tests/duels.test.ts
//
// Tvekampen.
//
// Avgorandet provas som ren funktion — det ar hela skalet till att
// `decideWinner` inte rakar i databasen. Resten ar granskning av kallan,
// av samma skal som i security.test.ts och social.test.ts: det som ska
// bevisas ar att en viss kontroll FINNS pa ratt stalle och inte gar att
// kringga fran granssnittet.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  decideWinner, isValidDuration, durationLabel, DURATIONS,
  type DuelSide,
} from "@/lib/duels";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

function side(id: string, over: Partial<DuelSide> = {}): DuelSide {
  return {
    userId: id, username: id, handle: id, avatarUrl: null,
    wordsHeld: 0, wordsPossible: 100, accuracy: 0,
    bestAt: null, attempts: 0, seconds: 0,
    ...over,
  };
}

// ── Vem som vinner ────────────────────────────────────────────────────
describe("who wins a duel", () => {
  it("gives it to whoever held more words", () => {
    const a = side("a", { wordsHeld: 120 });
    const b = side("b", { wordsHeld: 119 });
    expect(decideWinner(a, b)).toEqual({ winnerId: "a", margin: "words" });
    expect(decideWinner(b, a)).toEqual({ winnerId: "a", margin: "words" });
  });

  it("does not care who was challenger", () => {
    // Symmetrin ar hela poangen: den som bjod in far ingen fordel av att
    // sta forst i argumentlistan.
    const a = side("a", { wordsHeld: 10 });
    const b = side("b", { wordsHeld: 40 });
    expect(decideWinner(a, b).winnerId).toBe("b");
    expect(decideWinner(b, a).winnerId).toBe("b");
  });

  it("falls to accuracy when words are level", () => {
    const a = side("a", { wordsHeld: 80, accuracy: 91 });
    const b = side("b", { wordsHeld: 80, accuracy: 90 });
    expect(decideWinner(a, b)).toEqual({ winnerId: "a", margin: "accuracy" });
  });

  it("falls to whoever got there first when words and accuracy are level", () => {
    const a = side("a", { wordsHeld: 80, accuracy: 90, bestAt: "2026-01-01T10:00:00.000Z" });
    const b = side("b", { wordsHeld: 80, accuracy: 90, bestAt: "2026-01-01T09:00:00.000Z" });
    expect(decideWinner(a, b)).toEqual({ winnerId: "b", margin: "first" });
  });

  it("beats someone who never performed at all", () => {
    // Lika pa noll ord ar oavgjort, men har HAR den ena stallt sig upp.
    const a = side("a", { bestAt: "2026-01-01T10:00:00.000Z" });
    const b = side("b");
    expect(decideWinner(a, b)).toEqual({ winnerId: "a", margin: "first" });
    expect(decideWinner(b, a)).toEqual({ winnerId: "a", margin: "first" });
  });

  it("is a draw when nothing separates them", () => {
    const at = "2026-01-01T10:00:00.000Z";
    const a = side("a", { wordsHeld: 50, accuracy: 88, bestAt: at });
    const b = side("b", { wordsHeld: 50, accuracy: 88, bestAt: at });
    expect(decideWinner(a, b)).toEqual({ winnerId: null, margin: "draw" });
  });

  it("is a draw when neither did anything at all", () => {
    // Tva som glomde bort kampen ska inte ge en vinnare pa slumpen — och
    // sarskilt inte pa vems id som rakar sorteras forst.
    expect(decideWinner(side("a"), side("b"))).toEqual({ winnerId: null, margin: "draw" });
    expect(decideWinner(side("b"), side("a"))).toEqual({ winnerId: null, margin: "draw" });
  });

  it("lets someone who did nothing lose to someone who did a little", () => {
    const a = side("a", { wordsHeld: 0 });
    const b = side("b", { wordsHeld: 1, attempts: 1 });
    expect(decideWinner(a, b).winnerId).toBe("b");
  });

  it("never lets time alone beat words", () => {
    // Att sitta lange framfor texten ar inte att kunna den. Ordningen
    // mellan kriterierna ar det som gor matningen arlig.
    const grinder = side("grinder", { wordsHeld: 40, accuracy: 60, seconds: 7_200, attempts: 40 });
    const quick   = side("quick",   { wordsHeld: 41, accuracy: 99, seconds: 300,  attempts: 1 });
    expect(decideWinner(grinder, quick).winnerId).toBe("quick");
  });

  it("ignores time and attempt count entirely", () => {
    // Varken sekunder eller antal forsok far vara ett skiljetecken. Ett
    // kriterium som beloner mangd gor kampen till en uthallighetsprovning.
    const at = "2026-01-01T10:00:00.000Z";
    const a  = side("a", { wordsHeld: 30, accuracy: 75, bestAt: at, seconds: 10,    attempts: 1 });
    const b  = side("b", { wordsHeld: 30, accuracy: 75, bestAt: at, seconds: 9_999, attempts: 99 });
    expect(decideWinner(a, b)).toEqual({ winnerId: null, margin: "draw" });
  });
});

// ── Langderna ─────────────────────────────────────────────────────────
describe("the lengths on offer", () => {
  it("offers exactly the five that were asked for", () => {
    expect(DURATIONS.map(d => d.minutes)).toEqual([10, 60, 180, 1_440, 10_080]);
  });

  it("accepts only those five", () => {
    for (const d of DURATIONS) expect(isValidDuration(d.minutes)).toBe(true);
    for (const bad of [0, -10, 5, 59, 100_000, 1.5, NaN, "60", null, undefined]) {
      expect(isValidDuration(bad)).toBe(false);
    }
  });

  it("names them", () => {
    expect(durationLabel(10)).toBe("10 minutes");
    expect(durationLabel(10_080)).toBe("7 days");
  });
});

// ── Vem som far bjuda in ──────────────────────────────────────────────
describe("only Pro may send a challenge", () => {
  const src = read("lib/duels.ts");

  it("checks the plan inside createDuel, not in the route", () => {
    // Sitter kontrollen i granssnittet gar den att kringga genom att
    // anropa API:et for hand.
    expect(src).toMatch(/export async function createDuel[\s\S]*?if \(!ent\.isPro\)/);
  });

  it("refuses a stranger even when they are Pro", () => {
    expect(src).toMatch(/state !== "friends"/);
  });

  it("refuses a work that is not the challenger's own", () => {
    expect(src).toMatch(/prisma\.work\.findFirst\(\{\s*\n?\s*where:\s*\{ id: workId, userId: challengerId \}/);
  });

  it("does not gate ACCEPTING on the plan", () => {
    // Den inbjudne behover inte Pro. Star en plankontroll i acceptDuel ar
    // funktionen stangd for precis de anvandare den ska varva.
    const accept = src.slice(src.indexOf("export async function acceptDuel"));
    const body   = accept.slice(0, accept.indexOf("\n}"));
    expect(body).not.toMatch(/isPro/);
  });
});

// ── Det lanade Pro ────────────────────────────────────────────────────
describe("tools lent for the duration", () => {
  const src = read("lib/duels.ts");

  it("only lends while the clock is actually running", () => {
    // Utan endsAt-villkoret vore lanet permanent for alla som nagonsin
    // statt i en kamp.
    expect(src).toMatch(/duelEntitlements[\s\S]*?status: "active"[\s\S]*?endsAt: \{ gt: new Date\(\) \}/);
  });

  it("does not lend a higher work ceiling", () => {
    // Gransen for antal verk hor till kontot, inte till kampen. Lantes
    // den ut vore en tvekamp ett satt att kringga taket.
    expect(src).toMatch(/limits: ent\.limits/);
  });

  it("costs nothing for someone who already has Pro", () => {
    expect(src).toMatch(/if \(ent\.isPro\) return ent;/);
  });
});

// ── Kopian ────────────────────────────────────────────────────────────
describe("the copy that lands in the other library", () => {
  const src = read("lib/duels.ts");

  it("carries the text but not the progress", () => {
    // Kopieras SM-2-laget med startar mottagaren pa utmanarens framsteg
    // och kampen ar avgjord innan den borjat.
    const copy = src.slice(src.indexOf("export async function copyWorkTo"));
    const body = copy.slice(0, copy.indexOf("\n  return copy.id;"));
    expect(body).toMatch(/content:\s*s\.content/);
    for (const carried of ["sm2Reps", "sm2EF", "sm2Interval", "nextReview", "status"]) {
      expect(body).not.toMatch(new RegExp(`${carried}:`));
    }
  });

  it("is private no matter what the original was", () => {
    expect(src).toMatch(/visibility:\s*"private"/);
  });

  it("repoints sections at the new parts", () => {
    // Missas ompekningen pekar mottagarens sektioner in i nagon annans
    // verk. Det ar bade fel och en lacka.
    expect(src).toMatch(/partMap\.get\(s\.partId\)/);
  });
});

// ── Avgorandet ────────────────────────────────────────────────────────
describe("settling a duel", () => {
  const src = read("lib/duels.ts");

  it("counts once and freezes the answer", () => {
    // Ett resultat som kan bytas nasta gang sidan laddas ar inget
    // resultat.
    expect(src).toMatch(/if \(duel\.status === "finished"\)[\s\S]*?return \(duel\.result/);
  });

  it("will not settle before the clock runs out", () => {
    expect(src).toMatch(/duel\.endsAt\.getTime\(\) > Date\.now\(\)/);
  });

  it("claims the settlement atomically", () => {
    // Avgorandet sker lat, sa tva samtidiga sidladdningar kan na hit.
    // Villkoret pa status ar det som gor att bara den ena far skriva.
    expect(src).toMatch(/updateMany\(\{\s*\n?\s*where: \{ id: duelId, status: "active" \}/);
  });

  it("cannot hand out the same medal twice", () => {
    expect(read("prisma/schema.prisma")).toMatch(/@@unique\(\[userId, duelId\]\)/);
  });

  it("gives both a medal on a draw", () => {
    expect(src).toMatch(/winnerId === null\s*\n?\s*\? \[sides\.challenger, sides\.opponent\]/);
  });
});

// -- Vad som mats -----------------------------------------------------
describe("what counts toward a duel", () => {
  const src = read("lib/duels.ts");

  it("measures duel attempts, not practice", () => {
    // Ingen traning ska allokeras till tvekampens siffra. Laser matningen
    // PracticeSession ar den regeln bruten vid kallan.
    const fn   = src.slice(src.indexOf("export async function measureSide"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/prisma\.duelAttempt/);
    expect(body).not.toMatch(/practiceSession/);
    expect(body).not.toMatch(/prisma\.section/);
  });

  it("takes the best attempt, not the last and not the sum", () => {
    expect(src).toMatch(/orderBy: \[\{ wordsCorrect: "desc" \}, \{ createdAt: "asc" \}\]/);
  });

  it("scopes every measurement to one duel and one person", () => {
    expect(src).toMatch(/where:\s*\{ duelId, userId \}/);
  });
});

describe("a duel attempt touches nothing else", () => {
  const src  = read("lib/duels.ts");
  const fn   = src.slice(src.indexOf("export async function recordDuelAttempt"));
  const body = fn.slice(0, fn.indexOf("\nfunction clamp"));

  it("awards no XP and moves no schedule", () => {
    // Det ar hela skalet till att DuelAttempt ar en egen tabell. Skulle
    // nagon av de har raderna dyka upp har borjar en tvekamp betala ut
    // XP och flytta inlarningskurvan, vilket den inte ska.
    for (const forbidden of [
      "xp:", "increment", "sm2", "nextReview",
      "practiceSession", "performance.create", "recordRun",
      "checkAndAwardMedal", "recordMilestone", "recordPracticeSession",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("writes only to duelAttempt", () => {
    const writes = body.match(/prisma\.\w+\.(create|update|updateMany|upsert|delete)/g) ?? [];
    expect(writes).toEqual(["prisma.duelAttempt.create"]);
  });

  it("grades against the text on the server, never the client's copy", () => {
    // Skickade klienten originalet kunde man skicka in tva rader och
    // bli bedomd mot dem.
    expect(body).toMatch(/prisma\.section\.findMany/);
    expect(body).toMatch(/gradeAttempt\(/);
  });

  it("refuses an attempt once the clock has run out", () => {
    expect(body).toMatch(/endsAt\.getTime\(\) <= Date\.now\(\)/);
  });

  it("refuses an attempt on a duel that is not yours", () => {
    expect(src).toMatch(/duelSideFor[\s\S]*?That duel isn't yours/);
  });
});

// -- Notiserna --------------------------------------------------------
describe("the bubbles on the Friends tab", () => {
  const src = read("lib/duels.ts");

  it("counts invitations waiting on you, not ones you sent", () => {
    expect(src).toMatch(/opponentId: userId, status: "pending"/);
  });

  it("counts acceptances only until they have been seen", () => {
    // Utan kvitteringen lyser den grona bubblan hela kampen igenom, och
    // en notis som aldrig slocknar ar ingen notis.
    expect(src).toMatch(/challengerId:\s+userId,\s*\n\s*status:\s+"active",\s*\n\s*acceptedSeenAt: null/);
    expect(src).toMatch(/export async function markAcceptancesSeen/);
  });

  it("is cleared when the Friends page is actually opened", () => {
    expect(read("app/(app)/friends/page.tsx")).toMatch(/markAcceptancesSeen\(user\.id\)/);
  });
});

// ── Privata verk ──────────────────────────────────────────────────────
describe("a duel never names a private work in the feed", () => {
  it("keeps the title out of the milestone body", () => {
    // Samma regel som framforandena i performanceStore. posts.ts kan
    // dolja titeln den LANKAR till, men inte orden i brodtexten — star
    // titeln dar hamnar ett privat verks namn i vannernas flode.
    const src   = read("lib/duels.ts");
    const calls = src.match(/recordMilestone\([\s\S]*?\)\.catch/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).not.toMatch(/workTitle/);
    }
  });

  it("only shows a battle medal's title when the work is public", () => {
    // Medaljens titel NAMNGER verket, sa den maste silas dar den ritas.
    expect(read("app/(app)/u/[handle]/page.tsx"))
      .toMatch(/m\.work\.visibility === "public"/);
  });
});

// ── Resultatet ────────────────────────────────────────────────────────
describe("who may read a result", () => {
  it("refuses anyone who was not in the duel", () => {
    expect(read("lib/duels.ts"))
      .toMatch(/duel\.challengerId !== userId && duel\.opponentId !== userId/);
  });
});
