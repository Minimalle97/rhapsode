"use client";
// components/drills/CumulativeDrill.tsx
//
// Drill 2 — Kumulativ uppbyggnad.
//
// Rad ett. Sedan rad ett och tva. Sedan ett till tre, och sa vidare.
//
// ── Varfor fonstret har ett tak ───────────────────────────────────────
//
// Utan tak vaxer kortet tills man till slut ombeds recitera hela dikten
// varje gang, och da ar det inte langre en uppbyggnad utan ett
// framforande — det finns redan ett lage for. Vid sex rader slutar
// fonstret vaxa och borjar i stallet glida framat: den aldsta raden
// faller bort nar en ny kommer till. Sa fortsatter varje kort vara en
// overkomlig bit, hela verket igenom.
//
// ── Varfor texten ar nedskuren ────────────────────────────────────────
//
// Samma skelett som Drill 1, med samma instalningar. Kortet maste saga
// VILKA rader det galler utan att lamna ut orden — annars ar det en
// lasovning. Att aterianvanda skelettet betyder ocksa att den som stallt
// in sitt stod en gang far det overallt.

import { useState, useEffect, useRef, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { skeletonLine, type SkeletonSettings, type Segment } from "@/lib/drills/skeleton";
import type { DrillLine } from "./SkeletonDrill";

type Mark = "got_it" | "hesitated" | "missed";

/** Hogst sa har manga rader i ett kort. Sedan glider fonstret. */
const WINDOW = 6;

interface Props {
  workId:    string;
  workTitle: string;
  lines:     DrillLine[];
  settings:  SkeletonSettings;
  allowance: { unlimited: boolean; remaining: number; limit: number };
}

export function CumulativeDrill({ workId, workTitle, lines, settings, allowance }: Props) {
  const [at, setAt]             = useState(0);   // sista raden i fonstret
  const [revealed, setRevealed] = useState(false);
  const [left, setLeft]         = useState(allowance.remaining);
  const [blocked, setBlocked]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);

  const shownAt   = useRef(0);
  const revealMs  = useRef<number | null>(null);
  useEffect(() => { shownAt.current = Date.now(); }, [at]);

  // Fonstret: fram till `at`, men aldrig fler an WINDOW rader.
  const from   = Math.max(0, at - (WINDOW - 1));
  const window = lines.slice(from, at + 1);
  const last   = lines[at];

  const rendered = useMemo(
    () => window.map(l => skeletonLine(l.text, settings)),
    [window, settings]
  );

  async function mark(m: Mark) {
    setError(null);
    try {
      const res = await fetch("/api/drills/attempt", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drill:      "cumulative",
          // Kortet bedoms pa den rad som just LADES TILL. Det ar den som
          // provades; de fore satt redan forra kortet.
          sectionId:  last.sectionId,
          lineIndex:  last.lineIndex,
          mark:       m,
          msToReveal: revealMs.current,
        }),
      });

      if (res.status === 402) {
        const json = await res.json().catch(() => ({}));
        setBlocked(true);
        setError(json.message ?? "That is today's drill allowance.");
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not save that");
      }

      if (!allowance.unlimited) setLeft(n => Math.max(0, n - 1));

      if (at + 1 >= lines.length) { setDone(true); return; }
      setAt(n => n + 1);
      setRevealed(false);
      revealMs.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    }
  }

  function reveal() {
    revealMs.current = shownAt.current ? Date.now() - shownAt.current : null;
    setRevealed(true);
  }

  if (done) {
    return (
      <Frame workId={workId} workTitle={workTitle}>
        <div style={endBox}>
          <p style={{ fontFamily: "var(--fd)", fontSize: "22px", color: "var(--gold)", marginBottom: "8px" }}>
            Built to the end
          </p>
          <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.7, marginBottom: "16px" }}>
            You have worked up through all {lines.length} lines of {workTitle},
            a line at a time.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => { setAt(0); setRevealed(false); setDone(false); }}
              style={primaryBtn}
            >
              ↺ From the top
            </button>
            <Link href={`/work/${workId}/drills`} style={ghostBtn}>Back to drills</Link>
          </div>
        </div>
      </Frame>
    );
  }

  if (blocked) {
    return (
      <Frame workId={workId} workTitle={workTitle}>
        <div style={endBox}>
          <p style={{ fontFamily: "var(--fd)", fontSize: "22px", color: "var(--parch)", marginBottom: "8px" }}>
            That is today&apos;s allowance
          </p>
          <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.7, marginBottom: "16px" }}>
            {error} It resets tomorrow — or Pro takes the daily cap off entirely.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href="/settings/subscription" style={primaryBtn}>See Rhapsode Pro</Link>
            <Link href={`/work/${workId}`} style={ghostBtn}>Back to {workTitle}</Link>
          </div>
        </div>
      </Frame>
    );
  }

  const sliding = from > 0;

  return (
    <Frame workId={workId} workTitle={workTitle}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: "10px", flexWrap: "wrap", marginBottom: "8px",
      }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)" }}>
          {window.length === 1
            ? "Line 1"
            : `Lines ${from + 1}–${at + 1}`}
        </p>
        <p style={{ fontSize: "11.5px", color: "var(--muted)" }}>
          {allowance.unlimited
            ? `${at + 1} of ${lines.length}`
            : `${at + 1} of ${lines.length} · ${left} cards left today`}
        </p>
      </div>

      <div style={{ height: "3px", background: "var(--bg4)", borderRadius: "2px", marginBottom: "10px" }}>
        <div style={{
          height: "100%", width: `${Math.round(((at + 1) / lines.length) * 100)}%`,
          background: "linear-gradient(90deg, var(--gold2), var(--gold))",
          borderRadius: "2px", transition: "width .3s ease",
        }} />
      </div>

      <p style={{ fontSize: "11.5px", color: "var(--muted)", marginBottom: "16px", lineHeight: 1.6 }}>
        {sliding
          ? `Say all ${window.length} lines through. The window has started sliding — the opening has dropped away.`
          : window.length === 1
            ? "Say the first line."
            : `Say all ${window.length} from the top.`}
      </p>

      <div style={card}>
        {revealed ? (
          <div style={textBlock}>
            {window.map((l, i) => (
              <p key={i} style={{ margin: 0, color: "var(--gold)", whiteSpace: "pre-wrap" }}>
                {l.text}
              </p>
            ))}
          </div>
        ) : (
          <div style={textBlock}>
            {rendered.map((segs, i) => (
              <p key={i} style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                <Skeleton segments={segs} />
              </p>
            ))}
          </div>
        )}
      </div>

      {error && !blocked && (
        <p style={{ fontSize: "12.5px", color: "var(--red)", marginBottom: "12px" }}>{error}</p>
      )}

      {revealed ? (
        <>
          <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px" }}>
            How did the whole run go?
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={() => mark("got_it")}    style={markBtn("var(--green)")}>Got it</button>
            <button onClick={() => mark("hesitated")} style={markBtn("var(--gold)")}>Hesitated</button>
            <button onClick={() => mark("missed")}    style={markBtn("var(--red)")}>Missed</button>
          </div>
        </>
      ) : (
        <button onClick={reveal} style={primaryBtn}>Reveal</button>
      )}
    </Frame>
  );
}

