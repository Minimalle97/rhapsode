// lib/mastery.ts
//
// Vad det betyder att kunna en text.
//
// Regeln är att detta räknas fram, aldrig bedöms av en modell. En siffra
// som en modell hittat på ser lika trovärdig ut varje gång och betyder
// ingenting; den går inte att reproducera, inte att förklara för
// användaren och inte att förbättra. Nivån här bygger på vad någon
// faktiskt gjort: hur många repetitioner som suttit, hur långt intervallet
// hunnit, och hur nära ordagrant de senaste försöken låg.
//
// De lagrade statusarna från SM-2 (not_started, learning, learned,
// stable, mastered, permanent) rörs inte — de driver schemaläggningen och
// finns i tusentals rader redan. Det här är lagret ovanpå: fem nivåer som
// en människa kan känna igen sig i.

export type MasteryLevel =
  | "not_started"
  | "learning"
  | "practicing"
  | "nearly_mastered"
  | "mastered";

export const MASTERY_ORDER: MasteryLevel[] = [
  "not_started", "learning", "practicing", "nearly_mastered", "mastered",
];

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  not_started:     "Not started",
  learning:        "Learning",
  practicing:      "Practising",
  nearly_mastered: "Nearly mastered",
  mastered:        "Mastered",
};

/** Färgtoken ur det befintliga temat. Inga nya färger införs. */
export const MASTERY_COLOR: Record<MasteryLevel, string> = {
  not_started:     "var(--bg4)",
  learning:        "var(--blue)",
  practicing:      "var(--parch2)",
  nearly_mastered: "var(--green)",
  mastered:        "var(--gold)",
};

export interface SectionState {
  status:      string;
  sm2Reps:     number;
  sm2Interval: number;
  /** Ordträffsäkerhet i de senaste försöken, 0–100. Nyast först. */
  recentAccuracy?: number[];
}

/**
 * Nivån för en sektion.
 *
 * Tröskeln för "mastered" kräver både ett långt intervall OCH att de
 * senaste försöken faktiskt satt. Att bara ha väntat länge nog är inte
 * detsamma som att kunna något — utan andra ledet skulle en sektion
 * kunna glida upp till Mastered på tid allena.
 */
export function masteryOf(section: SectionState): MasteryLevel {
  const { status, sm2Reps, sm2Interval } = section;

  if (status === "not_started" || sm2Reps === 0) return "not_started";

  const accuracy = section.recentAccuracy ?? [];
  const recent   = accuracy.slice(0, 3);
  const meanAccuracy = recent.length
    ? recent.reduce((a, b) => a + b, 0) / recent.length
    : null;

  // Ordagrant och länge hållet.
  if ((status === "permanent" || sm2Interval >= 60) && (meanAccuracy === null || meanAccuracy >= 90)) {
    return "mastered";
  }
  if (status === "mastered" && (meanAccuracy === null || meanAccuracy >= 85)) {
    return "mastered";
  }
  if (sm2Interval >= 21 || status === "mastered") return "nearly_mastered";
  if (sm2Interval >= 7  || status === "stable")   return "nearly_mastered";
  if (sm2Reps >= 2      || status === "learned")  return "practicing";
  return "learning";
}

export interface WorkMastery {
  level:    MasteryLevel;
  percent:  number;
  counts:   Record<MasteryLevel, number>;
  total:    number;
}

/**
 * Nivån för ett helt verk.
 *
 * Ett verk är inte bemästrat förrän varje del är det. Det är en hård
 * regel och den är avsiktlig: den som säger sig kunna Odysséen ska kunna
 * hela Odysséen.
 */
export function workMastery(sections: SectionState[]): WorkMastery {
  const counts: Record<MasteryLevel, number> = {
    not_started: 0, learning: 0, practicing: 0, nearly_mastered: 0, mastered: 0,
  };

  for (const s of sections) counts[masteryOf(s)] += 1;

  const total = sections.length;
  if (total === 0) {
    return { level: "not_started", percent: 0, counts, total: 0 };
  }

  const percent = Math.round((counts.mastered / total) * 100);
  const touched = total - counts.not_started;

  let level: MasteryLevel;
  if (counts.mastered === total)                         level = "mastered";
  else if (counts.mastered + counts.nearly_mastered >= total * 0.8) level = "nearly_mastered";
  else if (touched >= total * 0.5)                       level = "practicing";
  else if (touched > 0)                                  level = "learning";
  else                                                   level = "not_started";

  return { level, percent, counts, total };
}

/**
 * Ordträffsäkerhet ur ett rättat försök. Ren aritmetik.
 * Sparas på PracticeSession så att algoritmen ovan kan skärpas i
 * efterhand utan att gammal historik blir obrukbar.
 */
export function accuracyPercent(wordsCorrect: number, wordsTotal: number): number {
  if (wordsTotal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((wordsCorrect / wordsTotal) * 100)));
}
