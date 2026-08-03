// app/api/works/[id]/sections/route.ts
//
// Massåtgärder på ett verks sektioner.
//
// Varför: en inskannad utgåva har ofta trettio sidor förord, redaktionella
// noter och textkritik före själva verket. Att rensa det en sektion i taget
// är inte rimligt. Här kan du säga "verket börjar här" och allt före
// försvinner.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id: workId } = await params;
    const user = await requireUser();

    const work = await prisma.work.findFirst({
      where:  { id: workId, userId: user.id },
      select: { id: true },
    });
    if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { action, ids, sectionId } = await req.json();

    let removed = 0;

    switch (action) {
      // ── Ta bort utvalda ─────────────────────────────────────────
      case "deleteMany": {
        if (!Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json({ error: "Nothing selected" }, { status: 400 });
        }
        const res = await prisma.section.deleteMany({
          where: { workId, id: { in: ids } },
        });
        removed = res.count;
        break;
      }

      // ── Verket börjar här — släng allt före ─────────────────────
      case "trimBefore": {
        const anchor = await prisma.section.findFirst({
          where:  { id: sectionId, workId },
          select: { orderIndex: true },
        });
        if (!anchor) {
          return NextResponse.json({ error: "Section not found" }, { status: 404 });
        }
        const res = await prisma.section.deleteMany({
          where: { workId, orderIndex: { lt: anchor.orderIndex } },
        });
        removed = res.count;
        break;
      }

      // ── Verket slutar här — släng allt efter ────────────────────
      case "trimAfter": {
        const anchor = await prisma.section.findFirst({
          where:  { id: sectionId, workId },
          select: { orderIndex: true },
        });
        if (!anchor) {
          return NextResponse.json({ error: "Section not found" }, { status: 404 });
        }
        const res = await prisma.section.deleteMany({
          where: { workId, orderIndex: { gt: anchor.orderIndex } },
        });
        removed = res.count;
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // ── Städa upp efter borttagningen ───────────────────────────────
    // Numrera om så att ordningen inte har luckor
    const rest = await prisma.section.findMany({
      where:   { workId },
      orderBy: { orderIndex: "asc" },
      select:  { id: true },
    });

    await prisma.$transaction(
      rest.map((s, i) =>
        prisma.section.update({ where: { id: s.id }, data: { orderIndex: i } })
      )
    );

    // Delar som blivit tomma tjänar inget syfte
    const emptyParts = await prisma.part.findMany({
      where:  { workId, sections: { none: {} } },
      select: { id: true },
    });
    if (emptyParts.length) {
      await prisma.part.deleteMany({
        where: { id: { in: emptyParts.map(p => p.id) } },
      });
    }

    return NextResponse.json({
      removed,
      remaining:    rest.length,
      partsRemoved: emptyParts.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
