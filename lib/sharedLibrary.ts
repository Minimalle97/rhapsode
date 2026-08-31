// lib/sharedLibrary.ts
//
// Vad en van far se av nagon annans bibliotek, och hur langt de kommit.
//
// Ligger separat fran lib/friends.ts med flit. Vanskapen behovs for att
// avgora VEM som far se; framstegen kommer fran performanceStore, som i
// sin tur skriver milstolpar via lib/posts, som fragar lib/friends vem
// som ar van. La den har funktionen i friends.ts slot cirkeln sig, och en
// cirkel mellan moduler ar den sortens fel som visar sig forst i drift.

import { prisma } from "./db";
import { workMastery, type MasteryLevel } from "./mastery";
import { standingsForWorks } from "./performanceStore";
import type { PerformanceStanding } from "./performance";


export interface SharedWork {
  id:      string;
  title:   string;
  author:  string;
  type:    string;
  /** Hur langt de kommit, 0-100. Andelen sektioner som sitter. */
  percent:  number;
  level:    MasteryLevel;
  sections: number;
  /** Framforandena: hur manga godkanda, och om titeln lyser. */
  standing: PerformanceStanding;
}

/**
 * Verken en van far se, med hur langt de kommit i vart och ett.
 *
 * Synligheten ar det forsta som avgors, inte det sista: `where` slapper
 * bara igenom publika verk om det inte ar ens egen profil. Skulle en
 * senare andring rora ordningen ar det den kontrollen som maste behallas.
 *
 * Sektionernas NAMN och TEXT hamtas aldrig. Att nagon kommit halvvags ar
 * ett framsteg att visa upp; att de fastnat pa rad fyra i tredje sangen
 * ar det inte.
 */
export async function sharedLibrary(
  personId: string,
  includePrivate: boolean,
  take = 24
): Promise<SharedWork[]> {
  const works = await prisma.work.findMany({
    where:   { userId: personId, ...(includePrivate ? {} : { visibility: "public" }) },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, title: true, author: true, type: true,
      sections: { select: { status: true, sm2Reps: true, sm2Interval: true } },
    },
  });

  const standings = await standingsForWorks(personId, works.map(w => w.id));

  return works.map(w => {
    const m = workMastery(w.sections);
    return {
      id:       w.id,
      title:    w.title,
      author:   w.author,
      type:     w.type,
      percent:  m.percent,
      level:    m.level,
      sections: m.total,
      standing: standings.get(w.id)!,
    };
  });
}
