// lib/weakSpots.ts
//
// Var i en text nagon faktiskt brukar tappa den.
//
// ── Vad det bygger pa ─────────────────────────────────────────────────
//
// Ingenting har ar en bedomning. Svagheten raknas ur vad anvandaren
// gjort: vilka ord som foll bort nar de skrev av strofen, vilka som foll
// bort nar de reciterade den ur minnet, och hur ofta. Samma
// Levenshtein-jamforelse som satter betyget i lib/cue.ts levererar
// underlaget — dess `diff` ar redan radad efter originalets ordfoljd, sa
// varje ord har en plats och varje plats en historia.
//
// En modell far aldrig peka ut ett svagt stalle. En sprakmodell kan saga
// vilka rader som ar SVARA, vilket later likadant men ar nagot helt
// annat: det ar ett pastaende om texten, inte om personen. Tva som lart
// sig samma dikt tappar den pa olika stallen, och det ar den skillnaden
// hela funktionen finns for.
//
// ── Hur det haller sig aktuellt ───────────────────────────────────────
//
// Varje nytt forsok dampar historiken innan det laggs till:
//
//   missar = missar * DECAY + (foll bort ? 1 : 0)
//   forsok = forsok * DECAY + 1
//
// Kvoten blir da ett glidande medelvarde med tyngdpunkt pa det senaste.
// En rad man tappade tio ganger i mars slutar lysa efter en handfull rena
// genomforanden, och tander igen samma dag den borjar glida. Det ar
// billigare an att spara varje forsok och racka bakat, och det ger exakt
// den egenskap som efterfragades: markeringen visar minnet som det ar nu.
//
// ── Kostnad ───────────────────────────────────────────────────────────
//
// Rakningen sker NAR ETT FORSOK SPARAS, aldrig nar texten lases. Att lasa
// en sektion ar en fraga mot en rad; att oppna ett helt verk ar en fraga
// mot alla dess rader. Ingen modell ar inblandad i nagondera.

import { prisma } from "./db";
import type { Diff } from "./cue";

/**
 * Hur snabbt det gamla viker undan.
 *
 * 0.82 betyder att ett forsok vager ungefar halften efter fyra nya och en
 * tiondel efter tolv. Lagre an sa blir markeringen nervos och hoppar pa
 * ett enda daligt forsok; hogre och den hanger kvar langt efter att raden
 * borjat sitta.
 */
const DECAY = 0.82;

/**
 * Under sa har manga (dampade) forsok visas ingenting alls.
 *
 * Kravet var uttryckligt: for en text utan historik ska inga svaga
 * stallen HITTAS PA. Ett enda forsok racker inte for att veta nagot —
 * forsta gangen man laser en strof missar man det mesta, och det sager
 * bara att man just borjat.
 */
const MIN_ATTEMPTS = 2.2;

export type Severity = "moderate" | "strong" | "severe";

/** Trosklar pa missfrekvensen. Under den lagsta markeras ingenting. */
const THRESHOLDS: { level: Severity; at: number }[] = [
  { level: "severe",   at: 0.62 },
  { level: "strong",   at: 0.38 },
  { level: "moderate", at: 0.20 },
];

export function severityOf(rate: number): Severity | null {
  for (const t of THRESHOLDS) if (rate >= t.at) return t.level;
  return null;
}

// ── Ordens platser i originalet ───────────────────────────────────────

export interface AlignedWord {
  /** Normalformen, identisk med den lib/cue.ts jamfor mot. */
  norm:  string;
  /** Var ordet borjar och slutar i ORIGINALTEXTEN, med skiljetecken. */
  start: number;
  end:   number;
}

/**
 * Originalets ord, med sina platser i den oredigerade texten.
 *
 * Normaliseringen nedan ar teckenvis identisk med den i gradeAttempt.
 * Den maste vara det: `diff[i]` fran rattningen och `alignedWords[i]`
 * harifran ar samma ord, och gar de isar markeras fel stalle i texten.
 * Det ar ocksa varfor den inte gar via samma reguljara uttryck — de
 * kastar bort var teckenet kom ifran, och det ar just det som behovs for
 * att kunna mala over ratt bit av originalet.
 */
