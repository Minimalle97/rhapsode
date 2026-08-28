// app/(app)/progress/page.tsx
//
// ── RÄTTAT ────────────────────────────────────────────────────────────
// Sidan hämtade två saker som växte utan gräns:
//
//   1. Varje sektions FULLA TEXT för varje verk, för att räkna statusar.
//   2. VARJE träningssession du någonsin gjort, med hela sektionen och
//      verket inbakat i varje rad.
//
// Det andra är det värre: efter ett års användning är det tiotusentals
// rader, och sidan blir långsammare för varje pass du gör.
//
// Graferna visar 30 dagar och 12 veckor. Nu hämtas bara den perioden,
// och bara de fält som graferna faktiskt läser.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRank, getNextRank, xpToNextRank } from "@/lib/xp";
import { getTodayGoal } from "@/lib/streaks";
import { RankBar } from "@/components/rank/RankBar";
import { DailyGoalCard } from "@/components/goals/DailyGoalCard";
import {
  buildXpPerDay,
  buildSectionStatusByWork,
  buildReviewHeatmap,
  buildTimeByWork,
  buildScoreTrend,
} from "@/lib/stats";
import { XpPerDayChart } from "@/components/stats/XpPerDayChart";
import { SectionStatusChart } from "@/components/stats/SectionStatusChart";
import { ReviewHeatmap } from "@/components/stats/ReviewHeatmap";
import { TimeByWorkChart } from "@/components/stats/TimeByWorkChart";
import { ScoreTrendChart } from "@/components/stats/ScoreTrendChart";

export const dynamic = "force-dynamic";

// Graferna sträcker sig som längst 12 veckor bakåt
const WINDOW_DAYS = 90;

export default async function ProgressPage() {
  const user = await requireUser();
  const now  = new Date();
  const from = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const [works, sessions, todayGoal, counts] = await Promise.all([
    prisma.work.findMany({
      where:  { userId: user.id },
      select: {
        id: true, title: true,
        // Bara status — inte texten
        sections: { select: { status: true } },
      },
    }),

    prisma.practiceSession.findMany({
      where: {
        section:   { work: { userId: user.id } },
        createdAt: { gte: from },
      },
      select: {
        createdAt: true, xpEarned: true, durationSecs: true,
        score: true, mode: true,
        section: { select: { work: { select: { id: true, title: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),

    getTodayGoal(user.id),

    // Totalerna räknas i databasen i stället för i minnet
    Promise.all([
      prisma.section.count({ where: { work: { userId: user.id } } }),
      prisma.section.count({
        where: { work: { userId: user.id }, status: { in: ["mastered", "permanent"] } },
      }),
      prisma.section.count({
        where: { work: { userId: user.id }, status: { in: ["learning", "learned"] } },
      }),
      prisma.section.count({
        where: { work: { userId: user.id }, nextReview: { lte: now } },
      }),
    ]),
  ]);

  const [totalSections, masteredSections, learningNow, dueToday] = counts;

  const rank     = getRank(user.xp);
  const nextRank = getNextRank(user.xp);
  const toNext   = xpToNextRank(user.xp);
  const progress = nextRank
    ? Math.round(((user.xp - rank.xpRequired) / (nextRank.xpRequired - rank.xpRequired)) * 100)
    : 100;

  const xpPerDay      = buildXpPerDay(sessions, 30);
  const sectionStatus = buildSectionStatusByWork(works);
  const heatmap       = buildReviewHeatmap(sessions, 12);
  const timeByWork    = buildTimeByWork(sessions);
  const scoreTrend    = buildScoreTrend(sessions, 30);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 24px 80px" }}>
      <h1 style={{
        fontFamily: "var(--fd)", fontSize: "32px", fontWeight: 300,
        letterSpacing: "0.06em", color: "var(--parch)", marginBottom: "28px",
      }}>
        Progress
      </h1>

      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "26px" }}>
        <div style={{ flex: "2 1 320px" }}>
          <RankBar
            xp={user.xp}
            rank={rank}
            nextRank={nextRank}
            progressPct={progress}
            toNext={toNext}
          />
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <DailyGoalCard
            completedSecs={todayGoal.completedSecs}
            targetSecs={todayGoal.targetSecs}
            streakDays={user.streakDays}
          />
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "12px", marginBottom: "34px",
      }}>
        <Stat label="Sections" value={totalSections} />
        <Stat label="Mastered" value={masteredSections} accent />
        <Stat label="Learning" value={learningNow} />
        <Stat label="Due now"  value={dueToday} accent={dueToday > 0} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <XpPerDayChart data={xpPerDay} />
        <SectionStatusChart data={sectionStatus} />
        <ReviewHeatmap data={heatmap} />
        <TimeByWorkChart data={timeByWork} />
        <ScoreTrendChart data={scoreTrend} />
      </div>
    </div>
  );
}

function Stat({
  label, value, accent,
}: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--bord)",
      borderRadius: "var(--r)", padding: "16px 18px",
    }}>
      <p style={{
        fontSize: "10px", letterSpacing: "0.15em", color: "var(--muted)",
        textTransform: "uppercase", marginBottom: "6px",
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "28px", fontWeight: 300,
        color: accent ? "var(--gold)" : "var(--parch)",
      }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
