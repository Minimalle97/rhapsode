"use client";
// components/stats/TimeByWorkChart.tsx
// Fas 6: tid spenderad per verk (donut). Bygger på PracticeSession.durationSecs,
// som bara finns från Fas 6 och framåt — se README för varför.

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { ChartCard, EmptyChart, ChartTooltip } from "./ChartCard";
import { PIE_SLICE_COLORS } from "./chartTheme";
import type { WorkTimeRow } from "@/lib/stats";

interface Props {
  data: WorkTimeRow[];
}

export function TimeByWorkChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <ChartCard title="Time spent by work" subtitle="Minutes practiced">
        <EmptyChart message="No timed sessions yet. This fills in once practice sessions report a duration." />
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Time spent by work" subtitle="Minutes practiced">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="minutes" nameKey="title" innerRadius={52} outerRadius={82} paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_SLICE_COLORS[i % PIE_SLICE_COLORS.length]} stroke="none" />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
        {data.slice(0, 7).map((d, i) => (
          <span key={d.title} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--parch2)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: PIE_SLICE_COLORS[i % PIE_SLICE_COLORS.length] }} />
            {d.title} <span style={{ color: "var(--muted)" }}>· {d.minutes}m</span>
          </span>
        ))}
      </div>
    </ChartCard>
  );
}
