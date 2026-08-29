// app/api/billing/redeem/route.ts
// POST { code } → löser in en åtkomstkod.
//
// Taket på fem försök i minuten är själva skyddet. Koderna är långa nog
// att inte kunna gissas, men utan tak vore det en gissningsmaskin.
// Svaret säger heller aldrig om en kod finns men är slut — bara att den
// inte gick att lösa in.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { redeemCode } from "@/lib/billing/access";

const MESSAGES: Record<string, string> = {
  not_found:        "That code isn't valid.",
  inactive:         "That code is no longer active.",
  expired:          "That code has expired.",
  exhausted:        "That code has already been fully claimed.",
  already_redeemed: "You've already used that code.",
};

export async function POST(req: NextRequest) {
  try {
    const { user } = await session();

    const limited = await rateLimit(`redeem:${user.id}`, 5);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";
    if (!code.trim()) {
      return NextResponse.json({ error: "Enter a code." }, { status: 400 });
    }

    const result = await redeemCode(user.id, code);
    if (!result.ok) {
      return NextResponse.json(
        { error: MESSAGES[result.reason] ?? "That code isn't valid." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok:          true,
      plan:        result.plan,
      expiresAt:   result.expiresAt?.toISOString() ?? null,
      alreadyHeld: result.alreadyHeld,
    });
  } catch (err) {
    return toResponse(err);
  }
}
