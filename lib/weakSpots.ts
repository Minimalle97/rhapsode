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
import type { Diff, CueLevel } from "./cue";

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
 *
 * RATTAT: vardet var 2.2, vilket i praktiken kravde TRE rattade forsok.
 * Dampningen gor att forsoken summerar till 1.00, 1.82, 2.49 … — tva
 * forsok nadde alltsa aldrig fram, och kryssrutan gick inte att klicka i
 * for nagon som gjort precis det kommentaren ovan beskriver som nog.
 * 1.5 slapper igenom vid tva, vilket var avsikten hela tiden.
 */
const MIN_ATTEMPTS = 1.5;

/**
 * Hur tungt en miss vager, efter hur mycket stod som var framme.
 *
 * "Frequent hints required" ar ett eget tecken pa svaghet. Att tappa ett
 * ord med hela texten framfor sig sager nagot helt annat an att tappa det
 * ur tomma intet — det forsta ar ett stalle man inte ens kan LASA sig
 * igenom, det andra ar bara svart. Ju mer stod som fanns, desto tyngre
 * vager missen.
 *
 * `hidden` ar grunden. Ingenting vager mindre an att missa nar ingenting
 * visades, for det ar det normala tillstandet i en minnesovning.
 */
export const CUE_WEIGHT: Record<CueLevel, number> = {
  full:      1.40,
  firstWord: 1.25,
  initials:  1.15,
  skeleton:  1.05,
  hidden:    1.00,
};

/**
 * Vad en tvekan vager, nar ordet anda blev ratt.
 *
 * Mindre an en miss, och med flit. Att staka sig och sedan komma pa det
 * ar inte samma sak som att inte kunna det — men det ar heller inte
 * ingenting, och det ar ofta forsta tecknet pa att en rad borjar glida.
 *
 * Vardet ar valt sa att ett ord man konsekvent tvekar pa men alltid far
 * ratt hamnar pa "moderate" och aldrig hogre. Bara riktiga missar tar
 * ett stalle hela vagen till "severe".
 */
export const HESITATION_WEIGHT = 0.35;

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
export interface AttemptContext {
  /** Hur mycket av texten som var framme. Tyngre miss ju mer stod. */
  cueLevel?: CueLevel;
  /**
   * Platser i FORSOKET dar det blev tyst lange innan ordet kom.
   *
   * Raknat i forsokets ordfoljd, precis som hooken ger dem. `diff[i].at`
   * ar bryggan over till originalets platser — utan den hade en tvekan
   * hamnat pa fel rad sa fort nagon hoppat over ett ord.
   */
  hesitatedAt?: number[];
}

export async function recordAttempt(
  sectionId: string,
  diff:      Diff[],
  ctx:       AttemptContext = {}
): Promise<void> {
  if (diff.length === 0) return;

  const existing = await prisma.sectionWeakness.findUnique({
    where:  { sectionId },
    select: { words: true, attempts: true },
  });

  const prev = readMap(existing?.words);
  const now  = Date.now();
  const next: WordMap = {};

  const cueWeight = CUE_WEIGHT[ctx.cueLevel ?? "hidden"] ?? 1;
  const hesitated = new Set(ctx.hesitatedAt ?? []);

  for (let i = 0; i < diff.length; i++) {
    const key       = String(i);
    const [m, a, l] = prev[key] ?? [0, 0, 0];
    const missed    = !diff[i].correct;

    // En miss vager efter hur mycket stod som fanns. Blev ordet ratt men
    // kom det efter en lang tystnad vager tvekan i stallet — mindre, men
    // inte noll. Ett ord kan inte bade missas och tvekas: missen ar det
    // starkare tecknet och inkluderar redan att det gick trogt.
    const at        = diff[i].at;
    const paused    = !missed && at !== null && at !== undefined && hesitated.has(at);
    const weight    = missed ? cueWeight : paused ? HESITATION_WEIGHT : 0;

    next[key] = [
      m * DECAY + weight,
      a * DECAY + 1,
      weight > 0 ? now : l,
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
  diff:     Diff[],
  ctx:      AttemptContext = {}
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

    // Tvekningarna raknas i HELA forsokets ordfoljd, och `slice` bar sina
    // egna `at` som fortfarande pekar dit. De behover darfor inte rebasas
    // — de jamfors mot samma lista hela vagen.
    await recordAttempt(section.id, slice, ctx).catch(() => {});
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
  /**
   * Sant nar sa gott som HELA sektionen var svag.
   *
   * Da ar det inte ett svagt stalle utan en text man annu inte kan, och
   * markeringen sags upp: se filtret i toWeakness().
   */
  saturated: boolean;
}

const EMPTY: SectionWeakness = { enough: false, attempts: 0, words: [], saturated: false };

/**
 * Over sa har stor andel svaga ord ar sektionen inte svag i ett stalle —
 * den ar olard.
 *
 * Med tva forsok pa en ny dikt ligger nittio procent av orden over
 * troskeln, och en text dar allt ar markerat sager exakt lika mycket som
 * en dar inget ar det. Da visas hellre ingenting, med en rad som sager
 * varfor.
 */
const SATURATION = 0.5;

function toWeakness(row: { words: unknown; attempts: number } | null): SectionWeakness {
  if (!row) return EMPTY;
  if (row.attempts < MIN_ATTEMPTS) {
    return { enough: false, attempts: row.attempts, words: [], saturated: false };
  }

  const map = readMap(row.words);
  const tracked = Object.values(map).filter(([, a]) => a > 0).length;

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

  // Ar nastan allt svagt ar ingenting det.
  //
  // Forst hojs kravet till bara det varsta — ofta racker det for att
  // skilja ut de verkliga stallena ur en text man borjat fa grepp om.
  // Ar aven det mesta kvar ar sektionen helt enkelt inte inlard an, och
  // da ar en helt overstruken dikt ingen upplysning.
  if (tracked > 0 && words.length / tracked > SATURATION) {
    const worst = words.filter(w => w.severity === "severe");
    if (worst.length / tracked <= SATURATION) {
      return { enough: true, attempts: row.attempts, words: worst, saturated: false };
    }
    return { enough: true, attempts: row.attempts, words: [], saturated: true };
  }

  return { enough: true, attempts: row.attempts, words, saturated: false };
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
