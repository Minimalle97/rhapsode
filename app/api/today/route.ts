// app/api/today/route.ts
// GET /api/today?fresh=5
//
// Allt som är dags att repetera idag, tvärs över alla verk, flätat så
// att två i rad sällan kommer ur samma text.
//
// `fresh` styr hur många nya sektioner som får fyllas på med om kön är
// tom eller kort. Repetition går alltid före nytt material — att lära in
// mer när man håller på att tappa det man redan har är hur samlingar
// faller isär.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { interleave, overdueDays, summarise, type QueueItem } from "@/lib/queue";

export const dynamic = "force-dynamic";

const MAX_DUE = 120;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const freshWanted = Math.min(
      20,
      Math.max(0, Number(searchParams.get("fresh") ?? 5) || 0)
    );

    const now = new Date();

    const select = {
      id: true, name: true, content: true, status: true, nextReview: true,
      work: { select: { id: true, title: true, author: true } },
      part: { select: { id: true, name: true } },
    };

    // Förfallna först
    const dueRows = await prisma.section.findMany({
      where: {
        work: { userId: user.id },
        nextReview: { lte: now },
      },
      orderBy: { nextReview: "asc" },
      take: MAX_DUE,
      select,
    });

    // Fyll på med nytt material bara om det finns utrymme
    const room = Math.max(0, freshWanted - Math.floor(dueRows.length / 4));

    // RÄTTAT: nytt material togs tidigare med orderBy workId — och eftersom
    // cuid växer med tiden betydde det ALLTID det äldsta verket först. Kön
    // fylldes med det du laddade upp först och kom aldrig vidare till resten
    // förrän det verket var slut. Nu varvas verken runt.
    const freshRows: typeof dueRows = [];
    if (room > 0) {
      const worksWithFresh = await prisma.work.findMany({
        where: {
          userId:   user.id,
          sections: { some: { status: "not_started", nextReview: null } },
        },
        orderBy: { createdAt: "asc" },
        select:  { id: true },
      });

      const perWork = await Promise.all(
        worksWithFresh.map(w =>
          prisma.section.findMany({
            where:   { workId: w.id, status: "not_started", nextReview: null },
            orderBy: { orderIndex: "asc" },
            take:    room,
            select,
          })
        )
      );

      // En från varje verk i tur och ordning tills kvoten är fylld
      for (let depth = 0; freshRows.length < room; depth++) {
        let movedThisRound = false;
        for (const list of perWork) {
          if (depth >= list.length) continue;
          freshRows.push(list[depth]);
          movedThisRound = true;
          if (freshRows.length >= room) break;
        }
        if (!movedThisRound) break;
      }
    }

    const toItem = (r: (typeof dueRows)[number]): QueueItem => ({
      id:          r.id,
      name:        r.name,
      content:     r.content,
      status:      r.status,
      nextReview:  r.nextReview,
      overdueDays: overdueDays(r.nextReview, now),
      work:        r.work,
      part:        r.part,
    });

    const items = interleave([...dueRows, ...freshRows].map(toItem));

    return NextResponse.json({
      items,
      summary: summarise(items),
      streakDays: user.streakDays,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
