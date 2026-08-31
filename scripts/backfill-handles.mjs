// scripts/backfill-handles.mjs
//
// Fyller i User.handleLower for de rader som satte sitt handtag innan
// kolumnen fanns.
//
// Bakgrunden: unikheten flyttades fran `handle` till `handleLower` sa att
// "Casper" och "casper" inte skulle kunna bli tva konton. Kolumnen lades
// till, men ingen skrev tillbaka de rader som redan fanns. Foljden var att
// varje uppslagning — profilsidan, vanforfragan pa handtag — gick mot en
// tom kolumn och inte hittade nagon.
//
// Kors en gang per miljo:
//
//   npm run handles:backfill
//
// Idempotent: rader som redan har kolumnen ifylld ror den inte.
// Kolliderar tva rader pa gemenformen lamnas bada orörda och skrivs ut —
// det ar tva konton som gor ansprak pa samma namn, och vilket som ska fa
// det ar inte ett skripts beslut.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.user.findMany({
    where:  { handle: { not: null }, handleLower: null },
    select: { id: true, username: true, handle: true },
  });

  if (rows.length === 0) {
    console.log("Nothing to do — every handle already has its lowercase form.");
    return;
  }

  console.log(`${rows.length} handle(s) without a lowercase form.\n`);

  // Kollisioner forst, innan nagot skrivs. En unik-krock mitt i loopen
  // hade lamnat halva tabellen fixad och halva inte.
  const seen = new Map();
  const clashes = [];

  for (const r of rows) {
    const lower = r.handle.toLowerCase();
    const first = seen.get(lower);
    if (first) clashes.push([first, r, lower]);
    else seen.set(lower, r);
  }

  const takenRows = await prisma.user.findMany({
    where:  { handleLower: { in: [...seen.keys()] } },
    select: { id: true, handle: true, handleLower: true },
  });
  for (const t of takenRows) {
    const mine = seen.get(t.handleLower);
    if (mine && mine.id !== t.id) clashes.push([t, mine, t.handleLower]);
  }

  if (clashes.length > 0) {
    console.error("Two accounts claim the same handle. Nothing was written.\n");
    for (const [a, b, lower] of clashes) {
      console.error(`  @${lower}: ${a.id} (@${a.handle}) vs ${b.id} (@${b.handle})`);
    }
    console.error("\nRename one of them by hand, then run this again.");
    process.exitCode = 1;
    return;
  }

  let done = 0;
  for (const r of rows) {
    await prisma.user.update({
      where: { id: r.id },
      data:  { handleLower: r.handle.toLowerCase() },
    });
    console.log(`  @${r.handle} → ${r.handle.toLowerCase()}   (${r.username})`);
    done += 1;
  }

  console.log(`\n${done} handle(s) filled in.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
