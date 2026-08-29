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
import { runAi } from "./ai/run";
import { workCompleteXP } from "./xp";
import type { Entitlements } from "./billing/entitlements";

const MASTERED = ["mastered", "permanent"];

export async function checkAndAwardMedal(
  userId: string,
  workId: string,
  ent?: Entitlements
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

  // Sex ord när ett helt verk sitter. Går genom runAi() som allt annat,
  // men räknas inte mot någons månadskvot — det är appens eget påhitt,
  // inte något användaren bett om. Cachen delas på titel och författare,
  // så alla som lär sig Invictus kostar ett enda anrop tillsammans.
  let medalTitle = `Bearer of ${work.title}`;
  if (ent) {
    try {
      const generated = await runAi<{ title: string }>({
        userId,
        ent,
        feature: "medal_title",
        cacheInput: { title: work.title, author: work.author },
        build: () => ({
          prompt:
            `Give a four-to-six word honorific for someone who has committed ` +
            `"${work.title}" by ${work.author} entirely to memory. Archaic, dignified, ` +
            `classical. Examples: "Reciter of the Iliad", "Keeper of Hamlet's Words". ` +
            `Return only the title.`,
          maxTokens: 60,
        }),
        parse: raw => {
          const title = raw.trim().replace(/^["']|["']$/g, "").slice(0, 80);
          return title ? { title } : null;
        },
        fallback: () => ({ title: `Bearer of ${work.title}` }),
      });
      medalTitle = generated.data.title;
    } catch {
      // Behåll reservtiteln. En medalj ska delas ut även utan modellen.
    }
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
