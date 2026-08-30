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
import { readSecret, hasSecret } from "@/lib/env";
import { prisma } from "@/lib/db";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    // readSecret trimmar bort radbrott. Ett radbrott pa slutet av en
    // nyckel klistrad i Vercel gjorde att Authorization-headern inte gick
    // att bygga, och felet kom tillbaka som "connection to Stripe".
    const key = readSecret("STRIPE_SECRET_KEY");
    // apiVersion utelämnas med flit. SDK:n använder då den version den
    // byggdes mot (2026-08-26.dahlia i stripe@22), vilket är den senaste.
    // Pinnar man en version här fastnar man tyst på den även efter en
    // SDK-uppgradering, och glappet upptäcks först när något går sönder.
    stripe = new Stripe(key, { typescript: true });
  }
  return stripe;
}

export function stripeConfigured(): boolean {
  return hasSecret("STRIPE_SECRET_KEY");
}

/**
 * Etikett för kassaflödet, syns i Stripes dashboard när man jämför
 * flöden mot varandra. Konstant med flit — ett värde per anrop skulle
 * göra jämförelsen omöjlig. Suffixet är åtta slumpade bokstäver enligt
 * Stripes konvention.
 */
const INTEGRATION_ID = "rhapsode-subscription-qkvmzrdb";

/**
 * Momsberäkning. AVSTÄNGD tills den slås på uttryckligen.
 *
 * Det här är den vanligaste dyra missen med Stripe Tax: `automatic_tax`
 * går att slå på utan att något klagar, men utan en aktiv REGISTRERING i
 * Stripe → Tax räknar Stripe fram noll moms och tar inte in någonting.
 * Integrationen ser då korrekt ut i månader medan momsskulden växer.
 *
 * Rhapsode säljer till konsumenter i EU, så det här kommer att behöva
 * slås på — men först efter att registreringen finns. Se
 * https://docs.stripe.com/billing/taxes/collect-taxes.md
 */
function taxEnabled(): boolean {
  return process.env.STRIPE_AUTOMATIC_TAX === "true";
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
  if (user.stripeCustomerId) {
    // Kontrollera att kunden finns INNAN vi anvander id:t.
    //
    // Skalet ar bytet fran test till skarpt lage. Ett cus_… som skapades
    // i testlaget finns inte i det skarpa — objekten ar helt atskilda.
    // Utan den har kontrollen skulle den som provkopt i testlaget mota
    // "No such customer" vid varje kassa och varje portalbesok efter
    // lanseringen, och felet skulle se ut som ett haveri i appen.
    //
    // Fangar ocksa en kund som raderats for hand i dashboarden.
    try {
      const existing = await getStripe().customers.retrieve(user.stripeCustomerId);
      if (!existing.deleted) return user.stripeCustomerId;
    } catch {
      // resource_missing eller fel lage. Faller igenom och skapar en ny.
    }
  }

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

  const withTax = taxEnabled();

  const session = await getStripe().checkout.sessions.create({
    mode:     "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(opts.interval), quantity: 1 }],

    // Ingen payment_method_types här. Utelämnad låter Stripe välja de
    // metoder som faktiskt går att använda för just den kunden — i
    // Sverige betyder det Klarna och Swish vid sidan av kort. Hårdkodar
    // man ["card"] stänger man av dem och tappar konverteringar.

    // userId på BÅDA. Sessionen behövs för checkout.session.completed,
    // prenumerationen för alla senare händelser i dess livstid.
    metadata: { userId: opts.user.id },
    subscription_data: {
      metadata: { userId: opts.user.id },
      ...(opts.trialDays ? { trial_period_days: opts.trialDays } : {}),
    },

    integration_identifier: INTEGRATION_ID,
    allow_promotion_codes: true,

    // Moms. Adressen måste samlas in och skrivas tillbaka på kunden,
    // annars vet Stripe inte vilket lands sats som gäller vid förnyelsen.
    ...(withTax
      ? {
          automatic_tax:             { enabled: true },
          billing_address_collection: "required" as const,
          customer_update:           { address: "auto" as const, name: "auto" as const },
          // Företagskunder — skolor, teatrar — ska kunna ange VAT-nummer.
          tax_id_collection:         { enabled: true },
        }
      : {}),

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
