// tests/access-codes.test.ts
// Koderna som ger bort Pro. Formatet måste tåla att läsas upp i telefon
// och skrivas av för hand.

import { describe, it, expect } from "vitest";
import { generateCode, normaliseCode } from "@/lib/billing/access";

describe("code generation", () => {
  it("produces the documented shape", () => {
    expect(generateCode()).toMatch(/^RHAP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("avoids characters that get misread", () => {
    // 0/O och 1/I/L är samma tecken för en människa som skriver av.
    const body = Array.from({ length: 60 }, () => generateCode()).join("").replace(/RHAP|-/g, "");
    expect(body).not.toMatch(/[01OIL]/);
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(codes.size).toBe(500);
  });

  it("accepts a custom prefix", () => {
    expect(generateCode("GIFT").startsWith("GIFT-")).toBe(true);
  });
});

describe("code normalisation", () => {
  it("forgives lower case", () => {
    expect(normaliseCode("rhap-abcd-efgh-jkmn")).toBe("RHAP-ABCD-EFGH-JKMN");
  });

  it("forgives spaces and stray dashes", () => {
    expect(normaliseCode("  RHAP -- ABCD - EFGH-JKMN ")).toBe("RHAP-ABCD-EFGH-JKMN");
  });

  it("forgives a pasted en dash", () => {
    expect(normaliseCode("RHAP–ABCD–EFGH–JKMN")).toBe("RHAP-ABCD-EFGH-JKMN");
  });

  it("strips anything that is not part of a code", () => {
    expect(normaliseCode("RHAP-ABCD-<script>-JKMN")).toBe("RHAP-ABCD-SCRIPT-JKMN");
  });

  it("returns nothing for junk", () => {
    expect(normaliseCode("!!!")).toBe("");
  });
});
