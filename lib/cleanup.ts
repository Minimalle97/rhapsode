// lib/cleanup.ts
//
// Stadning av en redan importerad text.
//
// Uppdelningen mellan gratis och betalt foljer en enda regel: allt som
// gar att RAKNA UT ar gratis. Dubbla blanksteg, sidnummer, sidhuvuden som
// upprepas, rader som brutits mitt i en mening — det ar monster, och
// monster hittar man med reglar, inte med en sprakmodell.
//
// Det som kraver att nagon FORSTAR texten kostar: var kapitlen borjar,
// vilken strofform som gatt sonder, om ett stycke ar en upprepning eller
// ett omkvade. Det ar genuint generande arbete, och det ar det som ligger
// i Pro.
//
// Ingenting harinne skriver till databasen. Funktionerna tar text och
// lamnar text, sa att forhandsgranskningen kan visa exakt vad som skulle
// handa innan nagot hander.

import { cleanTextVerbose } from "./extract";

export interface CleanupChange {
  /** Kort etikett, visas i sammanfattningen. */
  label: string;
  count: number;
}

export interface CleanupResult {
  text:    string;
  changes: CleanupChange[];
  /** Tecken fore och efter, for en arlig sammanfattning. */
  before:  number;
  after:   number;
}

// ── Gratis: monster, inte forstaelse ─────────────────────────────────

/** Radnummer i marginalen, sidnummer, upprepade sidhuvuden. */
function stripFurniture(text: string): { text: string; changes: CleanupChange[] } {
  const { text: cleaned, removed } = cleanTextVerbose(text, true);
  const changes: CleanupChange[] = [];

  if (removed.headers)     changes.push({ label: "Repeated headers and footers", count: removed.headers });
  if (removed.lineNumbers) changes.push({ label: "Margin line numbers",          count: removed.lineNumbers });
  if (removed.pageNumbers) changes.push({ label: "Page numbers",                 count: removed.pageNumbers });

  return { text: cleaned, changes };
}

/**
 * Rader som brutits mitt i en mening.
 *
 * En PDF bryter dar sidan tar slut, inte dar meningen gor det. Regeln:
 * en rad som slutar utan skiljetecken och foljs av en rad som borjar med
 * gemen hor ihop med den.
 *
 * VERS ROR VI INTE. En diktrad slutar ofta utan skiljetecken och foljs av
 * en gemen — det ar inte ett fel, det ar formen. Darfor kors det har bara
 * pa text som inte ser ut som vers.
 */
function joinBrokenLines(text: string): { text: string; count: number } {
  const lines = text.split("\n");
  const out: string[] = [];
  let joined = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];

    const endsMidSentence =
      line.trim().length > 0 &&
      !/[.!?;:"'”’)\]]\s*$/.test(line) &&
      !/^\s*$/.test(line);
    const nextContinues = next !== undefined && /^\s*\p{Ll}/u.test(next);

    if (endsMidSentence && nextContinues) {
      lines[i + 1] = `${line.trimEnd()} ${next.trimStart()}`;
      joined += 1;
      continue;
    }
    out.push(line);
  }

  return { text: out.join("\n"), count: joined };
}

/** Vanliga OCR-forvaxlingar, bara dar de ar entydiga. */
function fixOcr(text: string): { text: string; count: number } {
  let count = 0;
  const apply = (re: RegExp, to: string) => {
    text = text.replace(re, m => { count += 1; return m.replace(re, to); });
  };

  // rn -> m inuti ord ("modem" blir inte "modern" — bara dar rn foljs av
  // en vokal och foregas av en bokstav, vilket ar det vanliga OCR-felet).
  apply(/\bl(?=\d)/g, "1");          // l framfor siffra ar en etta
  apply(/(?<=\d)O(?=\d)/g, "0");     // O mellan siffror ar en nolla
  apply(/(?<=\p{Ll})\|(?=\p{Ll})/gu, "l"); // rort streck mitt i ord

  return { text, count };
}

/** Blanksteg och tomrader. Alltid sist — de andra stegen lamnar spar. */
function normaliseWhitespace(text: string): { text: string; count: number } {
  const before = text;
  const cleaned = text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Rakna hur manga rader som faktiskt andrades, inte antal tecken.
  const beforeLines = before.split("\n");
  const afterLines  = cleaned.split("\n");
  let count = Math.abs(beforeLines.length - afterLines.length);
  for (let i = 0; i < Math.min(beforeLines.length, afterLines.length); i++) {
    if (beforeLines[i] !== afterLines[i]) count += 1;
  }

  return { text: cleaned, count };
}

/** Ser texten ut som vers? Da lamnas radbrytningarna i fred. */
export function looksLikeVerse(text: string): boolean {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 6) return false;
  const short = lines.filter(l => l.trim().length < 60).length / lines.length;
  const avgWords =
    lines.reduce((sum, l) => sum + l.trim().split(/\s+/).length, 0) / lines.length;
  return short > 0.7 && avgWords < 12;
}

export interface BasicCleanupOptions {
  /** Slas av automatiskt for vers. */
  joinLines?: boolean;
  fixOcr?:    boolean;
}

/**
 * Gratisstadningen. Deterministisk, ogonblicklig, kostar ingenting.
 *
 * Detta racker for att gora en text ANVANDBAR. Pro-steget gor den perfekt.
 */
export function basicCleanup(
  input: string,
  options: BasicCleanupOptions = {}
): CleanupResult {
  const before = input.length;
  const changes: CleanupChange[] = [];
  let text = input.replace(/\r\n?/g, "\n");

  const furniture = stripFurniture(text);
  text = furniture.text;
  changes.push(...furniture.changes);

  const verse = looksLikeVerse(text);

  if (options.joinLines !== false && !verse) {
    const joinedResult = joinBrokenLines(text);
    text = joinedResult.text;
    if (joinedResult.count) {
      changes.push({ label: "Lines broken mid-sentence, rejoined", count: joinedResult.count });
    }
  }

  if (options.fixOcr !== false) {
    const ocr = fixOcr(text);
    text = ocr.text;
    if (ocr.count) changes.push({ label: "Likely scanning errors", count: ocr.count });
  }

  const ws = normaliseWhitespace(text);
  text = ws.text;
  if (ws.count) changes.push({ label: "Spacing and blank lines", count: ws.count });

  return { text, changes, before, after: text.length };
}

/** Sammanfattning i en mening, for forhandsgranskningen. */
export function summarise(result: CleanupResult): string {
  if (!result.changes.length) return "Nothing to tidy — this text is already clean.";
  const total = result.changes.reduce((n, c) => n + c.count, 0);
  const delta = result.before - result.after;
  return `${total} change${total === 1 ? "" : "s"}` +
    (delta > 0 ? `, ${delta.toLocaleString()} characters removed` : "");
}
