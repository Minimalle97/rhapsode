// lib/analytics.ts
//
// Intern händelselogg. Finns för att kunna svara på en enda fråga:
// vilka premiumfunktioner används egentligen?
//
// Vad som INTE sparas: namn, e-post, handle, texten någon övar på,
// betalningsuppgifter. Bara ett användar-id, ett händelsenamn och ett
// litet objekt med sådant som går att räkna på. Ingen händelse här ska
// kunna peka ut en person för någon som läser tabellen.

import { prisma } from "@/lib/db";

export type EventName =
  // pengar
  | "checkout_started"
  | "checkout_completed"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "payment_failed"
  | "tax_calculation_failed"
  | "portal_opened"
  | "code_redeemed"
  // produkt
  | "paywall_shown"
  | "paywall_clicked"
  | "feature_used"
  | "ai_blocked"
  | "recitation_completed";

/** Bara värden som går att aggregera. Fritext hör inte hemma här. */
export type EventProps = Record<string, string | number | boolean | null>;

export async function track(
  name: EventName,
  userId: string | null,
  props: EventProps = {}
): Promise<void> {
  await prisma.analyticsEvent
    .create({ data: { name, userId, props } })
    .catch(() => {
      // Mätning får aldrig vara skälet till att något går sönder.
    });
}

/** Vilka premiumfunktioner som faktiskt används, senaste N dagarna. */
export async function featureUsage(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  return prisma.analyticsEvent.groupBy({
    by:      ["name"],
    where:   { createdAt: { gte: since } },
    _count:  { _all: true },
    orderBy: { _count: { name: "desc" } },
  });
}
