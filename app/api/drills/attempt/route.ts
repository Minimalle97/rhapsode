// app/api/drills/attempt/route.ts
//
// POST — skriv ned ett bedomt drillkort.
//
// Det ar HAR ransonen dras, inte nar drillsidan oppnas. Att titta pa en
// text ska inte kosta nagot; det ar korten man faktiskt bedomer som
// raknas. En gratisanvandare kan alltsa oppna drillen, stalla in den och
// se hur den ser ut utan att forbruka nagot.
//
// Agarskapet provas i lib/drills.ts: sektionen maste tillhora den som
// bedomer den.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import {
  recordDrillAttempt, drillById, isMark, DrillLimitError, type DrillId,
} from "@/lib/drills";
import { PLANS } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { user, ent } = await session();

    const limited = await rateLimit(`drill-attempt:${user.id}`, 120);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));

    const drill = typeof body.drill === "string" ? drillById(body.drill) : undefined;
    if (!drill) {
      return NextResponse.json({ error: "Unknown drill." }, { status: 400 });
    }
    if (!isMark(body.mark)) {
      return NextResponse.json({ error: "Unknown mark." }, { status: 400 });
    }
    if (typeof body.sectionId !== "string" || !body.sectionId) {
      return NextResponse.json({ error: "Missing section." }, { status: 400 });
    }

    await recordDrillAttempt({
      userId:     user.id,
      sectionId:  body.sectionId,
      drill:      drill.id as DrillId,
      lineIndex:  Number(body.lineIndex) || 0,
      mark:       body.mark,
      msToReveal: body.msToReveal,
      peeked:     body.peeked === true,
    }, ent);

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Slut ranson ar inte ett fel i begaran. 402 ar samma svar som resten
    // av appen ger nar nagot tagit slut, sa granssnittet kan mota det med
    // en uppgraderingsruta i stallet for en rod ruta.
    if (err instanceof DrillLimitError) {
      return NextResponse.json({
        error:    "drill_limit_reached",
        used:     err.used,
        limit:    err.limit,
        resetsAt: err.resetsAt.toISOString(),
        message:  `That is today's ${err.limit} drill cards. ${PLANS.pro.name} removes the daily cap.`,
      }, { status: 402 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return toResponse(err);
  }
}