/** Samma utritning som Drill 1: strecken far sin egen aria-label. */
function Skeleton({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "literal") return <span key={i}>{seg.text}</span>;
        if (seg.hidden === "")      return <span key={i}>{seg.shown}</span>;
        return (
          <span key={i}>
            {seg.shown}
            <span aria-label="hidden word" role="img" style={{ letterSpacing: "0.06em" }}>
              {seg.hidden}
            </span>
          </span>
        );
      })}
    </>
  );
}

function Frame({
  workId, workTitle, children,
}: {
  workId: string; workTitle: string; children: React.ReactNode;
}) {
  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "32px 24px 80px" }}>
      <Link href={`/work/${workId}/drills`} style={{
        fontSize: "13px", color: "var(--muted)",
        textDecoration: "none", display: "inline-block", marginBottom: "18px",
      }}>
        ← Drills · {workTitle}
      </Link>
      {children}
    </div>
  );
}

const card: CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r)", padding: "24px",
  marginBottom: "18px", minHeight: "120px",
};
const textBlock: CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "clamp(18px, 3vw, 22px)",
  lineHeight: 1.85, color: "var(--parch)", width: "100%",
  wordBreak: "break-word",
};
const primaryBtn: CSSProperties = {
  padding: "11px 24px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "14px", cursor: "pointer",
  textDecoration: "none", display: "inline-block",
};
const ghostBtn: CSSProperties = {
  padding: "11px 18px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "13px", cursor: "pointer",
  textDecoration: "none", display: "inline-block",
};
function markBtn(colour: string): CSSProperties {
  return {
    padding: "11px 20px", borderRadius: "var(--r3)",
    background: "transparent", border: `1px solid ${colour}`,
    color: colour, fontSize: "13.5px", cursor: "pointer",
  };
}
const endBox: CSSProperties = {
  padding: "26px 24px", background: "var(--bg2)",
  border: "1px solid rgba(200,164,80,0.35)", borderRadius: "var(--r)",
};
