"use client";
// components/goals/DailyGoalCard.tsx
// Fas 7: dagens framsteg mot träningsmålet + aktuell streak.
// Tänkt att sitta bredvid RankBar på Progress-sidan.

import type { CSSProperties } from "react";

interface DailyGoalCardProps {
  completedSecs: number;
  targetSecs:    number;
  streakDays:    number;
}

export function DailyGoalCard({ completedSecs, targetSecs, streakDays }: DailyGoalCardProps) {
  const pct = targetSecs > 0 ? Math.min(100, Math.round((completedSecs / targetSecs) * 100)) : 0;
  const met = completedSecs >= targetSecs;

  const minutesDone   = Math.floor(completedSecs / 60);
  const minutesTarget = Math.max(1, Math.ceil(targetSecs / 60));

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
        <p style={labelStyle}>Today's goal</p>
        <span style={{ fontSize: "13px", color: "var(--muted)", whiteSpace: "nowrap" }}>
          🔥 <span style={{ color: "var(--parch2)" }}>{streakDays}</span> day{streakDays === 1 ? "" : "s"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "10px" }}>
        <span style={{
          fontFamily: "var(--fd)",
          fontSize:   "26px",
          fontWeight: 300,
          color:      met ? "var(--green)" : "var(--parch)",
        }}>
          {minutesDone}
        </span>
        <span style={{ fontSize: "13px", color: "var(--muted)" }}>/ {minutesTarget} min</span>
        {met && <span style={{ fontSize: "12px", color: "var(--green)", marginLeft: "6px" }}>✓ Done</span>}
      </div>

      <div style={{ height: "6px", background: "var(--bg4)", borderRadius: "3px" }}>
        <div style={{
          height:       "100%",
          width:        `${pct}%`,
          background:   met ? "var(--green)" : "linear-gradient(90deg, var(--gold2), var(--gold))",
          borderRadius: "3px",
          transition:   "width .5s ease",
        }} />
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background:   "var(--bg2)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r)",
  padding:      "20px 22px",
  minWidth:     "200px",
};

const labelStyle: CSSProperties = {
  fontSize:      "10px",
  letterSpacing: "0.2em",
  color:         "var(--gold)",
  textTransform: "uppercase",
};
