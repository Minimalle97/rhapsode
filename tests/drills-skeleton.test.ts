// tests/drills-skeleton.test.ts
//
// Skelettet, ord for ord.
//
// Rakningen ar hela drillen: gar den fel med ett tecken blir texten
// antingen for latt eller obegriplig, och bada ser ut som att appen ar
// trasig snarare an att en instalning star fel. Darfor provas den som
// ren funktion, och darfor bor gransfallen har och inte i en kommentar.

import { describe, it, expect } from "vitest";
import {
  reduceWord, skeletonLine, skeletonText, cleanSettings,
  DEFAULT_SETTINGS, type SkeletonSettings,
} from "@/lib/drills/skeleton";

const DASH = "–";
const set = (over: Partial<SkeletonSettings> = {}): SkeletonSettings =>
  ({ ...DEFAULT_SETTINGS, ...over });

// ── Ett ord i taget ───────────────────────────────────────────────────
describe("cutting a single word down", () => {
  it("keeps the opening letter and dashes the rest", () => {
    const w = reduceWord("Muse", set());
    expect(w.shown).toBe("M");
    expect(w.hidden).toBe(DASH.repeat(3));
  });

  it("keeps two or three letters when asked", () => {
    expect(reduceWord("unconquerable", set({ lettersPerWord: 2 })).shown).toBe("un");
    expect(reduceWord("unconquerable", set({ lettersPerWord: 3 })).shown).toBe("unc");
  });

  it("keeps capitals exactly as written", () => {
    expect(reduceWord("Muse", set()).shown).toBe("M");
    expect(reduceWord("muse", set()).shown).toBe("m");
  });

  it("hides the length when told to", () => {
    // Av: alltid tre streck, sa langden avslojar ingenting.
    const short = reduceWord("cat",           set({ showWordLength: false }));
    const long  = reduceWord("unconquerable", set({ showWordLength: false }));
    expect(short.hidden).toBe(DASH.repeat(3));
    expect(long.hidden).toBe(DASH.repeat(3));
    // Samma antal streck, trots tio bokstavers skillnad.
    expect(short.hidden).toBe(long.hidden);
  });

  it("shows the length when told to", () => {
    // Pa: ett ord pa sju bokstaver ger sin forsta plus sex streck.
    const w = reduceWord("majesty", set({ showWordLength: true }));
    expect(w.shown).toBe("m");
    expect(w.hidden).toBe(DASH.repeat(6));
    expect(w.shown.length + w.hidden.length).toBe("majesty".length);
  });

  it("leaves short words whole only when that is switched on", () => {
    expect(reduceWord("the", set({ keepShortWords: true })).hidden).toBe("");
    expect(reduceWord("the", set({ keepShortWords: true })).shown).toBe("the");
    // Av som standard — "the" blir "t––".
    expect(reduceWord("the", set({ keepShortWords: false })).shown).toBe("t");
  });

  it("never dashes a word that is already shorter than what would show", () => {
    // "a" med tre bokstavers visning: det finns inget att dolja.
    const w = reduceWord("a", set({ lettersPerWord: 3 }));
    expect(w.shown).toBe("a");
    expect(w.hidden).toBe("");
  });

  it("treats a hyphenated word as one word", () => {
    // Delas det blir "w––– w–––", vilket sager nagot annat an ordet gor.
    const segs = skeletonLine("well-worn", set());
    const words = segs.filter(s => s.kind === "word");
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({ shown: "w" });
  });

  it("does not split on an apostrophe", () => {
    for (const word of ["wasn't", "wasn’t", "o'er"]) {
      const words = skeletonLine(word, set()).filter(s => s.kind === "word");
      expect(words, word).toHaveLength(1);
    }
  });
});

