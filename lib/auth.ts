// lib/auth.ts
// Clerk-helpers: hämta aktuell användare och synka mot DB
//
// Fas 7: requireUser() kör nu reconcileStreak() efter upsert. Eftersom
// requireUser() anropas från varje sida och route, betyder det att en bruten
// streak visas korrekt direkt vid nästa sidladdning — inte bara efter nästa
// avslutade träningssession (se lib/streaks.ts för varför det annars hade
// kunnat visa en streak som redan är död).

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./db";
import { reconcileStreak } from "./streaks";
import type { RhapsodeUser } from "@/types";

/**
 * Hämtar den inloggade Clerk-användaren och ser till att
 * en matchande rad finns i vår DB. Returnerar DB-användaren.
 * Kastar fel om ingen är inloggad.
 */
export async function requireUser(): Promise<RhapsodeUser> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("UNAUTHORIZED");

  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("UNAUTHORIZED");

  const username =
    clerkUser.username ||
    `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() ||
    clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Rhapsode";

  // Upsert: skapa om ny, annars hämta befintlig
  const user = await prisma.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      username,
      avatarUrl: clerkUser.imageUrl ?? null,
    },
    update: {
      // Uppdatera avatar om den ändrats i Clerk
      avatarUrl: clerkUser.imageUrl ?? null,
      lastActive: new Date(),
    },
  });

  // Fas 7: rätta till streakDays om en dag missades medan användaren var borta
  const streakDays = await reconcileStreak(user.id);

  return { ...user, streakDays } as RhapsodeUser;
}
