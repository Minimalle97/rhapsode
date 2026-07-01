"use client";
// components/stats/ChartCard.tsx
// Fas 6: delad kort-chrome, tom-state och tooltip-stil för alla
// statistik-grafer — håller de fem chart-filerna fokuserade på sin egen graf.

import type { CSSProperties, ReactNode } from "react";
import { CHART_COLORS } from "./chartTheme";

interface ChartCardProps {
  title:     string;
  subtitle?: string;
  children:  ReactNode;
}

export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: "16px" }}>
        <p style={titleStyle}>{title}</p>
        {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return <div style={emptyStyle}><p>{message}</p></div>;
}

// Recharts' typer för custom tooltip-content skiljer sig mellan versioner
// och är notoriskt svåra att få exakt rätt — `any` här är ett medvetet val,
// inte en glömd typning.
export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      <p style={{ color: CHART_COLORS.muted, fontSize: "11px", marginBottom: "4px" }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? CHART_COLORS.parch, fontSize: "12px" }}>
          {p.name ?? p.dataKey}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

const cardStyle: CSSProperties = {
  background:   "var(--bg2)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r)",
  padding:      "20px",
};

const titleStyle: CSSProperties = {
  fontFamily: "var(--fd)",
  fontSize:   "16px",
  fontWeight: 400,
  color:      "var(--parch)",
};

const subtitleStyle: CSSProperties = {
  fontSize:  "11px",
  color:     "var(--muted)",
  marginTop: "2px",
};

const emptyStyle: CSSProperties = {
  height:         "180px",
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  fontSize:       "12.5px",
  color:          "var(--muted)",
  textAlign:      "center",
  padding:        "0 24px",
  lineHeight:     1.6,
};

const tooltipStyle: CSSProperties = {
  background:   CHART_COLORS.bg3,
  border:       "1px solid rgba(200,164,80,0.25)",
  borderRadius: "6px",
  padding:      "8px 12px",
};
