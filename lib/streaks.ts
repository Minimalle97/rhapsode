// lib/streaks.ts
// Fas 7: streaks & dagliga mål.
//
// Designval värt att känna till: streaken räknas på AKTIVITET (minst en
// PracticeSession loggad den dagen), inte på om dagens tidsmål uppnåtts.
// Originalplanens skiss gjorde likadant (kollade bara att en DailyGoal-rad
// fanns för igår). Hade jag istället krävt completedSecs >= targetSecs för
// att räkna dagen, hade streaken aldrig kunnat öka idag — durationSecs är 0
// i varje session tills praktik-sidan faktiskt mäter tid (se Fas 6-README).
// Det dagliga MÅLET (completedSecs/targetSecs) är en separat, kompletterande
// indikator som fylls i takt med att tid faktiskt rapporteras.

import { prisma } from "./db";

const DEFAULT_TARGET_SECS = 600; // 10 minuter

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUTCDay(d: Date): Date {
  return new Date(`${dayKey(d)}T00:00:00.000Z`);
}

function addUTCDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

export interface PracticeSessionStreakResult {
  streakDays:         number;
  isFirstSessionToday: boolean;
  completedSecs:      number;
  targetSecs:         number;
  goalMet:            boolean;
}

/**
 * Kör varje gång en träningssession sparas (från PATCH /api/sections).
 * Lägger till durationSecs på dagens DailyGoal (skapar raden om den
 * saknas) och räknar upp streaken om det är dagens FÖRSTA session.
 */
export async function recordPracticeSession(
  userId: string,
  durationSecs: number
): Promise<PracticeSessionStreakResult> {
  const today = startOfUTCDay(new Date());

  const existing = await prisma.dailyGoal.findUnique({
    where: { userId_date: { userId, date: today } },
  });
  const isFirstSessionToday = !existing;

  const goal = await prisma.dailyGoal.upsert({
    where:  { userId_date: { userId, date: today } },
    create: { userId, date: today, targetSecs: DEFAULT_TARGET_SECS, completedSecs: durationSecs },
    update: { completedSecs: { increment: durationSecs } },
  });

  let streakDays: number;
  if (isFirstSessionToday) {
    streakDays = await bumpStreak(userId, today);
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true } });
    streakDays = user?.streakDays ?? 0;
  }

  return {
    streakDays,
    isFirstSessionToday,
    completedSecs: goal.completedSecs,
    targetSecs:    goal.targetSecs,
    goalMet:       goal.completedSecs >= goal.targetSecs,
  };
}

/** Höjer streaken om gårdagen hade aktivitet, annars startar om på 1. */
async function bumpStreak(userId: string, today: Date): Promise<number> {
  const yesterday = addUTCDays(today, -1);

  const hadYesterday = await prisma.dailyGoal.findUnique({
    where: { userId_date: { userId, date: yesterday } },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true } });
  const newStreak = hadYesterday ? (user?.streakDays ?? 0) + 1 : 1;

  await prisma.user.update({ where: { id: userId }, data: { streakDays: newStreak } });
  return newStreak;
}

/**
 * Kontrollerar om en lagrad streak borde ha brutits medan användaren var
 * borta. Appen har ingen schemaläggare (inget cron-jobb), så detta körs
 * lat — från lib/auth.ts requireUser(), dvs. vid varje sidladdning — istället
 * för att vänta på nästa träningssession för att upptäcka en bruten streak.
 * Tidig retur om streaken redan är 0 håller kostnaden nära noll i normalfallet.
 */
export async function reconcileStreak(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true } });
  if (!user || user.streakDays === 0) return 0;

  const today     = startOfUTCDay(new Date());
  const yesterday = addUTCDays(today, -1);

  const [hasToday, hasYesterday] = await Promise.all([
    prisma.dailyGoal.findUnique({ where: { userId_date: { userId, date: today } } }),
    prisma.dailyGoal.findUnique({ where: { userId_date: { userId, date: yesterday } } }),
  ]);

  if (hasToday || hasYesterday) return user.streakDays; // fortfarande vid liv

  await prisma.user.update({ where: { id: userId }, data: { streakDays: 0 } });
  return 0;
}

/** Dagens mål-status, för UI (DailyGoalCard). Skapar ingen rad — bara default-värden om ingen finns än. */
export async function getTodayGoal(userId: string): Promise<{ completedSecs: number; targetSecs: number }> {
  const today = startOfUTCDay(new Date());
  const goal = await prisma.dailyGoal.findUnique({ where: { userId_date: { userId, date: today } } });
  return {
    completedSecs: goal?.completedSecs ?? 0,
    targetSecs:    goal?.targetSecs ?? DEFAULT_TARGET_SECS,
  };
}
