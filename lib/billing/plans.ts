// lib/billing/plans.ts
//
// Allt som styr vad de två planerna kostar och tillåter ligger här, och
// bara här. Ska Pro få 150 generationer i stället för 100, eller ska
// årspriset ändras, är det den här filen man öppnar — inte trettio
// komponenter.
//
// Ingen komponent får läsa ett pris eller en gräns någon annanstans
// ifrån. Ingen komponent får heller jämföra `user.plan === "pro"` själv;
// till det finns canUseFeature() i entitlements.ts.

export type PlanId = "free" | "pro";

/** Vad Stripe kan säga om en prenumeration, plus våra två egna lägen. */
export type SubscriptionStatus =
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "incomplete";

/** Var behörigheten kommer ifrån. Avgör vad fakturasidan visar. */
export type PlanSource = "none" | "stripe" | "grant" | "developer";

export type BillingInterval = "month" | "year";

// ── Funktioner man kan ha rätt till ───────────────────────────────────
// Lägg till en ny rad här och i ENTITLEMENTS nedan. Ingen annan fil
// behöver röras för att en funktion ska bli låst eller upplåst.
export const FEATURE = {
  BASIC_RECITATION:    "BASIC_RECITATION",
  ADVANCED_RECITATION: "ADVANCED_RECITATION",
  BASIC_RHYTHM:        "BASIC_RHYTHM",
  ADVANCED_RHYTHM:     "ADVANCED_RHYTHM",
  SAVED_CUSTOM_TEXTS:  "SAVED_CUSTOM_TEXTS",
  AI_EXERCISES:        "AI_EXERCISES",
  AI_GLOSSARY:         "AI_GLOSSARY",
  TRANSLATION:         "TRANSLATION",
  LANGUAGE_MODE:       "LANGUAGE_MODE",
  PERFORMANCE_ANALYSIS:"PERFORMANCE_ANALYSIS",
  ADVANCED_PROGRESS:   "ADVANCED_PROGRESS",
  PERSONALIZED_STUDY:  "PERSONALIZED_STUDY",
  BASIC_CLEANUP:       "BASIC_CLEANUP",
  ADVANCED_CLEANUP:    "ADVANCED_CLEANUP",
} as const;

export type Feature = (typeof FEATURE)[keyof typeof FEATURE];

// ── Gränser ───────────────────────────────────────────────────────────
export interface PlanLimits {
  /** Modellanrop per kalendermånad. */
  aiMonthly: number;
  /** Tak per minut. Skyddar mot en skenande klient, inte mot användaren. */
  aiBurstPerMinute: number;
  /** Antal egna verk. Infinity = obegränsat. */
  savedWorks: number;
  /**
   * Djupstädningar per månad.
   *
   * Egen räknare, skild från aiMonthly. Skälet är att den ska kunna ta
   * slut UTAN att generationerna gör det: den som städat två texter ska
   * fortfarande kunna göra sina övningar. Två gränser som tar slut
   * tillsammans känns som en gräns som är för snäv.
   */
  advancedCleanupMonthly: number;
}

