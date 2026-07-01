// app/api/medals/route.ts
// GET  /api/medals           → alla medaljer för inloggad användare (med verk-info)
// POST /api/medals/check     → trigga manuell check (anropas av klient efter practice)

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkAndAwardMedal } from "@/lib/medals";

export async function GET() {
  try {
    const user = await requireUser();

    const medals = await prisma.medal.findMany({
      where:   { userId: user.id },
      include: { work: { select: { title: true, author: true, type: true } } },
      orderBy: { earnedAt: "desc" },
    });

    return NextResponse.json(medals);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/medals  body: { workId }
// Anropas manuellt av klient om man vill trigga en medalj-check
export async function POST(req: NextRequest) {
  try {
    const user           = await requireUser();
    const { workId }     = await req.json();

    if (!workId) {
      return NextResponse.json({ error: "Missing workId" }, { status: 400 });
    }

    const medal = await checkAndAwardMedal(user.id, workId);
    return NextResponse.json({ medal: medal ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
