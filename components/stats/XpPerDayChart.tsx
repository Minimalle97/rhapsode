"use client";
// components/stats/XpPerDayChart.tsx
// Fas 6: XP intjänat per dag, senaste 30 dagarna.

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartCard, EmptyChart, ChartTooltip } from "./ChartCard";
import { CHART_COLORS } from "./chartTheme";
import type { DailyXP } from "@/lib/stats";

interface Props {
  data: DailyXP[];
}

export function XpPerDayChart({ data }: Props) {
  const hasData = data.some((d) => d.xp > 0);

  return (
    <ChartCard title="XP per day" subtitle="Last 30 days">
      {!hasData ? (
        <EmptyChart message="No practice sessions yet — XP will show up here once you start training." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
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
              tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="xp"
              name="XP"
              stroke={CHART_COLORS.gold}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: CHART_COLORS.gold }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
