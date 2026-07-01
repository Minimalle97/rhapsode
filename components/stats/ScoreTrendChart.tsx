"use client";
// components/stats/ScoreTrendChart.tsx
// Fas 6: score-trend för skriv-läge (write mode) — det enda läget som har
// ett score. Visar en löpande trend över de senaste sessionerna snarare än
// en linje per enskild sektion (se lib/stats.ts för motivering).

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartCard, EmptyChart, ChartTooltip } from "./ChartCard";
import { CHART_COLORS } from "./chartTheme";
import type { ScoreTrendPoint } from "@/lib/stats";

interface Props {
  data: ScoreTrendPoint[];
}

export function ScoreTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <ChartCard title="Score trend" subtitle="Write-mode practice">
        <EmptyChart message="Score history shows up here after your first write-mode practice session." />
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Score trend" subtitle={`Last ${data.length} write-mode session${data.length === 1 ? "" : "s"}`}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
            axisLine={{ stroke: CHART_COLORS.grid }}
            tickLine={false}
            interval={Math.ceil(data.length / 6)}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="score"
            name="Score"
            stroke={CHART_COLORS.green}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.green }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
