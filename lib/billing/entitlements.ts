// lib/billing/entitlements.ts
//
// Den enda platsen i kodbasen som får svara på frågan "får den här
// personen göra det här".
//
// Regeln är enkel och gäller utan undantag: inget i app/ eller
// components/ jämför `user.plan === "pro"`. Man frågar canUseFeature().
// Skälet är inte snygghet utan att en spridd jämförelse är omöjlig att
// ändra när en tredje plan tillkommer, och lätt att glömma på precis det
// ställe där det kostar pengar.

import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  ENTITLEMENTS, LIMITS, PLANS,
  type Feature, type PlanId, type PlanLimits,
  type PlanSource, type SubscriptionStatus,
} from "./plans";

export interface EntitlementUser {
  id:                 string;
  clerkId:            string;
  plan:               string;
  planSource:         string;
  subscriptionStatus: string;
  currentPeriodEnd:   Date | null;
  cancelAtPeriodEnd:  boolean;
}

export interface Entitlements {
  plan:     PlanId;
  source:   PlanSource;
  status:   SubscriptionStatus;
  isPro:    boolean;
  limits:   PlanLimits;
  features: ReadonlySet<Feature>;
  currentPeriodEnd:  Date | null;
  cancelAtPeriodEnd: boolean;
  /** Sant när Pro gäller men inte kommer att förnyas. */
  endingSoon: boolean;
}

// ── Utvecklarnyckel ───────────────────────────────────────────────────
//
// En kommaseparerad lista i miljön. Matchar antingen vårt eget user-id
// eller Clerk-id:t, så att den fungerar oavsett vilket man råkar ha
// framför sig. Ligger utanför databasen med flit: den överlever att
// databasen läggs om, och den kan inte lösas in, delas vidare eller
// gå ut. Den är till för dig, inte för utdelning — för utdelning finns
// inlösbara koder i access.ts.
function developerIds(): string[] {
  return (process.env.RHAPSODE_DEVELOPER_USER_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export function isDeveloper(user: Pick<EntitlementUser, "id" | "clerkId">): boolean {
  const ids = developerIds();
  return ids.includes(user.id) || ids.includes(user.clerkId);
}

// ── Härledning ────────────────────────────────────────────────────────

/**
 * Räknar ut planen ur användarraden. Rena funktioner, inga frågor —
 * `hasActiveGrant` matas in av anroparen som vet om den behöver slås upp.
 */
export function derivePlan(
  user: EntitlementUser,
  grant: boolean | { plan: string },
  now: Date = new Date()
): { plan: PlanId; source: PlanSource; status: SubscriptionStatus } {
  if (isDeveloper(user)) {
    return { plan: "pro", source: "developer", status: "active" };
  }

  if (grant) {
    // En kod kan vara utfardad som "developer". Da beter sig kontot som
    // ett utvecklarkonto — Pro pa livstid, och DEV-markoren syns — utan
    // att nagot behover in i miljovariabeln. Det ar sa du ger nagon
    // permanent atkomst utan en ny deploy.
    const isDevGrant = typeof grant === "object" && grant.plan === "developer";
    return {
      plan:   "pro",
      source: isDevGrant ? "developer" : "grant",
      status: "active",
    };
  }

  const status = normaliseStatus(user.subscriptionStatus);
  const periodAlive =
    user.currentPeriodEnd !== null && user.currentPeriodEnd.getTime() > now.getTime();

  // active och trialing ger Pro rakt av.
  //
  // cancelled och past_due ger Pro så länge den betalda perioden löper.
  // Att stänga av mitt i en period man betalat för vore fel; att stänga
  // av vid en tillfälligt nekad dragning vore ännu sämre, för det
  // vanligaste skälet är ett kort som gått ut och som fixas på en dag.
  if (status === "active" || status === "trialing") {
    return { plan: "pro", source: "stripe", status };
  }
  if ((status === "cancelled" || status === "past_due") && periodAlive) {
    return { plan: "pro", source: "stripe", status };
  }

  return { plan: "free", source: "none", status: status === "free" ? "free" : status };
}

function normaliseStatus(raw: string): SubscriptionStatus {
  switch (raw) {
    case "trialing":
    case "active":
    case "past_due":
    case "cancelled":
    case "incomplete":
    case "free":
      return raw;
    // Stripe har fler lägen än vi bryr oss om.
    case "canceled":           return "cancelled";
    case "unpaid":             return "past_due";
    case "incomplete_expired": return "free";
    default:                   return "free";
  }
}

/** Bygger hela behörighetsbilden ur en plan. Ren funktion — lätt att testa. */
export function entitlementsForPlan(
  plan: PlanId,
  source: PlanSource,
  status: SubscriptionStatus,
  currentPeriodEnd: Date | null = null,
  cancelAtPeriodEnd = false
): Entitlements {
  return {
    plan,
    source,
    status,
    isPro:    plan === "pro",
    limits:   LIMITS[plan],
    features: new Set(ENTITLEMENTS[plan]),
    currentPeriodEnd,
    cancelAtPeriodEnd,
    endingSoon: plan === "pro" && source === "stripe" && (cancelAtPeriodEnd || status === "cancelled"),
  };
}

/**
 * Behörigheterna för den inloggade. Cachad per request, så det kostar
 * ingenting att fråga från både layouten och sidan.
 *
 * Slår bara upp grants när användarraden pekar dit — i normalfallet blir
 * det noll extra frågor.
 */
export const getEntitlements = cache(
  async (user: EntitlementUser): Promise<Entitlements> => {
    let grant: { plan: string } | null = null;

    if (user.planSource === "grant" || user.plan === "free") {
      grant = await activeGrant(user.id);
    }

    const { plan, source, status } = derivePlan(user, grant ?? false);
    return entitlementsForPlan(
      plan, source, status, user.currentPeriodEnd, user.cancelAtPeriodEnd
    );
  }
);

/** Den gallande behorigheten, eller null. Innehaller sin plan. */
export async function activeGrant(
  userId: string,
  now: Date = new Date()
): Promise<{ plan: string } | null> {
  return prisma.accessGrant.findFirst({
    where: {
      userId,
      revokedAt: null,
      startsAt:  { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    // En utvecklarkod slar en vanlig, om nagon har bada.
    orderBy: { plan: "desc" },
    select:  { plan: true },
  });
}

export async function hasActiveGrant(userId: string, now: Date = new Date()): Promise<boolean> {
  return (await activeGrant(userId, now)) !== null;
}

// ── Frågan man faktiskt ställer ───────────────────────────────────────

export function canUseFeature(ent: Entitlements, feature: Feature): boolean {
  return ent.features.has(feature);
}

/** Kastar när funktionen är låst. Fångas av toResponse() i guard.ts. */
export class FeatureLockedError extends Error {
  readonly feature: Feature;
  readonly requiredPlan: PlanId = "pro";

  constructor(feature: Feature) {
    super(`Feature ${feature} requires ${PLANS.pro.name}`);
    this.name = "FeatureLockedError";
    this.feature = feature;
  }
}

export function requireFeature(ent: Entitlements, feature: Feature): void {
  if (!canUseFeature(ent, feature)) throw new FeatureLockedError(feature);
}

/** Vilken plan som krävs för en funktion — för texten i uppgraderingsrutan. */
export function planRequiredFor(feature: Feature): PlanId {
  return ENTITLEMENTS.free.includes(feature) ? "free" : "pro";
}
