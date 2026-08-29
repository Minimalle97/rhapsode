// tests/entitlements.test.ts
// Vem får göra vad. Det här är testet som skyddar intäkten.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  derivePlan, entitlementsForPlan, canUseFeature,
  requireFeature, FeatureLockedError, isDeveloper, planRequiredFor,
} from "@/lib/billing/entitlements";
import { FEATURE, ENTITLEMENTS } from "@/lib/billing/plans";

const NOW = new Date("2026-06-15T12:00:00Z");
const FUTURE = new Date("2026-07-15T12:00:00Z");
const PAST   = new Date("2026-05-15T12:00:00Z");

function user(over: Partial<Parameters<typeof derivePlan>[0]> = {}) {
  return {
    id: "u1", clerkId: "clerk_1",
    plan: "free", planSource: "none", subscriptionStatus: "free",
    currentPeriodEnd: null, cancelAtPeriodEnd: false,
    ...over,
  };
}

describe("plan derivation", () => {
  it("gives free by default", () => {
    expect(derivePlan(user(), false, NOW).plan).toBe("free");
  });

  it("gives pro while the subscription is active", () => {
    const r = derivePlan(user({ subscriptionStatus: "active" }), false, NOW);
    expect(r.plan).toBe("pro");
    expect(r.source).toBe("stripe");
  });

  it("treats a trial as pro", () => {
    expect(derivePlan(user({ subscriptionStatus: "trialing" }), false, NOW).plan).toBe("pro");
  });

  it("keeps pro to the end of a period that was cancelled", () => {
    const r = derivePlan(
      user({ subscriptionStatus: "cancelled", currentPeriodEnd: FUTURE }), false, NOW
    );
    expect(r.plan).toBe("pro");
  });

  it("drops to free once a cancelled period has run out", () => {
    const r = derivePlan(
      user({ subscriptionStatus: "cancelled", currentPeriodEnd: PAST }), false, NOW
    );
    expect(r.plan).toBe("free");
  });

  it("does not lock out a past-due card mid-period", () => {
    // Vanligaste skälet är ett kort som gått ut. Att stänga av direkt
    // vore fel bemötande, och Stripe försöker dra igen.
    const r = derivePlan(
      user({ subscriptionStatus: "past_due", currentPeriodEnd: FUTURE }), false, NOW
    );
    expect(r.plan).toBe("pro");
  });

  it("drops a past-due subscription once the period is over", () => {
    const r = derivePlan(
      user({ subscriptionStatus: "past_due", currentPeriodEnd: PAST }), false, NOW
    );
    expect(r.plan).toBe("free");
  });

  it("gives pro on an active grant", () => {
    const r = derivePlan(user({ planSource: "grant" }), true, NOW);
    expect(r.plan).toBe("pro");
    expect(r.source).toBe("grant");
  });

  it("normalises Stripe's spelling of cancelled", () => {
    const r = derivePlan(
      user({ subscriptionStatus: "canceled", currentPeriodEnd: FUTURE }), false, NOW
    );
    expect(r.status).toBe("cancelled");
    expect(r.plan).toBe("pro");
  });

  it("ignores a status it does not recognise", () => {
    expect(derivePlan(user({ subscriptionStatus: "nonsense" }), false, NOW).plan).toBe("free");
  });
});

describe("developer override", () => {
  const original = process.env.RHAPSODE_DEVELOPER_USER_IDS;
  beforeEach(() => { process.env.RHAPSODE_DEVELOPER_USER_IDS = "u1, clerk_9"; });
  afterEach(() => {
    if (original === undefined) delete process.env.RHAPSODE_DEVELOPER_USER_IDS;
    else process.env.RHAPSODE_DEVELOPER_USER_IDS = original;
  });

  it("matches on our own id", () => {
    expect(isDeveloper(user())).toBe(true);
    expect(derivePlan(user(), false, NOW).source).toBe("developer");
  });

  it("matches on the clerk id too", () => {
    expect(isDeveloper({ id: "other", clerkId: "clerk_9" })).toBe(true);
  });

  it("does not match anyone else", () => {
    expect(isDeveloper({ id: "u2", clerkId: "clerk_2" })).toBe(false);
  });
});

describe("feature access", () => {
  const free = entitlementsForPlan("free", "none", "free");
  const pro  = entitlementsForPlan("pro", "stripe", "active");

  it("lets free users recite and keep texts", () => {
    // Kärnan får aldrig hamna bakom betalning.
    expect(canUseFeature(free, FEATURE.BASIC_RECITATION)).toBe(true);
    expect(canUseFeature(free, FEATURE.BASIC_RHYTHM)).toBe(true);
    expect(canUseFeature(free, FEATURE.SAVED_CUSTOM_TEXTS)).toBe(true);
    expect(canUseFeature(free, FEATURE.AI_EXERCISES)).toBe(true);
  });

  it("keeps the advanced layers for pro", () => {
    for (const f of [
      FEATURE.ADVANCED_RECITATION, FEATURE.ADVANCED_RHYTHM, FEATURE.TRANSLATION,
      FEATURE.LANGUAGE_MODE, FEATURE.PERFORMANCE_ANALYSIS, FEATURE.ADVANCED_PROGRESS,
      FEATURE.PERSONALIZED_STUDY, FEATURE.AI_GLOSSARY,
    ]) {
      expect(canUseFeature(free, f)).toBe(false);
      expect(canUseFeature(pro,  f)).toBe(true);
    }
  });

  it("throws for a locked feature", () => {
    expect(() => requireFeature(free, FEATURE.TRANSLATION)).toThrow(FeatureLockedError);
    expect(() => requireFeature(pro,  FEATURE.TRANSLATION)).not.toThrow();
  });

  it("names the plan a feature needs", () => {
    expect(planRequiredFor(FEATURE.BASIC_RECITATION)).toBe("free");
    expect(planRequiredFor(FEATURE.TRANSLATION)).toBe("pro");
  });

  it("gives pro everything free has", () => {
    for (const f of ENTITLEMENTS.free) expect(canUseFeature(pro, f)).toBe(true);
  });

  it("marks a cancelled pro as ending", () => {
    const ending = entitlementsForPlan("pro", "stripe", "active", FUTURE, true);
    expect(ending.endingSoon).toBe(true);
    expect(ending.isPro).toBe(true);
  });
});
