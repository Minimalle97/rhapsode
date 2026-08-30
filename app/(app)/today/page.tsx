// app/(app)/today/page.tsx
//
// Dagens ko, med paminnelsen om mastartitlar ovanfor. Har hor den hemma:
// det ar sidan man oppnar for att veta vad som behover goras idag, och en
// titel som haller pa att falla ar precis det.

import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { TodayQueue } from "@/components/today/TodayQueue";
import { MasteryReminder } from "@/components/practice/MasteryReminder";
import { getEntitlements } from "@/lib/billing/entitlements";
import { DailyProOffer } from "@/components/billing/DailyProOffer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  const ent  = await getEntitlements(user);

  return (
    <>
      <div style={{ maxWidth: "660px", margin: "0 auto", padding: "32px 24px 0" }}>
        {/* Streamas separat sa att kon inte behover vanta pa den. */}
        {/* Paminnelsen forst — den galler nagot man redan gjort. */}
        <Suspense fallback={null}>
          <MasteryReminder userId={user.id} />
        </Suspense>

        {!ent.isPro && <DailyProOffer />}
      </div>
      <TodayQueue />
    </>
  );
}
