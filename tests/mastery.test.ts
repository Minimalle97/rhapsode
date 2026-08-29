// tests/mastery.test.ts
// Mästerskap räknas fram, aldrig bedöms. Testet håller den regeln.

import { describe, it, expect } from "vitest";
import { masteryOf, workMastery, accuracyPercent, MASTERY_ORDER } from "@/lib/mastery";

const base = { status: "learning", sm2Reps: 1, sm2Interval: 1 };

describe("section mastery", () => {
  it("calls an untouched section not started", () => {
    expect(masteryOf({ ...base, status: "not_started", sm2Reps: 0 })).toBe("not_started");
  });

  it("moves through the levels as the interval grows", () => {
    expect(masteryOf({ ...base, sm2Reps: 1, sm2Interval: 1 })).toBe("learning");
    expect(masteryOf({ ...base, sm2Reps: 3, sm2Interval: 3 })).toBe("practicing");
    expect(masteryOf({ ...base, sm2Reps: 5, sm2Interval: 10 })).toBe("nearly_mastered");
    expect(masteryOf({ ...base, sm2Reps: 8, sm2Interval: 90 })).toBe("mastered");
  });

  it("will not call something mastered that keeps being got wrong", () => {
    // Att ha väntat länge nog är inte samma sak som att kunna något.
    const level = masteryOf({
      ...base, status: "permanent", sm2Reps: 9, sm2Interval: 120,
      recentAccuracy: [62, 70, 58],
    });
    expect(level).not.toBe("mastered");
  });

  it("accepts mastery when the recent attempts were nearly verbatim", () => {
    const level = masteryOf({
      ...base, status: "permanent", sm2Reps: 9, sm2Interval: 120,
      recentAccuracy: [98, 96, 100],
    });
    expect(level).toBe("mastered");
  });

  it("is deterministic", () => {
    const input = { ...base, sm2Reps: 4, sm2Interval: 9, recentAccuracy: [91, 88] };
    const runs = Array.from({ length: 20 }, () => masteryOf(input));
    expect(new Set(runs).size).toBe(1);
  });
});

describe("work mastery", () => {
  const mastered = { status: "permanent", sm2Reps: 9, sm2Interval: 90, recentAccuracy: [98] };
  const untouched = { status: "not_started", sm2Reps: 0, sm2Interval: 1 };

  it("handles an empty work", () => {
    const m = workMastery([]);
    expect(m.level).toBe("not_started");
    expect(m.percent).toBe(0);
  });

  it("requires every section before a work counts as mastered", () => {
    // Den som säger sig kunna Odysséen ska kunna hela Odysséen.
    const almost = workMastery([mastered, mastered, mastered, untouched]);
    expect(almost.level).not.toBe("mastered");

    const all = workMastery([mastered, mastered, mastered]);
    expect(all.level).toBe("mastered");
    expect(all.percent).toBe(100);
  });

  it("counts each level", () => {
    const m = workMastery([mastered, untouched, untouched]);
    expect(m.counts.mastered).toBe(1);
    expect(m.counts.not_started).toBe(2);
    expect(m.total).toBe(3);
  });

  it("orders the levels from nothing to everything", () => {
    expect(MASTERY_ORDER[0]).toBe("not_started");
    expect(MASTERY_ORDER.at(-1)).toBe("mastered");
    expect(MASTERY_ORDER).toHaveLength(5);
  });
});

describe("accuracy", () => {
  it("is a plain percentage", () => {
    expect(accuracyPercent(9, 10)).toBe(90);
    expect(accuracyPercent(0, 10)).toBe(0);
  });

  it("survives an empty attempt without dividing by zero", () => {
    expect(accuracyPercent(0, 0)).toBe(0);
  });

  it("never leaves the range", () => {
    expect(accuracyPercent(20, 10)).toBe(100);
  });
});
