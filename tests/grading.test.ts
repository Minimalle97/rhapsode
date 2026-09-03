// tests/grading.test.ts
//
// Recitationen är produktens hjärta. De här testerna finns för att
// bevisa att den överlevde ombyggnaden — rättningen ska ge samma svar som
// förut, fast utan att fråga en modell.

import { describe, it, expect } from "vitest";
import { gradeAttempt, scoreToQuality, applyCue, maskToInitials, maskToFirstWord, suggestCue, pickBestTranscript } from "@/lib/cue";

const LINE = "Shall I compare thee to a summer's day?";

describe("deterministic grading", () => {
  it("gives a perfect recall full marks", () => {
    const r = gradeAttempt(LINE, LINE);
    expect(r.score).toBe(100);
    expect(r.missed).toEqual([]);
    expect(r.diff.every(d => d.correct)).toBe(true);
  });

  it("ignores punctuation, case and curly apostrophes", () => {
    // "dont" istället för "don't" är inte att ha glömt texten.
    const r = gradeAttempt("Shall I compare thee", "shall i COMPARE thee!!");
    expect(r.score).toBe(100);
  });

  it("marks the words that slipped", () => {
    const r = gradeAttempt(LINE, "Shall I compare thee to a winter's day");
    expect(r.score).toBeLessThan(100);
    expect(r.missed).toContain("summer's");
  });

  it("gives nothing for an empty original", () => {
    expect(gradeAttempt("", "anything").score).toBe(0);
  });

  it("is deterministic — the same input scores the same every time", () => {
    // Detta är hela skälet att inte fråga en modell: mästerskapsnivån
    // måste gå att reproducera.
    const runs = Array.from({ length: 8 }, () => gradeAttempt(LINE, "Shall I compare thee to a day"));
    expect(new Set(runs.map(r => r.score)).size).toBe(1);
  });

  it("scores a wholly wrong attempt low", () => {
    expect(gradeAttempt(LINE, "the quick brown fox jumps over").score).toBeLessThan(30);
  });
});

describe("cue ceilings", () => {
  it("caps quality when the whole text was visible", () => {
    // Att klara det med texten framför sig är inte att kunna det.
    expect(scoreToQuality(100, "full")).toBe(3);
    expect(scoreToQuality(100, "hidden")).toBe(5);
  });

  it("still punishes a poor attempt regardless of cue", () => {
    expect(scoreToQuality(10, "hidden")).toBe(0);
  });

  it("suggests less support as a section settles", () => {
    expect(suggestCue("not_started")).toBe("full");
    expect(suggestCue("learning")).toBe("firstWord");
    expect(suggestCue("mastered")).toBe("hidden");
  });
});

describe("masking", () => {
  it("keeps first letters and punctuation", () => {
    const masked = maskToInitials("Shall I compare");
    expect(masked.startsWith("S")).toBe(true);
    expect(masked).toContain("_");
    expect(masked).not.toContain("hall");
  });

  it("keeps apostrophes inside words", () => {
    expect(maskToInitials("summer's")).toContain("'");
  });

  it("keeps the first word of each line", () => {
    const masked = maskToFirstWord("Shall I compare\nThou art more");
    expect(masked).toContain("Shall");
    expect(masked).toContain("Thou");
    expect(masked).not.toContain("compare");
  });

  it("shows nothing at all when hidden", () => {
    expect(applyCue(LINE, "hidden")).toBe("");
  });

  it("preserves line breaks, which carry the rhythm", () => {
    const text = "one two\nthree four";
    expect(applyCue(text, "skeleton").split("\n")).toHaveLength(2);
  });
});

// ── Att valja bland motorns egna gissningar ───────────────────────────
describe("picking the best of the recogniser's alternatives", () => {
  it("takes a later alternative when it fits the text better", () => {
    // Motorn hade ratt ord som andrahandsval. Tidigare las bara det
    // forsta, och det ratta kastades bort.
    const original = "the quiet harbour holds the morning light";
    const chunks = [
      ["the quiet arbour holds", "the quiet harbour holds"],
      ["the morning light"],
    ];
    expect(pickBestTranscript(original, chunks)).toBe(
      "the quiet harbour holds the morning light"
    );
  });

  it("keeps the first alternative when nothing beats it", () => {
    const original = "one two three";
    const chunks = [["one two three", "won too free"]];
    expect(pickBestTranscript(original, chunks)).toBe("one two three");
  });

  it("never invents a word the recogniser did not offer", () => {
    // Det ar hela skillnaden mot att "rata" nagons minne. Sades fel ord
    // finns ingen kandidat med det ratta, och forsoket forblir fel.
    const original = "the harbour holds the light";
    const chunks   = [["a completely different sentence"]];
    const picked   = pickBestTranscript(original, chunks);
    expect(picked).toBe("a completely different sentence");
    expect(picked).not.toContain("harbour");
  });

  it("survives empty input", () => {
    expect(pickBestTranscript("anything", [])).toBe("");
  });

  it("improves the score rather than leaving it worse", () => {
    const original = "sails against the evening tide";
    const chunks = [
      ["sales against the evening tide", "sails against the evening tide"],
    ];
    const naive  = gradeAttempt(original, chunks[0][0]).score;
    const picked = gradeAttempt(original, pickBestTranscript(original, chunks)).score;
    expect(picked).toBeGreaterThan(naive);
  });
});

// ── Homofoner ─────────────────────────────────────────────────────────
describe("words that sound identical", () => {
  it("forgives them when the attempt was spoken", () => {
    // "their" och "there" later exakt likadant. Att racka motorns val av
    // dem som ett minnesfel vore att straffa nagon for gissningen.
    const spoken = gradeAttempt("their house by the sea", "there house by the sea", { spoken: true });
    expect(spoken.score).toBe(100);
  });

  it("still counts them wrong when it was written", () => {
    // I skrift ar stavningen en del av det man ovar.
    const written = gradeAttempt("their house by the sea", "there house by the sea");
    expect(written.score).toBeLessThan(100);
  });

  it("treats a digit and its word as the same thing aloud", () => {
    expect(gradeAttempt("two roads", "2 roads", { spoken: true }).score).toBe(100);
  });

  it("does not forgive a word that merely looks similar", () => {
    // Listan ska tacka det som ar omojligt att hora skillnad pa, inte
    // allt som ar likt — annars slinker riktiga fel igenom.
    const g = gradeAttempt("the harbour light", "the harbour night", { spoken: true });
    expect(g.score).toBeLessThan(100);
  });

  it("reports the original's own word, not the homophone", () => {
    // Missade-listan och markeringen ska namna texten som den star.
    const g = gradeAttempt("their house", "there hows", { spoken: true });
    expect(g.diff.map(d => d.word)).toEqual(["their", "house"]);
  });
});
