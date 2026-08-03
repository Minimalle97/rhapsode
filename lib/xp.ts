// lib/xp.ts
// XP, ranger och beräkning.
//
// ── Varför systemet gjordes om ────────────────────────────────────────
// Det gamla gav 5–20 XP för varje avslutad övning, oavsett vad som hände.
// Öva samma strof tio gånger i rad och du fick 200 XP utan att ha lärt dig
// något — belöningen mätte aktivitet, inte kunnande.
//
// Nu gäller tre principer:
//
//   1. Framsteg betalar, upprepning gör det inte.
//      Tyngdpunkten ligger på att en sektion flyttar sig till en ny nivå,
//      inte på antalet gånger du klickat dig igenom den.
//
//   2. Schemat respekteras.
//      Att repetera något som verkligen är dags ger full XP. Att öva i
//      förtid ger en fjärdedel — det stärker inte minnet på samma sätt,
//      så det ska inte heller betala som om det gjorde det.
//
//   3. Misslyckande ger noll.
//      Kunde du inte texten får du ingen XP. Det är ärligare, och det gör
//      att en hög siffra faktiskt betyder något.

import type { Rank } from "@/types";

// ── Ranger ────────────────────────────────────────────────────────────
export const RANKS: Rank[] = [
  { level: 1, titleEn: "The Uninitiated",          titleSv: "Den Oinvigde",         xpRequired: 0 },
  { level: 2, titleEn: "Apprentice of Forms",      titleSv: "Formernas Lärling",    xpRequired: 100 },
  { level: 3, titleEn: "Seeker of Truth",          titleSv: "Sanningens Sökare",    xpRequired: 300 },
  { level: 4, titleEn: "Friend of Wisdom",         titleSv: "Visdomens Vän",        xpRequired: 750 },
  { level: 5, titleEn: "Keeper of Memory",         titleSv: "Minnets Väktare",      xpRequired: 1_500 },
  { level: 6, titleEn: "Guardian of the Republic", titleSv: "Republikens Väktare",  xpRequired: 3_000 },
  { level: 7, titleEn: "Philosopher",              titleSv: "Filosofen",            xpRequired: 6_000 },
  { level: 8, titleEn: "Philosopher-King",         titleSv: "Filosofkonungen",      xpRequired: 12_000 },
  { level: 9, titleEn: "The Rhapsode",             titleSv: "Rapsoden",             xpRequired: 25_000 },
];

export function getRank(xp: number): Rank {
  return [...RANKS].reverse().find(r => xp >= r.xpRequired) ?? RANKS[0];
}

export function getNextRank(xp: number): Rank | null {
  return RANKS.find(r => xp < r.xpRequired) ?? null;
}

export function xpToNextRank(xp: number): number {
  const next = getNextRank(xp);
  return next ? next.xpRequired - xp : 0;
}

// ── Inställningar att skruva på ───────────────────────────────────────
// Allt som styr ekonomin ligger samlat här. Vill du att det ska kännas
// tyngre eller lättare är det de här talen du ändrar.
export const XP = {
  /** Grund för en repetition som var dags och gick bra. */
  sessionBase: 8,

  /** Andel av grunden när du övar i förtid. */
  earlyFactor: 0.25,

  /** Andel kvar vid andra, tredje, fjärde passet på samma sektion samma dag. */
  sameDayDecay: [1, 0.4, 0.15, 0],

  /** Hur väl du kom ihåg, SM-2:s kvalitet 0–5. Under 3 = du kunde den inte. */
  qualityFactor: {
    0: 0, 1: 0, 2: 0,
    3: 0.5,
    4: 1.0,
    5: 1.4,
  } as Record<number, number>,

  /** Övningsläge. Att läsa är studier, att recitera är prov. */
  modeFactor: {
    read:   0.3,
    hide:   0.7,
    write:  1.0,
    recite: 1.2,
  } as Record<string, number>,

  /** Extra för nästan felfri återgivning i write/recite. */
  accuracyBonus: [
    { min: 100, xp: 12 },
    { min: 97,  xp: 7 },
    { min: 92,  xp: 3 },
  ],

  /** När en sektion når en ny nivå. Här ligger den verkliga belöningen. */
  milestone: {
    learning:  0,
    learned:   10,
    stable:    25,
    mastered:  60,
    permanent: 120,
  } as Record<string, number>,

  /** Alla sektioner i en del bemästrade. */
  partComplete: 150,

  /** Hela verket bemästrat: fast summa plus en del per sektion. */
  workCompleteBase:    300,
  workCompletePerUnit: 15,

  /** Dagsbonus — ges en gång per dag, och bara för repetitioner som var dags. */
  dailyReviewBonus: 15,
  /** Streak-tillägg per dag, upp till taket. */
  streakStep: 3,
  streakCap:  30,
} as const;

