"use client";
// components/duels/DuelBadge.tsx
//
// Bubblan som sager att ett verk star i en tvekamp.
//
// Gron ar en ny fard i biblioteket, och den ar reserverad for det har.
// Guld betyder bemastrat, rott betyder mastartitel som galler; ett verk
// mitt i en kamp ar inget av det, och att lana en befintlig fard hade
// gjort bada otydliga.
//
// Klockan racknar ned i bubblan. Nar tiden ar ute byter den text till
// "1v1 · done" i stallet for att forsvinna — den som missade slutet ska
// se att det ar dags att hamta resultatet, inte att verket blev vanligt.

import { useCountdown } from "./useCountdown";

interface Props {
  endsAt:  string | Date;
  /** Kompakt form for biblioteket, storre for verkssidan. */
  size?:   "small" | "large";
}

export function DuelBadge({ endsAt, size = "small" }: Props) {
  const { label, done } = useCountdown(endsAt);
  const small = size === "small";

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: small ? "2px 9px" : "4px 12px",
      borderRadius: "999px",
      border: "1px solid rgba(106,158,106,0.45)",
      background: "rgba(106,158,106,0.10)",
      color: "var(--green)",
      fontSize: small ? "10.5px" : "12px",
      letterSpacing: "0.06em",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 600 }}>1v1</span>
      <span style={{ opacity: 0.55 }}>·</span>
      <span style={{ opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>
        {done ? "done" : label}
      </span>
    </span>
  );
}

/** Gron ram sa lange kampen pagar. Samma vardet pa bada stallen. */
export const DUEL_BORDER = "rgba(106,158,106,0.55)";