// ── En rad ────────────────────────────────────────────────────────────
describe("cutting a line down", () => {
  it("keeps punctuation and spacing exactly where it was", () => {
    const line = "Tell me of the man, Muse";
    const out  = skeletonText(line, set({ wholeWordsPerLine: 1 }));

    // Kommat star kvar, pa sin plats, och mellanrummen ar orörda.
    expect(out).toBe(`Tell m${DASH} o${DASH} t${DASH}${DASH} m${DASH}${DASH}, M${DASH}${DASH}${DASH}`);
  });

  it("spares the first word when asked, and only the first", () => {
    const out = skeletonText("alpha beta gamma", set({ wholeWordsPerLine: 1 }));
    expect(out.startsWith("alpha ")).toBe(true);
    expect(out).not.toContain("beta ");
  });

  it("spares two when asked for two", () => {
    const out = skeletonText("alpha beta gamma", set({ wholeWordsPerLine: 2 }));
    expect(out.startsWith("alpha beta ")).toBe(true);
    expect(out).not.toContain("gamma");
  });

  it("spares none by default", () => {
    const out = skeletonText("alpha beta gamma", set());
    expect(out).not.toContain("alpha");
  });

  it("counts the sparing per line, not per text", () => {
    // Andra radens forsta ord ska ocksa sta kvar.
    const out = skeletonText("alpha beta\ngamma delta", set({ wholeWordsPerLine: 1 }));
    const [one, two] = out.split("\n");
    expect(one.startsWith("alpha")).toBe(true);
    expect(two.startsWith("gamma")).toBe(true);
  });

  it("keeps every line break, including the empty ones", () => {
    const text = "one\n\ntwo";
    expect(skeletonText(text, set()).split("\n")).toHaveLength(3);
  });

  it("leaves a line with no words alone", () => {
    expect(skeletonText("...", set())).toBe("...");
    expect(skeletonText("", set())).toBe("");
  });

  it("keeps leading indentation", () => {
    const out = skeletonText("  indented line", set());
    expect(out.startsWith("  ")).toBe(true);
  });

  it("does not leak the text through a stray literal", () => {
    // Varje bokstav som inte ar bland de visade maste vara borta.
    const line = "unconquerable majesty";
    const out  = skeletonText(line, set());
    expect(out).not.toContain("unconquerable");
    expect(out).not.toContain("majesty");
  });
});

// ── Instalningarna ────────────────────────────────────────────────────
describe("settings that come back from the database", () => {
  it("falls back to the documented defaults", () => {
    expect(cleanSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      lettersPerWord: 1, wholeWordsPerLine: 0,
      showWordLength: true, keepShortWords: false,
    });
  });

  it("refuses a letter count outside one to three", () => {
    // Noll hade gett en text helt utan bokstaver, tjugo hade gett texten
    // oforandrad. Bada ser ut som ett haveri.
    for (const bad of [0, -1, 4, 20, NaN]) {
      expect(cleanSettings({ lettersPerWord: bad as 1 })).toMatchObject({ lettersPerWord: 1 });
    }
    for (const good of [1, 2, 3] as const) {
      expect(cleanSettings({ lettersPerWord: good })).toMatchObject({ lettersPerWord: good });
    }
  });

  it("refuses a whole-word count outside zero to two", () => {
    for (const bad of [-1, 3, 99, NaN]) {
      expect(cleanSettings({ wholeWordsPerLine: bad as 0 })).toMatchObject({ wholeWordsPerLine: 0 });
    }
  });

  it("keeps the two switches as real booleans", () => {
    expect(cleanSettings({ showWordLength: false }).showWordLength).toBe(false);
    expect(cleanSettings({ keepShortWords: true }).keepShortWords).toBe(true);
    // Allt som inte uttryckligen ar av respektive pa faller till standard.
    expect(cleanSettings({}).showWordLength).toBe(true);
    expect(cleanSettings({}).keepShortWords).toBe(false);
  });
});

// ── Skarmlasaren ──────────────────────────────────────────────────────
describe("the dashes are marked up for a screen reader", () => {
  it("comes back as its own segment, separable from the visible letters", () => {
    // Komponenten behover kunna satta aria-label pa STRECKEN och inte pa
    // hela ordet — annars laser skarmlasaren "dolt ord" over bokstaven
    // som faktiskt star dar och ar ledtraden.
    const segs = skeletonLine("Muse", set());
    const word = segs.find(s => s.kind === "word");
    expect(word).toMatchObject({ shown: "M", hidden: DASH.repeat(3) });
  });

  it("gives a whole word no hidden part at all", () => {
    // Inget att markera, alltsa ingen aria-label att satta.
    const segs = skeletonLine("alpha", set({ wholeWordsPerLine: 1 }));
    expect(segs.find(s => s.kind === "word")).toMatchObject({ hidden: "" });
  });
});
