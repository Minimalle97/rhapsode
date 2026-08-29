// lib/study.ts
//
// Study Mode — arkitektur, ännu utan gränssnitt.
//
// Poängen med att lägga den här nu är gränsdragningen. Ett studiepass
// består av två helt olika saker, och de blandas lätt ihop:
//
//   FORMEN — vilka sektioner, i vilken ordning, med vilka moment, och hur
//   de femton minuterna fördelas. Det är schemaläggning. Det räknas ut,
//   och det kostar ingenting. outlinePlan() nedan gör hela det arbetet.
//
//   INNEHÅLLET — själva övningarna, ordlistan, förklaringen av ett svårt
//   ställe. Det är genuint genererande, och bara det ska någonsin gå till
//   en modell.
//
// Blandas de ihop hamnar man med en modell som ombeds "planera ett pass",
// vilket kostar tio gånger mer och ger ett sämre schema än tjugo rader
// aritmetik. Formen räknas alltid ut först; modellen fyller sedan i de
// luckor som faktiskt kräver den.

import { FEATURE, type Feature } from "./billing/plans";

export type StudyGoal = "memorise" | "understand" | "perform" | "language";

export type StudyTool =
  | "vocabulary" | "glossary" | "translation"
  | "missing_words" | "recitation" | "rhythm" | "pronunciation";

export type StudyDifficulty = "gentle" | "normal" | "demanding";

/** Vilken behörighet varje moment kräver. null = ingår i Free. */
export const TOOL_FEATURE: Record<StudyTool, Feature | null> = {
  recitation:    null,
  rhythm:        null,
  missing_words: null,
  vocabulary:    FEATURE.LANGUAGE_MODE,
  glossary:      FEATURE.AI_GLOSSARY,
  translation:   FEATURE.TRANSLATION,
  pronunciation: FEATURE.LANGUAGE_MODE,
};

/** Kräver momentet ett modellanrop, eller går det på egen logik? */
export const TOOL_NEEDS_MODEL: Record<StudyTool, boolean> = {
  recitation:    false, // rättas deterministiskt i lib/cue.ts
  rhythm:        false, // metronomen och taktanalysen är aritmetik
  missing_words: false, // maskering, se lib/cue.ts
  vocabulary:    true,
  glossary:      true,
  translation:   true,
  pronunciation: true,
};

export interface StudyPlanRequest {
  workId:     string;
  partId?:    string | null;
  goal:       StudyGoal;
  language?:  string | null;
  difficulty: StudyDifficulty;
  tools:      StudyTool[];
  minutes:    number;
}

export interface StudyPlanStep {
  tool:     StudyTool;
  /** Sektioner steget arbetar med. */
  sectionIds: string[];
  minutes:  number;
  /** Sant om innehållet måste genereras innan steget kan köras. */
  needsGeneration: boolean;
}

export interface StudyPlan {
  steps:   StudyPlanStep[];
  minutes: number;
  /** Sektioner passet rör, i den ordning de tas. */
  sectionIds: string[];
}

export interface CandidateSection {
  id:          string;
  orderIndex:  number;
  status:      string;
  nextReview:  Date | null;
  /** Ordträffsäkerhet i senaste försöket, om det finns ett. */
  lastAccuracy?: number | null;
}

/** Hur många sektioner ett pass rimligen rymmer per minut. */
const SECTIONS_PER_MINUTE: Record<StudyDifficulty, number> = {
  gentle:    0.18,
  normal:    0.30,
  demanding: 0.45,
};

/**
 * Vilka sektioner passet ska handla om.
 *
 * Ordningen är avsiktlig: det som är förfallet först, sedan det som satt
 * sämst, sedan nytt material. Att repetera det som håller på att glömmas
 * bort går före att lära in mer — det är hela skälet till att SM-2 finns,
 * och ett studiepass som bryter mot det arbetar mot schemat.
 */
export function selectSections(
  sections: CandidateSection[],
  minutes: number,
  difficulty: StudyDifficulty,
  now: Date = new Date()
): string[] {
  const room = Math.max(1, Math.round(minutes * SECTIONS_PER_MINUTE[difficulty]));

  const due = sections
    .filter(s => s.nextReview !== null && s.nextReview <= now)
    .sort((a, b) => (a.nextReview!.getTime() - b.nextReview!.getTime()));

  const shaky = sections
    .filter(s => !due.includes(s) && typeof s.lastAccuracy === "number" && s.lastAccuracy < 85)
    .sort((a, b) => (a.lastAccuracy ?? 100) - (b.lastAccuracy ?? 100));

  const fresh = sections
    .filter(s => s.status === "not_started" && s.nextReview === null)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const picked: string[] = [];
  for (const list of [due, shaky, fresh]) {
    for (const s of list) {
      if (picked.length >= room) break;
      if (!picked.includes(s.id)) picked.push(s.id);
    }
  }
  return picked;
}

/**
 * Bygger passets form. Ingen modell inblandad.
 *
 * Minuterna fördelas efter vikt, inte jämnt: recitation är själva saken
 * och ska ha mest tid; en ordlista är uppslagsverk och behöver lite.
 */
const WEIGHT: Record<StudyTool, number> = {
  recitation:    3,
  missing_words: 2,
  rhythm:        2,
  vocabulary:    1.5,
  glossary:      1,
  translation:   1,
  pronunciation: 1.5,
};

export function outlinePlan(
  request: StudyPlanRequest,
  sections: CandidateSection[],
  now: Date = new Date()
): StudyPlan {
  const sectionIds = selectSections(sections, request.minutes, request.difficulty, now);

  const tools = request.tools.length ? request.tools : (["recitation"] as StudyTool[]);
  const totalWeight = tools.reduce((sum, t) => sum + WEIGHT[t], 0);

  // Läsande moment först, övande sist. Man slår upp ordet innan man
  // försöker minnas raden det sitter i.
  const ORDER: StudyTool[] = [
    "glossary", "vocabulary", "translation", "pronunciation",
    "missing_words", "recitation", "rhythm",
  ];
  const ordered = [...tools].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  const steps: StudyPlanStep[] = ordered.map(tool => ({
    tool,
    sectionIds,
    minutes: Math.max(1, Math.round((WEIGHT[tool] / totalWeight) * request.minutes)),
    needsGeneration: TOOL_NEEDS_MODEL[tool],
  }));

  return {
    steps,
    minutes: steps.reduce((sum, s) => sum + s.minutes, 0),
    sectionIds,
  };
}

/** Momenten som kräver ett modellanrop — alltså vad passet kommer att kosta. */
export function generationCount(plan: StudyPlan): number {
  return plan.steps.filter(s => s.needsGeneration).length;
}
