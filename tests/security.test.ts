// tests/security.test.ts
//
// Sakerhetsregler som gar att uttrycka i kod, uttryckta i kod.
//
// Bildkontrollen testas mot riktiga byte. Resten ar granskning av kallan:
// det som ska bevisas ar att ett visst monster INTE finns, och det gar
// inte att visa genom att kora en funktion.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { sniffImage, declaredTypeMatches } from "@/lib/upload";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

// ── Uppladdning ───────────────────────────────────────────────────────
function bytes(...b: number[]) { return new Uint8Array(b); }

const PNG  = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
const GIF  = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);

/** Varje route-fil under app/api, for pastaenden som galler alla. */
function walkRoutes(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "route.ts") {
        out.push({ path: path.relative(ROOT, full), text: readFileSync(full, "utf8") });
      }
    }
  };
  walk(path.join(ROOT, "app", "api"));
  return out;
}

describe("uploaded files are judged by their bytes", () => {
  it("recognises the four allowed formats", () => {
    expect(sniffImage(PNG)?.mime).toBe("image/png");
    expect(sniffImage(JPEG)?.mime).toBe("image/jpeg");
    expect(sniffImage(GIF)?.mime).toBe("image/gif");
    expect(sniffImage(WEBP)?.mime).toBe("image/webp");
  });

  it("rejects HTML posing as an image", () => {
    // Precis angreppet den gamla kontrollen slappte igenom: godtyckliga
    // byte med Content-Type: image/png.
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect(sniffImage(html)).toBeNull();
  });

  it("rejects SVG, which is a document and can carry script", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(sniffImage(svg)).toBeNull();
  });

  it("rejects a PDF, an archive and an executable", () => {
    expect(sniffImage(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull();          // %PDF
    expect(sniffImage(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();          // PK zip
    expect(sniffImage(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();          // MZ exe
  });

  it("rejects an empty or truncated file", () => {
    expect(sniffImage(bytes())).toBeNull();
    expect(sniffImage(bytes(0x89, 0x50))).toBeNull();
  });

  it("is not fooled by a signature that appears later in the file", () => {
    const late = bytes(0, 0, 0, 0, 0x89, 0x50, 0x4e, 0x47);
    expect(sniffImage(late)).toBeNull();
  });

  it("can tell when the client's claim disagrees with the bytes", () => {
    const sniffed = sniffImage(PNG)!;
    expect(declaredTypeMatches("image/png", sniffed)).toBe(true);
    expect(declaredTypeMatches("image/gif", sniffed)).toBe(false);
  });

  it("caps the size of every route that accepts a file", () => {
    // Tva sorters uppladdning maste hallas isar.
    //
    // En fil som SPARAS hos oss maste kontrolleras byte for byte — den
    // ligger kvar och kan lankas till. Den sortens route finns inte
    // langre: ljudet togs bort av integritetsskal och avataren ags av
    // Clerk. lib/upload.ts ar kvar med flit, sa att kontrollen finns
    // fardig och provad om en uppladdning nagonsin kommer tillbaka.
    //
    // En fil som bara LASES och slangs — importen av en PDF — behover
    // inte samma signaturkontroll, for ingenting blir kvar. Den behover
    // daremot ett tak, annars ar den en vag att aka minnet slut.
    const uploads = walkRoutes().filter(r => r.text.includes("formData()"));
    expect(uploads.length).toBeGreaterThan(0);

    for (const r of uploads) {
      const capped =
        /MAX_UPLOAD_BYTES|file\.size >/.test(r.text) ||
        /extractTextFromFile/.test(r.text); // taket sitter i lib/extract.ts
      expect(capped, `${r.path} accepts a file with no size limit`).toBe(true);
    }
  });

  it("stores no uploaded file anywhere", () => {
    // Det starkaste pastaendet: en fil fran en anvandare blir aldrig kvar
    // hos oss. Da finns det inget att servera, inget att lanka till och
    // inget att missta for en bild.
    const storing = walkRoutes().filter(r => /storage\s*\n?\s*\.from\(|\.upload\(/.test(r.text));
    expect(storing.map(r => r.path)).toEqual([]);
  });
});

// ── Synlighet ─────────────────────────────────────────────────────────
describe("private works stay private", () => {
  const publicProfile = read("app/(app)/u/[handle]/page.tsx");

  it("only lists shared works to a friend", () => {
    // Buggen som fanns: where hamtade alla verk, sa synlighetsvaljaren
    // hade ingen verkan pa den har sidan.
    //
    // Kontrollen bor numera i lib/sharedLibrary.ts, dar bade den har
    // sidan och allt som kommer efter maste ga igenom den. Sidan far
    // inte fraga databasen om verk pa egen hand igen.
    expect(read("lib/sharedLibrary.ts")).toMatch(/includePrivate \? \{\} : \{ visibility: "public" \}/);
    expect(publicProfile).toMatch(/sharedLibrary\(person\.id, state === "self"\)/);
    expect(publicProfile).not.toMatch(/prisma\.work\.findMany/);
  });

  it("never selects the words of a section for the progress bars", () => {
    // Framstegen raknas ur status och SM-2-siffror. Texten behovs inte,
    // och att hamta den vore att lasa nagon annans material.
    expect(read("lib/sharedLibrary.ts")).not.toMatch(/content:\s*true|name:\s*true/);
  });

  it("does not name a private work through its medal", () => {
    expect(publicProfile).toMatch(/m\.work\.visibility === "public"/);
  });

  it("never selects section text for someone else's profile", () => {
    // Att se att nagon kampar med rad fyra ar inte nagot man behover veta.
    expect(publicProfile).not.toMatch(/content:\s*true/);
  });

  it("hides the work name on your own profile too when it is private", () => {
    // Sidan ar delbar. En skarmbild ska inte avsloja vad nagon ovar pa.
    expect(read("app/(app)/profile/page.tsx")).toMatch(/visibility === "public"/);
  });
});

// ── Databasatkomst ────────────────────────────────────────────────────
describe("data access", () => {
  const SKIP = new Set(["node_modules", ".next", ".git", ".agents", ".claude", "tests"]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (SKIP.has(e)) continue;
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  const sources = walk(path.join(ROOT, "app"))
    .concat(walk(path.join(ROOT, "lib")))
    .map(f => ({ path: path.relative(ROOT, f), text: readFileSync(f, "utf8") }));

  it("never builds SQL by string concatenation", () => {
    // Taggade mallar ar parameteriserade. Unsafe-varianterna ar det inte.
    const offenders = sources
      .filter(s => /\$(executeRawUnsafe|queryRawUnsafe)/.test(s.text))
      .map(s => s.path);
    expect(offenders).toEqual([]);
  });

  it("never renders raw HTML from data", () => {
    const offenders = sources
      .filter(s => s.text.includes("dangerouslySetInnerHTML"))
      .map(s => s.path);
    expect(offenders).toEqual([]);
  });

  it("guards every API route with authentication", () => {
    const routes = sources.filter(s => /app[\\/]api[\\/].*route\.ts$/.test(s.path));
    expect(routes.length).toBeGreaterThan(10);

    const unguarded = routes
      .filter(s => !/requireUser|session\(\)/.test(s.text))
      // Webhooken har ingen session — den bevisar sig med Stripes signatur.
      .filter(s => !s.path.includes("webhook"))
      .map(s => s.path);
    expect(unguarded).toEqual([]);
  });

  it("verifies the signature on the one unauthenticated route", () => {
    const webhook = read("app/api/billing/webhook/route.ts");
    expect(webhook).toMatch(/constructEvent/);
    expect(webhook).toMatch(/STRIPE_WEBHOOK_SECRET/);
  });
});
