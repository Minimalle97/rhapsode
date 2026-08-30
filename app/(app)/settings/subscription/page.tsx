// app/(app)/settings/subscription/page.tsx
// Settings → Subscription.
//
// Allt som visas här räknas ut på servern. Sidan tar emot en färdig vy
// och skickar aldrig ut planen som något klienten kan påverka — den som
// ändrar `isPro` i React DevTools får se en annan knapp och ingenting
// annat, eftersom varje route kontrollerar behörigheten på nytt.

import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { aiAllowance } from "@/lib/ai/run";
import { countWorks } from "@/lib/billing/limits";
import { stripeConfigured } from "@/lib/billing/stripe";
import { PRICES, formatPrice, yearlySavingPercent } from "@/lib/billing/plans";
import { SubscriptionPanel, type SubscriptionView } from "@/components/billing/SubscriptionPanel";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscription" };

export default async function SubscriptionPage() {
  const user = await requireUser();
  const ent  = await getEntitlements(user);

  const [allowance, works] = await Promise.all([
    aiAllowance(user.id, ent),
    countWorks(user.id),
  ]);

  const finite = (n: number) => (Number.isFinite(n) && n < Number.MAX_SAFE_INTEGER ? n : null);

  const view: SubscriptionView = {
    plan:   ent.plan,
    source: ent.source,
    status: ent.status,
    isPro:  ent.isPro,
    monthly: formatPrice(PRICES.month.amountMinor, PRICES.month.currency),
    yearly:  formatPrice(PRICES.year.amountMinor,  PRICES.year.currency),
    yearlySaving: yearlySavingPercent(),
    allowance: {
      used:     allowance.used,
      limit:    finite(allowance.limit),
      resetsAt: allowance.resetsAt.toISOString(),
    },
    worksUsed:  works,
    worksLimit: finite(ent.limits.savedWorks),
    currentPeriodEnd:  ent.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
    billingConfigured: stripeConfigured(),
  };

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px 80px" }}>
      <Link
        href="/profile"
        style={{ fontSize: "13px", color: "var(--muted)", textDecoration: "none",
                 display: "inline-block", marginBottom: "24px" }}
      >
        ← Profile
      </Link>

      <h1 style={{
        fontFamily: "var(--fd)", fontSize: "32px", fontWeight: 300,
        letterSpacing: "0.05em", color: "var(--parch)", marginBottom: "26px",
      }}>
        Subscription
      </h1>

      <SubscriptionPanel view={view} />

      <p style={{ marginTop: "26px", fontSize: "12px", color: "var(--muted)" }}>
        <Link href="/legal/terms" style={{ color: "var(--muted)" }}>Terms</Link>
        <span style={{ margin: "0 8px", color: "var(--bg4)" }}>·</span>
        <Link href="/legal/privacy" style={{ color: "var(--muted)" }}>Privacy</Link>
      </p>
    </div>
  );
}
