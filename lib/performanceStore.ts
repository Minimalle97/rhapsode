// lib/performanceStore.ts
//
// Databassidan av Performance Mode. De rena reglerna bor i
// lib/performance.ts; har ligger bara lasning, skrivning och den lata
// avstamningen av mastartitlar.
//
// Titeln stams av latt — nar nagon tittar — i stallet for av ett
// schemalagt jobb. Appen har ingen schemalaggare, och en titel som fallit
// men ingen sett annu har inte gjort nagon skada.

import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { recordMilestone } from "@/lib/posts";
import {
  standingFor, isPassingRun, performanceXP, RULES,
  type PerformanceStanding,
} from "./performance";

export interface RecordRunInput {
  userId:   string;
  workId:   string;
  partId?:  string | null;
  accuracy: number;
  hesitations?:    number;
  missedSections?: number;
  durationSecs?:   number;
  longestPauseMs?: number;
  rhythmScore?:    number | null;
  detail?: Record<string, unknown> | null;
}

export interface RecordRunResult {
  passed:       boolean;
  accuracy:     number;
  xpEarned:     number;
  standing:     PerformanceStanding;
  justMastered: boolean;
  isBest:       boolean;
}

/** Alla framforanden for ett verk, nyast forst. */
async function runsFor(userId: string, workId: string) {
  return prisma.performance.findMany({
    where:   { userId, workId },
    orderBy: { createdAt: "desc" },
    select:  { accuracy: true, passed: true, createdAt: true },
  });
}

export async function standingForWork(
  userId: string,
  workId: string,
  now: Date = new Date()
): Promise<PerformanceStanding> {
  return standingFor(await runsFor(userId, workId), now);
}

/**
 * Standing for manga verk pa en gang, for biblioteket.
 *
 * En fraga totalt, inte en per kort. Med trettio verk i biblioteket ar
 * skillnaden mellan en sida som kanns direkt och en som inte gor det.
 */
export async function standingsForWorks(
  userId: string,
  workIds: string[],
  now: Date = new Date()
): Promise<Map<string, PerformanceStanding>> {
  const out = new Map<string, PerformanceStanding>();
  if (!workIds.length) return out;

  const rows = await prisma.performance.findMany({
    where:   { userId, workId: { in: workIds } },
    orderBy: { createdAt: "desc" },
    select:  { workId: true, accuracy: true, passed: true, createdAt: true },
  });

  const byWork = new Map<string, { accuracy: number; passed: boolean; createdAt: Date }[]>();
  for (const r of rows) {
    const list = byWork.get(r.workId) ?? [];
    list.push(r);
    byWork.set(r.workId, list);
  }

  for (const id of workIds) out.set(id, standingFor(byWork.get(id) ?? [], now));
  return out;
}

/**
 * Tander, slacker eller later medaljen vara.
 *
 * Medaljen raderas aldrig. En slocknad medalj ar historik — nagon gjorde
 * faktiskt tio godkanda framforanden — och att stryka det for att de
 * missat tre dagar vore att ljuga om vad som hant.
 */
export async function syncMedal(
  userId: string,
  workId: string,
  workTitle: string,
  standing: PerformanceStanding
): Promise<{ changed: boolean; awarded: boolean; lost: boolean }> {
  const medal = await prisma.medal.findFirst({
    where:  { userId, workId, kind: "performance" },
    select: { id: true, lostAt: true },
  });

  if (standing.isMastered) {
    if (!medal) {
      await prisma.medal.create({
        data: {
          userId, workId, kind: "performance",
          // Deterministisk titel. Ingen modell behovs for sex ord, och
          // den ska se likadan ut for alla som klarat samma text.
          title: `Reciter of ${workTitle}`,
        },
      });
      return { changed: true, awarded: true, lost: false };
    }
    if (medal.lostAt) {
      await prisma.medal.update({ where: { id: medal.id }, data: { lostAt: null } });
      return { changed: true, awarded: true, lost: false };
    }
    return { changed: false, awarded: false, lost: false };
  }

  // Inte bemastrad just nu. Slack en tand medalj.
  if (medal && !medal.lostAt && standing.standing === "lapsed") {
    await prisma.medal.update({
      where: { id: medal.id },
      data:  { lostAt: new Date() },
    });
    return { changed: true, awarded: false, lost: true };
  }

  return { changed: false, awarded: false, lost: false };
}

