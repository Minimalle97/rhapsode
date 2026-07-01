"use client";
// components/practice/QualityRating.tsx
// Fas 8: delad 3-knapps självskattning för Read/Hide-läget.
// Kvalitet-värdena matchar XP_TABLE.practice_hard/practice_ok/practice_easy
// i lib/xp.ts exakt — "Easy" ger fullt SM-2-pass (5), "Hard" räcker INTE
// för SM-2-pass (quality 2 < 3), vilket är avsiktligt: att medvetet
// markera något som svårt ska faktiskt korta intervallet, inte bara ge
// mindre XP.

import type { CSSProperties } from "react";

interface QualityRatingProps {
  onRate:    (quality: number) => void;
  disabled?: boolean;
}

const OPTIONS: { quality: number; label: string; color: string }[] = [
  { quality: 2, label: "Hard", color: "var(--red)" },
  { quality: 3, label: "OK",   color: "var(--blue)" },
  { quality: 5, label: "Easy", color: "var(--green)" },
];

export function QualityRating({ onRate, disabled }: QualityRatingProps) {
  return (
    <div style={{ display: "flex", gap: "10px" }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onRate(opt.quality)}
          disabled={disabled}
          style={btnStyle(opt.color)}
          onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = `${opt.color}1A`; }}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function btnStyle(color: string): CSSProperties {
  return {
    flex:         1,
    padding:      "12px 0",
    borderRadius: "var(--r2)",
    border:       `1px solid ${color}55`,
    background:   "transparent",
    color,
    fontSize:     "14px",
    fontFamily:   "var(--fb)",
    letterSpacing: "0.02em",
    cursor:       "pointer",
    transition:   "background .15s",
  };
}
