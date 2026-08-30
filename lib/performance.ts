// lib/performance.ts
//
// Performance Mode: texten framford i ett svep, utan stod.
//
// Skillnaden mot ovningslagena ar att ingenting hjalper till. Ingen
// stavningsledtrad, ingen sektion i taget, ingen andra chans mitt i. Det
// ar skalet till att just det har far bara mastartiteln — det ar det enda
// stallet i appen dar man visar att man kan hela texten, inte att man kan
// hitta tillbaka till den.
//
// Allt harinne raknas fram. Ingen modell ar inblandad i vare sig
// poangen, tioraningen eller om titeln star kvar.

export interface PerformanceRules {
  /** Godkanda framforanden som kravs for mastartiteln. */
  runsForMastery: number;
  /** Ordnoggrannhet i procent for att en korning ska raknas. */
  passAccuracy: number;
  /** Dagar utan godkant framforande innan paminnelsen visas. */
  remindAfterDays: number;
  /** Dagar utan godkant framforande innan titeln faller. */
  lapseAfterDays: number;
  /** Sektioner som ryms i ett framforande innan verket delas per del. */
  maxSectionsInOneSitting: number;
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const RULES: PerformanceRules = {
  runsForMastery: envInt("PERFORMANCE_RUNS_FOR_MASTERY", 10),
  passAccuracy:   envInt("PERFORMANCE_PASS_ACCURACY", 85),
  remindAfterDays: envInt("MASTERY_REMIND_AFTER_DAYS", 1),
  // Tre dagar, inte en. En dag betyder att ett missat dygn river tio
  // godkanda framforanden, och att den som bemastrat femton texter maste
  // framfora femton texter varje dag for alltid. Siffran ar en variabel:
  // satt MASTERY_LAPSE_AFTER_DAYS=1 om du vill ha den hardare.
  lapseAfterDays: envInt("MASTERY_LAPSE_AFTER_DAYS", 3),
  maxSectionsInOneSitting: envInt("PERFORMANCE_MAX_SECTIONS", 60),
};

export type MasteryStanding = "none" | "in_progress" | "held" | "at_risk" | "lapsed";

export interface PerformanceStanding {
  /** Godkanda korningar totalt. */
  passed: number;
  /** Hur manga som kravs. */
  required: number;
  /** 0-100, hur langt mot titeln. */
  percent: number;
  standing: MasteryStanding;
  /** Sant nar titeln galler just nu — styr rod ram och tand medalj. */
  isMastered: boolean;
  /** Dagar sedan senaste godkanda framforandet, null om inget finns. */
  daysSinceLastPass: number | null;
  /** Dagar kvar innan titeln faller. Null nar den inte ar i fara. */
  daysUntilLapse: number | null;
  bestAccuracy: number | null;
}

export interface PerformanceRun {
  accuracy:  number;
  passed:    boolean;
  createdAt: Date;
}

function wholeDaysBetween(then: Date, now: Date): number {
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

/**
 * Var nagon star med en text.
 *
 * Titeln kraver bade att tio korningar ar godkanda OCH att den senaste
 * ligger inom fonstret. Det ar hela poangen med den: den beskriver vad
 * man kan nu, inte vad man kunde en gang.
 */
export function standingFor(
  runs: PerformanceRun[],
  now: Date = new Date(),
  rules: PerformanceRules = RULES
): PerformanceStanding {
  const passedRuns = runs.filter(r => r.passed);
  const passed = passedRuns.length;
  const percent = Math.min(100, Math.round((passed / rules.runsForMastery) * 100));

  const bestAccuracy = runs.length
    ? Math.max(...runs.map(r => r.accuracy))
    : null;

  const lastPass = passedRuns.reduce<Date | null>(
    (latest, r) => (!latest || r.createdAt > latest ? r.createdAt : latest),
    null
  );
  const daysSinceLastPass = lastPass ? wholeDaysBetween(lastPass, now) : null;

  if (passed === 0) {
    return {
      passed, required: rules.runsForMastery, percent, standing: "none",
      isMastered: false, daysSinceLastPass, daysUntilLapse: null, bestAccuracy,
    };
  }

  if (passed < rules.runsForMastery) {
    return {
      passed, required: rules.runsForMastery, percent, standing: "in_progress",
      isMastered: false, daysSinceLastPass, daysUntilLapse: null, bestAccuracy,
    };
  }

  // Tio i hamn. Nu handlar det om huruvida den halls vid liv.
  const days = daysSinceLastPass ?? 0;

  if (days >= rules.lapseAfterDays) {
    return {
      passed, required: rules.runsForMastery, percent, standing: "lapsed",
      isMastered: false, daysSinceLastPass, daysUntilLapse: 0, bestAccuracy,
    };
  }

  const daysUntilLapse = rules.lapseAfterDays - days;

  if (days >= rules.remindAfterDays) {
    return {
      passed, required: rules.runsForMastery, percent, standing: "at_risk",
      isMastered: true, daysSinceLastPass, daysUntilLapse, bestAccuracy,
    };
  }

  return {
    passed, required: rules.runsForMastery, percent, standing: "held",
    isMastered: true, daysSinceLastPass, daysUntilLapse, bestAccuracy,
  };
}

/** Raknas den har korningen mot titeln? */
export function isPassingRun(accuracy: number, rules: PerformanceRules = RULES): boolean {
  return accuracy >= rules.passAccuracy;
}

/**
 * Kan verket framforas i ett svep, eller maste det tas del for del?
 *
 * Samma resonemang som pa recitationssidan: att framfora fyratusen
 * sektioner i rad ar varken tekniskt rimligt eller nagot nagon gor.
 */
export function fitsOneSitting(
  sectionCount: number,
  rules: PerformanceRules = RULES
): boolean {
  return sectionCount <= rules.maxSectionsInOneSitting;
}

// ── XP ────────────────────────────────────────────────────────────────
//
// Ett framforande ar dyrare an ett ovningspass i bade tid och nerver, och
// betalar darefter. Belopp skalar med textens langd sa att en sonett och
// en akt inte ger lika mycket.

export const PERFORMANCE_XP = {
  /** Grund for ett godkant framforande. */
  base: 40,
  /** Per sektion i texten, ovanpa grunden. */
  perSection: 3,
  /** Tak, sa att ett enormt verk inte ger orimliga tal. */
  maxPerRun: 400,
  /** Engangsbelopp nar titeln tas for forsta gangen. */
  masteryBonus: 500,
  /** Underkant framforande. Nagot, for att det anda var ett forsok. */
  failed: 5,
} as const;

export function performanceXP(opts: {
  passed:       boolean;
  accuracy:     number;
  sectionCount: number;
  /** Sant bara den korning som tar en over tioraningen. */
  justMastered: boolean;
}): number {
  if (!opts.passed) return PERFORMANCE_XP.failed;

  const earned = Math.min(
    PERFORMANCE_XP.maxPerRun,
    PERFORMANCE_XP.base + opts.sectionCount * PERFORMANCE_XP.perSection
  );

  // Narmare ordagrant ger mer, men bara inom det godkanda spannet.
  const precision = 1 + Math.max(0, (opts.accuracy - RULES.passAccuracy) / 100);

  return Math.round(earned * precision) +
    (opts.justMastered ? PERFORMANCE_XP.masteryBonus : 0);
}

// ── Inlarningskurvan pa ett verk ──────────────────────────────────────

/**
 * Hur langt ett verk kommit, som ett tal mellan 0 och 100.
 *
 * RATTAT beteende: tidigare visade stapeln bara andelen HELT bemastrade
 * sektioner, vilket betyder att den stod kvar pa noll under hela den
 * period da man faktiskt arbetade som mest. Man sag inte att nagot hande.
 *
 * Nu raknas delpoang: varje sektion bidrar med hur langt den kommit, inte
 * bara om den ar klar. Stapeln borjar rora sig vid forsta passet.
 */
const LEVEL_WEIGHT: Record<string, number> = {
  not_started:     0,
  learning:        0.25,
  practicing:      0.5,
  nearly_mastered: 0.8,
  mastered:        1,
};

export function learningProgress(levels: string[]): number {
  if (!levels.length) return 0;
  const sum = levels.reduce((acc, l) => acc + (LEVEL_WEIGHT[l] ?? 0), 0);
  return Math.round((sum / levels.length) * 100);
}
