// app/api/duels/[id]/attempt/route.ts
//
// POST → ett framforande som raknas FOR TVEKAMPEN och inget annat.
//
// Skild fran /api/performance med flit. Den routen registrerar ett
// framforande mot mastartiteln: den ger XP, flyttar standing, tander och
// slacker medaljer och kan skriva i vannernas flode. Ingenting av det ska
// handa har. Att lagga bada i samma route med en flagga hade betytt att
// varje framtida andring maste komma ihag vilket lage den ar i.
//
// Klienten skickar sitt transkript, aldrig originalet. Servern hamtar
// texten ur den egna kopian och jamfor — annars hade man kunnat skicka in
// en kortare text att bedomas mot och kopa segern for tva rader.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { recordDuelAttempt, DuelError } from "@/lib/duels";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { user } = await session();
    const { id }   = await params;

    // Samma tak som framforandena. Rattningen ar billig, men en klient i
    // en snurra ar det inte.
    const limited = await rateLimit(`duel-attempt:${user.id}`, 20);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));

    const result = await recordDuelAttempt({
      duelId:     id,
      userId:     user.id,
      transcript: typeof body.transcript === "string" ? body.transcript : "",
      durationSecs:   body.durationSecs,
      hesitations:    body.hesitations,
      longestPauseMs: body.longestPauseMs,
      chunks:         Array.isArray(body.chunks)
        ? body.chunks
            .slice(0, 400)
            .map((c: unknown) =>
              Array.isArray(c)
                ? c.filter((t): t is string => typeof t === "string")
                   .map((t: string) => t.slice(0, 400))
                   .slice(0, 8)
                : []
            )
            .filter((c: string[]) => c.length > 0)
        : [],
      hesitatedAt:    Array.isArray(body.hesitatedAt)
        ? body.hesitatedAt
            .map(Number)
            .filter((n: number) => Number.isInteger(n) && n >= 0 && n < 100_000)
            .slice(0, 400)
        : [],
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DuelError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return toResponse(err);
  }
}
