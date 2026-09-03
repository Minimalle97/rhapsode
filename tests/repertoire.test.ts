// tests/repertoire.test.ts
//
// Repertoaren.
//
// Igenkanningen provas som ren funktion — den avgor vilken grupp ett verk
// raknas till, och en grupp som blir klar av misstag ar samre an en som
// inte blir klar alls. Resten ar granskning av kallan, av samma skal som i
// security.test.ts: det som ska bevisas ar att en viss kontroll FINNS pa
// ratt stalle och inte gar att kringga fran granssnittet.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { GROUPS, ALL_ENTRIES, TOTAL_ENTRIES } from "@/lib/repertoire/data";
import { BORDERS, borderById } from "@/lib/repertoire/borders";
import { ARCHIVES, archiveUrl } from "@/lib/repertoire/archives";
import { normalise, matchEntry, progressFor, groupById, entryById } from "@/lib/repertoire";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

// ── Listan ────────────────────────────────────────────────────────────
describe("the list itself", () => {
  it("holds 762 poems in 24 groups", () => {
    expect(GROUPS).toHaveLength(24);
    expect(ALL_ENTRIES).toHaveLength(762);
    expect(TOTAL_ENTRIES).toBe(762);
  });

  it("numbers them 1 to 762 without a gap or a repeat", () => {
    // Numret ar identiteten — det ar vad Work.canonicalId pekar pa. En
    // lucka eller en dubblett dar vore en dikt som inte gar att kreditera.
    const ids = ALL_ENTRIES.map(e => e.id);
    expect(ids).toEqual(Array.from({ length: 762 }, (_, i) => i + 1));
  });

  it("gives every entry a title and an author", () => {
    for (const e of ALL_ENTRIES) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.author.trim().length).toBeGreaterThan(0);
      expect(e.links.length).toBeGreaterThan(0);
    }
  });

  it("marks 116 as the core set", () => {
    expect(ALL_ENTRIES.filter(e => e.starred)).toHaveLength(116);
  });

  it("gives every group a unique slug", () => {
    const ids = GROUPS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("points every link at an archive that exists", () => {
    for (const e of ALL_ENTRIES) {
      for (const code of e.links) expect(ARCHIVES[code]).toBeDefined();
    }
  });
});

// ── Ingen text ────────────────────────────────────────────────────────
describe("the repertoire carries no poem text", () => {
  // Detta ar filens viktigaste prov.
  //
  // Ungefar en tredjedel av listan ar fortfarande upphovsrattsskyddad.
  // Repertoaren ar en lista och en vagvisare: titel, upphovsperson och
  // vagen till arkivet. Skulle nagon en dag lagga in sjalva dikterna
  // "for bekvamlighets skull" ar appen en olaglig kopia av ett halvt
  // sekels poesi, och det ar inte den sortens misstag som marks i drift.

  it("has no text field on an entry", () => {
    for (const e of ALL_ENTRIES.slice(0, 40)) {
      expect(e).not.toHaveProperty("text");
      expect(e).not.toHaveProperty("body");
      expect(e).not.toHaveProperty("content");
      expect(e).not.toHaveProperty("lines");
    }
  });

  it("keeps every entry short enough to be a title, never a stanza", () => {
    // En titel ar en rad. En strof ar det inte. Skulle nagon klistra in
    // text i titelfaltet fanger det har den.
    for (const e of ALL_ENTRIES) {
      expect(e.title.length).toBeLessThan(120);
      expect(e.title).not.toContain("\n");
      expect(e.author).not.toContain("\n");
    }
  });

  it("says so in the file, so the next person knows the rule", () => {
    const src = read("lib/repertoire/data.ts");
    expect(src).toMatch(/Ingen diktext/i);
  });
});

