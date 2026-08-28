// app/api/sections/route.ts
// PATCH /api/sections?id=xxx

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sm2 } from "@/lib/sm2";
import { calcXP, getRank, dailyBonus, XP } from "@/lib/xp";
import { checkAndAwardMedal } from "@/lib/medals";
import { recordPracticeSession } from "@/lib/streaks";
import type { UpdateSectionPayload } from "@/types";

const MASTERED = ["mastered", "permanent"];

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const sectionId = searchParams.get("id");
    if (!sectionId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const body: UpdateSectionPayload = await req.json();
    const { quality, score, mode, durationSecs, recordingPath } = body;

    if (quality == null || !mode) {
      return NextResponse.json({ error: "Missing quality or mode" }, { status: 400 });
    }

    const section = await prisma.section.findFirst({
      where:   { id: sectionId, work: { userId: user.id } },
      include: { work: { select: { id: true, title: true, author: true } } },
    });
    if (!section) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date();

    // Kontext för XP-beräkningen
    const wasDue = !!section.nextReview && new Date(section.nextReview) <= now;

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const repeatsToday = await prisma.practiceSession.count({
      where: { sectionId, createdAt: { gte: startOfDay } },
    });

    const statusBefore = section.status;

    // SM-2
    const sm2Result = sm2({
      quality,
      sm2Reps:     section.sm2Reps,
      sm2EF:       section.sm2EF,
      sm2Interval: section.sm2Interval,
    });
    const statusAfter = sm2Result.status;

    // XP
    const award = calcXP({
      quality,
      mode,
      score:        score ?? null,
      wasDue,
      repeatsToday,
      statusBefore,
      statusAfter,
    });

    await prisma.$transaction([
      prisma.section.update({
        where: { id: sectionId },
        data: {
          status:      statusAfter,
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
          xpEarned:      award.total,
          durationSecs:  durationSecs ?? 0,
          recordingPath: recordingPath ?? null,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data:  { xp: { increment: award.total } },
      }),
    ]);

    // Blev en hel del färdig?
    let partBonus = 0;
    let partName: string | null = null;

    const justMastered =
      MASTERED.includes(statusAfter) && !MASTERED.includes(statusBefore);

    if (justMastered && section.partId) {
      const remaining = await prisma.section.count({
        where: { partId: section.partId, status: { notIn: MASTERED } },
      });

      if (remaining === 0) {
        partBonus = XP.partComplete;
        const part = await prisma.part.findUnique({
          where:  { id: section.partId },
          select: { name: true },
        });
        partName = part?.name ?? null;

        await prisma.user.update({
          where: { id: user.id },
          data:  { xp: { increment: partBonus } },
        });
      }
    }

    // Streak och dagsbonus
    const streak = await recordPracticeSession(user.id, durationSecs ?? 0);

    let streakBonus = 0;
    if (streak.isFirstSessionToday && award.total > 0) {
      streakBonus = dailyBonus(streak.streakDays);
      await prisma.user.update({
        where: { id: user.id },
        data:  { xp: { increment: streakBonus } },
      });
    }

    const totalXpEarned = award.total + partBonus + streakBonus;

    // Medalj för helt verk. Måste delas ut FÖRE saldot läses av — den ger
    // XP den med, och tidigare rapporterades ett newXP som saknade den.
    const medal = await checkAndAwardMedal(user.id, section.workId);

    // Ny rank
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const rank        = getRank(updatedUser!.xp);
    const rankUp      = rank.titleEn !== updatedUser!.rank;

    if (rankUp) {
      await prisma.user.update({
        where: { id: user.id },
        data:  { rank: rank.titleEn },
      });
    }

    return NextResponse.json({
      xpEarned: totalXpEarned,
      newXP:    updatedUser!.xp,
      rank:     rank.titleEn,
      rankUp,

      breakdown: {
        session:   award.session,
        accuracy:  award.accuracy,
        milestone: award.milestone,
        part:      partBonus,
        streak:    streakBonus,
        reason:    award.reason,
      },

      status: {
        before:  statusBefore,
        after:   statusAfter,
        changed: statusAfter !== statusBefore,
      },

      partCompleted: partBonus > 0 ? partName : null,

      medalAwarded: medal
        ? {
            ...medal,
            workTitle: section.work.title,
            author:    section.work.author,
          }
        : null,

      streak: {
        days:          streak.streakDays,
        bonusAwarded:  streakBonus > 0,
        bonusXP:       streakBonus,
        completedSecs: streak.completedSecs,
        targetSecs:    streak.targetSecs,
        goalMet:       streak.goalMet,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
