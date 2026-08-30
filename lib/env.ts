// lib/env.ts
//
// Laser hemligheter ur miljon och stadar dem innan de anvands.
//
// Bakgrund: en nyckel klistrad i Vercels formularfalt far ofta med sig
// ett radbrott pa slutet. Nyckeln ar i ovrigt helt korrekt, men Node
// vagrar satta ett radbrott i en HTTP-header, sa Stripe-anropet dog med
//
//   TypeError: Invalid character in header content ["Authorization"]
//   code: ERR_INVALID_CHAR
//
// Felet sag ut som ett natverksproblem — "An error occurred with our
// connection to Stripe" — och sa hade det latt kunnat felsokas at helt
// fel hall. Det var ett osynligt tecken.
//
// Har trimmas det bort, och allt som ANDA inte gar att skicka i en
// header ger ett tydligt fel med variabelns namn i, i stallet for ett
// obegripligt undantag djupt inne i ett SDK.

/** Tecken som far forekomma i ett header-varde: synlig ASCII. */
const PRINTABLE_ASCII = /^[\x21-\x7E]+$/;

export class EnvError extends Error {
  constructor(name: string, reason: string) {
    super(`${name}: ${reason}`);
    this.name = "EnvError";
  }
}

/**
 * Stadar ett hemlighetsvarde.
 *
 * Tar bort blanksteg och radbrott runtomkring, samt citattecken som
 * folide med fran en .env-fil. Gor INTE nagot at tecken inuti — en
 * nyckel med skrap mitt i ar trasig och ska sagas ifran om.
 */
export function cleanSecret(raw: string): string {
  return raw
    // \s tacker mellanslag, tabb, radbrott och vagnretur.
    .trim()
    // Osynliga tecken som folier med fran webblasare och dokument:
    // nonbreaking space, zero-width space, BOM.
    .replace(/^[ ​﻿]+|[ ​﻿]+$/g, "")
    // "sk_test_..." eller 'sk_test_...' fran en citerad .env-rad.
    // [\s\S] i stallet for . med s-flaggan: projektet kompilerar mot ES2017.
    .replace(/^(["'])([\s\S]*)\1$/, "$2")
    .trim();
}

/**
 * Hamtar en hemlighet som ska skickas i en HTTP-header.
 *
 * Kastar med variabelns namn i meddelandet nar den saknas eller
 * innehaller nagot som inte gar att skicka.
 */
export function readSecret(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    throw new EnvError(name, "is not set");
  }

  const value = cleanSecret(raw);
  if (!value) throw new EnvError(name, "is empty after trimming whitespace");

  if (!PRINTABLE_ASCII.test(value)) {
    // Namnge tecknet men ALDRIG nyckeln. Ett felmeddelande ar inte
    // stallet for en hemlighet.
    const bad = [...value].find(c => !/[\x21-\x7E]/.test(c))!;
    const code = bad.codePointAt(0)!.toString(16).padStart(4, "0");
    throw new EnvError(
      name,
      `contains a character that cannot be sent in an HTTP header (U+${code.toUpperCase()}). ` +
      `Re-paste the value without line breaks or invisible characters.`
    );
  }

  return value;
}

/** Som readSecret men kastar inte — for kod som bara vill veta om den finns. */
export function hasSecret(name: string): boolean {
  const raw = process.env[name];
  return raw !== undefined && cleanSecret(raw).length > 0;
}