// ── Arkiven ───────────────────────────────────────────────────────────
describe("the links out", () => {
  it("builds a search, not a fixed page", () => {
    // Direktlankar dor sa fort ett arkiv lagger om sina adresser. En
    // sokning overlever det.
    const url = archiveUrl("WS", "Ozymandias", "Percy Bysshe Shelley");
    expect(url).toContain("wikisource.org");
    expect(url).toMatch(/search=/);
    expect(url).toContain("Ozymandias");
  });

  it("escapes what it puts in the query string", () => {
    const url = archiveUrl("WS", "Sonnet 18 & 19", "A. Poet");
    expect(url).not.toContain(" ");
    expect(url).not.toMatch(/[^:/?=&.\w%-]/);
  });

  it("only ever points outward over https", () => {
    for (const a of Object.values(ARCHIVES)) {
      expect(a.build("Test Poem", "A Poet")).toMatch(/^https:\/\//);
    }
  });

  it("is honest about which archives allow a download", () => {
    // Poetry Foundation och Poets.org publicerar pa licens: texten gar
    // att lasa och kopiera, men inte att ladda ned. Att pasta annat vore
    // att uppmuntra nagot som inte ar tillatet.
    expect(ARCHIVES.PF.downloads).toBe(false);
    expect(ARCHIVES.PO.downloads).toBe(false);
    expect(ARCHIVES.WS.downloads).toBe(true);
    expect(ARCHIVES.PG.downloads).toBe(true);
  });
});

// ── Igenkanningen ─────────────────────────────────────────────────────
describe("matching a work to the list", () => {
  const OZY = ALL_ENTRIES.find(e => e.title === "Ozymandias")!;

  it("finds the entry the poem was added from, whatever it was renamed to", () => {
    // Stampeln ar ett val nagon gjort och slar alltid gissningen.
    const m = matchEntry({ canonicalId: OZY.id, title: "my own title", author: "nobody" });
    expect(m?.id).toBe(OZY.id);
  });

  it("recognises a work already in the library by title and author", () => {
    expect(matchEntry({ canonicalId: null, title: "Ozymandias", author: "Percy Bysshe Shelley" })?.id)
      .toBe(OZY.id);
  });

  it("forgives punctuation, case and accents", () => {
    expect(matchEntry({ canonicalId: null, title: "OZYMANDIAS!", author: "percy bysshe shelley" })?.id)
      .toBe(OZY.id);
  });

  it("accepts a surname on its own", () => {
    // "Wordsworth" och "William Wordsworth" ar samma person, och den som
    // skrev in verket for hand skrev sallan ut alla tre namnen.
    expect(matchEntry({ canonicalId: null, title: "Ozymandias", author: "Shelley" })?.id)
      .toBe(OZY.id);
  });

  it("refuses the right title under the wrong name", () => {
    // Det ar den har vagen felet gor skada: en grupp som blir klar av en
    // dikt nagon inte kan.
    expect(matchEntry({ canonicalId: null, title: "Ozymandias", author: "John Keats" })).toBeNull();
  });

  it("refuses a title that is merely similar", () => {
    expect(matchEntry({ canonicalId: null, title: "Ozymandias II", author: "Shelley" })).toBeNull();
    expect(matchEntry({ canonicalId: null, title: "Ozy", author: "Shelley" })).toBeNull();
  });

  it("credits an anonymous poem filed simply as Anonymous", () => {
    // Listan skriver ut spraket — "Anonymous (Akkadian)" — medan den som
    // lade in verket nastan alltid bara skrev "Anonymous". Utan det
    // gick gruppen med anonym vers inte att ta.
    const anon = ALL_ENTRIES.find(e => /^anonymous \(/i.test(e.author))!;
    expect(anon).toBeDefined();
    expect(matchEntry({ canonicalId: null, title: anon.title, author: "Anonymous" })?.id)
      .toBe(anon.id);
    expect(matchEntry({ canonicalId: null, title: anon.title, author: "Unknown" })?.id)
      .toBe(anon.id);
  });

  it("does not make Anonymous a universal key", () => {
    // Titeln bar fortfarande jamforelsen. Ett anonymt namn slapper bara
    // ett falt som anda inte sarskiljer nagot.
    expect(matchEntry({ canonicalId: null, title: "Some Ballad That Is Not Listed", author: "Anonymous" }))
      .toBeNull();
  });

  it("does not match a named poet against an anonymous entry", () => {
    const anon = ALL_ENTRIES.find(e => /^anonymous \(/i.test(e.author))!;
    expect(matchEntry({ canonicalId: null, title: anon.title, author: "Percy Bysshe Shelley" }))
      .toBeNull();
    // Och inte at andra hallet heller.
    expect(matchEntry({ canonicalId: null, title: "Ozymandias", author: "Anonymous" }))
      .toBeNull();
  });

  it("ignores a canonical id that points nowhere", () => {
    expect(matchEntry({ canonicalId: 99_999, title: "x", author: "y" })).toBeNull();
  });

  it("normalises the way the comparison needs", () => {
    expect(normalise("  Rubáiyát,  the!  ")).toBe("rubaiyat the");
    expect(normalise("L'Albatros")).toBe("l albatros");
  });
});

// ── Framstegen ────────────────────────────────────────────────────────
describe("group progress", () => {
  it("counts only what is held, and calls a group complete at the last one", () => {
    const group = GROUPS[2];               // Japan and Korea, 14 poems
    const state = new Map(group.entries.map(e => [e.id, { workId: "w", held: true }]));

    const mine = progressFor(state).find(p => p.group.id === group.id)!;
    expect(mine.held).toBe(group.entries.length);
    expect(mine.percent).toBe(100);
    expect(mine.complete).toBe(true);
  });

  it("does not call a group complete while one poem is merely started", () => {
    const group = GROUPS[2];
    const state = new Map(group.entries.map((e, i) => [e.id, { workId: "w", held: i > 0 }]));

    const mine = progressFor(state).find(p => p.group.id === group.id)!;
    expect(mine.complete).toBe(false);
    expect(mine.started).toBe(group.entries.length);
    expect(mine.held).toBe(group.entries.length - 1);
  });

  it("leaves the other groups alone", () => {
    const group = GROUPS[2];
    const state = new Map(group.entries.map(e => [e.id, { workId: "w", held: true }]));
    const others = progressFor(state).filter(p => p.group.id !== group.id);
    expect(others.every(p => p.held === 0 && !p.complete)).toBe(true);
  });
});

// ── Vad som raknas som hallet ─────────────────────────────────────────
describe("what counts as held", () => {
  const src = read("lib/repertoire.ts");

  it("is every section holding, not the performance title", () => {
    // Framforandetiteln kraver tio rena genomforanden per verk. En grupp
    // pa sjuttio dikter hade da krävt sjuhundra, och ingen grupp blivit
    // klar nagonsin.
    //
    // Las tidigare ur en "work"-medalj. Den delas inte ut langre, sa
    // samma matt raknas nu direkt ur sektionerna — och provet foljer med,
    // for annars gar repertoaren tyst sonder.
    expect(src).toMatch(/sections: \{ select: \{ status: true \} \}/);
    expect(src).toMatch(/work\.sections\.every\(sec => SM2_MASTERED\.includes/);
    expect(src).not.toMatch(/kind: "work"/);
  });

  it("reads the library in one query, not one per poem", () => {
    // Listan ar 762 poster lang. En fraga per post ar 762 fragor for en
    // sida som ritar 24 staplar.
    const fn   = src.slice(src.indexOf("export async function repertoireState"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect((body.match(/await prisma\./g) ?? [])).toHaveLength(1);
  });
});

// ── Bardarna ──────────────────────────────────────────────────────────
describe("the borders", () => {
  it("gives every group exactly one, and none to anything else", () => {
    expect(BORDERS).toHaveLength(24);
    const groupIds  = new Set(GROUPS.map(g => g.id));
    const borderIds = new Set(BORDERS.map(b => b.id));
    expect(borderIds).toEqual(groupIds);
  });

  it("gives each one its own colours", () => {
    // Tjugofyra ringar som gar att skilja at pa 38 pixlar kraver att de
    // faktiskt ar olika.
    const pairs = BORDERS.map(b => `${b.from}|${b.to}`);
    expect(new Set(pairs).size).toBe(BORDERS.length);
  });

  it("uses real hex colours", () => {
    for (const b of BORDERS) {
      expect(b.from).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(b.to).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(b.angle).toBeGreaterThanOrEqual(0);
      expect(b.angle).toBeLessThanOrEqual(360);
    }
  });

  it("returns nothing for an unknown id", () => {
    expect(borderById("not-a-group")).toBeNull();
    expect(borderById(null)).toBeNull();
  });
});

// ── Vem som far vad ───────────────────────────────────────────────────
describe("earning is free, wearing is Pro", () => {
  const src = read("lib/repertoire.ts");

  it("hands out the group award without asking about the plan", () => {
    // Att ta hela Shakespeare ar en bedrift oavsett vad man betalar.
    // Fragade utdelningen efter planen vore bedriften borta for den som
    // uppgraderar senare, och uppgraderingen alltsa ett straff.
    const fn   = src.slice(src.indexOf("export async function syncGroupAwards"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).not.toMatch(/isPro|ent\./);
  });

  it("requires Pro to open the lock", () => {
    expect(src).toMatch(/export async function unlockBorder[\s\S]*?if \(!ent\.isPro\)/);
  });

  it("requires Pro to put one on", () => {
    expect(src).toMatch(/export async function equipBorder[\s\S]*?if \(!ent\.isPro\)/);
  });

  it("checks the award against the database, not against what was sent", () => {
    // Utan den kontrollen racker det att kanna en grupps slug for att
    // bara dess bard.
    expect(src).toMatch(/unlockBorder[\s\S]*?prisma\.groupAward\.findUnique/);
    expect(src).toMatch(/equipBorder[\s\S]*?award\?\.unlockedAt/);
  });

  it("lets anyone take a border off", () => {
    // Den som tappar Pro ska kunna stalla tillbaka sin bild aven om de
    // inte langre far valja en ny.
    expect(src).toMatch(/if \(groupId === null\)[\s\S]*?profileBorder: null/);
  });

  it("stops showing a border when the subscription lapses, without erasing the award", () => {
    expect(src).toMatch(/export async function wornBorder[\s\S]*?if \(!isPro\) return null;/);
    // Bedriften ar en egen rad och rors inte av att barden slocknar.
    const fn   = src.slice(src.indexOf("export async function wornBorder"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).not.toMatch(/delete|update/);
  });
});

// ── Stampeln ──────────────────────────────────────────────────────────
describe("the canonical stamp", () => {
  it("is sanitised on the server, not trusted from the client", () => {
    // Numret avgor vilken grupp verket raknas till. Ett paphittat nummer
    // vore en medalj ingen fortjanat.
    const src = read("app/api/import-text/route.ts");
    expect(src).toMatch(/function repertoireId/);
    expect(src).toMatch(/n < 1 \|\| n > TOTAL_ENTRIES/);
  });

  it("resolves to a real entry for every id in range", () => {
    expect(entryById(1)).toBeDefined();
    expect(entryById(762)).toBeDefined();
    expect(entryById(0)).toBeUndefined();
    expect(entryById(763)).toBeUndefined();
  });

  it("finds every group by its slug", () => {
    for (const g of GROUPS) expect(groupById(g.id)?.name).toBe(g.name);
    expect(groupById("nope")).toBeUndefined();
  });
});
