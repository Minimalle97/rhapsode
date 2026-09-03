// lib/drills.ts
//
// Drillarna: ovningslagen for en sparad text.
//
// ── Vem som far ova ───────────────────────────────────────────────────
//
// Alla. Drillarna ar INTE lasta bakom Pro — de ar rantionerade. Gratis far
// ett antal kort per dygn, Pro har inget tak. Det ar samma val som
// djupstadningen redan gor, och skalet star dar: ett hanglas ber om pengar
// innan nagon vet vad de koper, en ranson ber om dem i det ogonblick de
// precis sett vad funktionen gor.
//
// Behorigheten fragas via canUseFeature() som allt annat, och rakningen
// gar genom samma UsageCounter som modellkvoten. Ingen andra kontroll,
// ingen egen raknare.

import { prisma } from "./db";
import { canUseFeature, type Entitlements } from "./billing/entitlements";
import { FEATURE } from "./billing/plans";
import { consume, peek, dayWindow } from "./usage/counters";
import { cleanSettings, type SkeletonSettings, type RawSettings } from "./drills/skeleton";

export { cleanSettings };
export type { SkeletonSettings, RawSettings };

// ── Vilka drillar som finns ───────────────────────────────────────────

export type DrillId =
  | "skeleton"
  | "cumulative"
  | "seam"
  | "cold_start"
  | "backward";

export interface DrillSpec {
  id:      DrillId;
  name:    string;
  blurb:   string;
  /** Falskt tills drillen ar byggd. Listan visar den anda, som "kommer". */
  ready:   boolean;
}

/**
 * Katalogen.
 *
 * Drill 6 (replikstickord) finns inte med, och det ar avsiktligt: den
 * kraver att texten ar uppdelad per talare, och det finns inget salt falt
 * i schemat. Att gissa fram en talare ur radernas utseende hade gett fel
 * repliker i halva pjaserna. Den laggs till den dag texterna faktiskt
 * bar en talare.
 */
export const DRILLS: readonly DrillSpec[] = [
  {
    id: "skeleton", ready: true,
    name:  "Skeleton",
    blurb: "The text cut down to its opening letters. Say the line aloud, then reveal.",
  },
  {
    id: "cumulative", ready: true,
    name:  "Cumulative build",
    blurb: "Line one. Then one and two. Then one to three, and on.",
  },
  {
    id: "seam", ready: false,
    name:  "Seam drill",
    blurb: "The end of one line; you supply the start of the next.",
  },
  {
    id: "cold_start", ready: false,
    name:  "Cold start",
    blurb: "Dropped in at a random line. Carry on from there.",
  },
  {
    id: "backward", ready: false,
    name:  "Backward chaining",
    blurb: "Start at the last chunk and grow backwards toward the opening.",
  },
] as const;

export function drillById(id: string): DrillSpec | undefined {
  return DRILLS.find(d => d.id === id);
}

/** Sjalvbedomningen efter ett kort. */
export type Mark = "got_it" | "hesitated" | "missed";
const MARKS: Mark[] = ["got_it", "hesitated", "missed"];
export const isMark = (v: unknown): v is Mark => MARKS.includes(v as Mark);

// ── Instalningarna ────────────────────────────────────────────────────

/** Instalningarna for en person. Saknas raden ges standardvardena. */
export async function settingsFor(userId: string): Promise<SkeletonSettings> {
  const row = await prisma.drillSettings.findUnique({
    where:  { userId },
    select: {
      lettersPerWord: true, wholeWordsPerLine: true,
      showWordLength: true, keepShortWords: true,
    },
  });
  // cleanSettings tvingar in vardena i det tillatna aven om raden ar
  // gammal eller handredigerad. Se lib/drills/skeleton.ts.
  return cleanSettings(row);
}

export async function saveSettings(
  userId: string,
  raw:    RawSettings
): Promise<SkeletonSettings> {
  const clean = cleanSettings(raw);
  await prisma.drillSettings.upsert({
    where:  { userId },
    create: { userId, ...clean },
    update: clean,
  });
  return clean;
}

// ── Ransonen ──────────────────────────────────────────────────────────