// ── Beräkning ─────────────────────────────────────────────────────────
export interface SessionContext {
  /** SM-2-kvalitet, 0–5. */
  quality: number;
  /** "read" | "hide" | "write" | "recite" */
  mode: string;
  /** 0–100 för write och recite. */
  score?: number | null;
  /** Var sektionen faktiskt dags att repetera? */
  wasDue: boolean;
  /** Antal pass på just den här sektionen tidigare idag. */
  repeatsToday: number;
  /** Sektionens status före passet. */
  statusBefore: string;
  /** Sektionens status efter passet. */
  statusAfter: string;
}

export interface XPBreakdown {
  session:   number;
  accuracy:  number;
  milestone: number;
  total:     number;
  /** Kort förklaring att visa användaren. */
  reason:    string;
}

export function calcXP(ctx: SessionContext): XPBreakdown {
  const qf = XP.qualityFactor[Math.round(ctx.quality)] ?? 0;

  // Kunde du den inte finns inget att belöna.
  if (qf === 0) {
    return {
      session: 0, accuracy: 0, milestone: 0, total: 0,
      reason: "No recall — nothing awarded",
    };
  }

  const mf    = XP.modeFactor[ctx.mode] ?? 1;
  const decay = XP.sameDayDecay[Math.min(ctx.repeatsToday, XP.sameDayDecay.length - 1)];
  const due   = ctx.wasDue ? 1 : XP.earlyFactor;

  const session = Math.round(XP.sessionBase * qf * mf * decay * due);

  // Träffsäkerhet — bara riktigt nära originalet räknas
  let accuracy = 0;
  if (ctx.score != null && (ctx.mode === "write" || ctx.mode === "recite")) {
    const band = XP.accuracyBonus.find(b => ctx.score! >= b.min);
    if (band) accuracy = Math.round(band.xp * decay);
  }

  // Nivåhöjning
  let milestone = 0;
  if (ctx.statusAfter !== ctx.statusBefore) {
    const before = XP.milestone[ctx.statusBefore] ?? 0;
    const after  = XP.milestone[ctx.statusAfter]  ?? 0;
    // Bara uppåt, och bara skillnaden — så man inte kan pendla fram och
    // tillbaka mellan två nivåer och plocka samma belöning om och om igen.
    milestone = Math.max(0, after - before);
  }

  const total = session + accuracy + milestone;

  return { session, accuracy, milestone, total, reason: describe(ctx, milestone) };
}

function describe(ctx: SessionContext, milestone: number): string {
  if (milestone > 0) {
    const label: Record<string, string> = {
      learning:  "Learning",
      learned:   "Learned",
      stable:    "Stable",
      mastered:  "Mastered",
      permanent: "Held permanently",
    };
    return `${label[ctx.statusAfter] ?? ctx.statusAfter}`;
  }
  if (!ctx.wasDue)          return "Practised early";
  if (ctx.repeatsToday > 0) return "Repeated today";
  return "Reviewed on schedule";
}

/** Dagsbonus, växer med streaken men planar ut. */
export function dailyBonus(streakDays: number): number {
  return XP.dailyReviewBonus + Math.min(streakDays * XP.streakStep, XP.streakCap);
}

/** Belöning när ett helt verk är bemästrat. */
export function workCompleteXP(sectionCount: number): number {
  return XP.workCompleteBase + sectionCount * XP.workCompletePerUnit;
}

// ── Bakåtkompatibelt ──────────────────────────────────────────────────
/**
 * Gamla signaturen, så att befintlig kod fortsätter fungera.
 * Antar det försiktiga fallet: sektionen var dags, första passet idag,
 * ingen nivåhöjning. Byt till calcXP() när du uppdaterar API-routen.
 */
export function calcSessionXP(quality: number, score?: number | null): number {
  return calcXP({
    quality,
    mode:         "write",
    score:        score ?? null,
    wasDue:       true,
    repeatsToday: 0,
    statusBefore: "learning",
    statusAfter:  "learning",
  }).total;
}

/** Behålls för äldre importer. */
export const XP_TABLE = {
  practice_hard:      Math.round(XP.sessionBase * 0.5),
  practice_ok:        XP.sessionBase,
  practice_easy:      Math.round(XP.sessionBase * 1.4),
  section_mastered:   XP.milestone.mastered,
  work_completed:     XP.workCompleteBase,
  daily_streak_bonus: XP.dailyReviewBonus,
};
