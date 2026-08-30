// tests/performance.test.ts
//
// Mastartiteln ar det enda i appen som kan tas ifran nagon. Reglerna for
// nar den ges, hills och faller maste darfor vara exakta, forutsagbara
// och uttrycka precis vad som avsags — inte ungefar.

import { describe, it, expect } from "vitest";
import {
  standingFor, isPassingRun, performanceXP, learningProgress,
  fitsOneSitting, RULES, type PerformanceRun,
} from "@/lib/performance";

const NOW = new Date("2026-06-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function runs(count: number, opts: { passed?: boolean; daysAgo?: number; accuracy?: number } = {}): PerformanceRun[] {
  return Array.from({ length: count }, () => ({
    accuracy:  opts.accuracy ?? 90,
    passed:    opts.passed ?? true,
    createdAt: daysAgo(opts.daysAgo ?? 0),
  }));
}

describe("the pass bar", () => {
  it("counts a run at the threshold", () => {
    expect(isPassingRun(85)).toBe(true);
    expect(isPassingRun(84)).toBe(false);
  });

  it("records failed runs without counting them", () => {
    const s = standingFor([...runs(3), ...runs(5, { passed: false })], NOW);
    expect(s.passed).toBe(3);
    // Misslyckade forsok finns kvar i historiken — man ska kunna se sin
    // kurva, inte bara sina segrar.
    expect(s.bestAccuracy).not.toBeNull();
  });
});

describe("earning the title", () => {
  it("needs ten passing runs", () => {
    expect(standingFor(runs(9), NOW).isMastered).toBe(false);
    expect(standingFor(runs(10), NOW).isMastered).toBe(true);
  });

  it("reports progress toward it", () => {
    expect(standingFor(runs(0), NOW).percent).toBe(0);
    expect(standingFor(runs(5), NOW).percent).toBe(50);
    expect(standingFor(runs(10), NOW).percent).toBe(100);
  });

  it("cannot be reached on failed runs alone", () => {
    expect(standingFor(runs(50, { passed: false }), NOW).isMastered).toBe(false);
  });

  it("moves through the states in order", () => {
    expect(standingFor(runs(0), NOW).standing).toBe("none");
    expect(standingFor(runs(4), NOW).standing).toBe("in_progress");
    expect(standingFor(runs(10), NOW).standing).toBe("held");
  });
});

describe("keeping the title", () => {
  it("holds it on the day it was performed", () => {
    const s = standingFor(runs(10, { daysAgo: 0 }), NOW);
    expect(s.standing).toBe("held");
    expect(s.isMastered).toBe(true);
  });

  it("warns after a day without a performance", () => {
    const s = standingFor(runs(10, { daysAgo: 1 }), NOW);
    expect(s.standing).toBe("at_risk");
    // Varnad, men inte fratagen. Ett missat dygn river inte tio framforanden.
    expect(s.isMastered).toBe(true);
    expect(s.daysUntilLapse).toBe(2);
  });

  it("still holds on the second day", () => {
    const s = standingFor(runs(10, { daysAgo: 2 }), NOW);
    expect(s.isMastered).toBe(true);
    expect(s.daysUntilLapse).toBe(1);
  });

  it("lapses on the third", () => {
    const s = standingFor(runs(10, { daysAgo: 3 }), NOW);
    expect(s.standing).toBe("lapsed");
    expect(s.isMastered).toBe(false);
  });

  it("counts from the most recent passing run, not the first", () => {
    const s = standingFor(
      [...runs(9, { daysAgo: 40 }), ...runs(1, { daysAgo: 0 })],
      NOW
    );
    expect(s.standing).toBe("held");
    expect(s.daysSinceLastPass).toBe(0);
  });

  it("is not kept alive by failed runs", () => {
    // Att stalla sig och mumla varje dag ska inte halla titeln vid liv.
    const s = standingFor(
      [...runs(10, { daysAgo: 10 }), ...runs(5, { passed: false, daysAgo: 0 })],
      NOW
    );
    expect(s.standing).toBe("lapsed");
  });
});

describe("xp", () => {
  it("pays more for a longer work", () => {
    const short = performanceXP({ passed: true, accuracy: 90, sectionCount: 2,  justMastered: false });
    const long  = performanceXP({ passed: true, accuracy: 90, sectionCount: 40, justMastered: false });
    expect(long).toBeGreaterThan(short);
  });

  it("caps what a single run can pay", () => {
    const huge = performanceXP({ passed: true, accuracy: 100, sectionCount: 5_000, justMastered: false });
    expect(huge).toBeLessThanOrEqual(600);
  });

  it("pays a large one-off when the title is taken", () => {
    const plain    = performanceXP({ passed: true, accuracy: 90, sectionCount: 10, justMastered: false });
    const mastered = performanceXP({ passed: true, accuracy: 90, sectionCount: 10, justMastered: true });
    expect(mastered - plain).toBe(500);
  });

  it("pays something for a failed attempt, but barely", () => {
    const failed = performanceXP({ passed: false, accuracy: 40, sectionCount: 10, justMastered: false });
    expect(failed).toBeGreaterThan(0);
    expect(failed).toBeLessThan(20);
  });

  it("rewards precision above the bar", () => {
    const bare    = performanceXP({ passed: true, accuracy: 85,  sectionCount: 10, justMastered: false });
    const verbatim = performanceXP({ passed: true, accuracy: 100, sectionCount: 10, justMastered: false });
    expect(verbatim).toBeGreaterThan(bare);
  });
});

describe("the learning bar", () => {
  it("is empty before anything is practised", () => {
    expect(learningProgress(["not_started", "not_started"])).toBe(0);
  });

  it("moves on the first session, not only when a section is finished", () => {
    // Det har ar hela poangen med andringen: forut stod stapeln kvar pa
    // noll under hela den period da man arbetade som mest.
    expect(learningProgress(["learning", "not_started", "not_started"])).toBeGreaterThan(0);
  });

  it("rises as sections settle", () => {
    const early = learningProgress(["learning", "learning"]);
    const later = learningProgress(["practicing", "nearly_mastered"]);
    expect(later).toBeGreaterThan(early);
  });

  it("is full only when every section is held", () => {
    expect(learningProgress(["mastered", "mastered"])).toBe(100);
    expect(learningProgress(["mastered", "nearly_mastered"])).toBeLessThan(100);
  });

  it("handles a work with no sections", () => {
    expect(learningProgress([])).toBe(0);
  });
});

describe("what fits one sitting", () => {
  it("lets a poem be performed whole", () => {
    expect(fitsOneSitting(2)).toBe(true);
    expect(fitsOneSitting(RULES.maxSectionsInOneSitting)).toBe(true);
  });

  it("sends the Odyssey to its parts", () => {
    expect(fitsOneSitting(1_639)).toBe(false);
  });
});
