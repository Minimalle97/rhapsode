// tests/recording-privacy.test.ts
//
// En röstinspelning är biometriska personuppgifter. Den här appen samlar
// inte in dem, och det ska inte gå att råka börja göra det igen.
//
// Testerna läser källkoden. Det är rätt verktyg här: det som ska bevisas
// är att en viss sorts kod INTE finns någonstans, och det går inte att
// visa genom att köra en funktion.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

const SKIP = new Set([
  "node_modules", ".next", ".git", ".agents", ".claude", "dist", "build", "coverage", "tests",
]);
const EXT = new Set([".ts", ".tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(entry))) out.push(full);
  }
  return out;
}

const sources = walk(ROOT).map(f => ({
  path: path.relative(ROOT, f),
  text: readFileSync(f, "utf8"),
}));

describe("recordings never leave the device", () => {
  it("has no endpoint that could receive audio", () => {
    expect(existsSync(path.join(ROOT, "app/api/recordings"))).toBe(false);
  });

  it("has no code that posts to one", () => {
    const offenders = sources.filter(s => s.text.includes("/api/recordings")).map(s => s.path);
    expect(offenders).toEqual([]);
  });

  it("has nowhere in the database to record where audio went", () => {
    // Kolumnen är borttagen med flit. Finns det ingen plats att skriva en
    // sökväg går det inte att glida tillbaka till att spara filer.
    const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).not.toMatch(/recordingPath/);

    const offenders = sources.filter(s => s.text.includes("recordingPath")).map(s => s.path);
    expect(offenders).toEqual([]);
  });

  it("never puts an audio blob into a request body", () => {
    // Det konkreta mönstret som fanns förut: en Blob i en FormData som
    // postades vidare. Ingen fil får göra båda sakerna.
    const offenders = sources
      .filter(s => /new FormData\(/.test(s.text) && /audioBlob|audio\/webm|recitation\.webm/.test(s.text))
      .map(s => s.path);
    expect(offenders).toEqual([]);
  });

  it("still lets the recording be played back and saved locally", () => {
    // Integriteten får inte lösas genom att ta bort funktionen. Man ska
    // fortfarande kunna lyssna på sig själv och behålla filen.
    const recite = readFileSync(path.join(ROOT, "components/practice/ReciteMode.tsx"), "utf8");
    expect(recite).toMatch(/URL\.createObjectURL/);
    expect(recite).toMatch(/link\.download/);
    expect(recite).toMatch(/audio\.reset\(\)/); // slappt igen nar man gar vidare
  });

  it("keeps the Supabase storage helper away from audio", () => {
    // Avataren ligger kvar i Storage, och det är i sin ordning — en bild
    // man själv valt att ladda upp är inte samma sak som rösten.
    const storageUsers = sources
      .filter(s => s.text.includes("supabase.storage"))
      .map(s => s.path);
    expect(storageUsers).toEqual(["app\\api\\avatar\\route.ts".replace(/\\/g, path.sep)]);
  });
});
