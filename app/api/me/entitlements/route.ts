// app/api/me/entitlements/route.ts
// GET → vad den inloggade får göra, uträknat på servern.
//
// Finns för att klientkomponenter ska kunna visa rätt sak utan att gissa.
// Det är en AVSPEGLING, aldrig en källa: att manipulera svaret i
// webbläsaren ändrar vad som ritas ut och ingenting annat, eftersom varje
// route kontrollerar behörigheten på nytt när den anropas.

import { NextResponse } from "next/server";
import { session, toResponse } from "@/lib/http/guard";
import { aiAllowance } from "@/lib/ai/run";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, ent } = await session();
    const allowance = await aiAllowance(user.id, ent);

    return NextResponse.json({
      plan:     ent.plan,
      source:   ent.source,
      status:   ent.status,
      isPro:    ent.isPro,
      features: [...ent.features],
      allowance: {
        used:      allowance.used,
        limit:     Number.isFinite(allowance.limit) ? allowance.limit : null,
        remaining: Number.isFinite(allowance.remaining) ? allowance.remaining : null,
        resetsAt:  allowance.resetsAt.toISOString(),
      },
      currentPeriodEnd:  ent.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
    });
  } catch (err) {
    return toResponse(err);
  }
}
