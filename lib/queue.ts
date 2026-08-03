// lib/queue.ts
// Dagens kö.
//
// Problemet den löser: för att repetera något var du tvungen att veta
// vilket verk som hade något förfallet, klicka dig in i det, hitta rätt
// del och sedan rätt sektion. Fyra steg innan du fick börja. Ingen gör
// det varje dag.
//
// En kö tar bort navigeringen helt. Du får veta att det finns fjorton
// saker att göra, och du gör dem.
//
// ── Om blandningen ────────────────────────────────────────────────────
// Kön blandar avsiktligt mellan verk. Att köra ett verk i taget känns
// ordnat men lär sämre — när nästa rad alltid kommer ur samma text
// känner du igen den i stället för att hämta den. Omväxling tvingar fram
// hämtningen. Det är samma sak som gör att det är svårare, och därför
// bättre.

export interface QueueItem {
  id:         string;
  name:       string;
  content:    string;
  status:     string;
  nextReview: Date | null;
  overdueDays: number;
  work: { id: string; title: string; author: string };
  part: { id: string; name: string } | null;
}

export interface QueueSummary {
  due:        number;
  fresh:      number;
  total:      number;
  works:      number;
  mostOverdue: number;
}

/**
 * Flätar samman poster så att två i rad sällan kommer från samma verk.
 *
 * Round robin över verken: ta en från varje i tur och ordning tills alla
 * är slut. Det ger största möjliga avstånd mellan poster ur samma text
 * utan att någon post hamnar sist bara för att den råkade tillhöra ett
 * stort verk.
 */
export function interleave(items: QueueItem[]): QueueItem[] {
  const byWork = new Map<string, QueueItem[]>();

  for (const item of items) {
    const list = byWork.get(item.work.id) ?? [];
    list.push(item);
    byWork.set(item.work.id, list);
  }

  // Inom varje verk: mest försenat först
  for (const list of byWork.values()) {
    list.sort((a, b) => b.overdueDays - a.overdueDays);
  }

  // Verk med flest poster får gå först i varvet, så att inget verk
  // blir liggande på slutet
  const queues = [...byWork.values()].sort((a, b) => b.length - a.length);

  const out: QueueItem[] = [];
  let placed = 0;
  const total = items.length;

  while (placed < total) {
    let movedThisRound = false;
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        out.push(next);
        placed += 1;
        movedThisRound = true;
      }
    }
    if (!movedThisRound) break;
  }

  return out;
}

/** Dagar försenad. Negativt betyder inte förfallen än. */
export function overdueDays(nextReview: Date | null, now: Date): number {
  if (!nextReview) return 0;
  return Math.floor(
    (now.getTime() - new Date(nextReview).getTime()) / 86_400_000
  );
}

export function summarise(items: QueueItem[]): QueueSummary {
  const works = new Set(items.map(i => i.work.id));
  return {
    due:   items.filter(i => i.nextReview !== null).length,
    fresh: items.filter(i => i.nextReview === null).length,
    total: items.length,
    works: works.size,
    mostOverdue: items.reduce((max, i) => Math.max(max, i.overdueDays), 0),
  };
}
