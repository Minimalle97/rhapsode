"use client";
// components/rank/RankBar.tsx
// Återanvändbar XP + rank-progress bar

import { RANKS } from "@/lib/xp";
import type { Rank } from "@/types";

interface RankBarProps {
  xp: number;
  rank: Rank;
  nextRank: Rank | null;
  progressPct: number;     // 0-100
  toNext: number;
  compact?: boolean;       // liten variant för nav
}

export function RankBar({
  xp, rank, nextRank, progressPct, toNext, compact = false,
}: RankBarProps) {
  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{
          fontFamily: "var(--fd)",
          fontSize: "13px",
          color: "var(--gold)",
          whiteSpace: "nowrap",
        }}>
          {rank.titleEn}
        </span>
        <div style={{ width: "64px", height: "2px", background: "var(--bg4)", borderRadius: "1px", flexShrink: 0 }}>
          <div style={{
            height: "100%",
            width: `${progressPct}%`,
            background: "var(--gold)",
            borderRadius: "1px",
            transition: "width .5s ease",
          }} />
        </div>
        <span style={{ fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap" }}>
          {xp.toLocaleString()} XP
        </span>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--bg2)",
      border: "1px solid var(--bord)",
      borderRadius: "var(--r)",
      padding: "24px 28px",
    }}>
      {/* Current rank */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
        <div>
          <p style={{
            fontSize: "10px",
            letterSpacing: "0.2em",
            color: "var(--gold)",
            textTransform: "uppercase",
            marginBottom: "4px",
          }}>
            Rank {rank.level} of {RANKS.length}
          </p>
          <h2 style={{
            fontFamily: "var(--fd)",
            fontSize: "26px",
            fontWeight: 400,
            color: "var(--parch)",
            letterSpacing: "0.04em",
          }}>
            {rank.titleEn}
          </h2>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "22px", fontFamily: "var(--fd)", fontWeight: 300, color: "var(--parch)" }}>
            {xp.toLocaleString()}
          </p>
          <p style={{ fontSize: "11px", color: "var(--muted)", letterSpacing: "0.1em" }}>XP</p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: "3px", background: "var(--bg4)", borderRadius: "2px", margin: "16px 0 8px" }}>
        <div style={{
          height: "100%",
          width: `${progressPct}%`,
          background: `linear-gradient(90deg, var(--gold2), var(--gold))`,
          borderRadius: "2px",
          transition: "width .6s ease",
        }} />
      </div>

      {/* Next rank label */}
      {nextRank ? (
        <p style={{ fontSize: "12px", color: "var(--muted)" }}>
          {toNext.toLocaleString()} XP until{" "}
          <span style={{ color: "var(--parch2)" }}>{nextRank.titleEn}</span>
        </p>
      ) : (
        <p style={{ fontSize: "12px", color: "var(--gold)" }}>
          Maximum rank achieved
        </p>
      )}
    </div>
  );
}
