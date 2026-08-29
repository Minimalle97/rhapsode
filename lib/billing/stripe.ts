// lib/billing/stripe.ts
//
// Serverens enda kontakt med Stripe.
//
// Två regler som inte får böjas:
//
//   Den hemliga nyckeln finns bara här. Ingen NEXT_PUBLIC_-variant, inget
//   pris-id som skickas in från klienten. Klienten får be om "månad"
//   eller "år" och inget annat — annars kunde vem som helst starta en
//   kassa mot ett pris de hittat på.
//
//   Prenumerationsstatus läses aldrig från webbläsaren. Det som står i
//   vår databas är satt av en signerad webhook, inte av en lyckad
//   omdirigering. En användare som stannar på success-sidan och trycker
//   uppdatera ska inte kunna bli Pro.

import Stripe from "stripe";
import { PRICES, type BillingInterval } from "./plans";
import { prisma } from "@/lib/db";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripe = new Stripe(key, { typescript: true });
  }
  return stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Priset för ett intervall. Kastar hellre än att gissa. */
export function priceIdFor(interval: BillingInterval): string {
  const id = PRICES[interval].stripePriceId;
  if (!id) {
    throw new Error(
      `No Stripe price configured for "${interval}". ` +
      `Set ${interval === "month" ? "STRIPE_PRICE_PRO_MONTHLY" : "STRIPE_PRICE_PRO_YEARLY"}.`
    );
  }
  return id;
}

/**
 * Hämtar eller skapar Stripe-kunden.
 *
 * E-post skickas inte med. Stripe frågar ändå i kassan, och då slipper vi
 * spara en adress till som vi inte behöver.
 */
export async function getOrCreateCustomer(user: {
  id: string;
  stripeCustomerId: string | null;
}): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await getStripe().customers.create({
    metadata: { userId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data:  { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function createCheckoutSession(opts: {
  user:     { id: string; stripeCustomerId: string | null };
  interval: BillingInterval;
  origin:   string;
  trialDays?: number;
}): Promise<string> {
  const customerId = await getOrCreateCustomer(opts.user);

  const session = await getStripe().checkout.sessions.create({
    mode:     "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(opts.interval), quantity: 1 }],
    // userId på BÅDA. Sessionen behövs för checkout.session.completed,
    // prenumerationen för alla senare händelser i dess livstid.
    metadata: { userId: opts.user.id },
    subscription_data: {
      metadata: { userId: opts.user.id },
      ...(opts.trialDays ? { trial_period_days: opts.trialDays } : {}),
    },
    allow_promotion_codes: true,
    success_url: `${opts.origin}/settings/subscription?checkout=success`,
    cancel_url:  `${opts.origin}/settings/subscription?checkout=cancelled`,
  });

  if (!session.url) throw new Error("Stripe returned a session without a URL");
  return session.url;
}

/**
 * Stripes egen portal för uppsägning, kortbyte och kvitton.
 *
 * Att bygga om det själv vore veckor av arbete för att hamna på något
 * sämre, och det skulle innebära att vi hanterade kortuppgifter.
 */
export async function createPortalSession(opts: {
  user:   { id: string; stripeCustomerId: string | null };
  origin: string;
}): Promise<string> {
  const customerId = await getOrCreateCustomer(opts.user);

  const session = await getStripe().billingPortal.sessions.create({
    customer:   customerId,
    return_url: `${opts.origin}/settings/subscription`,
  });

  return session.url;
}
