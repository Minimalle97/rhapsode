// app/api/billing/checkout/route.ts
// POST → { url } till Stripe Checkout.
//
// Klienten skickar "month" eller "year". Inget pris-id, ingen summa, ingen
// plan-sträng. Priserna slås upp på servern ur lib/billing/plans.ts, så
// det finns ingen väg att teckna Pro för ett belopp man hittat på.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { createCheckoutSession, stripeConfigured } from "@/lib/billing/stripe";
import { track } from "@/lib/analytics";
import type { BillingInterval } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  try {
    const { user, ent } = await session();

    const limited = await rateLimit(`checkout:${user.id}`, 10);
    if (limited) return limited;

    if (!stripeConfigured()) {
      return NextResponse.json(
        { error: "Billing is not configured on this deployment." },
        { status: 503 }
      );
    }

    // Redan Pro via kod eller utvecklarnyckel — då finns inget att köpa.
    if (ent.isPro && ent.source !== "stripe") {
      return NextResponse.json(
        { error: "You already have Pro access." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const interval: BillingInterval = body.interval === "year" ? "year" : "month";

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const url = await createCheckoutSession({ user, interval, origin });

    await track("checkout_started", user.id, { interval });

    return NextResponse.json({ url });
  } catch (err) {
    return toResponse(err);
  }
}
