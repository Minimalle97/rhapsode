// lib/auth.ts
// Clerk-helpers: hämta aktuell användare och synka mot DB.
//
// Cachad per request med React `cache()` — anropa så många gånger du vill,
// det kostar bara ett Clerk-anrop och en databasfråga totalt.
//
// UPPDATERAD: hämtar nu även `handle`, som vänfunktionen behöver.

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./db";
import { reconcileStreak } from "./streaks";

export interface SessionUser {
  id:         string;
  clerkId:    string;
  username:   string;
  handle:     string | null;
  avatarUrl:  string | null;
  xp:         number;
  rank:       string;
  streakDays: number;
  lastActive: Date;
  createdAt:  Date;

  // Prenumerationsraden. Läses av lib/billing/entitlements.ts och av
  // ingen annan — jämför aldrig plan direkt, fråga canUseFeature().
  plan:               string;
  planSource:         string;
  subscriptionStatus: string;
  currentPeriodEnd:   Date | null;
  cancelAtPeriodEnd:  boolean;
  stripeCustomerId:   string | null;
}

export const requireUser = cache(async (): Promise<SessionUser> => {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("UNAUTHORIZED");

  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("UNAUTHORIZED");

  const username =
    clerkUser.username ||
    `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() ||
    clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Rhapsode";

  const user = await prisma.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      username,
      avatarUrl: clerkUser.imageUrl ?? null,
    },
    // Rör inte avatarUrl — den kan ha ersatts av en egen uppladdning
    update: { lastActive: new Date() },
    select: {
      id: true, clerkId: true, username: true, handle: true,
      avatarUrl: true, xp: true, rank: true,
      streakDays: true, lastActive: true, createdAt: true,
      plan: true, planSource: true, subscriptionStatus: true,
      currentPeriodEnd: true, cancelAtPeriodEnd: true, stripeCustomerId: true,
    },
  });

  // En bruten streak upptäcktes tidigare aldrig: reconcileStreak var skriven
  // för att köras härifrån men blev aldrig anropad, så en streak kunde ligga
  // kvar på 14 dagar i månader utan att någon övat. Kostar noll frågor när
  // streaken redan är 0, vilket den är i normalfallet.
  if (user.streakDays > 0) {
    const streakDays = await reconcileStreak(user.id, user.streakDays);
    if (streakDays !== user.streakDays) return { ...user, streakDays };
  }

  return user;
});

/** Som requireUser men kastar inte — returnerar null om utloggad. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  try {
    return await requireUser();
  } catch {
    return null;
  }
});
