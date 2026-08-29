// lib/http/guard.ts
//
// Gemensam ingång för route handlers: hämta användaren, hämta
// behörigheterna, begränsa takten, och översätt fel till rätt statuskod.
//
// Finns för att varje route annars skriver sin egen variant av samma
// try/catch, och för att det räcker att en enda glömmer kontrollen för
// att gränserna ska vara meningslösa.

import { NextResponse } from "next/server";
import { requireUser, type SessionUser } from "@/lib/auth";
import { getEntitlements, FeatureLockedError, type Entitlements } from "@/lib/billing/entitlements";
import { AiQuotaError, AiRateLimitError } from "@/lib/ai/run";
import { WorkLimitError } from "@/lib/billing/limits";
import { consume, slidingWindow } from "@/lib/usage/counters";
import { PLANS } from "@/lib/billing/plans";

export interface Session {
  user: SessionUser;
  ent:  Entitlements;
}

export async function session(): Promise<Session> {
  const user = await requireUser();
  const ent  = await getEntitlements(user);
  return { user, ent };
}

/**
 * Tak per minut för en route som inte går till modellen.
 *
 * Skyddar det som är billigt per anrop men dyrt i mängd: kassaanrop,
 * inlösenförsök, rättning. Räknaren är densamma som kvoten använder, så
 * den håller för samtidiga anrop.
 */
export async function rateLimit(
  key: string,
  limit: number,
  seconds = 60
): Promise<NextResponse | null> {
  const result = await consume("http_burst", key, limit, slidingWindow(seconds));
  if (result.allowed) return null;

  const retryAfter = Math.max(1, Math.ceil((result.resetsAt.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * Ett fel till ett svar.
 *
 * 402 för låst funktion och slut kvot är avsiktligt: det är inte ett fel
 * i begäran och inte en nekad inloggning, utan ett svar som gränssnittet
 * ska kunna känna igen och möta med en uppgraderingsruta i stället för en
 * röd ruta.
 */
export function toResponse(err: unknown): NextResponse {
  if (err instanceof FeatureLockedError) {
    return NextResponse.json(
      {
        error:   "upgrade_required",
        feature: err.feature,
        plan:    err.requiredPlan,
        message: `${PLANS.pro.name} opens this up.`,
      },
      { status: 402 }
    );
  }

  if (err instanceof WorkLimitError) {
    return NextResponse.json(
      {
        error: "work_limit_reached",
        used:  err.used,
        limit: err.limit,
        message: `Your plan holds ${err.limit} works. ${PLANS.pro.name} removes the ceiling.`,
      },
      { status: 402 }
    );
  }

  if (err instanceof AiQuotaError) {
    return NextResponse.json(
      {
        error:     "allowance_spent",
        used:      err.used,
        limit:     err.limit,
        resetsAt:  err.resetsAt.toISOString(),
        message:   "You've used this month's generations.",
      },
      { status: 402 }
    );
  }

  if (err instanceof AiRateLimitError) {
    return NextResponse.json(
      { error: "rate_limited", message: "Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
    );
  }

  const msg = err instanceof Error ? err.message : "Unknown error";
  if (msg === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Interna fel läcker inte ut. Stacken hör hemma i loggen, inte i svaret.
  console.error("Request failed:", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
