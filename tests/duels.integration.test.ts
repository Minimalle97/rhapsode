// tests/duels.integration.test.ts
//
// Hela tvekampen mot en riktig databas.
//
// Det som provas har gar inte att prova utan Postgres: att kopian faktiskt
// hamnar i den andres bibliotek med texten men utan framstegen, att
// matningen bara ser innanfor tidsfonstret, att avgorandet fryser sitt
// svar, och att medaljen inte gar att fa tva ganger.
//
// Kor med en databas som far skrivas i:
//
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/duels.integration.test.ts
//
// Utan variabeln hoppar filen over sig sjalv i stallet for att ljuga om
// att allt ar gront. Samma regel som counters.integration.test.ts.
//
// Allt som skapas ar markt med DUELTEST och raderas i afterAll. Raderingen
// av de tva kontona kaskaderar till verk, sektioner, ovningspass, medaljer,
// inlagg och sjalva duellen — inget lamnas kvar.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createDuel, acceptDuel, settleDuel, duelBadgesForWorks,
  duelEntitlements, measureSide, recordDuelAttempt,
  duelNotices, markAcceptancesSeen, DuelError,
} from "@/lib/duels";
import { entitlementsForPlan } from "@/lib/billing/entitlements";
import { FEATURE } from "@/lib/billing/plans";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();

const MARK = "DUELTEST";
const PRO  = entitlementsForPlan("pro",  "grant", "active");
const FREE = entitlementsForPlan("free", "none",  "free");

// Texten. Ordantalen ar med flit olika sa att "ord som halls" och
// "sektioner" inte kan ge samma svar av en slump.
const SECTIONS = [
  { name: "I",   content: "out of the night that covers me black as the pit" },        // 11 ord
  { name: "II",  content: "i thank whatever gods may be for my unconquerable soul" },  // 10 ord
  { name: "III", content: "i am the master of my fate i am the captain of my soul" },  // 14 ord
];
/** 11 + 10 + 14. Star som en konstant sa att en andrad text inte tyst
 *  gor proven fel — de ska ga sonder, inte glida. */
const TOTAL_WORDS = 35;

let challengerId: string, opponentId: string, workId: string;

/**
 * Halet mellan "raden finns" och "typen sager kanske".
 *
 * Prisma ger null nar nagot inte hittas, och tsc granskar den har filen
 * som all annan kod. Ett utropstecken hade tystat den; det har sager i
 * stallet vad som saknades nar det saknas, vilket ar skillnaden mellan
 * ett prov som pekar pa felet och ett som kastar "cannot read property".
 */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

async function scrub() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: MARK } } });
}

