// app/api/works/route.ts
// GET  /api/works  → lista verk för inloggad användare
//                    Fas 5: stödjer nu sök/filter via querystring:
//                    ?q=&type=&tag=&difficulty=&status=&collection=
// POST /api/works  → skapa nytt verk med sektioner

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { assertWorkAllowance } from "@/lib/billing/limits";
import { toResponse } from "@/lib/http/guard";
import { prisma } from "@/lib/db";
import { buildWorkWhere } from "@/lib/works";
import type { CreateWorkPayload, LibraryFilters } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);

    const filters: LibraryFilters = {
      q:            searchParams.get("q")          ?? undefined,
      type:         (searchParams.get("type")       ?? undefined) as LibraryFilters["type"],
      tag:          searchParams.get("tag")         ?? undefined,
      difficulty:   (searchParams.get("difficulty") ?? undefined) as LibraryFilters["difficulty"],
      status:       (searchParams.get("status")     ?? undefined) as LibraryFilters["status"],
      collectionId: searchParams.get("collection")  ?? undefined,
    };

    // Listan behöver status och antal, inte texten. Att skicka hela
    // biblioteket över nätet gjorde svaret enormt i stora samlingar.
    const works = await prisma.work.findMany({
      where:  buildWorkWhere(user.id, filters),
      select: {
        id: true, userId: true, title: true, author: true, type: true,
        tags: true, analysis: true, practiceAdvice: true,
        difficulty: true, estimatedMinutes: true, createdAt: true,
        sections: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true, name: true, status: true,
            orderIndex: true, nextReview: true, partId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(works);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const ent  = await getEntitlements(user);
    await assertWorkAllowance(user.id, ent);

    const body: CreateWorkPayload = await req.json();

    const { title, author, type, tags, analysis, practiceAdvice, difficulty, estimatedMinutes, sections } = body;

    if (!title || !author || !type || !sections?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const work = await prisma.work.create({
      data: {
        userId: user.id,
        title,
        author,
        type,
        tags: tags ?? [],
        analysis: analysis ?? null,
        practiceAdvice: practiceAdvice ?? null,
        difficulty: difficulty ?? "medium",
        estimatedMinutes: estimatedMinutes ?? 15,
        sections: {
          create: sections.map((s, i) => ({
            name: s.name,
            content: s.content,
            difficulty: s.difficulty ?? "medium",
            orderIndex: s.orderIndex ?? i,
          })),
        },
      },
      include: { sections: { orderBy: { orderIndex: "asc" } } },
    });

    return NextResponse.json(work, { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Verifiera ägarskap
    const work = await prisma.work.findFirst({ where: { id, userId: user.id } });
    if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.work.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
