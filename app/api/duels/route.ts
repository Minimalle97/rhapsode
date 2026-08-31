// app/api/duels/route.ts
//
// GET  — allt man har pa gang, plus verken man kan satsa
// POST — bjud in nagon till en tvekamp
//
// Routen fattar inga beslut. Vem som far bjuda in, hur langt en kamp far
// vara och vad som hander nar den antas star i lib/duels.ts, sa att
// reglerna inte kan skilja sig at mellan granssnittet och API:et.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { createDuel, listDuels, challengeableWorks, DuelError, DURATIONS } from "@/lib/duels";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, ent } = await session();

    const [duels, works] = await Promise.all([
      listDuels(user.id),
      // Bara den som far bjuda in behover listan pa vad de kan satsa.
      ent.isPro ? challengeableWorks(user.id) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      duels,
      works,
      durations: DURATIONS,
      canInvite: ent.isPro,
      me:        { id: user.id },
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, ent } = await session();

    // En inbjudan skickar en text till nagon annans bibliotek. Det ar
    // billigt per anrop och dyrt i mangd, alltsa precis det rateLimit
    // finns for.
    const limited = await rateLimit(`duel:${user.id}`, 10, 60);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const opponentId = typeof body.opponentId === "string" ? body.opponentId : "";
    const workId     = typeof body.workId     === "string" ? body.workId     : "";
    const minutes    = Number(body.minutes);

    if (!opponentId || !workId) {
      return NextResponse.json({ error: "Pick someone and a work." }, { status: 400 });
    }

    const duel = await createDuel({
      challengerId: user.id,
      ent,
      opponentId,
      workId,
      minutes,
    });

    return NextResponse.json({ id: duel.id, sent: true }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

/**
 * DuelError bar sin egen statuskod. 402 far samma form som resten av
 * appens uppgraderingssvar, sa att granssnittet kan mota det med en
 * uppgraderingsruta i stallet for en rod ruta.
 */
function fail(err: unknown) {
  if (err instanceof DuelError) {
    if (err.status === 402) {
      return NextResponse.json(
        {
          error:   "upgrade_required",
          plan:    "pro",
          message: "Challenging a friend is part of Rhapsode Pro.",
        },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return toResponse(err);
}
