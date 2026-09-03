// app/api/medals/route.ts
// GET /api/medals → alla medaljer för inloggad användare (med verk-info)
//
// ── POST ar borttagen ────────────────────────────────────────────────
//
// Den lat klienten be om en medaljkontroll for ett verk, och den
// kontrollen delade ut guldmedaljen for SM-2-bemastring. Den medaljen
// finns inte langre: mastartiteln kommer BARA fran Performance Mode, och
// den delas ut av syncMedal() i lib/performanceStore.ts nar ett
// framforande registreras. Det finns alltsa ingenting for en klient att
// utlosa langre.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();

    const medals = await prisma.medal.findMany({
      // Gamla "work"-medaljer utelamnas. De delades ut for SM-2-bemastring
      // innan regeln andrades, och att visa dem vore att pasta att nagon
      // bemastrat ett verk de aldrig framfort. Raderna star kvar i
      // databasen — det ar bara visningen som slutat.
      where:   { userId: user.id, kind: { not: "work" } },
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
