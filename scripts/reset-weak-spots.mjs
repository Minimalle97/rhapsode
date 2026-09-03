// scripts/reset-weak-spots.mjs
//
// Nollstaller den insamlade svagheten for markeringen i laslaget.
//
// ── Nar man behover den ───────────────────────────────────────────────
//
// Ett trasigt framforande — en inspelning som klipptes av, en mikrofon
// som inte var pa — gav tidigare ett forsok dar nastan varje ord raknades
// som missat. Tva sadana rackte for att mala en hel dikt orange, aven om
// de riktiga forsoken lag pa attio och nittio procent.
//
// Golvet i lib/weakSpots.ts (carriesSignal) stoppar nya sadana forsok.
// Rader som redan hunnit bli forgiftade star dock kvar tills de dampats
// ut av manga bra korningar, och det tar tid. Det har skriptet tommer dem
// i stallet, sa att markeringen borjar om fran nasta rattade forsok.
//
// Kors:
//
//   npm run weakspots:reset          — visar vad som skulle raderas
//   npm run weakspots:reset -- --yes — raderar
//
// Det som raderas ar HARLEDD data. Inga ovningspass, inga poang, ingen XP
// och inga medaljer ror sig — bara den ordvisa statistik som markeringen
// raknas ur, och den byggs upp igen av sig sjalv.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRMED = process.argv.includes("--yes");

async function main() {
  const rows = await prisma.sectionWeakness.findMany({
    select: {
      id: true, attempts: true, words: true,
      section: { select: { name: true, work: { select: { title: true } } } },
    },
  });

  if (rows.length === 0) {
    console.log("Nothing stored — the highlighting has no history to clear.");
    return;
  }

  console.log(`${rows.length} section(s) with weak-spot history:\n`);

  for (const r of rows) {
    const words = r.words && typeof r.words === "object" ? r.words : {};
    const cells = Object.values(words).filter(v => Array.isArray(v) && v[1] > 0);
    const weak  = cells.filter(v => v[0] / v[1] >= 0.2).length;
    const share = cells.length ? Math.round((weak / cells.length) * 100) : 0;

    console.log(
      `  ${r.section.work.title} · ${r.section.name}` +
      `  — ${cells.length} words, ${share}% marked weak, ${r.attempts.toFixed(2)} attempts` +
      (share > 60 ? "   <- looks poisoned" : "")
    );
  }

  if (!CONFIRMED) {
    console.log("\nNothing was deleted. Re-run with --yes to clear it:");
    console.log("  npm run weakspots:reset -- --yes");
    return;
  }

  const { count } = await prisma.sectionWeakness.deleteMany({});
  console.log(`\nCleared ${count} row(s). The highlighting starts again from your next marked attempt.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
