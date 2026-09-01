// tests/weak-spots.integration.test.ts
//
// Att markeringen foljer minnet.
//
// Det gar inte att prova utan databas, och det ar den egenskap hela
// funktionen bestalldes for: ett stalle som ar svagt ska lysa, sluta lysa
// nar det borjar sitta, och tanda igen den dag det glider. En markering
// som bara ackumulerar vore en permanent stampel pa nagot man for lange
// sedan lart sig.
//
// Kor med en databas som far skrivas i:
//
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/weak-spots.integration.test.ts
//
// Utan variabeln hoppar filen over sig sjalv. Allt som skapas ar markt
// med WEAKTEST och raderas i afterAll.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { gradeAttempt } from "@/lib/cue";
import {
  recordAttempt, recordWholeWorkAttempt, weaknessFor, spansFor,
} from "@/lib/weakSpots";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const MARK = "WEAKTEST";

// Tre rader. Den mittersta ar den som ska tappas.
const LINE_A = "the first line holds firm";
const LINE_B = "the middle line keeps slipping away";
const LINE_C = "the final line holds firm";
const TEXT   = `${LINE_A}\n${LINE_B}\n${LINE_C}`;

let userId: string, workId: string, sectionId: string;

async function scrub() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: MARK } } });
}

/** Ett forsok dar hela texten satt. */
async function perfectAttempt(id = sectionId, text = TEXT) {
  await recordAttempt(id, gradeAttempt(text, text).diff);
}

/** Ett forsok dar mittenraden foll bort. */
async function missMiddle() {
  await recordAttempt(sectionId, gradeAttempt(TEXT, `${LINE_A}\n${LINE_C}`).diff);
}

/** Texten som ar markerad just nu, sammanslagen. */
async function highlighted(): Promise<string> {
  const w = await weaknessFor(sectionId);
  return spansFor(TEXT, w).map(s => TEXT.slice(s.start, s.end)).join(" | ");
}

describe.skipIf(!HAS_DB)("weak spots follow the memory", () => {
  beforeAll(async () => {
    await scrub();
    const user = await prisma.user.create({
      data: { clerkId: `${MARK}_a`, username: "Weak Test" },
      select: { id: true },
    });
    userId = user.id;

    const work = await prisma.work.create({
      data: { userId, title: "Test Work", author: "Nobody", type: "POEM" },
      select: { id: true },
    });
    workId = work.id;

    const section = await prisma.section.create({
      data: { workId, name: "I", content: TEXT, orderIndex: 0 },
      select: { id: true },
    });
    sectionId = section.id;
  });

  afterAll(async () => {
    await scrub();
    await prisma.$disconnect();
  });

  it("invents nothing for a text that has never been practised", async () => {
    const w = await weaknessFor(sectionId);
    expect(w.enough).toBe(false);
    expect(await highlighted()).toBe("");
  });

  it("still says nothing after a single attempt", async () => {
    // En enda gang bevisar ingenting — forsta gangen man laser en strof
    // missar man det mesta, och det sager bara att man just borjat.
    await missMiddle();
    const w = await weaknessFor(sectionId);
    expect(w.enough).toBe(false);
    expect(await highlighted()).toBe("");
  });

  it("marks the line once it has slipped repeatedly", async () => {
    await missMiddle();
    await missMiddle();

    const w = await weaknessFor(sectionId);
    expect(w.enough).toBe(true);

    const shown = await highlighted();
    // Den tappade raden ar markerad...
    expect(shown).toContain("middle line keeps slipping");
    // ...och raderna som satt ar det inte.
    expect(shown).not.toContain("first line");
    expect(shown).not.toContain("final line");
  });

  it("gets more serious the more it slips", async () => {
    await missMiddle();
    await missMiddle();

    const spans = spansFor(TEXT, await weaknessFor(sectionId));
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0].severity).toBe("severe");
    expect(spans[0].misses).toBeGreaterThan(1);
    expect(spans[0].accuracy).toBeLessThan(50);
  });

  it("fades as the line starts to hold", async () => {
    const before = spansFor(TEXT, await weaknessFor(sectionId))[0];

    await perfectAttempt();
    await perfectAttempt();

    const after = spansFor(TEXT, await weaknessFor(sectionId))[0];
    // Fortfarande markerad, men lagre grad — minnet ar pa vag tillbaka.
    expect(after).toBeDefined();
    expect(after.accuracy).toBeGreaterThan(before.accuracy);
  });

  it("stops marking it once it is consistently recalled", async () => {
    for (let i = 0; i < 6; i++) await perfectAttempt();

    expect(await highlighted()).toBe("");
    // Historiken finns kvar — det ar bara markeringen som slocknat.
    expect((await weaknessFor(sectionId)).enough).toBe(true);
  });

  it("lights up again when the line starts slipping once more", async () => {
    await missMiddle();
    await missMiddle();
    await missMiddle();

    expect(await highlighted()).toContain("middle line");
  });

  it("never marks a line that has always held", async () => {
    // Genom hela ovanstaende har forsta och sista raden suttit.
    const shown = await highlighted();
    expect(shown).not.toContain("first line holds");
    expect(shown).not.toContain("final line holds");
  });

  // ── Hela verket pa en gang ──────────────────────────────────────────

  it("splits a whole-work performance back into the right sections", async () => {
    const two = await prisma.section.create({
      data: { workId, name: "II", content: "a second section entirely", orderIndex: 1 },
      select: { id: true },
    });

    const sections = [
      { id: sectionId, content: TEXT },
      { id: two.id,    content: "a second section entirely" },
    ];
    const joined = sections.map(s => s.content).join("\n\n");

    // Hela verket reciteras, men den andra sektionen faller bort helt.
    for (let i = 0; i < 4; i++) {
      await recordWholeWorkAttempt(sections, gradeAttempt(joined, TEXT).diff);
    }

    const second = await weaknessFor(two.id);
    expect(second.enough).toBe(true);
    expect(second.words.length).toBeGreaterThan(0);

    // Och den forsta sektionen fick INTE den andras missar pahangda.
    const firstShown = spansFor(TEXT, await weaknessFor(sectionId))
      .map(s => TEXT.slice(s.start, s.end)).join(" ");
    expect(firstShown).not.toContain("second section");
  });

  it("writes nothing when the grading does not line up with the text", async () => {
    const three = await prisma.section.create({
      data: { workId, name: "III", content: "untouched section here", orderIndex: 2 },
      select: { id: true },
    });

    // En diff som ar for kort for sektionerna — hellre inget alls an
    // svaghet pa fel plats.
    await recordWholeWorkAttempt(
      [{ id: three.id, content: "untouched section here" }],
      gradeAttempt("one", "one").diff
    );

    expect((await weaknessFor(three.id)).enough).toBe(false);
  });
});
