"use client";
// components/stats/SectionStatusChart.tsx
// Fas 6: stapeldiagram (horisontellt) — sektionsstatus per verk.
// layout="vertical" i Recharts betyder att kategorierna (verken) ligger på
// Y-axeln och staplarna växer horisontellt — bättre för långa boktitlar
// och skalar med antal verk utan att klämma ihop X-axeletiketter.

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartCard, EmptyChart, ChartTooltip } from "./ChartCard";
import { CHART_COLORS } from "./chartTheme";
import type { SectionStatusRow } from "@/lib/stats";

interface Props {
  data: SectionStatusRow[];
}

function truncate(title: string): string {
  return title.length > 18 ? `${title.slice(0, 17)}…` : title;
}

export function SectionStatusChart({ data }: Props) {
  const hasData = data.some((d) => d.notStarted + d.learning + d.mastered > 0);

  return (
    <ChartCard title="Section status by work" subtitle="Not started · Learning · Mastered">
      {!hasData ? (
        <EmptyChart message="Add a work with sections to see its progress here." />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 42)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="title"
              width={120}
              tickFormatter={truncate}
              tick={{ fill: CHART_COLORS.parch2, fontSize: 11.5 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(200,164,80,0.05)" }} />
            <Bar dataKey="notStarted" name="Not started" stackId="a" fill={CHART_COLORS.muted} />
            <Bar dataKey="learning"   name="Learning"    stackId="a" fill={CHART_COLORS.blue} />
            <Bar dataKey="mastered"   name="Mastered"    stackId="a" fill={CHART_COLORS.gold} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
