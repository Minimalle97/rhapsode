// tests/weak-spots.test.ts
//
// Markeringen av svaga stallen.
//
// Det viktigaste provet i filen ar det forsta: att `alignedWords` ger
// EXAKT samma ordfoljd som rattningen i lib/cue.ts. Hela funktionen vilar
// pa att `diff[i]` och `alignedWords(text)[i]` ar samma ord. Glider de
// isar med ett enda steg markeras fel halva av strofen, och felet syns
// inte i nagot annat prov — texten ser rimlig ut, den ar bara fel.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { gradeAttempt } from "@/lib/cue";
import {
  alignedWords, spansFor, severityOf, explain,
  CUE_WEIGHT, HESITATION_WEIGHT,
  type SectionWeakness, type WeakWord,
} from "@/lib/weakSpots";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/** Texter med den sortens typografi som faktiskt forekommer. */
const SAMPLES = [
  "Out of the night that covers me,\nBlack as the pit from pole to pole",
  "I thank whatever gods may be\n  For my unconquerable soul.",
  "HAMLET.\nTo be, or not to be — that is the question.",
  "Shall I compare thee to a summer's day?\nThou art more lovely...",
  "One — two — three.\n\nFour: five; six!",
  "Café naïve résumé — accented words stay whole.",
  "Line with  double  spaces\tand a tab.",
  "'Quoted opening' and a mid-word hyphen: well-worn.",
];

