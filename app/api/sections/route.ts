// app/api/sections/route.ts
// PATCH /api/sections?id=xxx
// Fas 8: tar nu även emot recordingPath (valfri) — sparas på PracticeSession
// om Recite-läget laddade upp en inspelning.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sm2 } from "@/lib/sm2";
import { calcSessionXP, getRank, XP_TABLE } from "@/lib/xp";
import { checkAndAwardMedal } from "@/lib/medals";
import { recordPracticeSession } from "@/lib/streaks";
import type { UpdateSectionPayload } from "@/types";

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const sectionId = searchParams.get("id");
    if (!sectionId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body: UpdateSectionPayload = await req.json();
    const { quality, score, mode, durationSecs, recordingPath } = body;

    if (quality == null || !mode) {
      return NextResponse.json({ error: "Missing quality or mode" }, { status: 400 });
    }

    // Hämta sektion + verk (för workTitle + author i svaret)
    const section = await prisma.section.findFirst({
      where:   { id: sectionId, work: { userId: user.id } },
      include: { work: { select: { id: true, title: true, author: true } } },
    });
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // SM-2
    const sm2Result = sm2({
      quality,
      sm2Reps:     section.sm2Reps,
      sm2EF:       section.sm2EF,
      sm2Interval: section.sm2Interval,
    });

    // XP för själva sessionen
    const sessionXP = calcSessionXP(quality, score);

    // Transaktion: uppdatera sektion + skapa session + ge sessions-XP
    await prisma.$transaction([
      prisma.section.update({
        where: { id: sectionId },
        data: {
          status:      sm2Result.status,
          sm2Reps:     sm2Result.sm2Reps,
          sm2EF:       sm2Result.sm2EF,
          sm2Interval: sm2Result.sm2Interval,
          nextReview:  sm2Result.nextReview,
        },
      }),
      prisma.practiceSession.create({
        data: {
          sectionId,
          quality,
          score:         score ?? null,
          mode,
          xpEarned:      sessionXP,
          durationSecs:  durationSecs ?? 0,
          recordingPath: recordingPath ?? null,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data:  { xp: { increment: sessionXP } },
      }),
    ]);

    // Streak + dagligt mål (Fas 7)
    const streak = await recordPracticeSession(user.id, durationSecs ?? 0);

    let totalXpEarned = sessionXP;
    if (streak.isFirstSessionToday) {
      await prisma.user.update({
        where: { id: user.id },
        data:  { xp: { increment: XP_TABLE.daily_streak_bonus } },
      });
      totalXpEarned += XP_TABLE.daily_streak_bonus;
    }

    // Ny rank efter all XP (sessions-XP + ev. streak-bonus)
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const rank        = getRank(updatedUser!.xp);

    if (rank.titleEn !== updatedUser!.rank) {
      await prisma.user.update({
        where: { id: user.id },
        data:  { rank: rank.titleEn },
      });
    }

    // Medalj-check
    const medal = await checkAndAwardMedal(user.id, section.workId);

    return NextResponse.json({
      xpEarned:     totalXpEarned,
      newXP:        updatedUser!.xp,
      rank:         rank.titleEn,
      medalAwarded: medal
        ? {
            ...medal,
            workTitle: section.work.title,
            author:    section.work.author,
          }
        : null,
      streak: {
        days:          streak.streakDays,
        bonusAwarded:  streak.isFirstSessionToday,
        bonusXP:       streak.isFirstSessionToday ? XP_TABLE.daily_streak_bonus : 0,
        completedSecs: streak.completedSecs,
        targetSecs:    streak.targetSecs,
        goalMet:       streak.goalMet,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
