// app/api/works/[id]/sections/route.ts
//
// Massåtgärder på ett verks sektioner.
//
// ── Rättat ────────────────────────────────────────────────────────────
// Renumreringen körde tidigare en UPDATE per sektion i en enda
// transaktion. I ett verk med några tusen sektioner blev det några tusen
// frågor på en gång — den hann aldrig klart, och anropet dog.
//
// Nu görs det i ett enda SQL-uttryck som räknar om ordningen i databasen.
// Samma resultat, en fråga i stället för tusentals.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const maxDuration = 60;

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

    // ── Numrera om i ett enda uttryck ───────────────────────────────
    // ROW_NUMBER ger den nya ordningen; bara rader som faktiskt ändras
    // skrivs, vilket gör det billigt även i stora verk.
    await prisma.$executeRaw`
      WITH ordered AS (
        SELECT id,
               (ROW_NUMBER() OVER (ORDER BY "orderIndex" ASC, "createdAt" ASC) - 1)::int AS rn
        FROM "Section"
        WHERE "workId" = ${workId}
      )
      UPDATE "Section" s
      SET "orderIndex" = o.rn
      FROM ordered o
      WHERE s.id = o.id
        AND s."orderIndex" <> o.rn
    `;

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

    const remaining = await prisma.section.count({ where: { workId } });

    return NextResponse.json({
      removed,
      remaining,
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
