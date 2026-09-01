// app/api/repertoire/border/route.ts
//
// POST  — oppna lasset pa en avklarad grupp
// PATCH — byt bard, eller ta av den
//
// Routen fattar inga beslut. Om gruppen ar klar, om planen racker och om
// barden ar upplast avgors i lib/repertoire.ts, sa att svaret blir
// detsamma har som i granssnittet.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { unlockBorder, equipBorder, RepertoireError } from "@/lib/repertoire";
import { PLANS } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  try {
    const { user, ent } = await session();

    const limited = await rateLimit(`border:${user.id}`, 20);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const groupId = typeof body.groupId === "string" ? body.groupId : "";

    await unlockBorder(user.id, groupId, ent);
    return NextResponse.json({ unlocked: true, groupId });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, ent } = await session();

    const limited = await rateLimit(`border:${user.id}`, 30);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    // null ar ett giltigt val: det tar av barden.
    const groupId = typeof body.groupId === "string" ? body.groupId : null;

    await equipBorder(user.id, groupId, ent);
    return NextResponse.json({ border: groupId });
  } catch (err) {
    return fail(err);
  }
}

function fail(err: unknown) {
  if (err instanceof RepertoireError) {
    // 402 far samma form som resten av appens uppgraderingssvar, sa att
    // granssnittet kan mota det med en uppgraderingsruta i stallet for
    // en rod ruta.
    if (err.status === 402) {
      return NextResponse.json(
        {
          error:   "upgrade_required",
          plan:    "pro",
          message: `Wearing a border is part of ${PLANS.pro.name}. The group is yours either way.`,
        },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return toResponse(err);
}
