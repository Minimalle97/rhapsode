// lib/medals.ts
//
// XP nar ett helt verk sitter enligt SM-2.
//
// ── RATTAT: har delades en medalj ut for fel sak ──────────────────────
//
// Funktionen hette tidigare checkAndAwardMedal och gjorde precis det: nar
// alla sektioner natt "mastered" i SM-2 skapades en guldmedalj och verket
// kallades bemastrat.
//
// Det var fel, och det syntes: ett verk kunde sta som "Mastered" med en
// medalj pa profilen medan raknaren bredvid sade "0 of 10 performances".
// Tva olika saker hette samma sak. SM-2 mater att man klarat sektionerna
// var for sig, med ledtradar, i sin egen takt. Mastartiteln ska sta for
// nagot mycket hardare — hela verket ur minnet, tio ganger, over 85 %.
//
// Nu finns bara EN vag till titeln och medaljen: Performance Mode, via
// syncMedal() i lib/performanceStore.ts. Den medaljen ar rod, den kan
// falla om man slutar framfora verket, och den betyder darfor nagot.
//
// XP:n star kvar. Att fa varje sektion att sitta ar ett riktigt arbete och
// ska betala — det ar bara ordet "bemastrad" och medaljen som var for
// mycket lovat.

import { prisma } from "./db";
import { workCompleteXP } from "./xp";

/**
 * Delar ut XP forsta gangen alla sektioner i ett verk sitter.
 *
 * Idempotent via AnalyticsEvent: samma verk betalar en gang. Utan den
 * kontrollen betalade varje ovningspass om igen sa lange verket stod
 * kvar som fardigt.
 *
 * Rakningen ar billig med flit — den kors efter VARJE avslutad ovning.
 * En count-fraga i stallet for att lasa hem hela texten.
 */
export async function awardWorkCompletionXP(
  userId: string,
  workId: string
): Promise<{ xp: number; workTitle: string } | null> {
  const work = await prisma.work.findFirst({
    where:  { id: workId, userId },
    select: { id: true, title: true },
  });
  if (!work) return null;

  const [remaining, total] = await Promise.all([
    prisma.section.count({
      where: { workId, status: { notIn: MASTERED } },
    }),
    prisma.section.count({ where: { workId } }),
  ]);

  // Inte klart an — eller ett tomt verk, som inte fortjanar nagot.
  if (remaining > 0 || total === 0) return null;

  // Har det redan betalats? Handelsen ar kvittot.
  const already = await prisma.analyticsEvent.findFirst({
    where: { userId, name: EVENT, props: { path: ["workId"], equals: workId } },
    select: { id: true },
  });
  if (already) return null;

  const xp = workCompleteXP(total);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data:  { xp: { increment: xp } },
    }),
    prisma.analyticsEvent.create({
      data: { userId, name: EVENT, props: { workId, sections: total, xp } },
    }),
  ]);

  return { xp, workTitle: work.title };
}

const MASTERED = ["mastered", "permanent"];

/** Kvittot pa att ett verk redan betalat sin slutbonus. */
const EVENT = "work_sections_complete";
