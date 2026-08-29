// tests/ai-features.test.ts
//
// Katalogen över vad som får kosta pengar. Testerna här är i praktiken
// en spärr mot att någon längre fram flyttar in aritmetik i modellen
// eller gör ett personligt svar delbart.

import { describe, it, expect } from "vitest";
import { AI_FEATURES, aiFeature } from "@/lib/ai/features";
import { modelFor, estimateCostMicros, formatMicros } from "@/lib/ai/models";
import { cacheKey } from "@/lib/ai/cache";

describe("feature catalogue", () => {
  it("keeps personal answers out of the shared cache", () => {
    // Ett studiepass byggt på DIN historik får aldrig serveras till någon
    // annan. Det vore ett läckage mellan konton, inte en besparing.
    expect(AI_FEATURES.study_plan.shareable).toBe(false);
    expect(AI_FEATURES.tutor_chat.shareable).toBe(false);
    expect(AI_FEATURES.recitation_analysis.shareable).toBe(false);
  });

  it("shares what depends only on the text", () => {
    expect(AI_FEATURES.glossary.shareable).toBe(true);
    expect(AI_FEATURES.translation.shareable).toBe(true);
    expect(AI_FEATURES.work_metadata.shareable).toBe(true);
  });

  it("meters everything the user actually asked for", () => {
    for (const id of ["exercises", "glossary", "translation", "study_plan", "tutor_chat"] as const) {
      expect(AI_FEATURES[id].metered).toBe(true);
    }
  });

  it("does not charge the user for the app's own flourishes", () => {
    // En medaljtitel är inte något någon bett om. Den loggas ändå,
    // eftersom kostnaden är verklig.
    expect(AI_FEATURES.medal_title.metered).toBe(false);
    expect(AI_FEATURES.work_metadata.metered).toBe(false);
  });

  it("lets import and medals survive an exhausted allowance", () => {
    expect(AI_FEATURES.work_metadata.degradesGracefully).toBe(true);
    expect(AI_FEATURES.medal_title.degradesGracefully).toBe(true);
  });

  it("puts every paid feature behind an entitlement", () => {
    for (const spec of Object.values(AI_FEATURES)) {
      if (spec.metered) expect(spec.requires).not.toBeNull();
    }
  });

  it("throws on an unknown feature rather than guessing", () => {
    // @ts-expect-error — avsiktligt fel id
    expect(() => aiFeature("nonsense")).toThrow();
  });
});

describe("model routing and cost", () => {
  it("sends the open-ended work to the strongest model", () => {
    expect(modelFor("reasoning").id).toBe("claude-opus-5");
  });

  it("sends six-word flourishes to the cheapest", () => {
    expect(modelFor("light").id).toBe("claude-haiku-4-5");
  });

  it("does not send an effort setting to a model that rejects it", () => {
    expect(modelFor("light").effort).toBeUndefined();
  });

  it("prices output above input", () => {
    const input  = estimateCostMicros("claude-opus-5", 1_000_000, 0);
    const output = estimateCostMicros("claude-opus-5", 0, 1_000_000);
    expect(output).toBeGreaterThan(input);
    expect(input).toBe(5_000_000);   // $5 per MTok
    expect(output).toBe(25_000_000); // $25 per MTok
  });

  it("assumes the dearest price for a model it does not know", () => {
    expect(estimateCostMicros("claude-unreleased-9", 1_000_000, 0)).toBe(5_000_000);
  });

  it("returns whole micro-dollars, never a float", () => {
    expect(Number.isInteger(estimateCostMicros("claude-sonnet-5", 1234, 567))).toBe(true);
  });

  it("formats for a human", () => {
    expect(formatMicros(12_500)).toBe("$0.0125");
  });
});

describe("cache keys", () => {
  const base = { feature: "glossary", model: "claude-sonnet-5", promptVersion: 1 };

  it("gives the same key for the same question", () => {
    const a = cacheKey({ ...base, input: { text: "The Raven", lang: "en" } });
    const b = cacheKey({ ...base, input: { lang: "en", text: "The Raven" } });
    expect(a).toBe(b); // nyckelordning får inte spela roll
  });

  it("separates two different texts", () => {
    expect(cacheKey({ ...base, input: { text: "a" } }))
      .not.toBe(cacheKey({ ...base, input: { text: "b" } }));
  });

  it("separates users when the answer is personal", () => {
    expect(cacheKey({ ...base, input: { text: "a" }, userId: "u1" }))
      .not.toBe(cacheKey({ ...base, input: { text: "a" }, userId: "u2" }));
  });

  it("retires cached answers when the prompt changes", () => {
    expect(cacheKey({ ...base, input: { text: "a" } }))
      .not.toBe(cacheKey({ ...base, promptVersion: 2, input: { text: "a" } }));
  });
});