/** Miljövariabel som heltal, med ett värde att falla tillbaka på. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    aiMonthly:        envInt("FREE_AI_MONTHLY_LIMIT", 5),
    aiBurstPerMinute: envInt("FREE_AI_BURST_PER_MINUTE", 3),
    savedWorks:       envInt("FREE_SAVED_WORKS_LIMIT", 3),
    advancedCleanupMonthly: envInt("FREE_ADVANCED_CLEANUP_LIMIT", 2),
  },
  pro: {
    aiMonthly:        envInt("PRO_AI_MONTHLY_LIMIT", 100),
    aiBurstPerMinute: envInt("PRO_AI_BURST_PER_MINUTE", 10),
    savedWorks:       envInt("PRO_SAVED_WORKS_LIMIT", Number.MAX_SAFE_INTEGER),
    advancedCleanupMonthly: envInt("PRO_ADVANCED_CLEANUP_LIMIT", Number.MAX_SAFE_INTEGER),
  },
};

// ── Vad varje plan får göra ───────────────────────────────────────────
//
// Free är avsiktligt en hel produkt. Man kan läsa, lyssna, recitera, få
// rättning och se att man blir bättre. Det som ligger bakom Pro är inte
// kärnan utan det som gör kärnan snabbare.
export const ENTITLEMENTS: Record<PlanId, readonly Feature[]> = {
  free: [
    FEATURE.BASIC_RECITATION,
    FEATURE.BASIC_RHYTHM,
    FEATURE.SAVED_CUSTOM_TEXTS, // begränsat av LIMITS.free.savedWorks
    FEATURE.AI_EXERCISES,       // begränsat av LIMITS.free.aiMonthly
    FEATURE.BASIC_CLEANUP,      // obegränsat — det är bara aritmetik
    // Free får två i månaden. Funktionen är alltså INTE låst; den tar
    // slut. Skillnaden spelar roll: ett hänglås ber om pengar innan
    // någon vet vad de köper, en förbrukad ranson ber om dem i det
    // ögonblick de precis sett vad den gör.
    FEATURE.ADVANCED_CLEANUP,
  ],
  pro: [
    FEATURE.BASIC_RECITATION,
    FEATURE.ADVANCED_RECITATION,
    FEATURE.BASIC_RHYTHM,
    FEATURE.ADVANCED_RHYTHM,
    FEATURE.SAVED_CUSTOM_TEXTS,
    FEATURE.AI_EXERCISES,
    FEATURE.AI_GLOSSARY,
    FEATURE.TRANSLATION,
    FEATURE.LANGUAGE_MODE,
    FEATURE.PERFORMANCE_ANALYSIS,
    FEATURE.ADVANCED_PROGRESS,
    FEATURE.PERSONALIZED_STUDY,
    FEATURE.BASIC_CLEANUP,
    FEATURE.ADVANCED_CLEANUP,
  ],
};

// ── Pris ──────────────────────────────────────────────────────────────
// Belopp i ören. Stripe räknar i minsta valutaenhet och det gör vi också,
// så att ingen avrundning kan uppstå på vägen.
export interface PlanPrice {
  interval:    BillingInterval;
  amountMinor: number;
  currency:    string;
  /** price_… från Stripe. Sätts per miljö, aldrig i koden. */
  stripePriceId: string | undefined;
}

export const PRICES: Record<BillingInterval, PlanPrice> = {
  month: {
    interval:      "month",
    amountMinor:   envInt("PRO_PRICE_MONTHLY_MINOR", 4_990), // 49,90 kr
    currency:      process.env.BILLING_CURRENCY ?? "sek",
    stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY,
  },
  year: {
    interval:      "year",
    // 449 mot 12 × 49,90 = 598,80 ger 25 % rabatt, alltsa ungefar tre
    // manader gratis. Samma proportion som tidigare.
    amountMinor:   envInt("PRO_PRICE_YEARLY_MINOR", 44_900), // 449,00 kr
    currency:      process.env.BILLING_CURRENCY ?? "sek",
    stripePriceId: process.env.STRIPE_PRICE_PRO_YEARLY,
  },
};

export interface Plan {
  id:      PlanId;
  name:    string;
  tagline: string;
  limits:  PlanLimits;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id:      "free",
    name:    "Rhapsode",
    tagline: "Read, recite and carry a text you care about.",
    limits:  LIMITS.free,
  },
  pro: {
    id:      "pro",
    name:    "Rhapsode Pro",
    tagline: "The whole apparatus: closer reading, harder practice, faster mastery.",
    limits:  LIMITS.pro,
  },
};

/** 7900 → "79 kr". Heltal visas utan decimaler; 79,50 visas med. */
export function formatPrice(amountMinor: number, currency = "sek"): string {
  const major = amountMinor / 100;
  const isWhole = amountMinor % 100 === 0;
  const formatted = new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
  return currency.toLowerCase() === "sek"
    ? `${formatted} kr`
    : `${formatted} ${currency.toUpperCase()}`;
}

/** Hur mycket årsplanen sparar, i procent. För en enda rad text i UI:t. */
export function yearlySavingPercent(): number {
  const twelveMonths = PRICES.month.amountMinor * 12;
  if (twelveMonths <= 0) return 0;
  return Math.round((1 - PRICES.year.amountMinor / twelveMonths) * 100);
}
