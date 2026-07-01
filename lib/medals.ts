// lib/medals.ts
// Kontrollera om ett verk är färdigt och tilldela medalj + XP

import { prisma } from "./db";
import { aiGenerateMedalTitle } from "./anthropic";
import { XP_TABLE } from "./xp";

/**
 * Anropas efter varje träningssession.
 * Om alla sektioner i verket är mastered/permanent
 * och ingen medalj finns sedan tidigare → skapa medalj + ge XP.
 * Returnerar den nya medaljen om en delades ut, annars null.
 */
export async function checkAndAwardMedal(
  userId: string,
  workId: string
): Promise<{ id: string; title: string; earnedAt: Date } | null> {
  const work = await prisma.work.findFirst({
    where:   { id: workId, userId },
    include: { sections: true, medals: { where: { userId } } },
  });

  if (!work) return null;

  // Medalj finns redan
  if (work.medals.length > 0) return null;

  // Inte alla sektioner klara
  const allDone = work.sections.every(s =>
    s.status === "mastered" || s.status === "permanent"
  );
  if (!allDone) return null;

  // Generera titeln med AI
  let medalTitle: string;
  try {
    medalTitle = await aiGenerateMedalTitle(work.title, work.author);
  } catch {
    medalTitle = `Bearer of ${work.title}`;
  }

  // Skapa medalj + ge XP i en transaktion
  const [medal] = await prisma.$transaction([
    prisma.medal.create({
      data: { userId, workId, title: medalTitle },
    }),
    prisma.user.update({
      where: { id: userId },
      data:  { xp: { increment: XP_TABLE.work_completed } },
    }),
  ]);

  return medal;
}
