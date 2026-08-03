"use client";
// components/practice/ReciteView.tsx
// Reciteringsläget: hela texten, en taktgivare, och raden som lyser upp
// i takt med slaget. Ungefär vad en rapsod gjorde med en stav mot golvet.

import { useState, useMemo, useRef, useEffect } from "react";
import { useMetronome } from "./useMetronome";
import { METERS, getMeter, secondsPerLine } from "@/lib/meter";

interface ReciteViewProps {
  title:        string;
  author:       string;
  /** Sammanhängande text — sektioner sammanfogade i ordning. */
  text:         string;
  /** Föreslaget versmått, från suggestMeter(). */
  suggestedMeter: string;
  /** Var användaren kan gå tillbaka. */
  backHref:     string;
  backLabel:    string;
}

export function ReciteView({
  title, author, text, suggestedMeter, backHref, backLabel,
}: ReciteViewProps) {
  const lines = useMemo(
    () => text.split("\n").map(l => l.trimEnd()),
    [text]
  );

  // Bara rader med innehåll ska ta tid — tomrader hoppas över
  const spokenIndexes = useMemo(
    () => lines.map((l, i) => (l.trim() ? i : -1)).filter(i => i >= 0),
    [lines]
  );

  const [meterId, setMeterId] = useState(suggestedMeter);
  const meter = getMeter(meterId);

  const [bpm, setBpm]       = useState(meter.defaultBpm);
  const [hideText, setHide] = useState(false);
  const [current, setCurrent] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef    = useRef<HTMLParagraphElement>(null);

  // Byte av versmått sätter om tempot
  function chooseMeter(id: string) {
    setMeterId(id);
    setBpm(getMeter(id).defaultBpm);
  }

  const metro = useMetronome(meter, bpm, {
    lineCount: spokenIndexes.length,
    onLineChange: line => setCurrent(Math.max(0, line)),
    countIn: true,
  });

  // Rulla den aktiva raden till mitten
  useEffect(() => {
    if (!metro.running) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [current, metro.running]);

  const activeLineIndex = spokenIndexes[current] ?? -1;
  const perLine = secondsPerLine(meter, bpm);
  const totalMin = (spokenIndexes.length * perLine) / 60;

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto", padding: "32px 24px 200px" }}>
      <a href={backHref} style={{
        fontSize: "13px", color: "var(--muted)",
        textDecoration: "none", display: "inline-block", marginBottom: "20px",
      }}>
        ← {backLabel}
      </a>

      <header style={{ marginBottom: "26px" }}>
        <h1 style={{
          fontFamily: "var(--fd)", fontSize: "clamp(26px, 5vw, 34px)",
          fontWeight: 300, color: "var(--parch)",
          letterSpacing: "0.03em", marginBottom: "4px",
        }}>
          {title}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--muted)" }}>{author}</p>
      </header>

      {/* Versmått */}
      <section style={{ marginBottom: "22px" }}>
        <p style={eyebrow}>Metre</p>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
          {METERS.map(m => {
            const active = m.id === meterId;
            return (
              <button
                key={m.id}
                onClick={() => chooseMeter(m.id)}
                disabled={metro.running}
                style={{
                  padding:      "7px 13px",
                  borderRadius: "var(--r3)",
                  fontSize:     "12px",
                  cursor:       metro.running ? "not-allowed" : "pointer",
                  opacity:      metro.running && !active ? 0.4 : 1,
                  background:   active ? "var(--gold3)" : "var(--bg2)",
                  border:       `1px solid ${active ? "rgba(200,164,80,0.4)" : "var(--bord)"}`,
                  color:        active ? "var(--gold)" : "var(--muted)",
                  transition:   "all .15s",
                }}
              >
                {m.name}
              </button>
            );
          })}
        </div>

        <div style={{
          background: "var(--bg2)", border: "1px solid var(--bord)",
          borderRadius: "var(--r2)", padding: "14px 16px",
        }}>
          <p style={{ fontSize: "12px", color: "var(--gold)", marginBottom: "5px" }}>
            {meter.origin}
          </p>
          <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.65 }}>
            {meter.description}
          </p>
          {meter.example && (
            <p style={{
              fontFamily: "var(--fd)", fontSize: "14px", fontStyle: "italic",
              color: "var(--muted)", marginTop: "10px",
            }}>
              {meter.example}
            </p>
          )}
        </div>
      </section>

      {/* Texten */}
      <div
        ref={containerRef}
        style={{
          background:   "var(--bg2)",
          border:       "1px solid var(--bord)",
          borderRadius: "var(--r)",
          padding:      "28px 30px",
        }}
      >
        {lines.map((line, i) => {
          const isBlank  = !line.trim();
          const isActive = i === activeLineIndex && metro.running;
          const spoken   = spokenIndexes.indexOf(i);
          const isPast   = metro.running && spoken >= 0 && spoken < current;

          if (isBlank) return <div key={i} style={{ height: "14px" }} />;

          return (
            <p
              key={i}
              ref={isActive ? activeRef : null}
              style={{
                fontFamily:    "var(--fd)",
                fontSize:      "17px",
                lineHeight:    1.85,
                letterSpacing: "0.01em",
                color:         isActive ? "var(--gold)" : isPast ? "var(--bg4)" : "var(--parch2)",
                // Dölj-läget lämnar den aktiva raden synlig som stöd
                filter:        hideText && !isActive ? "blur(5px)" : "none",
                paddingLeft:   "12px",
                borderLeft:    `2px solid ${isActive ? "var(--gold)" : "transparent"}`,
                transition:    "color .25s ease, border-color .25s ease, filter .2s ease",
              }}
            >
              {line}
            </p>
          );
        })}
      </div>

      {/* Kontrollpanelen */}
      <div style={{
        position:   "fixed",
        bottom:     0, left: 0, right: 0,
        background: "rgba(12,16,21,0.94)",
        backdropFilter: "blur(16px)",
        borderTop:  "1px solid var(--bord)",
        padding:    "14px 20px calc(14px + env(safe-area-inset-bottom))",
        zIndex:     150,
      }}>
        <div style={{
          maxWidth: "780px", margin: "0 auto",
          display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
        }}>
          {/* Pulsindikator */}
          <div style={{
            width: "42px", height: "42px", borderRadius: "50%",
            border: `1px solid ${metro.isAccent ? "var(--gold)" : "var(--bord)"}`,
            background: metro.isAccent ? "var(--gold3)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            transform: metro.running && metro.isAccent ? "scale(1.12)" : "scale(1)",
            transition: "transform .07s ease-out, background .12s, border-color .12s",
          }}>
            <span style={{
              fontFamily: "var(--fd)",
              fontSize: "17px",
              color: metro.isAccent ? "var(--gold)" : "var(--muted)",
            }}>
              {metro.line < 0 ? Math.abs(metro.line) : metro.beat + 1}
            </span>
          </div>

          <button
            onClick={() => metro.toggle(0)}
            style={{
              padding:      "11px 26px",
              borderRadius: "var(--r3)",
              background:   metro.running ? "transparent" : "var(--gold)",
              border:       `1px solid ${metro.running ? "var(--bord)" : "var(--gold)"}`,
              color:        metro.running ? "var(--muted)" : "var(--bg)",
              fontSize:     "14px",
              cursor:       "pointer",
              flexShrink:   0,
            }}
          >
            {metro.running ? "Stop" : "Begin"}
          </button>

          {/* Tempo */}
          <div style={{ flex: "1 1 190px", minWidth: "150px" }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: "11px", color: "var(--muted)", marginBottom: "4px",
            }}>
              <span>{bpm} beats/min</span>
              <span>{perLine.toFixed(1)}s per line</span>
            </div>
            <input
              type="range"
              min={40} max={220} step={2}
              value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              aria-label="Tempo"
              style={{ width: "100%", accentColor: "var(--gold)" }}
            />
          </div>

          <button
            onClick={() => setHide(h => !h)}
            style={{
              padding:      "9px 15px",
              borderRadius: "var(--r3)",
              background:   hideText ? "var(--gold3)" : "transparent",
              border:       `1px solid ${hideText ? "rgba(200,164,80,0.4)" : "var(--bord)"}`,
              color:        hideText ? "var(--gold)" : "var(--muted)",
              fontSize:     "12px",
              cursor:       "pointer",
              flexShrink:   0,
            }}
          >
            {hideText ? "Text hidden" : "Hide text"}
          </button>

          <span style={{ fontSize: "11px", color: "var(--bg4)", flexShrink: 0 }}>
            {spokenIndexes.length} lines · {totalMin < 1
              ? `${Math.round(totalMin * 60)}s`
              : `${totalMin.toFixed(1)} min`}
          </span>
        </div>
      </div>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: "10px", letterSpacing: "0.2em",
  color: "var(--gold)", textTransform: "uppercase", marginBottom: "10px",
};
