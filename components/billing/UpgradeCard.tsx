"use client";
// components/billing/UpgradeCard.tsx
//
// Rutan man möter när något ligger bakom Pro.
//
// Den säger vad funktionen GÖR med just den text du står i, inte att den
// är låst. Skillnaden mellan
//
//     "Upgrade to unlock AI"
//
// och
//
//     "Rhapsode Pro can turn this passage into targeted exercises"
//
// är att det andra går att värdera. Det första ber om förtroende utan
// att erbjuda något att bedöma.
//
// Inga gradienter, ingen märkning, ingen nedräkning, ingen procent-rabatt
// i versaler. Samma ram, samma guld och samma typsnitt som resten av
// appen — det ska se ut som en del av Rhapsode, inte som en annons som
// råkat hamna i den.

import { useState, type CSSProperties, type ReactNode } from "react";

interface UpgradeCardProps {
  /** Vad man vinner, uttryckt som en handling. Inte "Pro-funktion". */
  title?: string;
  /** En eller två meningar om vad det gör med den här texten. */
  body: ReactNode;
  /** För mätningen: vilken funktion som stängde dörren. */
  feature?: string;
  /** compact: en rad i ett flöde. full: fristående ruta. */
  variant?: "full" | "compact";
}

export function UpgradeCard({ title, body, feature, variant = "full" }: UpgradeCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ interval: "month", feature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(false);
    }
  }

  if (variant === "compact") {
    return (
      <div style={compactWrap}>
        <span style={{ flex: 1, minWidth: 0, fontSize: "13px", color: "var(--parch2)", lineHeight: 1.6 }}>
          {body}
        </span>
        <button onClick={upgrade} disabled={busy} style={quietButton}>
          {busy ? "…" : "Try Pro"}
        </button>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {title && <p style={heading}>{title}</p>}
      <p style={paragraph}>{body}</p>

      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "18px" }}>
        <button onClick={upgrade} disabled={busy} style={primaryButton}>
          {busy ? "Opening…" : "Try Rhapsode Pro"}
        </button>
        <a href="/settings/subscription" style={secondaryLink}>
          What Pro includes
        </a>
      </div>

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "12px" }}>{error}</p>
      )}
    </div>
  );
}

const wrap: CSSProperties = {
  background:   "var(--gold4)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r)",
  padding:      "22px 24px",
};

const compactWrap: CSSProperties = {
  display:      "flex",
  alignItems:   "center",
  gap:          "14px",
  flexWrap:     "wrap",
  background:   "var(--gold4)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r2)",
  padding:      "13px 16px",
};

const heading: CSSProperties = {
  fontFamily:    "var(--fd)",
  fontSize:      "20px",
  fontWeight:    400,
  color:         "var(--parch)",
  letterSpacing: "0.02em",
  marginBottom:  "8px",
};

const paragraph: CSSProperties = {
  fontSize:   "13.5px",
  lineHeight: 1.7,
  color:      "var(--parch2)",
};

const primaryButton: CSSProperties = {
  padding:       "9px 20px",
  borderRadius:  "var(--r3)",
  border:        "1px solid var(--gold)",
  background:    "var(--gold3)",
  color:         "var(--gold)",
  fontSize:      "13px",
  letterSpacing: "0.02em",
  cursor:        "pointer",
};

const quietButton: CSSProperties = {
  padding:      "6px 14px",
  borderRadius: "var(--r3)",
  border:       "1px solid var(--bord)",
  background:   "transparent",
  color:        "var(--gold)",
  fontSize:     "12px",
  cursor:       "pointer",
  whiteSpace:   "nowrap",
  flexShrink:   0,
};

const secondaryLink: CSSProperties = {
  fontSize:       "12.5px",
  color:          "var(--muted)",
  textDecoration: "none",
};