/** Skriver ned ett framforande och allt som foljer av det. */
export async function recordRun(input: RecordRunInput): Promise<RecordRunResult> {
  const work = await prisma.work.findFirst({
    where:  { id: input.workId, userId: input.userId },
    select: { id: true, title: true, _count: { select: { sections: true } } },
  });
  if (!work) throw new Error("Not found");

  const accuracy = Math.max(0, Math.min(100, Math.round(input.accuracy)));
  const passed   = isPassingRun(accuracy);

  const before = await standingForWork(input.userId, input.workId);

  const best = await prisma.performance.findFirst({
    where:   { userId: input.userId, workId: input.workId },
    orderBy: { accuracy: "desc" },
    select:  { id: true, accuracy: true },
  });
  const isBest = !best || accuracy > best.accuracy;

  await prisma.performance.create({
    data: {
      userId:         input.userId,
      workId:         input.workId,
      partId:         input.partId ?? null,
      accuracy,
      passed,
      hesitations:    input.hesitations ?? 0,
      missedSections: input.missedSections ?? 0,
      durationSecs:   input.durationSecs ?? 0,
      longestPauseMs: input.longestPauseMs ?? null,
      rhythmScore:    input.rhythmScore ?? null,
      isBest,
      detail:         (input.detail ?? undefined) as object | undefined,
    },
  });

  // Bara ett framforande i taget far bara "basta" flaggan.
  if (isBest && best) {
    await prisma.performance.updateMany({
      where: { userId: input.userId, workId: input.workId, isBest: true, accuracy: { lt: accuracy } },
      data:  { isBest: false },
    });
  }

  const after = await standingForWork(input.userId, input.workId);
  const justMastered = !before.isMastered && after.isMastered;

  const xpEarned = performanceXP({
    passed,
    accuracy,
    sectionCount: work._count.sections,
    justMastered,
  });

  await prisma.user.update({
    where: { id: input.userId },
    data:  { xp: { increment: xpEarned } },
  });

  await syncMedal(input.userId, input.workId, work.title, after);

  // Milstolpen skrivs bara nar titeln tands forsta gangen, inte vid
  // varje godkant framforande — annars vore vannernas flode en logg.
  //
  // Verkets titel skickas INTE med. Inlagget pekar pa verket, och
  // lib/posts avgor vid lasningen om det far namnges. Sa slipper en
  // gammal rad ligga kvar och namnge nagot som sedan gjorts privat.
  if (justMastered) {
    await recordMilestone(input.userId, input.workId, "Performed a work from memory");
  }

  await track("recitation_completed", input.userId, {
    passed, accuracy, justMastered, sections: work._count.sections,
  });

  return { passed, accuracy, xpEarned, standing: after, justMastered, isBest };
}

// ── Paminnelsen ───────────────────────────────────────────────────────

export interface MasteryAlert {
  workId:   string;
  title:    string;
  standing: PerformanceStanding;
}

/**
 * Verk dar titeln ar i fara eller nyss fallit.
 *
 * Stammer av medaljerna pa vagen, sa att en slocknad titel blir slocknad
 * aven i databasen forsta gangen nagon tittar.
 */
export async function masteryAlerts(
  userId: string,
  now: Date = new Date()
): Promise<{ atRisk: MasteryAlert[]; lapsed: MasteryAlert[] }> {
  const medals = await prisma.medal.findMany({
    where:   { userId, kind: "performance" },
    select:  { workId: true, work: { select: { title: true } } },
  });

  const atRisk: MasteryAlert[] = [];
  const lapsed: MasteryAlert[] = [];
  if (!medals.length) return { atRisk, lapsed };

  const standings = await standingsForWorks(userId, medals.map(m => m.workId), now);

  for (const m of medals) {
    const standing = standings.get(m.workId);
    if (!standing) continue;

    if (standing.standing === "at_risk") {
      atRisk.push({ workId: m.workId, title: m.work.title, standing });
    } else if (standing.standing === "lapsed") {
      lapsed.push({ workId: m.workId, title: m.work.title, standing });
      // Slack medaljen medan vi anda ar har.
      await syncMedal(userId, m.workId, m.work.title, standing);
    }
  }

  return { atRisk, lapsed };
}

export { RULES };
