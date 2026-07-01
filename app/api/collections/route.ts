// app/api/collections/route.ts
// Fas 5
// GET    /api/collections          → lista alla samlingar för inloggad användare (med workIds)
// POST   /api/collections          → skapa ny samling { name, color? }
// PATCH  /api/collections?id=xxx   → byt namn/färg och/eller lägg till/ta bort ett verk
//                                     body: { name?, color?, addWorkId?, removeWorkId? }
// DELETE /api/collections?id=xxx   → ta bort en samling (kopplingarna tas bort via cascade)

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { CreateCollectionPayload, UpdateCollectionPayload } from "@/types";

export async function GET() {
  try {
    const user = await requireUser();

    const collections = await prisma.collection.findMany({
      where:   { userId: user.id },
      include: { works: { select: { workId: true } } },
      orderBy: { orderIndex: "asc" },
    });

    return NextResponse.json(
      collections.map((c) => ({
        id:         c.id,
        userId:     c.userId,
        name:       c.name,
        color:      c.color,
        orderIndex: c.orderIndex,
        createdAt:  c.createdAt,
        workIds:    c.works.map((w) => w.workId),
      }))
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body: CreateCollectionPayload = await req.json();

    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const count = await prisma.collection.count({ where: { userId: user.id } });

    const collection = await prisma.collection.create({
      data: {
        userId:     user.id,
        name,
        color:      body.color ?? null,
        orderIndex: count,
      },
    });

    return NextResponse.json({ ...collection, workIds: [] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Verifiera ägarskap
    const existing = await prisma.collection.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body: UpdateCollectionPayload = await req.json();
    const { name, color, addWorkId, removeWorkId } = body;

    if (name !== undefined || color !== undefined) {
      await prisma.collection.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(color !== undefined ? { color } : {}),
        },
      });
    }

    if (addWorkId) {
      // Verifiera att verket faktiskt tillhör användaren innan vi kopplar in det
      const work = await prisma.work.findFirst({ where: { id: addWorkId, userId: user.id } });
      if (!work) return NextResponse.json({ error: "Work not found" }, { status: 404 });

      await prisma.collectionWork.upsert({
        where:  { collectionId_workId: { collectionId: id, workId: addWorkId } },
        create: { collectionId: id, workId: addWorkId },
        update: {},
      });
    }

    if (removeWorkId) {
      await prisma.collectionWork.deleteMany({
        where: { collectionId: id, workId: removeWorkId },
      });
    }

    const updated = await prisma.collection.findUnique({
      where:   { id },
      include: { works: { select: { workId: true } } },
    });

    return NextResponse.json({
      ...updated,
      workIds: updated!.works.map((w) => w.workId),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const collection = await prisma.collection.findFirst({ where: { id, userId: user.id } });
    if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.collection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
