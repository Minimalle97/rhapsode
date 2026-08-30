// app/api/billing/webhook/route.ts
//
// Den enda vägen som får ändra någons prenumerationsstatus.
//
// Tre saker gör den säker:
//
//   Signaturen kontrolleras mot STRIPE_WEBHOOK_SECRET. Utan det steget
//   vore endpointen ett formulär där vem som helst kunde skriva "den här
//   användaren är Pro".
//
//   Den läser RÅ kropp. Stripes signatur räknas på bytes; går kroppen
//   genom JSON.parse först stämmer den aldrig.
//
//   Den är avstängd från Clerk (se proxy.ts) — Stripe har ingen session —
//   men signaturen ersätter inloggningen som bevis.

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { claimEvent, handleStripeEvent } from "@/lib/billing/sync";
import { pruneExpired } from "@/lib/usage/counters";
import { cleanSecret } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Signeringshemligheten jamfors, den skickas inte i en header — men
  // ett radbrott pa slutet skulle anda gora att ingen signatur stammer.
  const secret = process.env.STRIPE_WEBHOOK_SECRET
    ? cleanSecret(process.env.STRIPE_WEBHOOK_SECRET)
    : "";
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set — refusing the webhook");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // Skälet loggas men skickas inte tillbaka — en avsändare som inte kan
    // signera ska inte få veta varför det inte gick.
    console.error("Stripe signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const fresh = await claimEvent(event);
  if (!fresh) return NextResponse.json({ received: true, duplicate: true });

  try {
    const outcome = await handleStripeEvent(event);

    // Appen har ingen schemaläggare. Webhooken körs sällan och sött, så
    // den får städa utgångna räknarfönster i förbifarten.
    void pruneExpired().catch(() => {});

    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    // 500 gör att Stripe försöker igen. Reservationen släpps så att
    // omförsöket inte avvisas som dubblett.
    console.error(`Stripe webhook ${event.type} failed:`, err);
    const { prisma } = await import("@/lib/db");
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
