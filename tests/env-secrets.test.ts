// tests/env-secrets.test.ts
//
// Ett radbrott pa slutet av en nyckel tog ner kassan i produktion, och
// felet det gav — "An error occurred with our connection to Stripe" —
// pekade at helt fel hall. Det har ar testerna som gor att samma sak
// inte kan hanta igen tyst.

import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanSecret, readSecret, hasSecret, EnvError } from "@/lib/env";

afterEach(() => { vi.unstubAllEnvs(); });

const KEY = "rk_test_NOTAREAL";

describe("cleanSecret", () => {
  it("leaves a well-formed key alone", () => {
    expect(cleanSecret(KEY)).toBe(KEY);
  });

  it("strips the trailing newline that broke production", () => {
    expect(cleanSecret(`${KEY}\n`)).toBe(KEY);
    expect(cleanSecret(`${KEY}\r\n`)).toBe(KEY);
  });

  it("strips leading and trailing spaces and tabs", () => {
    expect(cleanSecret(`  ${KEY}\t `)).toBe(KEY);
  });

  it("strips a non-breaking space pasted from a browser", () => {
    expect(cleanSecret(` ${KEY} `)).toBe(KEY);
  });

  it("strips a zero-width space and a BOM", () => {
    expect(cleanSecret(`﻿${KEY}​`)).toBe(KEY);
  });

  it("strips quotes carried over from a .env line", () => {
    expect(cleanSecret(`"${KEY}"`)).toBe(KEY);
    expect(cleanSecret(`'${KEY}'`)).toBe(KEY);
  });

  it("does not touch the middle of the value", () => {
    // En nyckel med skrap inuti ar trasig och ska inte tystas ned.
    expect(cleanSecret("rk_test_ab cd")).toBe("rk_test_ab cd");
  });
});

describe("readSecret", () => {
  it("returns a cleaned key", () => {
    vi.stubEnv("TEST_SECRET", `${KEY}\n`);
    expect(readSecret("TEST_SECRET")).toBe(KEY);
  });

  it("names the variable when it is missing", () => {
    vi.stubEnv("TEST_SECRET", "");
    expect(() => readSecret("TEST_SECRET")).toThrow(EnvError);
    expect(() => readSecret("TEST_SECRET")).toThrow(/TEST_SECRET/);
  });

  it("explains a character that cannot go in a header", () => {
    vi.stubEnv("TEST_SECRET", "rk_test_ab cd");
    expect(() => readSecret("TEST_SECRET")).toThrow(/cannot be sent in an HTTP header/);
    expect(() => readSecret("TEST_SECRET")).toThrow(/U\+00A0/);
  });

  it("never puts the secret itself in the error message", () => {
    // Ett felmeddelande hamnar i loggar, i felrapporter och ibland pa en
    // skarm nagon delar. Nyckeln far inte folja med dit.
    vi.stubEnv("TEST_SECRET", "rk_test_SUPERSECRETvalue");
    try {
      readSecret("TEST_SECRET");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).not.toContain("SUPERSECRET");
      expect((err as Error).message).toContain("TEST_SECRET");
    }
  });

  it("accepts every character Stripe and Anthropic actually use", () => {
    for (const value of [
      "sk_test_fake", "rk_live_fake", "whsec_fake",
      "sk-ant-fake_-aB1",
    ]) {
      vi.stubEnv("TEST_SECRET", value);
      expect(readSecret("TEST_SECRET")).toBe(value);
    }
  });
});

describe("hasSecret", () => {
  it("is false for unset, empty and whitespace-only", () => {
    vi.stubEnv("TEST_SECRET", "");
    expect(hasSecret("TEST_SECRET")).toBe(false);
    vi.stubEnv("TEST_SECRET", "   \n");
    expect(hasSecret("TEST_SECRET")).toBe(false);
  });

  it("is true for a real value even with stray whitespace", () => {
    vi.stubEnv("TEST_SECRET", `  ${KEY}\n`);
    expect(hasSecret("TEST_SECRET")).toBe(true);
  });
});