export function alignedWords(text: string): AlignedWord[] {
  const chars: { c: string; src: number }[] = [];

  for (let i = 0; i < text.length; i++) {
    let c = text[i].toLowerCase();

    if (c === "’" || c === "‘") c = "'";
    else if (c === "–" || c === "—") c = "-";

    if (/\s/.test(c)) {
      // Radbrytning och mellanslag ar samma sak for jamforelsen.
      if (chars.length > 0 && chars[chars.length - 1].c !== " ") {
        chars.push({ c: " ", src: i });
      }
      continue;
    }

    // Samma teckenklass som gradeAttempt slapper igenom.
    if (!/[\p{L}\p{N}'\-]/u.test(c)) continue;

    // toLowerCase kan ge fler tecken an ett. Alla pekar pa samma plats.
    for (const part of c) chars.push({ c: part, src: i });
  }

  const words: AlignedWord[] = [];
  let cur = "", start = -1, end = -1;

  const flush = () => {
    if (cur) words.push({ norm: cur, start, end: end + 1 });
    cur = ""; start = -1; end = -1;
  };

  for (const { c, src } of chars) {
    if (c === " ") { flush(); continue; }
    if (!cur) start = src;
    cur += c;
    end = src;
  }
  flush();

  return words;
}

// ── Skrivningen ───────────────────────────────────────────────────────

/** [missar, forsok, senast missad i millisekunder]. */
type Cell = [number, number, number];
type WordMap = Record<string, Cell>;

function readMap(raw: unknown): WordMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: WordMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v) || v.length < 2) continue;
    const [m, a, l] = v as unknown[];
    if (typeof m !== "number" || typeof a !== "number") continue;
    out[k] = [m, a, typeof l === "number" ? l : 0];
  }
  return out;
}

/**
 * Skriver ned vad ett rattat forsok visade.
 *
 * Anropas dar rattningen redan skett — den behover `diff`, alltsa
 * originalets ord med en flagga per plats. Kostar en las och en skrivning.
 *
 * Anrop far aldrig falla ett forsok: markeringen ar en hjalp, och att en
 * ovning misslyckas for att en hjalp inte gick att spara vore fel ordning
 * pa sakerna. Anroparen fangar darfor felet och gar vidare.
 */
export async function recordAttempt(sectionId: string, diff: Diff[]): Promise<void> {
  if (diff.length === 0) return;

  const existing = await prisma.sectionWeakness.findUnique({
    where:  { sectionId },
    select: { words: true, attempts: true },
  });

  const prev = readMap(existing?.words);
  const now  = Date.now();
  const next: WordMap = {};

  for (let i = 0; i < diff.length; i++) {
    const key    = String(i);
    const [m, a, l] = prev[key] ?? [0, 0, 0];
    const missed = !diff[i].correct;

    next[key] = [
      m * DECAY + (missed ? 1 : 0),
      a * DECAY + 1,
      missed ? now : l,
    ];
  }

  // Platser som fanns forut men inte i det har forsoket — texten kan ha
  // kortats. De dampas vidare i stallet for att raderas, sa att en
  // tillfallig redigering inte kastar bort historiken.
  for (const [key, [m, a, l]] of Object.entries(prev)) {
    if (next[key]) continue;
    const decayed: Cell = [m * DECAY, a * DECAY, l];
    if (decayed[1] > 0.05) next[key] = decayed;
  }

  const attempts = (existing?.attempts ?? 0) * DECAY + 1;

  await prisma.sectionWeakness.upsert({
    where:  { sectionId },
    create: { sectionId, words: next, attempts },
    update: { words: next, attempts },
  });
}

/**
 * Samma sak for ett framforande av HELA verket.
 *
 * Rattningen gors da mot alla sektioner hopfogade, sa `diff` maste delas
 * upp igen innan den kan skrivas. Uppdelningen sker pa ordantal: sektion
 * ett ager de forsta n orden, sektion tva de nasta, och sa vidare.
 *
 * Sektionerna maste komma i samma ordning som de fogades ihop, annars
 * hamnar en missad rad i fel sektion.
 */
export async function recordWholeWorkAttempt(
  sections: { id: string; content: string }[],
  diff:     Diff[]
): Promise<void> {
  let offset = 0;

  for (const section of sections) {
    const count = alignedWords(section.content).length;
    if (count === 0) continue;

    const slice = diff.slice(offset, offset + count);
    offset += count;

    // Gick rattningen isar med texten ar det battre att inte skriva alls
    // an att skriva svaghet pa fel plats.
    if (slice.length !== count) return;

    await recordAttempt(section.id, slice).catch(() => {});
  }
}

// ── Lasningen ─────────────────────────────────────────────────────────

export interface WeakWord {
  index:    number;
  /** Dampad missfrekvens, 0-1. */
  rate:     number;
  severity: Severity;
  /** Ungefarligt antal missar, avrundat. For forklaringsrutan. */
  misses:   number;
}

