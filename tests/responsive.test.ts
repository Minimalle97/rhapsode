// tests/responsive.test.ts
//
// Att sidan far plats pa en telefon.
//
// Provet finns for en konkret bugg. Topplisten hade en ruta med bade
// className="nav-desktop-only" och style={{ display: "flex" }}. En
// inline-stil vinner over ett stilark, sa `display: none` i media-fragan
// hade ingen verkan: rangbalken lag kvar och gjorde listen 711px bred pa
// en 375px skarm. Hela appen gick att dra i sidled, pa varje sida.
//
// Felet syns inte i typkontrollen, inte i bygget och inte i nagot annat
// prov. Det syns bara om man tittar — eller om man letar efter monstret,
// vilket ar vad som gors har.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const css  = read("app/globals.css");

const SKIP = new Set(["node_modules", ".next", ".git", ".agents", ".claude", "tests", "dist"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const sources = walk(path.join(ROOT, "app"))
  .concat(walk(path.join(ROOT, "components")))
  .map(f => ({ path: path.relative(ROOT, f), text: readFileSync(f, "utf8") }));

/** Klasser vars display styrs av en media-fraga. */
const SWITCHED = ["nav-desktop-only", "nav-mobile-only", "nav-tabs", "rank-nav-bar"];

describe("the media queries can actually reach what they style", () => {
  for (const cls of SWITCHED) {
    it(`nothing sets display inline on .${cls}`, () => {
      // Traffar bade <div className="x" style={{ display: ... }}> och
      // omvand ordning, sa lange bada star i samma tagg.
      const offenders = sources.filter(s => {
        const tags = s.text.match(/<[a-zA-Z][^>]*>/g) ?? [];
        return tags.some(t => t.includes(cls) && /style=\{\{[^}]*display:/.test(t));
      }).map(s => s.path);

      expect(
        offenders,
        `an inline display would override the media query for .${cls}`
      ).toEqual([]);
    });
  }
});

describe("the phone gets a tab bar it can reach", () => {
  it("moves the tabs to the bottom on a narrow screen", () => {
    expect(css).toMatch(/@media \(max-width: 720px\)/);
    expect(css).toMatch(/\.nav-tabs \{[\s\S]*?position: fixed/);
  });

  it("leaves room for it under the page", () => {
    // Utan detta hamnar sidans sista rad under listen, och pa en kort
    // sida gar den inte att komma at alls.
    expect(css).toMatch(/\.app-shell main \{ padding-bottom: var\(--tabbar\)/);
    expect(read("app/(app)/layout.tsx")).toMatch(/className="app-shell"/);
  });

  it("keeps clear of the home indicator", () => {
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(read("app/layout.tsx")).toMatch(/viewportFit: "cover"/);
  });

  it("gives every tab a thumb-sized target", () => {
    // 15px over och under plus radhojden ger 44px, vilket ar den
    // vedertagna undre gransen for nagot man trycker pa med tummen.
    //
    // Bara den LODRATA halvan provas. Den vagrata andrades fran 2px till
    // 1px nar repertoaren blev en sjatte flik och raden skulle rymma ett
    // ord till; det ror inte hojden, och det ar hojden som avgor om en
    // flik gar att traffa. Ett prov som last hela strangen hade gatt
    // sonder pa en andring det inte hade nagon asikt om.
    expect(css).toMatch(/\.nav-tab \{[\s\S]*?padding: 15px \d+px/);
  });
});

describe("nothing fixed to the bottom lands under the tab bar", () => {
  it("declares how tall the bar is, in one place", () => {
    expect(css).toMatch(/--tabbar: 0px/);                       // dator
    expect(css).toMatch(/--tabbar: calc\(44px \+ env\(safe-area-inset-bottom\)\)/);
  });

  it("has every bottom-anchored bar sit on top of it", () => {
    // En atgardsrad med bottom: 0 hamnar bakom fliklisten pa telefon.
    // Den ska utga fran variabeln, som ar noll dar listen inte finns.
    const offenders = sources
      .filter(s => /position: "fixed"[\s\S]{0,120}?bottom: 0/.test(s.text))
      .map(s => s.path);
    expect(offenders).toEqual([]);
  });
});

describe("forms behave on a phone", () => {
  it("stops iOS zooming in when a field is focused", () => {
    // Under 16px zoomar Safari in sidan och zoomar inte ut igen.
    // !important behovs for att falten satts med style-attribut.
    expect(css).toMatch(/font-size: 16px !important/);
  });

  it("does not let Safari resize the text on its own", () => {
    expect(css).toMatch(/text-size-adjust: 100%/);
  });

  it("sets the viewport to the device width", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/width: "device-width"/);
    expect(layout).toMatch(/initialScale: 1/);
  });
});

describe("grids give way instead of overflowing", () => {
  it("has no fixed multi-column grid left in a page", () => {
    // repeat(3, 1fr) haller tre spalter aven pa 320px, dar de blir 90px
    // breda och siffrorna bryts. auto-fit lagger om i stallet.
    const offenders = sources
      .filter(s => /gridTemplateColumns: "repeat\(\d+, 1fr\)"/.test(s.text))
      .map(s => s.path);
    expect(offenders).toEqual([]);
  });
});
