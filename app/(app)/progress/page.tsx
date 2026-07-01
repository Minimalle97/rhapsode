// app/(app)/progress/page.tsx
// Fas 7: DailyGoalCard bredvid RankBar — visar dagens måltid + streak.
// streakDays kommer redan rättat från requireUser() (se lib/auth.ts).

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

export default async function ProgressPage() {
  const user = await requireUser();

  const [works, sessions, todayGoal] = await Promise.all([
    prisma.work.findMany({
      where:   { userId: user.id },
      include: { sections: true },
    }),
    // Alla träningssessioner för användaren, äldst → nyast (filtrerat via
    // section → work → userId, eftersom PracticeSession saknar eget userId).
    prisma.practiceSession.findMany({
      where:   { section: { work: { userId: user.id } } },
      include: { section: { include: { work: { select: { id: true, title: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    getTodayGoal(user.id),
  ]);

  const totalSections    = works.reduce((a, w) => a + w.sections.length, 0);
  const masteredSections = works.reduce(
    (a, w) => a + w.sections.filter(s => ["mastered", "permanent"].includes(s.status)).length, 0
  );
  const learningNow = works.reduce(
    (a, w) => a + w.sections.filter(s => ["learning", "learned"].includes(s.status)).length, 0
  );
  const dueToday = works.reduce(
    (a, w) => a + w.sections.filter(s => s.nextReview && new Date(s.nextReview) <= new Date()).length, 0
  );

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
    <div style={{ maxWidth: "920px", margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontFamily: "var(--fd)", fontSize: "32px", fontWeight: 300, letterSpacing: "0.06em", color: "var(--parch)", marginBottom: "32px" }}>
        Progress
      </h1>

      {/* Rank + dagligt mål */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
        <div style={{ flex: "2 1 320px" }}>
          <RankBar
            xp={user.xp}
            rank={rank}
            nextRank={nextRank}
            progressPct={progress}
            toNext={toNext}
          />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <DailyGoalCard
            completedSecs={todayGoal.completedSecs}
            targetSecs={todayGoal.targetSecs}
            streakDays={user.streakDays}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", marginBottom: "40px" }}>
        <StatCard label="Works in study"   value={works.length} />
        <StatCard label="Total sections"   value={totalSections} />
        <StatCard label="Mastered"         value={masteredSections} highlight />
        <StatCard label="Active learning"  value={learningNow} />
        <StatCard label="Due today"        value={dueToday} warn={dueToday > 0} />
        <StatCard label="Day streak"       value={user.streakDays} />
      </div>

      {/* Statistics */}
      <h2 style={{ fontFamily: "var(--fd)", fontSize: "20px", fontWeight: 400, color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "16px" }}>
        Statistics
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <XpPerDayChart data={xpPerDay} />
        <SectionStatusChart data={sectionStatus} />
        <ReviewHeatmap data={heatmap} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          <TimeByWorkChart data={timeByWork} />
          <ScoreTrendChart data={scoreTrend} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight, warn }: {
  label: string; value: number; highlight?: boolean; warn?: boolean;
}) {
  return (
    <div style={{
      background:   "var(--bg2)",
      border:       "1px solid var(--bord)",
      borderRadius: "var(--r)",
      padding:      "20px",
    }}>
      <p style={{ fontSize: "11px", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "8px" }}>
        {label}
      </p>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "36px", fontWeight: 300,
        color: warn ? "var(--gold)" : highlight ? "var(--green)" : "var(--parch)",
      }}>
        {value}
      </p>
    </div>
  );
}
