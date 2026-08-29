// tests/limits.test.ts
// Gränser och pris. Att de går att ändra från miljön är ett krav, inte
// en detalj — de kommer att ändras.

import { describe, it, expect, vi, afterEach } from "vitest";
import { LIMITS, PRICES, formatPrice, yearlySavingPercent, ENTITLEMENTS } from "@/lib/billing/plans";

afterEach(() => { vi.resetModules(); });

describe("default limits", () => {
  it("gives free a real but bounded allowance", () => {
    expect(LIMITS.free.aiMonthly).toBe(5);
    expect(LIMITS.free.savedWorks).toBe(3);
  });

  it("gives pro a larger one", () => {
    expect(LIMITS.pro.aiMonthly).toBe(100);
    expect(LIMITS.pro.savedWorks).toBeGreaterThan(1000);
  });

  it("never lets free out-rank pro", () => {
    expect(LIMITS.pro.aiMonthly).toBeGreaterThan(LIMITS.free.aiMonthly);
    expect(LIMITS.pro.aiBurstPerMinute).toBeGreaterThan(LIMITS.free.aiBurstPerMinute);
    expect(ENTITLEMENTS.pro.length).toBeGreaterThan(ENTITLEMENTS.free.length);
  });
});

describe("environment overrides", () => {
  it("reads limits from the environment", async () => {
    vi.stubEnv("FREE_AI_MONTHLY_LIMIT", "12");
    vi.stubEnv("PRO_AI_MONTHLY_LIMIT", "500");
    vi.resetModules();
    const mod = await import("@/lib/billing/plans");
    expect(mod.LIMITS.free.aiMonthly).toBe(12);
    expect(mod.LIMITS.pro.aiMonthly).toBe(500);
    vi.unstubAllEnvs();
  });

  it("falls back when the value is nonsense", async () => {
    vi.stubEnv("FREE_AI_MONTHLY_LIMIT", "not-a-number");
    vi.resetModules();
    const mod = await import("@/lib/billing/plans");
    expect(mod.LIMITS.free.aiMonthly).toBe(5);
    vi.unstubAllEnvs();
  });

  it("reads price from the environment", async () => {
    vi.stubEnv("PRO_PRICE_MONTHLY_MINOR", "9900");
    vi.resetModules();
    const mod = await import("@/lib/billing/plans");
    expect(mod.PRICES.month.amountMinor).toBe(9900);
    vi.unstubAllEnvs();
  });
});

describe("price", () => {
  it("defaults to the agreed figures", () => {
    expect(PRICES.month.amountMinor).toBe(7900);
    expect(PRICES.year.amountMinor).toBe(69900);
    expect(PRICES.month.currency).toBe("sek");
  });

  it("formats whole amounts without decimals", () => {
    expect(formatPrice(7900)).toBe("79 kr");
    expect(formatPrice(69900).replace(/\u00a0/g, " ")).toBe("699 kr");
  });

  it("keeps decimals when there are any", () => {
    expect(formatPrice(7950)).toBe("79,50 kr");
  });

  it("reports what the annual plan saves", () => {
    // 699 mot 12 × 79 = 948
    expect(yearlySavingPercent()).toBe(26);
  });
});
