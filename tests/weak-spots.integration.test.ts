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

  // -- Ledtradar och tvekan -------------------------------------------

  it("counts a miss made with the text showing more heavily than one made cold", async () => {
    // "Frequent hints required": att tappa ett ord med hela texten framfor
    // sig sager nagot helt annat an att tappa det ur tomma intet.
    const cold = await prisma.section.create({
      data: { workId, name: "cold", content: TEXT, orderIndex: 10 },
      select: { id: true },
    });
    const helped = await prisma.section.create({
      data: { workId, name: "helped", content: TEXT, orderIndex: 11 },
      select: { id: true },
    });

    const diff = gradeAttempt(TEXT, `${LINE_A}
${LINE_C}`).diff;
    for (let i = 0; i < 3; i++) {
      await recordAttempt(cold.id,   diff, { cueLevel: "hidden" });
      await recordAttempt(helped.id, diff, { cueLevel: "full" });
    }

    const coldSpan   = spansFor(TEXT, await weaknessFor(cold.id))[0];
    const helpedSpan = spansFor(TEXT, await weaknessFor(helped.id))[0];

    expect(coldSpan).toBeDefined();
    expect(helpedSpan).toBeDefined();
    // Samma missar, men den som hade texten framme bedoms strangare.
    expect(helpedSpan.accuracy).toBeLessThan(coldSpan.accuracy);
  });

  it("marks a word that is always hesitated over but always correct", async () => {
    const s = await prisma.section.create({
      data: { workId, name: "hesitant", content: TEXT, orderIndex: 12 },
      select: { id: true },
    });

    // Perfekt atergivning varje gang — men alltid en lang paus fore ordet
    // pa plats 6 i forsoket.
    const diff = gradeAttempt(TEXT, TEXT).diff;
    for (let i = 0; i < 5; i++) {
      await recordAttempt(s.id, diff, { cueLevel: "hidden", hesitatedAt: [6] });
    }

    const w = await weaknessFor(s.id);
    const marked = w.words.find(x => x.index === 6);

    expect(marked).toBeDefined();
    // Det syns — men det ar inte samma sak som att inte kunna det.
    expect(marked!.severity).toBe("moderate");
    expect(marked!.severity).not.toBe("severe");
  });

  it("leaves the words that were neither missed nor hesitated alone", async () => {
    const s = await prisma.section.create({
      data: { workId, name: "quiet", content: TEXT, orderIndex: 13 },
      select: { id: true },
    });

    const diff = gradeAttempt(TEXT, TEXT).diff;
    for (let i = 0; i < 5; i++) {
      await recordAttempt(s.id, diff, { cueLevel: "hidden", hesitatedAt: [6] });
    }

    const w = await weaknessFor(s.id);
    // Bara den ena platsen, inte hela sektionen.
    expect(w.words.map(x => x.index)).toEqual([6]);
  });

  it("does not count a word twice when it was both missed and hesitated over", async () => {
    // Missen ar det starkare tecknet och inkluderar redan att det gick
    // trogt. Bada pa hade dubbelraknat samma handelse.
    //
    // Provas pa ETT ord, inte pa hela sektionen: ett forsok dar ordet
    // sags FEL ger en substitution, och bara substitutioner har en plats
    // i forsoket att hanga en tvekan pa. Ett ord som hoppats over helt
    // har `at: null`, och da kan fragan inte ens uppsta.
    const wrong = `${LINE_A}
the muddle line keeps slipping away
${LINE_C}`;
    const diff  = gradeAttempt(TEXT, wrong).diff;

    const swapped = diff.findIndex(d => !d.correct && d.at !== null && d.at !== undefined);
    expect(swapped).toBeGreaterThan(-1);
    const attemptIndex = diff[swapped].at as number;

    const both = await prisma.section.create({
      data: { workId, name: "both", content: TEXT, orderIndex: 14 },
      select: { id: true },
    });
    const missOnly = await prisma.section.create({
      data: { workId, name: "missonly", content: TEXT, orderIndex: 15 },
      select: { id: true },
    });

    for (let i = 0; i < 3; i++) {
      await recordAttempt(both.id,     diff, { cueLevel: "hidden", hesitatedAt: [attemptIndex] });
      await recordAttempt(missOnly.id, diff, { cueLevel: "hidden" });
    }

    const a = (await weaknessFor(both.id)).words.find(w => w.index === swapped);
    const b = (await weaknessFor(missOnly.id)).words.find(w => w.index === swapped);

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Samma ord, samma vikt — tvekan la ingenting ovanpa missen.
    expect(a!.rate).toBeCloseTo(b!.rate, 6);
  });

  // -- Trasiga inspelningar ------------------------------------------

  it("ignores a run that captured almost nothing, however many times it happens", async () => {
    // Det verkliga felet: tva framforanden pa 7 % och 11 % — trunkerade
    // av en trasig inspelning — malade hela dikten orange, trots att de
    // riktiga forsoken lag pa 80 och 91 procent.
    const s = await prisma.section.create({
      data: { workId, name: "botched", content: TEXT, orderIndex: 20 },
      select: { id: true },
    });

    // Fem korningar dar nastan ingenting kom fram.
    const barely = gradeAttempt(TEXT, "the").diff;
    for (let i = 0; i < 5; i++) await recordAttempt(s.id, barely);

    const after = await weaknessFor(s.id);
    // Ingenting skrevs: raden finns inte ens.
    expect(after.enough).toBe(false);
    expect(after.attempts).toBe(0);
    expect(spansFor(TEXT, after)).toEqual([]);
  });

  it("still records a run that mostly came through", async () => {
    // Gransen far inte tysta riktiga forsok. Har faller en rad bort av
    // tre — det ar precis den sortens forsok markeringen finns for.
    const s = await prisma.section.create({
      data: { workId, name: "genuine", content: TEXT, orderIndex: 21 },
      select: { id: true },
    });

    const good = gradeAttempt(TEXT, `${LINE_A}
${LINE_C}`).diff;
    for (let i = 0; i < 3; i++) await recordAttempt(s.id, good);

    const after = await weaknessFor(s.id);
    expect(after.enough).toBe(true);
    expect(spansFor(TEXT, after).length).toBeGreaterThan(0);
  });

  it("does not paint the whole section when a run is merely poor", async () => {
    // Saturationsvakten: ar nastan allt svagt ar ingenting det.
    const s = await prisma.section.create({
      data: { workId, name: "saturated", content: TEXT, orderIndex: 22 },
      select: { id: true },
    });

    // Precis over golvet, men nastan allt fel.
    const words = TEXT.split(/\s+/);
    const half  = words.slice(0, Math.ceil(words.length * 0.55)).join(" ");
    for (let i = 0; i < 3; i++) await recordAttempt(s.id, gradeAttempt(TEXT, half).diff);

    const after = await weaknessFor(s.id);
    if (after.saturated) {
      expect(spansFor(TEXT, after)).toEqual([]);
    } else {
      // Annars ska atminstone inte HELA texten vara markerad.
      const covered = spansFor(TEXT, after).reduce((n, sp) => n + (sp.end - sp.start), 0);
      expect(covered).toBeLessThan(TEXT.length);
    }
  });
});
