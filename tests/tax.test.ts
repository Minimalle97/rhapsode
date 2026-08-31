// tests/tax.test.ts
//
// Stripe Tax i kassan.
//
// Två egenskaper ska hålla, och de drar åt olika håll:
//
//   Med flaggan AV ska sessionen se ut exakt som den gjorde innan
//   momsstödet skrevs. Ingen ny parameter, ingen ändrad standard.
//
//   Med flaggan PÅ ska alla fyra inställningarna finnas, för de hänger
//   ihop: utan adress vet Stripe inte vilket lands sats som gäller, och
//   utan customer_update kan adressen inte skrivas till en befintlig
//   kund — då avvisas sessionen.
//
// Ingen skatt räknas ut i vår kod, och det testas också. All beräkning
// ska ligga hos Stripe.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT   = path.resolve(__dirname, "..");
const read   = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const stripe = read("lib/billing/stripe.ts");
const sync   = read("lib/billing/sync.ts");

/** Kassans anrop, isolerat, så påståendena inte träffar portalen. */
const checkout = stripe.slice(
  stripe.indexOf("export async function createCheckoutSession"),
  stripe.indexOf("export async function createPortalSession")
);

describe("the flag", () => {
  it("is read from STRIPE_AUTOMATIC_TAX and nothing else", () => {
    expect(stripe).toMatch(/process\.env\.STRIPE_AUTOMATIC_TAX === "true"/);
  });

  it("is never set to true anywhere in the codebase", () => {
    // Att slå på moms utan en aktiv registrering betyder att Stripe
    // räknar fram noll och inte tar in något — utan att klaga. Flaggan
    // ska bytas av en människa, medvetet.
    for (const file of [
      "lib/billing/stripe.ts",
      "lib/billing/plans.ts",
      "lib/billing/sync.ts",
      "app/api/billing/checkout/route.ts",
      "app/api/billing/portal/route.ts",
    ]) {
      expect(read(file)).not.toMatch(/STRIPE_AUTOMATIC_TAX\s*=\s*["']?true/);
    }
  });

  it("defaults to off when the variable is absent or malformed", () => {
    // Strikt jämförelse mot "true" — "1", "yes" och "TRUE" ger av.
    expect(stripe).not.toMatch(/STRIPE_AUTOMATIC_TAX\s*(!==\s*"false"|\?\?)/);
  });
});

describe("flag off: nothing changes", () => {
  it("puts every tax setting behind the conditional", () => {
    // Villkoret måste stå före varje förekomst. Annars läcker en
    // inställning ut i det avstängda läget.
    const guard = checkout.indexOf("...(withTax");
    expect(guard).toBeGreaterThan(-1);

    for (const key of [
      "automatic_tax:",
      "billing_address_collection:",
      "customer_update:",
      "tax_id_collection:",
    ]) {
      const at = checkout.indexOf(key);
      expect(at, `${key} must sit inside the withTax branch`).toBeGreaterThan(guard);
    }
  });

  it("spreads an empty object when off, so the request is unchanged", () => {
    expect(checkout).toMatch(/:\s*\{\}\s*\)/);
  });

  it("leaves the parameters that have nothing to do with tax alone", () => {
    // Regressionsvakt: momsarbetet fick inte råka röra något annat.
    expect(checkout).toMatch(/mode:\s*"subscription"/);
    expect(checkout).toMatch(/integration_identifier/);
    expect(checkout).toMatch(/allow_promotion_codes:\s*true/);
    expect(checkout).not.toMatch(/payment_method_types\s*:/);
  });
});

describe("flag on: all four settings", () => {
  it("enables automatic tax", () => {
    expect(checkout).toMatch(/automatic_tax:\s*\{\s*enabled:\s*true\s*\}/);
  });

  it("collects a billing address", () => {
    // Utan adress har Stripe ingen plats att räkna satsen för.
    expect(checkout).toMatch(/billing_address_collection:\s*"required"/);
  });

  it("lets an existing customer's address be updated", () => {
    // Vi skickar alltid med customer, så utan address: "auto" använder
    // Checkout kundens gamla adress — eller avvisar sessionen.
    expect(checkout).toMatch(/customer_update:\s*\{[^}]*address:\s*"auto"/);
  });

  it("collects VAT numbers so EU businesses can enter one", () => {
    expect(checkout).toMatch(/tax_id_collection:\s*\{\s*enabled:\s*true\s*\}/);
  });

  it("does not try to set automatic_tax on subscription_data", () => {
    // Den parametern finns inte. Enligt API-referensen gäller sessionens
    // automatic_tax "this session and resulting payments, invoices, and
    // subscriptions" — förnyelser omfattas alltså redan.
    expect(checkout).not.toMatch(/subscription_data:\s*\{[^}]*automatic_tax/);
  });
});

describe("the portal", () => {
  const portal = stripe.slice(stripe.indexOf("export async function createPortalSession"));

  it("passes no tax parameter, because there is none to pass", () => {
    // billingPortal.sessions.create har inget skattefält. Ett planbyte
    // där ärver prenumerationens egen automatic_tax, satt vid skapandet.
    expect(portal).not.toMatch(/automatic_tax|tax_id_collection|billing_address_collection/);
  });
});

describe("the webhook", () => {
  it("reads no amount, so inclusive pricing changes nothing there", () => {
    // Hanteraren speglar status och datum, aldrig belopp. Därför spelar
    // det ingen roll om priset är med eller utan moms.
    for (const field of [
      "amount_total", "amount_paid", "amount_due",
      "subtotal", "unit_amount", "total_tax_amounts",
    ]) {
      expect(sync).not.toContain(field);
    }
  });

  it("handles an invoice that could not be finalized", () => {
    // Det tysta felet som blir möjligt först när momsen är på: går den
    // inte att räkna fram finalizeras ingen faktura, ingen betalning
    // görs, och inget payment_failed skickas.
    expect(sync).toMatch(/case "invoice\.finalization_failed"/);
    expect(sync).toMatch(/automatic_tax[\s\S]*?status/);
    expect(sync).toMatch(/tax_calculation_failed/);
  });

  it("does not silently swallow it", () => {
    expect(sync).toMatch(/console\.error/);
  });
});

describe("no tax logic of our own", () => {
  it("computes no rates, no VAT numbers, no thresholds", () => {
    // All beräkning ska ligga hos Stripe. Dyker en procentsats upp i vår
    // kod är det början på en andra sanning om vad kunden ska betala.
    for (const file of ["lib/billing/stripe.ts", "lib/billing/sync.ts", "lib/billing/plans.ts"]) {
      const src = read(file);
      expect(src).not.toMatch(/\b(0\.25|0\.19|1\.25|vatRate|taxRate|VAT_RATE)\b/);
      expect(src).not.toMatch(/\* *0\.\d+ *\/\/ *(moms|vat|tax)/i);
    }
  });

  it("keeps the decided prices untouched", () => {
    const plans = read("lib/billing/plans.ts");
    expect(plans).toMatch(/PRO_PRICE_MONTHLY_MINOR",\s*4_990/);
    expect(plans).toMatch(/PRO_PRICE_YEARLY_MINOR",\s*44_900/);
  });
});
