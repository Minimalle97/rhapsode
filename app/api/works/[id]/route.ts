// app/api/works/[id]/route.ts
//
// PATCH  — rätta titel, författare, typ och taggar
// DELETE — ta bort hela verket
//
// Titeln och författaren gissas av Claude vid import. Gissningen är ofta
// rätt men inte alltid, särskilt när filnamnet är kryptiskt eller texten
// börjar mitt i ett förord. Det ska gå att rätta utan att importera om.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Ctx {
  params: Promise<{ id: string }>;
}

const TYPES = [
  "POEM", "EPIC", "PLAY", "SPEECH",
  "PHILOSOPHICAL", "RELIGIOUS", "PROFESSIONAL", "OTHER",
];

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const user = await requireUser();

    const work = await prisma.work.findFirst({
      where:  { id, userId: user.id },
      select: { id: true },
    });
    if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim().slice(0, 200);
    }
    if (typeof body.author === "string") {
      data.author = body.author.trim().slice(0, 160) || "Unknown";
    }
    if (typeof body.type === "string" && TYPES.includes(body.type.toUpperCase())) {
      data.type = body.type.toUpperCase();
    }
    if (typeof body.visibility === "string" &&
        ["private", "public"].includes(body.visibility)) {
      data.visibility = body.visibility;
    }
    if (Array.isArray(body.tags)) {
      data.tags = body.tags
        .slice(0, 8)
        .map((t: unknown) => String(t).toLowerCase().trim())
        .filter(Boolean);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.work.update({
      where:  { id },
      data,
      select: { id: true, title: true, author: true, type: true, tags: true, visibility: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const user = await requireUser();

    const work = await prisma.work.findFirst({
      where:  { id, userId: user.id },
      select: {
        id: true, title: true,
        _count: { select: { sections: true } },
      },
    });
    if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Delar, sektioner, övningspass och medaljer försvinner med verket —
    // schemat kaskaderar. Det som ligger kvar är den XP du redan tjänat,
    // och det är avsiktligt: arbetet gjordes, även om texten är borta.
    await prisma.work.delete({ where: { id } });

    return NextResponse.json({
      deleted:  true,
      title:    work.title,
      sections: work._count.sections,
    });
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