export interface WeakSpan {
  /** Platser i ORIGINALTEXTEN. */
  start:    number;
  end:      number;
  severity: Severity;
  /** Hur manga ganger stallet fallit bort, avrundat uppat. */
  misses:   number;
  /** Genomsnittlig traffsakerhet pa stallet, 0-100. */
  accuracy: number;
}

export interface SectionWeakness {
  /** Sant nar det finns nog med historik for att saga nagot alls. */
  enough:   boolean;
  attempts: number;
  words:    WeakWord[];
}

const EMPTY: SectionWeakness = { enough: false, attempts: 0, words: [] };

function toWeakness(row: { words: unknown; attempts: number } | null): SectionWeakness {
  if (!row) return EMPTY;
  if (row.attempts < MIN_ATTEMPTS) {
    return { enough: false, attempts: row.attempts, words: [] };
  }

  const map = readMap(row.words);
  const words: WeakWord[] = [];

  for (const [key, [m, a]] of Object.entries(map)) {
    if (a <= 0) continue;
    const rate = m / a;
    const level = severityOf(rate);
    if (!level) continue;
    words.push({
      index: Number(key), rate, severity: level,
      misses: Math.max(1, Math.round(m)),
    });
  }

  words.sort((x, y) => x.index - y.index);
  return { enough: true, attempts: row.attempts, words };
}

export async function weaknessFor(sectionId: string): Promise<SectionWeakness> {
  return toWeakness(await prisma.sectionWeakness.findUnique({
    where:  { sectionId },
    select: { words: true, attempts: true },
  }));
}

/** Flera sektioner pa en gang — en fraga, inte en per sektion. */
export async function weaknessForSections(
  sectionIds: string[]
): Promise<Map<string, SectionWeakness>> {
  const out = new Map<string, SectionWeakness>();
  if (sectionIds.length === 0) return out;

  const rows = await prisma.sectionWeakness.findMany({
    where:  { sectionId: { in: sectionIds } },
    select: { sectionId: true, words: true, attempts: true },
  });

  for (const r of rows) out.set(r.sectionId, toWeakness(r));
  return out;
}

// ── Fran ord till markerade stycken ───────────────────────────────────

/**
 * Slar ihop nargransande svaga ord till stycken att mala over.
 *
 * Ett ensamt ord i taget hade gett en text full av konfetti. Ligger tva
 * svaga ord med hogst ett friskt emellan hor de till samma stalle — det
 * ar sa en glomd rad ser ut: inte ett ord, utan en bit man tappar.
 *
 * Styckets grad ar den varsta i det. Ett stalle dar man konsekvent tappar
 * halva raden ska inte tonas ned av att ett ord i den brukar sitta.
 */
export function spansFor(
  text:     string,
  weakness: SectionWeakness,
  /** Hur manga friska ord som far ligga mellan tva svaga. */
  bridge = 1
): WeakSpan[] {
  if (!weakness.enough || weakness.words.length === 0) return [];

  const aligned = alignedWords(text);
  if (aligned.length === 0) return [];

  const spans: WeakSpan[] = [];
  let group: WeakWord[] = [];

  const flush = () => {
    if (group.length === 0) return;

    const first = aligned[group[0].index];
    const last  = aligned[group[group.length - 1].index];
    if (!first || !last) { group = []; return; }

    const worst = group.reduce<Severity>((acc, w) =>
      w.severity === "severe" ? "severe"
      : acc === "severe" ? "severe"
      : w.severity === "strong" ? "strong"
      : acc === "strong" ? "strong"
      : "moderate", "moderate");

    const meanRate = group.reduce((a, w) => a + w.rate, 0) / group.length;

    spans.push({
      start:    first.start,
      end:      last.end,
      severity: worst,
      misses:   Math.max(...group.map(w => w.misses)),
      accuracy: Math.round((1 - meanRate) * 100),
    });
    group = [];
  };

  for (const w of weakness.words) {
    if (w.index >= aligned.length) continue;
    if (group.length === 0) { group = [w]; continue; }

    const gap = w.index - group[group.length - 1].index;
    if (gap <= bridge + 1) group.push(w);
    else { flush(); group = [w]; }
  }
  flush();

  return spans;
}

/** Kortaste sanna meningen om ett stalle. Visas vid hovring eller tryck. */
export function explain(span: WeakSpan): { title: string; detail: string } {
  const title =
    span.severity === "severe" ? "Keeps slipping"
    : span.severity === "strong" ? "Needs practice"
    : "Weak spot";

  const times = span.misses === 1 ? "once" : `${span.misses} times`;
  return {
    title,
    detail: `Lost here ${times} · recall ${span.accuracy}%`,
  };
}
