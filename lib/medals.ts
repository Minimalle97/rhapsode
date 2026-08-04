// lib/medals.ts
// Kontrollera om ett verk är färdigt och dela ut medalj + XP.
//
// ── RÄTTAT ────────────────────────────────────────────────────────────
// Funktionen hämtade tidigare hela verket med `sections: true` — alltså
// varje sektions fulla text — bara för att kolla om alla var bemästrade.
// Och den körs efter VARJE avslutad övning.
//
// Med Divina Commedia i biblioteket lästes hela dikten från databasen
// varje gång du klickade dig igenom en strof. Det är den enskilt dyraste
// frågan i appen, och den kördes oftast.
//
// Nu räknas bara antalet sektioner som inte är klara. Är det noll är
// verket färdigt. En count-fråga i stället för att läsa hem allt.

import { prisma } from "./db";
import { aiGenerateMedalTitle } from "./anthropic";
import { workCompleteXP } from "./xp";

const MASTERED = ["mastered", "permanent"];

export async function checkAndAwardMedal(
  userId: string,
  workId: string
): Promise<{ id: string; title: string; earnedAt: Date } | null> {
  // Finns redan en medalj är vi klara direkt — billigaste kontrollen först
  const existing = await prisma.medal.findFirst({
    where:  { userId, workId },
    select: { id: true },
  });
  if (existing) return null;

  const work = await prisma.work.findFirst({
    where:  { id: workId, userId },
    select: { id: true, title: true, author: true },
  });
  if (!work) return null;

  const [remaining, total] = await Promise.all([
    prisma.section.count({
      where: { workId, status: { notIn: MASTERED } },
    }),
    prisma.section.count({ where: { workId } }),
  ]);

  // Inte klart än — eller ett tomt verk, som inte förtjänar en medalj
  if (remaining > 0 || total === 0) return null;

  let medalTitle: string;
  try {
    medalTitle = await aiGenerateMedalTitle(work.title, work.author);
  } catch {
    medalTitle = `Bearer of ${work.title}`;
  }

  // XP skalar med verkets storlek — en sonett och Odysséen är inte
  // samma bedrift
  const reward = workCompleteXP(total);

  const [medal] = await prisma.$transaction([
    prisma.medal.create({
      data:   { userId, workId, title: medalTitle },
      select: { id: true, title: true, earnedAt: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data:  { xp: { increment: reward } },
    }),
  ]);

  return medal;
}
