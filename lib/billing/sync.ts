// lib/billing/sync.ts
//
// Översätter Stripes händelser till raden i vår User-tabell.
//
// Stripe är sanningen om betalningar; vår rad är en spegling av den, och
// speglingen sker bara här. Ingen annan kod får skriva plan,
// subscriptionStatus eller currentPeriodEnd.
//
// Webhooks kommer om. Stripe skickar samma event igen vid minsta tvekan,
// och de kommer inte alltid i ordning. Därför två skydd: StripeEvent-
// tabellen avvisar dubbletter, och all statusskrivning är idempotent —
// att köra samma event två gånger ger samma slutläge.

import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import type { SubscriptionStatus } from "./plans";

/** Har vi sett eventet förut? Reserverar det i samma andetag. */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
    return true;
  } catch {
    // Unik nyckel-krock = redan behandlat.
    return false;
  }
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":              return "active";
    case "trialing":            return "trialing";
    case "past_due":            return "past_due";
    case "unpaid":              return "past_due";
    case "canceled":            return "cancelled";
    case "incomplete":          return "incomplete";
    case "incomplete_expired":  return "free";
    case "paused":              return "cancelled";
    default:                    return "free";
  }
}

/** Vilken av våra användare hör prenumerationen till? */
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.userId;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const user = await prisma.user.findUnique({
    where:  { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

/** Periodslutet ligger på prenumerationens poster i nyare API-versioner. */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const seconds =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

/**
 * Skriver ned prenumerationens läge.
 *
 * Notera att plan sätts av status, inte av att det finns en rad: en
 * avslutad prenumeration lämnar kvar currentPeriodEnd, och
 * entitlements.ts låter Pro löpa ut perioden ut. Det är ett medvetet
 * val — man ska få det man betalat för.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserId(sub);
  if (!userId) return;

  const status = mapStatus(sub.status);
  const alive  = status === "active" || status === "trialing";

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan:                 alive ? "pro" : "free",
      planSource:           alive ? "stripe" : "none",
      subscriptionStatus:   status,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd:     periodEnd(sub),
      cancelAtPeriodEnd:    sub.cancel_at_period_end ?? false,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });
}

/** Prenumerationen är slut på riktigt — perioden har löpt ut. */
export async function endSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserId(sub);
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan:               "free",
      planSource:         "none",
      subscriptionStatus: "cancelled",
      cancelAtPeriodEnd:  false,
      currentPeriodEnd:   periodEnd(sub),
    },
  });

  await track("subscription_cancelled", userId, {});
}

/**
 * Behandlar ett verifierat event.
 *
 * Returnerar en kort rad om vad som gjordes; den loggas av routen och är
 * det man läser när något ser konstigt ut i Stripe-panelen.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId  = session.metadata?.userId ?? null;

      if (session.subscription) {
        const subId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
        // Hämta prenumerationen färsk hellre än att lita på sessionens
        // ögonblicksbild — den kan redan vara omsprungen av ett annat event.
        const { getStripe } = await import("./stripe");
        const sub = await getStripe().subscriptions.retrieve(subId);
        await syncSubscription(sub);
      }

      if (userId) await track("checkout_completed", userId, {});
      return "checkout completed";
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncSubscription(event.data.object as Stripe.Subscription);
      return "subscription synced";
    }

    case "customer.subscription.deleted": {
      await endSubscription(event.data.object as Stripe.Subscription);
      return "subscription ended";
    }

    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId =
        (invoice as unknown as { subscription?: string | { id: string } }).subscription ??
        invoice.lines?.data?.[0]?.subscription;
      const id = typeof subId === "string" ? subId : subId?.id;

      if (id) {
        const { getStripe } = await import("./stripe");
        const sub = await getStripe().subscriptions.retrieve(id);
        await syncSubscription(sub);
        const userId = sub.metadata?.userId;
        if (userId && invoice.billing_reason === "subscription_cycle") {
          await track("subscription_renewed", userId, {});
        }
      }
      return "invoice paid";
    }

    // Fakturan gick inte att faststalla.
    //
    // Det har blir mojligt forst nar Stripe Tax ar paslaget, och det ar
    // ett tyst fel av varsta sorten: kan Stripe inte rakna fram momsen
    // faststalls ingen faktura, ingen betalning forsoks, och INGET
    // invoice.payment_failed skickas. Prenumerationen star kvar som
    // active, kunden behaller Pro, och ingen betalar. Utan det har fallet
    // upptacks det forst nar nagon jamfor intakter mot antal kunder.
    //
    // Vanligaste orsaken ar requires_location_inputs: adressen racker
    // inte for att avgora vilket lands sats som galler. Det gar inte att
    // laga har — kunden maste fylla i den — sa raden loggas och markeras
    // for uppfoljning i stallet for att tyst passera.
    case "invoice.finalization_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;

      const taxStatus =
        (invoice as unknown as { automatic_tax?: { status?: string } })
          .automatic_tax?.status ?? null;

      if (customerId) {
        const user = await prisma.user.findUnique({
          where:  { stripeCustomerId: customerId },
          select: { id: true },
        });
        if (user) {
          await track("tax_calculation_failed", user.id, {
            reason:  taxStatus,
            invoice: invoice.id ?? null,
          });
        }
      }

      // Loggas alltid, aven nar kunden inte gar att hitta — en faktura som
      // inte kan faststallas ar nagot nagon behover titta pa.
      console.error(
        `Invoice ${invoice.id} could not be finalized. ` +
        `automatic_tax.status=${taxStatus ?? "unknown"}. ` +
        `No payment was attempted.`
      );

      return `finalization failed (${taxStatus ?? "unknown"})`;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;

      if (customerId) {
        const user = await prisma.user.findUnique({
          where:  { stripeCustomerId: customerId },
          select: { id: true },
        });
        if (user) {
          // Ingen avstängning här. past_due behåller Pro perioden ut —
          // det vanligaste skälet är ett kort som gått ut, och att låsa
          // ute någon för det vore fel bemötande.
          await prisma.user.update({
            where: { id: user.id },
            data:  { subscriptionStatus: "past_due" },
          });
          await track("payment_failed", user.id, {});
        }
      }
      return "payment failed recorded";
    }

    default:
      return `ignored ${event.type}`;
  }
}
