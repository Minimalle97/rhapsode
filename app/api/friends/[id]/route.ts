// app/api/friends/[id]/route.ts
//
// PATCH  — svara ja på en inkommande förfrågan
// DELETE — säg nej, dra tillbaka, eller ta bort en vän

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const row = await prisma.friendship.findUnique({
      where:  { id },
      select: { id: true, addresseeId: true, status: true },
    });

    // Bara mottagaren kan svara ja
    if (!row || row.addresseeId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (row.status === "accepted") {
      return NextResponse.json({ accepted: true });
    }

    await prisma.friendship.update({
      where: { id },
      data:  { status: "accepted", respondedAt: new Date() },
    });

    return NextResponse.json({ accepted: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const row = await prisma.friendship.findUnique({
      where:  { id },
      select: { id: true, requesterId: true, addresseeId: true },
    });

    // Båda parter får ta bort — den ena avböjer, den andra ångrar sig
    if (!row || (row.requesterId !== user.id && row.addresseeId !== user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.friendship.delete({ where: { id } });
    return NextResponse.json({ removed: true });
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