export interface Allowance {
  /** Sant nar planen over huvud taget slapper in i drillarna. */
  allowed:   boolean;
  /** Sant nar det inte finns nagot tak att tala om. */
  unlimited: boolean;
  used:      number;
  limit:     number;
  remaining: number;
  /** Nar ransonen aterstalls. Null nar den ar obegransad. */
  resetsAt:  Date | null;
}

export class DrillLimitError extends Error {
  readonly used:     number;
  readonly limit:    number;
  readonly resetsAt: Date;
  constructor(used: number, limit: number, resetsAt: Date) {
    super("drill_limit_reached");
    this.name = "DrillLimitError";
    this.used = used;
    this.limit = limit;
    this.resetsAt = resetsAt;
  }
}

/** Sant nar taket i praktiken inte finns. */
function isUnlimited(limit: number): boolean {
  return limit >= Number.MAX_SAFE_INTEGER;
}

/**
 * Hur mycket som ar kvar av dagens ranson — UTAN att forbruka nagot.
 *
 * Anvands av sidorna for att kunna saga hur det ligger till innan man
 * borjar. Rakningen sker forst nar ett kort faktiskt bedoms.
 */
export async function allowanceFor(
  userId: string,
  ent:    Entitlements
): Promise<Allowance> {
  const limit = ent.limits.drillsDaily;

  if (!canUseFeature(ent, FEATURE.DRILLS)) {
    return { allowed: false, unlimited: false, used: 0, limit: 0, remaining: 0, resetsAt: null };
  }
  if (isUnlimited(limit)) {
    return { allowed: true, unlimited: true, used: 0, limit, remaining: limit, resetsAt: null };
  }

  const window = dayWindow();
  // peek ger antalet, inte ett objekt — och forbrukar ingenting.
  const used = await peek("drill_day", userId, window);

  return {
    allowed:   true,
    unlimited: false,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt:  window.expiresAt,
  };
}

/**
 * Tar ett kort ur ransonen.
 *
 * Kastar DrillLimitError nar dagens ar slut. Rakningen gar via samma
 * atomara raknare som modellkvoten, sa tio samtidiga kort kan inte alla
 * lasa "nitton av tjugo" och sedan alla skriva tjugo.
 */
export async function spendOne(userId: string, ent: Entitlements): Promise<void> {
  const limit = ent.limits.drillsDaily;
  if (isUnlimited(limit)) return;

  const result = await consume("drill_day", userId, limit, dayWindow());
  if (!result.allowed) {
    throw new DrillLimitError(result.used, limit, result.resetsAt);
  }
}

// ── Korten ────────────────────────────────────────────────────────────

export interface RecordAttemptInput {
  userId:     string;
  sectionId:  string;
  drill:      DrillId;
  lineIndex:  number;
  mark:       Mark;
  /** Millisekunder fran att kortet visades till att Reveal trycktes. */
  msToReveal?: number | null;
  peeked?:     boolean;
}

/**
 * Skriver ned ett bedomt kort, och drar ett fran ransonen.
 *
 * Agarskapet provas har och inte i routen: sektionen maste tillhora den
 * som bedomer den. Utan den kontrollen racker det att kanna ett
 * sektions-id for att skriva i nagon annans historik.
 */
export async function recordDrillAttempt(input: RecordAttemptInput, ent: Entitlements): Promise<void> {
  const owns = await prisma.section.findFirst({
    where:  { id: input.sectionId, work: { userId: input.userId } },
    select: { id: true },
  });
  if (!owns) throw new Error("NOT_FOUND");

  await spendOne(input.userId, ent);

  await prisma.drillAttempt.create({
    data: {
      userId:    input.userId,
      sectionId: input.sectionId,
      drill:     input.drill,
      lineIndex: Math.max(0, Math.floor(input.lineIndex)),
      mark:      input.mark,
      // Ett orimligt varde ar samre an inget. En klocka som stod stilla
      // eller en flik som lag i bakgrunden i en timme sager ingenting om
      // hur snabbt nagon mindes raden.
      msToReveal:
        typeof input.msToReveal === "number" &&
        Number.isFinite(input.msToReveal) &&
        input.msToReveal >= 0 &&
        input.msToReveal < 10 * 60_000
          ? Math.round(input.msToReveal)
          : null,
      peeked: input.peeked === true,
    },
  });
}
