// tests/cleanup.test.ts
//
// Gransen mellan gratis och betalt gar vid en enda fraga: gar det att
// rakna ut? Testerna nedan haller fast bade att den gratis stadningen
// verkligen gor nytta, och att den inte tyst borjar anropa en modell.

import { describe, it, expect } from "vitest";
import { basicCleanup, summarise, looksLikeVerse } from "@/lib/cleanup";
import { LIMITS, ENTITLEMENTS, FEATURE } from "@/lib/billing/plans";
import { entitlementsForPlan, canUseFeature } from "@/lib/billing/entitlements";
import { AI_FEATURES } from "@/lib/ai/features";

describe("free cleanup: patterns, no model", () => {
  it("collapses runs of spaces and blank lines", () => {
    const r = basicCleanup("one    two\n\n\n\nthree");
    expect(r.text).toBe("one two\n\nthree");
    expect(r.changes.some(c => /spacing/i.test(c.label))).toBe(true);
  });

  it("strips margin line numbers", () => {
    const withNumbers = [
      "Shall I compare thee to a summer's day?", "5",
      "Thou art more lovely and more temperate:", "10",
      "Rough winds do shake the darling buds of May,",
      "And summer's lease hath all too short a date;",
    ].join("\n");
    expect(basicCleanup(withNumbers).text).not.toMatch(/^\s*(5|10)\s*$/m);
  });

  it("strips page numbers set between dashes", () => {
    const paged = ["Some text here.", "— 42 —", "More text follows."].join("\n");
    expect(basicCleanup(paged).text).not.toContain("42");
  });

  it("removes a header that repeats on every page", () => {
    const lines: string[] = [];
    for (let i = 0; i < 8; i++) {
      lines.push("THE COMPLETE WORKS", `Body line number ${i} with real content in it.`);
    }
    const cleaned = basicCleanup(lines.join("\n")).text;
    expect(cleaned).not.toContain("THE COMPLETE WORKS");
    expect(cleaned).toContain("Body line number 3");
  });

  it("rejoins a sentence broken across lines", () => {
    const broken = "It was the best of times, it was the worst\nof times, it was the age of wisdom.";
    expect(basicCleanup(broken).text).toContain("the worst of times");
  });

  it("leaves verse line breaks alone", () => {
    // En diktrad slutar ofta utan skiljetecken och foljs av en gemen. Det
    // ar inte ett fel — det ar formen, och att "laga" det vore forstorelse.
    const verse = [
      "Out of the night that covers me",
      "black as the pit from pole to pole",
      "i thank whatever gods may be",
      "for my unconquerable soul",
      "in the fell clutch of circumstance",
      "i have not winced nor cried aloud",
    ].join("\n");
    expect(looksLikeVerse(verse)).toBe(true);
    expect(basicCleanup(verse).text.split("\n").length).toBe(6);
  });

  it("is deterministic", () => {
    const input = "a   b\n\n\n c \nd";
    const runs = Array.from({ length: 10 }, () => basicCleanup(input).text);
    expect(new Set(runs).size).toBe(1);
  });

  it("says so plainly when there is nothing to do", () => {
    const clean = basicCleanup("A tidy line.\n\nAnother tidy line.");
    expect(summarise(clean)).toMatch(/already clean/);
  });

  it("never returns an empty text for a non-empty input", () => {
    // Stadning far kramas, aldrig radera allt.
    for (const input of ["word", "a\n\nb", "  spaced  "]) {
      expect(basicCleanup(input).text.length).toBeGreaterThan(0);
    }
  });
});

describe("the free/paid split", () => {
  const free = entitlementsForPlan("free", "none", "free");
  const pro  = entitlementsForPlan("pro", "stripe", "active");

  it("gives basic cleanup to everyone, unmetered", () => {
    expect(canUseFeature(free, FEATURE.BASIC_CLEANUP)).toBe(true);
    expect(canUseFeature(pro,  FEATURE.BASIC_CLEANUP)).toBe(true);
  });

  it("gives deep cleanup to free users too — it runs out, it is not locked", () => {
    // Skillnaden ar avsiktlig. Ett hanglas ber om pengar innan nagon vet
    // vad de koper; en forbrukad ranson ber om dem precis nar de sett det.
    expect(canUseFeature(free, FEATURE.ADVANCED_CLEANUP)).toBe(true);
    expect(LIMITS.free.advancedCleanupMonthly).toBe(2);
  });

  it("gives pro an allowance that is effectively unlimited", () => {
    expect(LIMITS.pro.advancedCleanupMonthly).toBeGreaterThan(1000);
  });

  it("keeps the cleanup allowance separate from the generation allowance", () => {
    // Den som stadat tva texter ska fortfarande kunna gora sina ovningar.
    expect(LIMITS.free.advancedCleanupMonthly).not.toBe(LIMITS.free.aiMonthly);
  });

  it("puts both cleanup features in both plans", () => {
    for (const plan of [ENTITLEMENTS.free, ENTITLEMENTS.pro]) {
      expect(plan).toContain(FEATURE.BASIC_CLEANUP);
      expect(plan).toContain(FEATURE.ADVANCED_CLEANUP);
    }
  });
});

describe("what the deep clean costs", () => {
  const spec = AI_FEATURES.text_cleanup;

  it("requires the advanced entitlement", () => {
    expect(spec.requires).toBe(FEATURE.ADVANCED_CLEANUP);
  });

  it("does not eat the generation allowance", () => {
    // Den har en egen rakning (cleanup_month).
    expect(spec.metered).toBe(false);
  });

  it("shares its answer, because the same file cleans the same way", () => {
    expect(spec.shareable).toBe(true);
  });

  it("does not silently fall back to something worse", () => {
    // Import och medaljtitlar far degradera. En stadning far inte —
    // halvstadad text ar samre an ostadad, for man vet inte vilket man har.
    expect(spec.degradesGracefully).toBe(false);
  });
});
