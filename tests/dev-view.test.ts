// tests/dev-view.test.ts
//
// Utvecklarväxeln. Den ger ett konto möjligheten att se produkten som en
// gratisanvändare, och den egenskap som måste hålla är enkel att säga och
// lätt att råka bryta:
//
//   VÄXELN KAN BARA TA BORT BEHÖRIGHET, ALDRIG GE DEN.
//
// En kaka som kunde ge Pro vore en gratisprenumeration för alla som kan
// öppna webbläsarens utvecklarverktyg.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { readDevView, DEV_VIEW_COOKIE } from "@/lib/billing/devView";
import { entitlementsForPlan, canUseFeature } from "@/lib/billing/entitlements";
import { FEATURE } from "@/lib/billing/plans";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("reading the cookie", () => {
  it("defaults to pro when there is no request to read", async () => {
    // Anropad utanför en request — schemalagt jobb, test, skript. Ett
    // fel här får inte betyda att någon tappar sina behörigheter.
    expect(await readDevView()).toBe("pro");
  });

  it("uses a namespaced cookie name, not something generic", () => {
    expect(DEV_VIEW_COOKIE).toMatch(/^rhapsode/);
  });
});

describe("the cookie can only subtract", () => {
  const source = read("lib/billing/entitlements.ts");

  it("is only consulted when the account is already a developer", () => {
    // Villkoret måste stå FÖRE läsningen. Läses kakan först och kollas
    // rollen efteråt är det en helt annan sak.
    const guard = source.indexOf('source === "developer"');
    const read_ = source.indexOf("readDevView");
    expect(guard).toBeGreaterThan(-1);
    expect(read_).toBeGreaterThan(guard);
  });

  it("only ever branches toward free", () => {
    // Ingenstans får kakan leda till att en plan höjs.
    expect(source).toMatch(/readDevView\(\)\) === "free"/);
    expect(source).not.toMatch(/readDevView\(\)\) === "pro"/);
  });

  it("returns the free entitlement set, not a patched pro one", () => {
    expect(source).toMatch(/entitlementsForPlan\("free", "none", "free"\)/);
  });

  it("what it returns really is the free product", () => {
    const free = entitlementsForPlan("free", "none", "free");
    expect(free.isPro).toBe(false);
    expect(canUseFeature(free, FEATURE.ADVANCED_RECITATION)).toBe(false);
    expect(canUseFeature(free, FEATURE.ADVANCED_PROGRESS)).toBe(false);
    // …och gratisfunktionerna finns kvar, annars testar man fel produkt.
    expect(canUseFeature(free, FEATURE.BASIC_RECITATION)).toBe(true);
    expect(canUseFeature(free, FEATURE.BASIC_CLEANUP)).toBe(true);
  });

  it("applies the free LIMITS too, not just the feature list", () => {
    // Poängen är att se produkten som en betalande inte ser den. Då måste
    // ransonerna gälla också, annars testar man en fantasi.
    const free = entitlementsForPlan("free", "none", "free");
    expect(free.limits.aiMonthly).toBe(5);
    expect(free.limits.savedWorks).toBe(3);
    expect(free.limits.advancedCleanupMonthly).toBe(2);
  });
});

describe("the route that sets it", () => {
  const route = read("app/api/dev/view/route.ts");

  it("checks the account server-side, not in the browser", () => {
    expect(route).toMatch(/requireUser/);
    expect(route).toMatch(/getEntitlements/);
    expect(route).toMatch(/status: 403/);
  });

  it("refuses anyone who is not a developer", () => {
    expect(route).toMatch(/if \(!isDeveloper\)/);
  });

  it("still works for a developer who is currently viewing free", () => {
    // Annars vore växeln en enkelriktad dörr och man satt fast i
    // gratisläget tills kakan gick ut.
    expect(route).toMatch(/devViewingFree/);
  });

  it("sets the cookie httpOnly so scripts on the page cannot touch it", () => {
    expect(route).toMatch(/httpOnly:\s*true/);
    expect(route).toMatch(/sameSite:\s*"lax"/);
  });
});

describe("what the interface shows", () => {
  it("only renders the switch for developer accounts", () => {
    const layout = read("app/(app)/layout.tsx");
    expect(layout).toMatch(/ent\.source === "developer" \|\| ent\.devViewingFree/);
  });

  it("drops the Pro wordmark while viewing free", () => {
    // isPro är redan falskt i det läget, så märket följer med av sig
    // självt — men det ska vara sant, inte en lycklig slump.
    const layout = read("app/(app)/layout.tsx");
    expect(layout).toMatch(/\{ent\.isPro && <em className="brand-pro">Pro<\/em>\}/);
  });
});
