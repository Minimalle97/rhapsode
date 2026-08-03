// lib/auth.ts
// Clerk-helpers: hämta aktuell användare och synka mot DB.
//
// OPTIMERING: requireUser() anropades tidigare en gång per komponent som
// behövde användaren — layout, sida, och varje API-route. Varje anrop gjorde
// ett nätverksanrop till Clerk PLUS en upsert mot databasen. På en enda
// sidladdning blev det 3–4 rundturer.
//
// React `cache()` gör att funktionen körs EN gång per request och att alla
// efterföljande anrop får samma resultat direkt ur minnet.

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./db";
import type { RhapsodeUser } from "@/types";

/**
 * Hämtar inloggad användare och ser till att en matchande DB-rad finns.
 * Kastar "UNAUTHORIZED" om ingen är inloggad.
 *
 * Cachad per request — anropa så många gånger du vill, det kostar inget extra.
 */
export const requireUser = cache(async (): Promise<RhapsodeUser> => {
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
    update: {
      lastActive: new Date(),
    },
    // Hämta bara kolumnerna vi faktiskt använder
    select: {
      id: true,
      clerkId: true,
      username: true,
      avatarUrl: true,
      xp: true,
      rank: true,
      streakDays: true,
      lastActive: true,
      createdAt: true,
    },
  });

  return user as RhapsodeUser;
});

/**
 * Som requireUser men kastar inte — returnerar null om utloggad.
 * Använd i komponenter som ska funka både in- och utloggade.
 */
export const getUser = cache(async (): Promise<RhapsodeUser | null> => {
  try {
    return await requireUser();
  } catch {
    return null;
  }
});
