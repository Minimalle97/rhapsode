// tests/drills.test.ts
//
// Vem som far ova, och hur mycket.
//
// Granskning av kallan, av samma skal som security.test.ts: det som ska
// bevisas ar att en kontroll FINNS pa servern och inte bara i knapparna.
// En dold knapp ar ingen grans.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { DRILLS, drillById, isMark } from "@/lib/drills";
import { ENTITLEMENTS, LIMITS, FEATURE } from "@/lib/billing/plans";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

// ── Ransonen, inte hanglaset ──────────────────────────────────────────
describe("free is rationed, not locked out", () => {
  it("gives both plans the feature", () => {
    // Det var det uttryckliga bytet: gratis har begransad anvandning, inte
    // noll. Ligger DRILLS bara i pro-listan ar drillarna lasta igen.
    expect(ENTITLEMENTS.free).toContain(FEATURE.DRILLS);
    expect(ENTITLEMENTS.pro).toContain(FEATURE.DRILLS);
  });

  it("gives free a real daily allowance and pro none to speak of", () => {
    expect(LIMITS.free.drillsDaily).toBeGreaterThan(0);
    expect(LIMITS.free.drillsDaily).toBeLessThan(1_000);
    expect(LIMITS.pro.drillsDaily).toBeGreaterThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it("counts a card only when it is marked, never when the page opens", () => {
    // Att titta pa en text ska inte kosta nagot. En gratisanvandare ska
    // kunna oppna drillen, stalla in den och se hur den ser ut utan att
    // ha forbrukat en enda av dagens kort.
    const page = read("app/(app)/work/[id]/drills/skeleton/page.tsx");
    expect(page).toMatch(/allowanceFor/);
    expect(page).not.toMatch(/spendOne|consume\(/);

    const route = read("app/api/drills/attempt/route.ts");
    expect(route).toMatch(/recordDrillAttempt/);
  });

  it("spends through the shared counter, not a second one of its own", () => {
    const src = read("lib/drills.ts");
    expect(src).toMatch(/from "\.\/usage\/counters"/);
    expect(src).toMatch(/consume\("drill_day"/);
  });

  it("asks the existing entitlement helper and never compares the plan itself", () => {
    const src = read("lib/drills.ts");
    expect(src).toMatch(/canUseFeature\(ent, FEATURE\.DRILLS\)/);
    // Regeln star i lib/billing/entitlements.ts: ingen jamfor plan direkt.
    expect(src).not.toMatch(/plan === "pro"/);
  });
});

// ── Servern, inte knapparna ───────────────────────────────────────────
describe("the check happens on the server", () => {
  it("verifies the work belongs to the person asking, on every drill page", () => {
    for (const page of [
      "app/(app)/work/[id]/drills/page.tsx",
      "app/(app)/work/[id]/drills/skeleton/page.tsx",
    ]) {
      const src = read(page);
      expect(src, page).toMatch(/requireUser\(\)/);
      expect(src, page).toMatch(/userId: user\.id/);
      expect(src, page).toMatch(/notFound\(\)/);
    }
  });

  it("verifies ownership again before writing an attempt", () => {
    // Utan den kontrollen racker det att kanna ett sektions-id for att
    // skriva i nagon annans historik.
    const src = read("lib/drills.ts");
    expect(src).toMatch(/where:\s*\{ id: input\.sectionId, work: \{ userId: input\.userId \} \}/);
    expect(src).toMatch(/if \(!owns\) throw new Error\("NOT_FOUND"\)/);
  });

  it("answers a spent allowance with 402, the same as everything else", () => {
    // 402 ar inte ett fel i begaran. Granssnittet kanner igen det och
    // moter det med en uppgraderingsruta i stallet for en rod ruta.
    const src = read("app/api/drills/attempt/route.ts");
    expect(src).toMatch(/DrillLimitError/);
    expect(src).toMatch(/status: 402/);
  });
});

// ── Katalogen ─────────────────────────────────────────────────────────
describe("the drill catalogue", () => {
  it("has the built drills marked ready and the rest not pretending", () => {
    // Skeleton och Cumulative ar byggda. De ovriga star kvar i listan sa
    // att man ser vad som kommer, men de gar inte att klicka pa — se
    // provet nedan om att bara fardiga drillar far en lank.
    for (const id of ["skeleton", "cumulative"]) {
      expect(drillById(id), id).toBeDefined();
      expect(drillById(id)?.ready, id).toBe(true);
    }
    for (const id of ["seam", "cold_start", "backward"]) {
      expect(drillById(id), id).toBeDefined();
      expect(drillById(id)?.ready, id).toBe(false);
    }
  });

  it("gives every ready drill a page to land on", () => {
    // En drill markerad som fardig men utan sida ger en 404 fran en lank
    // appen sjalv ritade ut.
    for (const drill of DRILLS.filter(d => d.ready)) {
      const page = path.join(ROOT, "app/(app)/work/[id]/drills", drill.id, "page.tsx");
      expect(existsSync(page), `${drill.id} has no page`).toBe(true);
    }
  });

  it("does not offer a cue-line drill, because nothing records a speaker", () => {
    // Kravet var uttryckligt: sag att faltet saknas och hoppa over
    // drillen i stallet for att hitta pa ett.
    expect(DRILLS.map(d => d.id)).not.toContain("cue_line");
    expect(read("prisma/schema.prisma")).not.toMatch(/\bspeaker\b/i);
    // Och sag det till anvandaren i stallet for att bara utelamna den.
    expect(read("app/(app)/work/[id]/drills/page.tsx"))
      .toMatch(/split by speaker/);
  });

  it("only links a drill that is actually built", () => {
    expect(read("app/(app)/work/[id]/drills/page.tsx"))
      .toMatch(/drill\.ready \? `\/work\/\$\{work\.id\}\/drills\/\$\{drill\.id\}` : null/);
  });

  it("accepts only the three self-marks", () => {
    for (const good of ["got_it", "hesitated", "missed"]) expect(isMark(good)).toBe(true);
    for (const bad of ["perfect", "", null, undefined, 1, "GOT_IT"]) expect(isMark(bad)).toBe(false);
  });
});

// ── Tiden ─────────────────────────────────────────────────────────────
describe("drill 7: the timing", () => {
  it("measures from the card appearing to Reveal, not to the mark", () => {
    // Rakas bedomningsknappen in mater siffran hur snabbt man klickar,
    // inte hur snabbt man mindes.
    const src = read("components/drills/SkeletonDrill.tsx");
    expect(src).toMatch(/function reveal\(\)[\s\S]{0,300}Date\.now\(\) - shownAt\.current/);
  });

  it("restarts the clock on each new card", () => {
    const src = read("components/drills/SkeletonDrill.tsx");
    expect(src).toMatch(/shownAt\.current = Date\.now\(\);\s*\n\s*\}, \[at\]\)/);
  });

  it("stores it, and shows it nowhere yet", () => {
    expect(read("prisma/schema.prisma")).toMatch(/msToReveal Int\?/);
  });

  it("throws away a nonsense duration rather than storing it", () => {
    // En flik som legat i bakgrunden i en timme sager ingenting om hur
    // snabbt nagon mindes raden.
    const src = read("lib/drills.ts");
    expect(src).toMatch(/input\.msToReveal < 10 \* 60_000/);
  });
});

// ── Peek ──────────────────────────────────────────────────────────────
describe("peek", () => {
  it("does not mark the line as missed", () => {
    // Den som behover ett enda ord for att komma vidare ska inte behova
    // doma hela raden.
    const src = read("components/drills/SkeletonDrill.tsx");
    const peekButton = src.slice(src.indexOf("Peek a word") - 400, src.indexOf("Peek a word"));
    expect(peekButton).toMatch(/setPeeks/);
    expect(peekButton).not.toMatch(/mark\(/);
  });

  it("is still recorded, because a peeked card is weaker evidence", () => {
    expect(read("components/drills/SkeletonDrill.tsx")).toMatch(/peeked:\s*peeks > 0/);
    expect(read("prisma/schema.prisma")).toMatch(/peeked Boolean @default\(false\)/);
  });
});
