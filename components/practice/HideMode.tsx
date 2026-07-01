"use client";
// components/practice/HideMode.tsx
// Fas 8: texten är dold (blur) tills du försökt återkalla den ur minnet —
// tryck "Reveal" för att kolla dig själv, sen skatta. Medvetet enklare än
// ord-för-ord cloze: en blur-toggle täcker samma behov (dölj → tänk efter
// → kolla → skatta) utan att bygga ett helt eget textmarkeringssystem.

import { useState, type CSSProperties } from "react";
import { QualityRating } from "./QualityRating";

interface HideModeProps {
  content:    string;
  onComplete: (quality: number) => void;
}

export function HideMode({ content, onComplete }: HideModeProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: "20px" }}>
        <p style={{ ...textStyle, filter: revealed ? "none" : "blur(8px)", userSelect: revealed ? "auto" : "none" }}>
          {content}
        </p>
        {!revealed && (
          <div style={overlayStyle}>
            <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "12px", textAlign: "center" }}>
              Recall it from memory first, then check.
            </p>
            <button onClick={() => setRevealed(true)} style={revealBtnStyle}>
              Reveal
            </button>
          </div>
        )}
      </div>

      {revealed && (
        <>
          <p style={promptStyle}>How close was your recall?</p>
          <QualityRating onRate={onComplete} />
        </>
      )}
    </div>
  );
}

const textStyle: CSSProperties = {
  fontFamily:  "var(--fd)",
  fontSize:    "20px",
  lineHeight:  1.7,
  color:       "var(--parch)",
  whiteSpace:  "pre-wrap",
  transition:  "filter .25s",
  minHeight:   "80px",
};

const overlayStyle: CSSProperties = {
  position:       "absolute",
  inset:          0,
  display:        "flex",
  flexDirection:  "column",
  alignItems:     "center",
  justifyContent: "center",
};

const revealBtnStyle: CSSProperties = {
  padding:      "9px 22px",
  borderRadius: "var(--r2)",
  border:       "1px solid var(--gold)",
  background:   "var(--gold3)",
  color:        "var(--gold)",
  fontSize:     "13px",
  fontFamily:   "var(--fb)",
  cursor:       "pointer",
};

const promptStyle: CSSProperties = {
  fontSize:      "12px",
  color:         "var(--muted)",
  marginBottom:  "10px",
  letterSpacing: "0.02em",
};
