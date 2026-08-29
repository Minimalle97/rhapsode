// app/api/billing/portal/route.ts
// POST → { url } till Stripes kundportal.
//
// Uppsägning, kortbyte, kvitton och adressändring sköts där. Att bygga om
// det här skulle betyda att vi hanterade kortuppgifter, vilket vore både
// dyrare och sämre.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { createPortalSession, stripeConfigured } from "@/lib/billing/stripe";
import { track } from "@/lib/analytics";

export async function POST(req: NextRequest) {
  try {
    const { user } = await session();

    const limited = await rateLimit(`portal:${user.id}`, 10);
    if (limited) return limited;

    if (!stripeConfigured()) {
      return NextResponse.json(
        { error: "Billing is not configured on this deployment." },
        { status: 503 }
      );
    }
    if (!user.stripeCustomerId) {
      return NextResponse.json(
        { error: "There's no billing account to manage yet." },
        { status: 409 }
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const url = await createPortalSession({ user, origin });

    await track("portal_opened", user.id, {});

    return NextResponse.json({ url });
  } catch (err) {
    return toResponse(err);
  }
}
