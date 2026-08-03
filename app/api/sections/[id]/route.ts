// app/api/sections/[id]/route.ts
//
// PATCH  — redigera en sektions namn eller text
// DELETE — ta bort en sektion
// POST   — dela en sektion i två, eller slå ihop med nästa
//
// Varför det behövs: PDF-extraktion är inte perfekt. En strof kan delas
// mitt itu, en sidfot kan följa med in i texten, en rubrik kan hamna i
// fel sektion. Utan möjlighet att rätta är enda utvägen att radera hela
// verket och börja om — och då blir det inte gjort.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Kontrollerar att sektionen tillhör den inloggade användaren. */
async function owned(sectionId: string, userId: string) {
  return prisma.section.findFirst({
    where:  { id: sectionId, work: { userId } },
    select: {
      id: true, workId: true, partId: true,
      name: true, content: true, orderIndex: true,
    },
  });
}

// ── Redigera ──────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const section = await owned(id, user.id);
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { name, content } = await req.json();

    const data: { name?: string; content?: string } = {};
    if (typeof name === "string" && name.trim()) {
      data.name = name.trim().slice(0, 120);
    }
    if (typeof content === "string") {
      if (!content.trim()) {
        return NextResponse.json({ error: "Text cannot be empty" }, { status: 400 });
      }
      data.content = content;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.section.update({
      where:  { id },
      data,
      select: { id: true, name: true, content: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return fail(err);
  }
}

// ── Ta bort ───────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const section = await owned(id, user.id);
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.section.delete({ where: { id } });

    // Stäng luckan i ordningen
    await prisma.section.updateMany({
      where: { workId: section.workId, orderIndex: { gt: section.orderIndex } },
      data:  { orderIndex: { decrement: 1 } },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}

// ── Dela eller slå ihop ───────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const section = await owned(id, user.id);
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { action, splitAt } = await req.json();

    // ── Dela i två vid en teckenposition ──────────────────────────
    if (action === "split") {
      const at = Number(splitAt);
      if (!Number.isFinite(at) || at <= 0 || at >= section.content.length) {
        return NextResponse.json(
          { error: "Split point must fall inside the text" },
          { status: 400 }
        );
      }

      const first  = section.content.slice(0, at).trim();
      const second = section.content.slice(at).trim();

      if (!first || !second) {
        return NextResponse.json(
          { error: "Both halves must contain text" },
          { status: 400 }
        );
      }

      // Gör plats efter den här sektionen
      await prisma.section.updateMany({
        where: { workId: section.workId, orderIndex: { gt: section.orderIndex } },
        data:  { orderIndex: { increment: 1 } },
      });

      const [updated, created] = await prisma.$transaction([
        prisma.section.update({
          where: { id },
          data:  { content: first },
          select: { id: true, name: true, content: true },
        }),
        prisma.section.create({
          data: {
            workId:     section.workId,
            partId:     section.partId,
            name:       `${section.name}b`,
            content:    second,
            orderIndex: section.orderIndex + 1,
          },
          select: { id: true, name: true, content: true },
        }),
      ]);

      return NextResponse.json({ split: true, first: updated, second: created });
    }

    // ── Slå ihop med nästa sektion ────────────────────────────────
    if (action === "mergeNext") {
      const next = await prisma.section.findFirst({
        where:   {
          workId:     section.workId,
          partId:     section.partId,
          orderIndex: { gt: section.orderIndex },
        },
        orderBy: { orderIndex: "asc" },
        select:  { id: true, content: true, orderIndex: true },
      });

      if (!next) {
        return NextResponse.json(
          { error: "This is the last section here" },
          { status: 400 }
        );
      }

      const merged = `${section.content.trimEnd()}\n\n${next.content.trimStart()}`;

      await prisma.$transaction([
        prisma.section.update({ where: { id }, data: { content: merged } }),
        prisma.section.delete({ where: { id: next.id } }),
      ]);

      await prisma.section.updateMany({
        where: { workId: section.workId, orderIndex: { gt: next.orderIndex } },
        data:  { orderIndex: { decrement: 1 } },
      });

      return NextResponse.json({ merged: true, content: merged });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : "Unknown error";
  if (msg === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: msg }, { status: 500 });
}
