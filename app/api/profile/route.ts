// app/api/profile/route.ts
// GET   /api/profile   → profil + stats + medals + rank
// PATCH /api/profile   → uppdatera username

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRank, getNextRank, xpToNextRank } from "@/lib/xp";

export async function GET() {
  try {
    const user = await requireUser();

    const [medals, works, recentSessions] = await Promise.all([
      prisma.medal.findMany({
        where:   { userId: user.id },
        include: { work: { select: { title: true, author: true, type: true } } },
        orderBy: { earnedAt: "desc" },
      }),
      prisma.work.findMany({
        where:   { userId: user.id },
        include: { sections: true },
      }),
      prisma.practiceSession.findMany({
        where:   { section: { work: { userId: user.id } } },
        orderBy: { createdAt: "desc" },
        take:    50,
        include: {
          section: {
            select: {
              name:   true,
              workId: true,
              work:   { select: { title: true } },
            },
          },
        },
      }),
    ]);

    const rank     = getRank(user.xp);
    const nextRank = getNextRank(user.xp);
    const toNext   = xpToNextRank(user.xp);
    const progress = nextRank
      ? Math.round(((user.xp - rank.xpRequired) / (nextRank.xpRequired - rank.xpRequired)) * 100)
      : 100;

    const totalSections     = works.reduce((a, w) => a + w.sections.length, 0);
    const masteredSections  = works.reduce(
      (a, w) => a + w.sections.filter(s => ["mastered", "permanent"].includes(s.status)).length, 0
    );
    const totalXPFromSessions = recentSessions.reduce((a, s) => a + s.xpEarned, 0);

    return NextResponse.json({
      user: {
        id:         user.id,
        username:   user.username,
        avatarUrl:  user.avatarUrl,
        xp:         user.xp,
        rank:       rank.titleEn,
        rankLevel:  rank.level,
        streakDays: user.streakDays,
        createdAt:  user.createdAt,
      },
      rankProgress: {
        current:     rank,
        next:        nextRank,
        toNext,
        progressPct: progress,
      },
      stats: {
        totalWorks:       works.length,
        totalSections,
        masteredSections,
        totalSessions:    recentSessions.length,
        medals:           medals.length,
        totalXP:          user.xp,
      },
      medals,
      recentSessions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const { username } = await req.json();

    const trimmed = username?.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }
    if (trimmed.length > 40) {
      return NextResponse.json({ error: "Username too long (max 40 chars)" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data:  { username: trimmed },
    });

    return NextResponse.json({ username: updated.username });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
