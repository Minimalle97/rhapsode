// tests/study.test.ts
//
// Study Mode. Det viktiga testet är det sista: passets FORM räknas ut,
// och bara innehållet i vissa moment behöver en modell. Skulle någon
// senare låta modellen planera passet skulle kostnaden mångdubblas för
// ett sämre schema — testet gör den glidningen synlig.

import { describe, it, expect } from "vitest";
import {
  outlinePlan, selectSections, generationCount,
  TOOL_NEEDS_MODEL, TOOL_FEATURE, type CandidateSection, type StudyPlanRequest,
} from "@/lib/study";

const NOW = new Date("2026-06-15T12:00:00Z");

const sections: CandidateSection[] = [
  { id: "a", orderIndex: 0, status: "learned",     nextReview: new Date("2026-06-01"), lastAccuracy: 80 },
  { id: "b", orderIndex: 1, status: "not_started", nextReview: null },
  { id: "c", orderIndex: 2, status: "stable",      nextReview: new Date("2026-06-10"), lastAccuracy: 95 },
  { id: "d", orderIndex: 3, status: "learning",    nextReview: new Date("2026-08-01"), lastAccuracy: 60 },
  { id: "e", orderIndex: 4, status: "not_started", nextReview: null },
];

const request: StudyPlanRequest = {
  workId: "w1", goal: "memorise", difficulty: "normal",
  tools: ["recitation", "glossary", "missing_words"], minutes: 15,
};

describe("section selection", () => {
  it("takes what is overdue first", () => {
    const picked = selectSections(sections, 30, "normal", NOW);
    expect(picked[0]).toBe("a"); // längst förfallen
  });

  it("reaches for shaky sections before new material", () => {
    const picked = selectSections(sections, 60, "demanding", NOW);
    expect(picked.indexOf("d")).toBeLessThan(picked.indexOf("b"));
  });

  it("fits the session to the time available", () => {
    expect(selectSections(sections, 5, "gentle", NOW).length)
      .toBeLessThanOrEqual(selectSections(sections, 60, "demanding", NOW).length);
  });

  it("never repeats a section", () => {
    const picked = selectSections(sections, 90, "demanding", NOW);
    expect(new Set(picked).size).toBe(picked.length);
  });

  it("always returns something to do", () => {
    expect(selectSections(sections, 1, "gentle", NOW).length).toBeGreaterThan(0);
  });
});

describe("plan outline", () => {
  it("spends roughly the time asked for", () => {
    const plan = outlinePlan(request, sections, NOW);
    expect(plan.minutes).toBeGreaterThanOrEqual(12);
    expect(plan.minutes).toBeLessThanOrEqual(18);
  });

  it("reads before it drills", () => {
    const plan = outlinePlan(request, sections, NOW);
    const tools = plan.steps.map(s => s.tool);
    expect(tools.indexOf("glossary")).toBeLessThan(tools.indexOf("recitation"));
  });

  it("gives recitation the most time", () => {
    const plan = outlinePlan(request, sections, NOW);
    const recite = plan.steps.find(s => s.tool === "recitation")!;
    for (const step of plan.steps) expect(recite.minutes).toBeGreaterThanOrEqual(step.minutes);
  });

  it("falls back to recitation when nothing was chosen", () => {
    const plan = outlinePlan({ ...request, tools: [] }, sections, NOW);
    expect(plan.steps.map(s => s.tool)).toEqual(["recitation"]);
  });

  it("is deterministic", () => {
    const runs = Array.from({ length: 10 }, () => JSON.stringify(outlinePlan(request, sections, NOW)));
    expect(new Set(runs).size).toBe(1);
  });
});

describe("what actually costs money", () => {
  it("keeps recitation, rhythm and missing words off the model", () => {
    // Alla tre går att räkna ut. Skulle någon av dem bli true här har
    // någon flyttat aritmetik till en modell.
    expect(TOOL_NEEDS_MODEL.recitation).toBe(false);
    expect(TOOL_NEEDS_MODEL.rhythm).toBe(false);
    expect(TOOL_NEEDS_MODEL.missing_words).toBe(false);
  });

  it("counts only the generating steps", () => {
    const plan = outlinePlan(request, sections, NOW);
    expect(generationCount(plan)).toBe(1); // bara ordlistan
  });

  it("costs nothing at all for a plan built from free tools", () => {
    const plan = outlinePlan(
      { ...request, tools: ["recitation", "rhythm", "missing_words"] }, sections, NOW
    );
    expect(generationCount(plan)).toBe(0);
  });

  it("keeps the free tools outside any paid feature", () => {
    expect(TOOL_FEATURE.recitation).toBeNull();
    expect(TOOL_FEATURE.rhythm).toBeNull();
    expect(TOOL_FEATURE.translation).not.toBeNull();
  });
});