// ── Radningen ─────────────────────────────────────────────────────────
describe("aligning words to the original text", () => {
  it("produces exactly the words the grader compares", () => {
    // Provas genom att ratta texten mot SIG SJALV: da ar varje ord ratt,
    // och diffens ordfoljd ar originalets.
    for (const text of SAMPLES) {
      const graded = gradeAttempt(text, text);
      const mine   = alignedWords(text);

      expect(mine.map(w => w.norm)).toEqual(graded.diff.map(d => d.word));
    }
  });

  it("keeps that parity when the attempt is wrong", () => {
    // Diffen ar radad efter ORIGINALET aven nar forsoket ar trasigt —
    // det ar den egenskapen markeringen hanger pa.
    const text = SAMPLES[0];
    const graded = gradeAttempt(text, "out of the pit");
    expect(graded.diff.map(d => d.word)).toEqual(alignedWords(text).map(w => w.norm));
  });

  it("points at the right piece of the untouched text", () => {
    const text = "Out of the night that covers me";
    const words = alignedWords(text);

    expect(text.slice(words[0].start, words[0].end)).toBe("Out");
    expect(text.slice(words[3].start, words[3].end)).toBe("night");
    expect(text.slice(words[6].start, words[6].end)).toBe("me");
  });

  it("carries punctuation and capitals through untouched", () => {
    const text = "Black as the pit,\nfrom pole to pole.";
    for (const w of alignedWords(text)) {
      // Utsnittet ur originalet ska normalisera till samma sak igen.
      const cut = text.slice(w.start, w.end);
      expect(cut.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "")).toBe(
        w.norm.replace(/[^\p{L}\p{N}'-]/gu, "")
      );
    }
  });

  it("survives an empty or blank text", () => {
    expect(alignedWords("")).toEqual([]);
    expect(alignedWords("   \n\n  ")).toEqual([]);
  });
});

// ── Graderna ──────────────────────────────────────────────────────────
describe("how bad is bad", () => {
  it("rises through the three levels", () => {
    expect(severityOf(0.05)).toBeNull();
    expect(severityOf(0.25)).toBe("moderate");
    expect(severityOf(0.45)).toBe("strong");
    expect(severityOf(0.80)).toBe("severe");
  });

  it("marks nothing at all below the lowest threshold", () => {
    // En rad man missat en gang pa tio ska inte lysa. Markeras for mycket
    // slutar den betyda nagot.
    expect(severityOf(0)).toBeNull();
    expect(severityOf(0.19)).toBeNull();
  });
});

// ── Styckena ──────────────────────────────────────────────────────────
function weakness(words: Partial<WeakWord>[]): SectionWeakness {
  return {
    enough: true,
    attempts: 5,
    words: words.map(w => ({
      index: 0, rate: 0.5, severity: "strong", misses: 2, ...w,
    })) as WeakWord[],
  };
}

describe("grouping weak words into something you can see", () => {
  const text = "one two three four five six seven eight nine ten";

  it("joins neighbours into a single span", () => {
    const spans = spansFor(text, weakness([{ index: 1 }, { index: 2 }, { index: 3 }]));
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("two three four");
  });

  it("bridges a single healthy word", () => {
    // Sa ser en glomd rad ut: en bit man tappar, inte ett ord.
    const spans = spansFor(text, weakness([{ index: 1 }, { index: 3 }]));
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("two three four");
  });

  it("does not bridge a wider gap", () => {
    const spans = spansFor(text, weakness([{ index: 1 }, { index: 6 }]));
    expect(spans).toHaveLength(2);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("two");
    expect(text.slice(spans[1].start, spans[1].end)).toBe("seven");
  });

  it("takes the worst grade in the group", () => {
    // Ett stalle dar man konsekvent tappar halva raden ska inte tonas ned
    // av att ett ord i den brukar sitta.
    const spans = spansFor(text, weakness([
      { index: 1, severity: "moderate" },
      { index: 2, severity: "severe" },
    ]));
    expect(spans[0].severity).toBe("severe");
  });

  it("marks nothing without enough history", () => {
    // Kravet var uttryckligt: for en ny text ska inga svaga stallen
    // hittas pa.
    const thin: SectionWeakness = { enough: false, attempts: 1, words: [] };
    expect(spansFor(text, thin)).toEqual([]);
  });

  it("marks nothing when there is no history at all", () => {
    expect(spansFor(text, { enough: false, attempts: 0, words: [] })).toEqual([]);
  });

  it("ignores an index past the end of the text", () => {
    // Texten kan ha kortats sedan svagheten skrevs.
    expect(spansFor(text, weakness([{ index: 999 }]))).toEqual([]);
  });

  it("lands on real word boundaries", () => {
    const spans = spansFor(text, weakness([{ index: 2 }]));
    expect(spans[0].start).toBe(text.indexOf("three"));
    expect(spans[0].end).toBe(text.indexOf("three") + "three".length);
  });
});

// ── Forklaringen ──────────────────────────────────────────────────────
describe("what the tooltip says", () => {
  it("counts once as once", () => {
    const e = explain({ start: 0, end: 3, severity: "moderate", misses: 1, accuracy: 70 });
    expect(e.detail).toContain("once");
    expect(e.detail).toContain("70%");
  });

  it("names the level in words, not numbers", () => {
    expect(explain({ start: 0, end: 3, severity: "severe", misses: 9, accuracy: 12 }).title)
      .toBe("Keeps slipping");
    expect(explain({ start: 0, end: 3, severity: "moderate", misses: 2, accuracy: 74 }).title)
      .toBe("Weak spot");
  });
});

// ── Var siffrorna kommer ifran ────────────────────────────────────────
describe("weakness comes from what the user did", () => {
  const src = read("lib/weakSpots.ts");

  it("uses no model anywhere", () => {
    // Kravet var uttryckligt: markera inte en rad for att en modell
    // tycker att den ar svar. Det ar ett pastaende om TEXTEN; det som ska
    // visas ar ett pastaende om PERSONEN.
    for (const forbidden of ["runAi", "anthropic", "openai", "prompt", "@/lib/ai"]) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("decays old attempts so the mark follows the current memory", () => {
    // Utan dampningen markeras en tidig svacka for alltid.
    // Vikten ar inte langre en etta — ledtradsniva och tvekan gor den
    // rorlig — men dampningen ar oforandrad, och det ar den som provas.
    expect(src).toMatch(/const DECAY = 0\.\d+/);
    expect(src).toMatch(/m \* DECAY \+ weight/);
    expect(src).toMatch(/a \* DECAY \+ 1/);
  });

  it("keeps quiet until there is enough history", () => {
    expect(src).toMatch(/const MIN_ATTEMPTS = /);
    expect(src).toMatch(/row\.attempts < MIN_ATTEMPTS/);
  });

  it("stores by position, not by the word itself", () => {
    // "the" star tio ganger i en strof. Pa ordet hade ett missat "the"
    // tant alla tio.
    expect(src).toMatch(/const key\s+= String\(i\)/);
  });
});

describe("the counting happens when practice is recorded, not when reading", () => {
  it("writes from the grading route", () => {
    const src = read("app/api/practice/grade/route.ts");
    expect(src).toMatch(/recordAttempt\(section\.id, graded\.diff,/);
  });

  it("writes from a whole-work performance", () => {
    expect(read("app/api/performance/route.ts"))
      .toMatch(/recordWholeWorkAttempt\(sections, graded\.diff,/);
  });

  it("never lets a failed write break the practice session", () => {
    // Markeringen ar en hjalp. Att ett pass misslyckas for att en hjalp
    // inte gick att spara vore fel ordning pa sakerna.
    // [\s\S] och inte [^)]: argumentet ar numera ett objekt over flera
    // rader, och ett prov som inte kan spanna dem provar ingenting.
    expect(read("app/api/practice/grade/route.ts"))
      .toMatch(/recordAttempt\([\s\S]*?\)\.catch\(/);
    expect(read("app/api/performance/route.ts"))
      .toMatch(/recordWholeWorkAttempt\([\s\S]*?\)\.catch\(/);
  });

  it("reads a finished answer when a section is opened", () => {
    // Lasvyn far inte rakna nagot sjalv, och absolut inte anropa en modell.
    const page = read("app/(app)/work/[id]/read/[sectionId]/page.tsx");
    expect(page).toMatch(/weaknessFor\(section\.id\)/);
    expect(page).not.toMatch(/runAi|recordAttempt/);
  });
});

// ── Gratis mot Pro ────────────────────────────────────────────────────
describe("reading is free, knowing your weak spots is Pro", () => {
  const page = read("app/(app)/work/[id]/read/[sectionId]/page.tsx");

  it("never gates the reading itself", () => {
    // Sidan far inte kunna stanga nagon ute fran sin egen text.
    expect(page).not.toMatch(/requireFeature|FeatureLocked|notFound\(\).*isPro/);
  });

  it("does not even look up the weak spots without Pro", () => {
    // Skickas platserna anda kan de lasas ur svaret, och da ar gransen
    // en rityta i stallet for en grans.
    expect(page).toMatch(/ent\.isPro \? await weaknessFor/);
  });

  it("gives the client nothing to reveal", () => {
    expect(page).toMatch(/const spans\s+= weakness \? spansFor/);
  });
});

// ── En renderare ──────────────────────────────────────────────────────
describe("one renderer, not two", () => {
  it("has practice's Read mode use the reading renderer", () => {
    // Tva renderare hade betytt att en pjas bryts pa ett satt pa ett
    // stalle och ett annat pa ett annat.
    expect(read("components/practice/ReadMode.tsx")).toMatch(/from "@\/components\/reading\/SectionText"/);
  });

  it("keeps the user's own line breaks", () => {
    const src = read("components/reading/SectionText.tsx");
    expect(src).toMatch(/content\.split\("\\n"\)/);
    expect(src).toMatch(/whiteSpace: "pre-wrap"/);
  });

  it("highlights with a background, never by recolouring the words", () => {
    // Att farga sjalva orden hade gjort just de rader som ar svarast att
    // minnas svarast att lasa.
    const src = read("components/reading/SectionText.tsx");
    expect(src).toMatch(/color:\s*"inherit"/);
    for (const level of ["moderate", "strong", "severe"]) {
      expect(src).toContain(`${level}:`);
    }
  });
});

// ── Ledtradar och tvekan ──────────────────────────────────────────────
describe("hints and hesitation count too", () => {
  const src = read("lib/weakSpots.ts");

  it("weighs a miss by how much of the text was showing", () => {
    // "Frequent hints required" ar ett eget tecken. Att tappa ett ord med
    // hela texten framfor sig ar nagot annat an att tappa det ur intet.
    expect(src).toMatch(/const CUE_WEIGHT: Record<CueLevel, number>/);
  });

  it("makes more support mean a heavier miss", () => {
    // Provas pa VARDENA, inte pa kallan som stavar dem. Ett prov som
    // laser siffror ur en textfil gar sonder pa indrag.
    expect(CUE_WEIGHT.hidden).toBe(1);
    expect(CUE_WEIGHT.skeleton).toBeGreaterThan(CUE_WEIGHT.hidden);
    expect(CUE_WEIGHT.initials).toBeGreaterThan(CUE_WEIGHT.skeleton);
    expect(CUE_WEIGHT.firstWord).toBeGreaterThan(CUE_WEIGHT.initials);
    expect(CUE_WEIGHT.full).toBeGreaterThan(CUE_WEIGHT.firstWord);
  });

  it("counts a hesitation for less than a miss", () => {
    // Att staka sig och anda komma pa det ar inte att inte kunna det.
    expect(HESITATION_WEIGHT).toBeGreaterThan(0);
    expect(HESITATION_WEIGHT).toBeLessThan(CUE_WEIGHT.hidden);
    // Och lagt nog att en ren tvekan aldrig ensam nar hogsta graden.
    expect(severityOf(HESITATION_WEIGHT)).not.toBe("severe");
  });

  it("never counts the same word as both missed and hesitated", () => {
    // Missen ar det starkare tecknet och inkluderar redan att det gick
    // trogt. Att lagga bada pa hade dubbelraknat samma handelse.
    expect(src).toMatch(/const paused\s+= !missed &&/);
  });

  it("places a hesitation through the attempt index, not by position", () => {
    // Tvekningarna raknas i forsokets ordfoljd. Utan bryggan via diff.at
    // hamnar de fel sa fort nagon hoppat over ett ord.
    expect(src).toMatch(/diff\[i\]\.at/);
  });
});

describe("the grader hands over which attempt word landed where", () => {
  it("records the attempt index on a match and on a substitution", () => {
    const g = gradeAttempt("one two three", "one two three");
    expect(g.diff.map(d => d.at)).toEqual([0, 1, 2]);
  });

  it("marks an outright omission as having no attempt word", () => {
    // Ordet sades aldrig. Det finns ingen plats i forsoket att peka pa,
    // och da far ingen tvekan hangas dar heller.
    const g = gradeAttempt("one two three", "one three");
    const missing = g.diff.find(d => !d.correct);
    expect(missing).toBeDefined();
    expect(missing!.at).toBeNull();
  });
});

describe("the hesitation signal is sanitised on the server", () => {
  it("is filtered in every route that accepts it", () => {
    // Kommer fran klienten. En lista pa tiotusen poster far inte na
    // rakningen bara for att den ar valformad JSON.
    for (const file of [
      "app/api/practice/grade/route.ts",
      "app/api/performance/route.ts",
      "app/api/duels/[id]/attempt/route.ts",
    ]) {
      const src = read(file);
      expect(src).toMatch(/Number\.isInteger/);
      expect(src).toMatch(/\.slice\(0, \d+\)/);
    }
  });
});

// ── Vagen in i ovningen ───────────────────────────────────────────────
describe("weak spots lead straight into practice", () => {
  const view = read("components/reading/ReadingView.tsx");

  it("offers the shortcut only when there is something to practise", () => {
    expect(view).toMatch(/highlight && spans\.length > 0/);
    expect(view).toMatch(/Practise these/);
  });

  it("lands in a testing mode, not with the text open", () => {
    // Att svara pa "ova det har" med att visa facit vore ingen ovning.
    expect(view).toMatch(/\/practice\/\$\{workId\}\/\$\{section\.id\}\?mode=write/);
  });

  it("has practice honour the mode it is sent", () => {
    const page = read("app/(app)/practice/[id]/[sectionId]/page.tsx");
    expect(page).toMatch(/initialMode=/);
    // Och bara kanda lagen — ?mode= kommer fran adressfaltet.
    expect(page).toMatch(/MODES\.includes/);
  });

  it("still lets anyone practise a section without weak spots", () => {
    // Genvagen far inte ersatta den vanliga vagen in.
    expect(view).toMatch(/Practise this section/);
  });
});
