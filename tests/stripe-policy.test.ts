// tests/stripe-policy.test.ts
//
// Regler som är lätta att bryta av misstag och dyra när de bryts.
//
// De här testerna läser källkoden i stället för att köra den. Det är
// ovanligt, men rätt här: felen de fångar går inte att upptäcka i en
// enhetstest av en funktion som ringer ut på nätet, och de kostar
// riktiga pengar — tappade betalningar, en läckt nyckel, moms som aldrig
// togs in.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const stripeSource = readFileSync(path.join(ROOT, "lib/billing/stripe.ts"), "utf8");

describe("checkout configuration", () => {
  it("never pins payment_method_types", () => {
    // Hårdkodar man ["card"] stängs Klarna och Swish av för svenska
    // kunder, tyst, och konverteringen faller. Utelämnad låter Stripe
    // välja per kund utifrån dashboard-inställningarna.
    expect(stripeSource).not.toMatch(/payment_method_types\s*:/);
  });

  it("tags the checkout flow so it can be compared in the dashboard", () => {
    expect(stripeSource).toMatch(/integration_identifier/);
    // Stripes konvention: etiketten slutar på åtta bokstäver.
    expect(stripeSource).toMatch(/["'][a-z-]+-[a-z]{8}["']/);
  });

  it("keeps the flow on Checkout Sessions rather than raw PaymentIntents", () => {
    expect(stripeSource).toMatch(/checkout\.sessions\.create/);
    expect(stripeSource).toMatch(/mode:\s*"subscription"/);
    expect(stripeSource).not.toMatch(/paymentIntents\.create/);
  });

  it("uses a client instance, not the deprecated global key", () => {
    expect(stripeSource).toMatch(/new Stripe\(/);
    expect(stripeSource).not.toMatch(/Stripe\.setApiKey|stripe\.api_key/);
  });

  it("sends people to the Stripe portal instead of rebuilding billing", () => {
    expect(stripeSource).toMatch(/billingPortal\.sessions\.create/);
  });
});

describe("tax", () => {
  it("leaves automatic_tax off unless it is switched on deliberately", () => {
    // Utan en aktiv registrering räknar Stripe fram noll moms och säger
    // ingenting. Standardläget måste därför vara av.
    expect(stripeSource).toMatch(/STRIPE_AUTOMATIC_TAX === "true"/);
  });

  it("only ever sets automatic_tax behind that flag", () => {
    // Regeln är inte "automatic_tax får inte förekomma" utan "den får
    // bara förekomma villkorad". Det uttrycks enklast som ordningen i
    // filen: villkoret måste komma före varje förekomst.
    const guard = stripeSource.indexOf("...(withTax");
    expect(guard).toBeGreaterThan(-1);

    for (const match of stripeSource.matchAll(/automatic_tax:/g)) {
      expect(match.index).toBeGreaterThan(guard);
    }
  });

  it("collects the address when tax is on, or the renewal rate is guesswork", () => {
    expect(stripeSource).toMatch(/customer_update/);
    expect(stripeSource).toMatch(/billing_address_collection/);
  });
});

describe("no secrets in source", () => {
  const SECRET = /(sk|rk)_(live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9_-]{16,}/;
  const SKIP_DIRS = new Set([
    "node_modules", ".next", ".git", ".agents", "dist", "build", "coverage",
  ]);
  const EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".json"]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (EXT.has(path.extname(entry))) out.push(full);
    }
    return out;
  }

  it("has no API key committed anywhere in the tree", () => {
    // Nyckelläckage i repon är den vanligaste orsaken till kapade
    // Stripe-konton. Den här filen är undantagen — den innehåller
    // mönstret den letar efter.
    const offenders = walk(ROOT)
      .filter(f => !f.endsWith("stripe-policy.test.ts"))
      .filter(f => SECRET.test(readFileSync(f, "utf8")))
      .map(f => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  it("exposes no Stripe or Claude secret to the browser bundle", () => {
    // Allt som heter NEXT_PUBLIC_ bakas in i klientpaketet.
    const source = walk(path.join(ROOT, "lib"))
      .concat(walk(path.join(ROOT, "app")))
      .concat(walk(path.join(ROOT, "components")))
      .map(f => readFileSync(f, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/NEXT_PUBLIC_STRIPE_SECRET/);
    expect(source).not.toMatch(/NEXT_PUBLIC_ANTHROPIC/);
    expect(source).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|API_KEY|WEBHOOK)/);
  });
});
