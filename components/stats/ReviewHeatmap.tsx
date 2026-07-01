"use client";
// components/stats/ReviewHeatmap.tsx
// Fas 6: GitHub-stil heatmap över träningssessioner, senaste 12 veckorna.
// Recharts har ingen heatmap-primitiv, så detta är ett enkelt CSS-grid
// istället för att tvinga in det i ett diagrambibliotek som inte är byggt för det.

import type { CSSProperties } from "react";
import { ChartCard } from "./ChartCard";
import type { HeatmapDay } from "@/lib/stats";

interface Props {
  data: HeatmapDay[]; // kronologisk ordning, äldst → nyast
}

// Söndag-först, som GitHubs heatmap. Visar etikett varannan rad för att inte tränga ihop.
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export function ReviewHeatmap({ data }: Props) {
  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <ChartCard title="Review calendar" subtitle="Practice sessions, last 12 weeks">
        <div style={{ padding: "20px 0", textAlign: "center", fontSize: "12.5px", color: "var(--muted)" }}>
          No sessions logged yet — this fills in as you practice.
        </div>
      </ChartCard>
    );
  }

  // Padda i början så att veckokolumnerna börjar på söndag.
  const first = new Date(`${data[0].date}T00:00:00Z`);
  const leadingEmpty = first.getUTCDay(); // 0 = söndag
  const padded: (HeatmapDay | null)[] = [
    ...Array.from({ length: leadingEmpty }, () => null),
    ...data,
  ];

  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <ChartCard title="Review calendar" subtitle="Practice sessions, last 12 weeks">
      <div style={{ display: "flex", gap: "10px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i} style={weekdayLabelStyle}>{label}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: "3px", overflowX: "auto", paddingBottom: "2px" }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {week.map((day, di) => (
                <div
                  key={di}
                  title={day ? `${day.date}: ${day.count} session${day.count === 1 ? "" : "s"}` : undefined}
                  style={cellStyle(day?.count ?? null, max)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

const weekdayLabelStyle: CSSProperties = {
  height:    "13px",
  fontSize:  "9px",
  color:     "var(--muted)",
  lineHeight: "13px",
};

function cellStyle(count: number | null, max: number): CSSProperties {
  const base: CSSProperties = { width: "13px", height: "13px", borderRadius: "2px", flexShrink: 0 };
  if (count === null) return { ...base, background: "transparent" };
  if (count === 0) return { ...base, background: "var(--bg4)" };
  const intensity = Math.min(1, count / max);
  return { ...base, background: `rgba(200, 164, 80, ${0.25 + intensity * 0.65})` };
}
