// app/api/duels/[id]/route.ts
//
// GET    — resultatet, om tiden gatt ut. Avgor kampen om ingen hunnit fore.
// PATCH  — anta en inbjudan
// DELETE — tacka nej, eller ta tillbaka sin egen
//
// Avgorandet ligger pa GET och inte pa en schemalaggare med flit: appen
// har ingen sadan, och en kamp som avgors nasta gang nagon tittar ger
// samma svar som en som avgjorts pa sekunden. Rakningen fryses vid
// forsta avgorandet, sa vantetiden andrar inte utfallet.

import { NextRequest, NextResponse } from "next/server";
import { session, toResponse } from "@/lib/http/guard";
import { acceptDuel, declineDuel, cancelDuel, duelResult, DuelError } from "@/lib/duels";

export const dynamic = "force-dynamic";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { user } = await session();
    const { id }   = await params;

    const result = await duelResult(id, user.id);
    return NextResponse.json({ result });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(_req: NextRequest, { params }: Ctx) {
  try {
    const { user } = await session();
    const { id }   = await params;

    await acceptDuel(id, user.id);
    return NextResponse.json({ accepted: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { user } = await session();
    const { id }   = await params;

    // Vem man ar avgor vad DELETE betyder. Utmanaren tar tillbaka, den
    // inbjudne tackar nej — bada gangerna ar det "gor dig av med den
    // har", och det ar samma knapp fran anvandarens hall.
    try {
      await declineDuel(id, user.id);
    } catch {
      await cancelDuel(id, user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

function fail(err: unknown) {
  if (err instanceof DuelError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return toResponse(err);
}
