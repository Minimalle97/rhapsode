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

  it("is used by the avatar route, and the stored type comes from it", () => {
    const route = read("app/api/avatar/route.ts");
    expect(route).toMatch(/sniffImage/);
    // contentType far inte komma fran klientens pastaende.
    expect(route).not.toMatch(/contentType:\s*file\.type/);
    expect(route).toMatch(/contentType:\s*sniffed\.mime/);
  });
});

// ── Synlighet ─────────────────────────────────────────────────────────
describe("private works stay private", () => {
  const publicProfile = read("app/(app)/u/[handle]/page.tsx");

  it("only lists shared works to a friend", () => {
    // Buggen som fanns: where hamtade alla verk, sa synlighetsvaljaren
    // hade ingen verkan pa den har sidan.
    expect(publicProfile).toMatch(/visibility:\s*"public"/);
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
