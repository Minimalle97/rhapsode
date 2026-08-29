// tests/grading.test.ts
//
// Recitationen är produktens hjärta. De här testerna finns för att
// bevisa att den överlevde ombyggnaden — rättningen ska ge samma svar som
// förut, fast utan att fråga en modell.

import { describe, it, expect } from "vitest";
import {
  gradeAttempt, scoreToQuality, applyCue,
  maskToInitials, maskToFirstWord, suggestCue,
} from "@/lib/cue";

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