describe.skipIf(!HAS_DB)("a duel, end to end", () => {
  beforeAll(async () => {
    await scrub();

    const a = await prisma.user.create({
      data: { clerkId: `${MARK}_a`, username: "Challenger", handle: `${MARK}a`, handleLower: `${MARK.toLowerCase()}a` },
      select: { id: true },
    });
    const b = await prisma.user.create({
      data: { clerkId: `${MARK}_b`, username: "Opponent", handle: `${MARK}b`, handleLower: `${MARK.toLowerCase()}b` },
      select: { id: true },
    });
    challengerId = a.id;
    opponentId   = b.id;

    await prisma.friendship.create({
      data: { requesterId: a.id, addresseeId: b.id, status: "accepted", respondedAt: new Date() },
    });

    // Verket med en DEL, sa att ompekningen av sektioner till nya delar
    // faktiskt provas och inte bara pastas i en kallgranskning.
    const work = await prisma.work.create({
      data: {
        userId: a.id, title: "Invictus", author: "W. E. Henley",
        type: "POEM", visibility: "public",
        parts: { create: [{ name: "Whole", orderIndex: 0 }] },
      },
      select: { id: true, parts: { select: { id: true } } },
    });
    workId = work.id;

    await prisma.section.createMany({
      data: SECTIONS.map((s, i) => ({
        workId: work.id, partId: work.parts[0].id,
        name: s.name, content: s.content, orderIndex: i,
        // Utmanaren har redan arbetat med sin text. Det far INTE folja
        // med i kopian.
        status: "mastered", sm2Reps: 9, sm2Interval: 90,
      })),
    });
  });

  afterAll(async () => {
    await scrub();
    await prisma.$disconnect();
  });

  // ── Inbjudan ────────────────────────────────────────────────────────

  it("refuses a challenger without Pro", async () => {
    await expect(
      createDuel({ challengerId, ent: FREE, opponentId, workId, minutes: 60 })
    ).rejects.toThrow(DuelError);
  });

  it("refuses a length that is not on offer", async () => {
    await expect(
      createDuel({ challengerId, ent: PRO, opponentId, workId, minutes: 45 })
    ).rejects.toThrow(/lengths on offer/);
  });

  it("refuses a work the challenger does not own", async () => {
    const notMine = await prisma.work.create({
      data: { userId: opponentId, title: "Theirs", author: "X", type: "POEM" },
      select: { id: true },
    });
    await expect(
      createDuel({ challengerId, ent: PRO, opponentId, workId: notMine.id, minutes: 60 })
    ).rejects.toThrow(/isn't yours/);
  });

  let duelId: string;

  it("creates the challenge, and does not start the clock yet", async () => {
    const duel = await createDuel({ challengerId, ent: PRO, opponentId, workId, minutes: 60 });
    duelId = duel.id;

    const row = must(await prisma.duel.findUnique({ where: { id: duelId } }), "duel");
    expect(row.status).toBe("pending");
    expect(row.startedAt).toBeNull();
    expect(row.endsAt).toBeNull();
    // Frysta, sa att resultatet gar att lasa aven efter en radering.
    expect(row.workTitle).toBe("Invictus");
  });

  it("will not let the same two stack up challenges", async () => {
    await expect(
      createDuel({ challengerId, ent: PRO, opponentId, workId, minutes: 10 })
    ).rejects.toThrow(/already/);
  });

  it("gives the opponent nothing until they accept", async () => {
    const theirs = await prisma.work.count({ where: { userId: opponentId, title: "Invictus" } });
    expect(theirs).toBe(0);
  });

  // ── Antagandet ──────────────────────────────────────────────────────

  let opponentWorkId: string;

  it("copies the work over and starts the clock on accept", async () => {
    await acceptDuel(duelId, opponentId);

    const row = must(await prisma.duel.findUnique({ where: { id: duelId } }), "duel");
    expect(row.status).toBe("active");
    expect(row.startedAt).toBeInstanceOf(Date);
    expect(row.endsAt).toBeInstanceOf(Date);
    expect(
      must(row.endsAt, "endsAt").getTime() - must(row.startedAt, "startedAt").getTime()
    ).toBe(60 * 60_000);

    opponentWorkId = must(row.opponentWorkId, "the opponent's copy");
  });

  it("hands over the text but none of the progress", async () => {
    const copy = must(await prisma.work.findUnique({
      where:  { id: opponentWorkId },
      select: {
        userId: true, title: true, visibility: true,
        parts: { select: { id: true, name: true } },
        sections: {
          orderBy: { orderIndex: "asc" },
          select: { content: true, partId: true, status: true, sm2Reps: true, sm2Interval: true, nextReview: true },
        },
      },
    }), "the copy");

    expect(copy.userId).toBe(opponentId);
    expect(copy.sections.map(s => s.content)).toEqual(SECTIONS.map(s => s.content));

    // Framstegen ar nollstallda — annars startar mottagaren pa
    // utmanarens arbete.
    for (const s of copy.sections) {
      expect(s.status).toBe("not_started");
      expect(s.sm2Reps).toBe(0);
      expect(s.nextReview).toBeNull();
    }

    // Kopian ar privat aven om originalet var publikt.
    expect(copy.visibility).toBe("private");

    // Sektionerna pekar pa KOPIANS del, inte pa utmanarens.
    expect(copy.parts).toHaveLength(1);
    for (const s of copy.sections) expect(s.partId).toBe(copy.parts[0].id);
  });

  it("cannot be accepted twice", async () => {
    await expect(acceptDuel(duelId, opponentId)).rejects.toThrow(/already been answered/);
  });

  it("cannot be accepted by a bystander", async () => {
    await expect(acceptDuel(duelId, challengerId)).rejects.toThrow(/isn't yours/);
  });

  // ── Lanade verktyg ──────────────────────────────────────────────────

  it("lends the free opponent Pro tools on the duel work only", async () => {
    const onDuelWork = await duelEntitlements(opponentId, FREE, opponentWorkId);
    expect(onDuelWork.isPro).toBe(true);
    expect(onDuelWork.features.has(FEATURE.ADVANCED_RECITATION)).toBe(true);

    // Men inte pa nagot annat verk de ager.
    const other = must(await prisma.work.findFirst({
      where: { userId: opponentId, id: { not: opponentWorkId } },
      select: { id: true },
    }), "another work");
    const elsewhere = await duelEntitlements(opponentId, FREE, other.id);
    expect(elsewhere.isPro).toBe(false);
  });

  it("does not lend a higher work ceiling", async () => {
    const lent = await duelEntitlements(opponentId, FREE, opponentWorkId);
    expect(lent.limits.savedWorks).toBe(FREE.limits.savedWorks);
  });

  // ── Biblioteket ─────────────────────────────────────────────────────

  it("marks both libraries, each with their own copy", async () => {
    const forChallenger = await duelBadgesForWorks(challengerId, [workId]);
    const forOpponent   = await duelBadgesForWorks(opponentId, [opponentWorkId]);

    expect(forChallenger.get(workId)?.running).toBe(true);
    expect(forChallenger.get(workId)?.opponentName).toBe("Opponent");
    expect(forOpponent.get(opponentWorkId)?.opponentName).toBe("Challenger");
  });

  it("does not mark a work that is in no duel", async () => {
    const other = must(await prisma.work.findFirst({
      where: { userId: opponentId, id: { not: opponentWorkId } },
      select: { id: true },
    }), "another work");
    expect((await duelBadgesForWorks(opponentId, [other.id])).size).toBe(0);
  });

  // -- Matningen ------------------------------------------------------

  it("will not settle while the clock is still running", async () => {
    expect(await settleDuel(duelId)).toBeNull();
  });

  it("starts both sides at nothing", async () => {
    const mine = await measureSide(duelId, opponentId);
    expect(mine.wordsHeld).toBe(0);
    expect(mine.attempts).toBe(0);
    expect(mine.bestAt).toBeNull();
  });

  it("ignores practice entirely, however much of it there is", async () => {
    // Detta ar hela regeln: ingen traning allokeras till tvekampens
    // siffra. Motstandaren ovar hela verket ordagrant, i de lagen som
    // annars ar de striktaste, och kampen ska inte rora sig en millimeter.
    const secs = await prisma.section.findMany({
      where: { workId: opponentWorkId }, orderBy: { orderIndex: "asc" },
      select: { id: true, content: true },
    });

    await prisma.practiceSession.createMany({
      data: secs.map(sec => ({
        sectionId:    sec.id,
        mode:         "recite",
        quality:      5,
        wordsTotal:   sec.content.split(/\s+/).length,
        wordsCorrect: sec.content.split(/\s+/).length,
        durationSecs: 120,
        xpEarned:     20,
      })),
    });

    const after = await measureSide(duelId, opponentId);
    expect(after.wordsHeld).toBe(0);
    expect(after.attempts).toBe(0);
  });

  it("records a duel attempt and scores it against the real text", async () => {
    // Halva verket, ordagrant: sektion I och II, inte III.
    const said = `${SECTIONS[0].content} ${SECTIONS[1].content}`;

    const r = await recordDuelAttempt({
      duelId, userId: opponentId, transcript: said, durationSecs: 45,
    });

    expect(r.wordsTotal).toBe(TOTAL_WORDS);
    expect(r.wordsCorrect).toBe(21);       // 11 + 10
    expect(r.isBest).toBe(true);
    expect(r.mine.wordsHeld).toBe(21);
    expect(r.theirs.wordsHeld).toBe(0);
  });

  it("writes nothing but the attempt itself", async () => {
    // Ingen XP, ingen SM-2-rorelse, ingen Performance-rad, ingen medalj.
    const [xp, moved, performances, medals] = await Promise.all([
      prisma.user.findUnique({ where: { id: opponentId }, select: { xp: true } }),
      prisma.section.count({ where: { workId: opponentWorkId, status: { not: "not_started" } } }),
      prisma.performance.count({ where: { userId: opponentId } }),
      prisma.medal.count({ where: { userId: opponentId } }),
    ]);

    expect(xp?.xp).toBe(0);
    expect(moved).toBe(0);
    expect(performances).toBe(0);
    expect(medals).toBe(0);
  });

  it("keeps the best attempt when a later one is worse", async () => {
    await recordDuelAttempt({
      duelId, userId: opponentId,
      transcript: SECTIONS[0].content,   // bara 11 ord den har gangen
      durationSecs: 20,
    });

    const m = await measureSide(duelId, opponentId);
    expect(m.wordsHeld).toBe(21);   // det basta star kvar
    expect(m.attempts).toBe(2);
    expect(m.seconds).toBe(65);
  });

  it("refuses an attempt from someone not in the duel", async () => {
    const stranger = await prisma.user.create({
      data: { clerkId: `${MARK}_c`, username: "Stranger" },
      select: { id: true },
    });
    await expect(
      recordDuelAttempt({ duelId, userId: stranger.id, transcript: "anything" })
    ).rejects.toThrow(/isn't yours/);
  });

  it("refuses an empty attempt", async () => {
    await expect(
      recordDuelAttempt({ duelId, userId: opponentId, transcript: "   " })
    ).rejects.toThrow(/Nothing was picked up/);
  });

  // -- Avgorandet -----------------------------------------------------

  it("settles once the clock runs out, and names the right winner", async () => {
    // Utmanaren gor hela verket och slar darmed 21.
    const whole = SECTIONS.map(s => s.content).join(" ");
    const r = await recordDuelAttempt({
      duelId, userId: challengerId, transcript: whole, durationSecs: 60,
    });
    expect(r.wordsCorrect).toBe(TOTAL_WORDS);

    // Flytta sluttiden bakat i stallet for att vanta en timme.
    await prisma.duel.update({
      where: { id: duelId },
      data:  { endsAt: new Date(Date.now() - 1_000) },
    });

    const result = must(await settleDuel(duelId), "a settled result");

    expect(result.challenger.wordsHeld).toBe(TOTAL_WORDS);
    expect(result.opponent.wordsHeld).toBe(21);
    expect(result.winnerId).toBe(challengerId);
    expect(result.margin).toBe("words");

    const row = must(await prisma.duel.findUnique({ where: { id: duelId } }), "duel");
    expect(row.status).toBe("finished");
    expect(row.winnerId).toBe(challengerId);
    expect(row.settledAt).toBeInstanceOf(Date);
  });

  it("refuses a further attempt once the duel is over", async () => {
    await expect(
      recordDuelAttempt({ duelId, userId: opponentId, transcript: SECTIONS[0].content })
    ).rejects.toThrow(/over|Time is up/);
  });

  it("gives the winner a battle medal, and the loser none", async () => {
    const medals = await prisma.medal.findMany({
      where:  { duelId },
      select: { userId: true, kind: true, title: true, workId: true, lostAt: true },
    });

    expect(medals).toHaveLength(1);
    expect(medals[0].userId).toBe(challengerId);
    expect(medals[0].kind).toBe("battle");
    // Verket foljer med — den som vann behaller texten.
    expect(medals[0].workId).toBe(workId);
    // En vunnen strid kan inte slockna.
    expect(medals[0].lostAt).toBeNull();
  });

  it("never names the work in the feed, only in the medal", async () => {
    const posts = await prisma.post.findMany({
      where:  { userId: challengerId, kind: "milestone" },
      select: { body: true },
    });
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) expect(p.body).not.toContain("Invictus");
  });

  it("gives the same answer when settled again, and no second medal", async () => {
    const again = must(await settleDuel(duelId), "the frozen result");
    expect(again.winnerId).toBe(challengerId);
    expect(again.challenger.wordsHeld).toBe(TOTAL_WORDS);

    expect(await prisma.medal.count({ where: { duelId } })).toBe(1);
  });

  it("stops lending the tools once the duel is over", async () => {
    const after = await duelEntitlements(opponentId, FREE, opponentWorkId);
    expect(after.isPro).toBe(false);
  });

  it("leaves the work in the loser's library all the same", async () => {
    // "Bada behaller verket" — det ar hela avtalet.
    const still = must(await prisma.work.findUnique({
      where:  { id: opponentWorkId },
      select: { userId: true, title: true },
    }), "the loser's copy");
    expect(still.userId).toBe(opponentId);
    expect(still.title).toBe("Invictus");
  });

  it("drops the badge once the duel is finished", async () => {
    expect((await duelBadgesForWorks(opponentId, [opponentWorkId])).size).toBe(0);
  });

  // -- Notiserna på Friends-fliken ------------------------------------

  it("counts a waiting invitation for the person who must answer", async () => {
    const fresh = await createDuel({
      challengerId, ent: PRO, opponentId, workId, minutes: 10,
    });

    expect((await duelNotices(opponentId)).invites).toBe(1);
    // Utmanaren har inget att svara pa — deras egen inbjudan ar ingen notis.
    expect((await duelNotices(challengerId)).invites).toBe(0);

    await prisma.duel.delete({ where: { id: fresh.id } });
  });

  it("turns green for the challenger once it is accepted, until seen", async () => {
    const fresh = await createDuel({
      challengerId, ent: PRO, opponentId, workId, minutes: 10,
    });
    expect((await duelNotices(challengerId)).accepted).toBe(0);

    await acceptDuel(fresh.id, opponentId);
    expect((await duelNotices(challengerId)).accepted).toBe(1);
    // Och den inbjudne har inget kvar att svara pa.
    expect((await duelNotices(opponentId)).invites).toBe(0);

    await markAcceptancesSeen(challengerId);
    expect((await duelNotices(challengerId)).accepted).toBe(0);

    await prisma.duel.delete({ where: { id: fresh.id } });
  });
});
