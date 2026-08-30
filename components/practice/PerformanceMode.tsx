"use client";
// components/practice/PerformanceMode.tsx
//
// Framforandet. Texten visas inte, det finns ingen ledtrad, och man kan
// inte pausa och titta. Det ar hela poangen — allt annat i appen ar till
// for att hjalpa dig minnas, och det har ar stallet dar du visar att du
// redan gor det.
//
// Ljudet spelas inte in. Talet blir text i webblasaren via Web Speech
// och transkriptet ar det enda som lamnar enheten. Att spara rosten hade
// inte gjort bedomningen battre, och den ar personuppgift.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSpeechRecitation } from "@/hooks/useSpeechRecitation";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import type { PerformanceStanding } from "@/lib/performance";

interface PerformanceModeProps {
  workId:       string;
  workTitle:    string;
  author:       string;
  partId?:      string | null;
  partName?:    string | null;
  sectionCount: number;
  standing:     PerformanceStanding;
  passAccuracy: number;
  isPro:        boolean;
}

interface RunResult {
  passed:       boolean;
  accuracy:     number;
  xpEarned:     number;
  justMastered: boolean;
  isBest:       boolean;
  wordsTotal:   number;
  wordsCorrect: number;
  missed:       string[];
  missedSections: number;
  standing:     PerformanceStanding;
}

const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "sv-SE", label: "Swedish" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
];

/** Tystnad langre an sa har raknas som en tvekan. */
const HESITATION_MS = 3_000;

export function PerformanceMode({
  workId, workTitle, author, partId, partName,
  sectionCount, standing, passAccuracy, isPro,
}: PerformanceModeProps) {
  const [lang, setLang]     = useState("en-US");
  const speech = useSpeechRecitation({ lang });

  const [result, setResult]   = useState<RunResult | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const startedAt   = useRef<number>(0);
  const lastWordAt  = useRef<number>(0);
  const hesitations = useRef(0);
  const longestGap  = useRef(0);

  // Tvekningar raknas ur mellanrummen mellan orden. Grovt, men det ar
  // aritmetik pa nagot vi anda har — ingen modell behovs for att marka
  // att nagon stod still i sju sekunder.
  const noteSpeech = useCallback(() => {
    const now = Date.now();
    if (lastWordAt.current) {
      const gap = now - lastWordAt.current;
      if (gap > HESITATION_MS) hesitations.current += 1;
      if (gap > longestGap.current) longestGap.current = gap;
    }
    lastWordAt.current = now;
  }, []);

  // Rakna tvekningar nar nya ord kommer in. I en effekt, inte under
  // renderingen — att mutera en ref mitt i en render ar just den sortens
  // sidoeffekt som gor att React kan rita om och tappa rakningen.
  useEffect(() => {
    if (speech.isListening) noteSpeech();
  }, [speech.transcript, speech.interimTranscript, speech.isListening, noteSpeech]);

  function begin() {
    setResult(null);
    setError(null);
    hesitations.current = 0;
    longestGap.current  = 0;
    startedAt.current   = Date.now();
    lastWordAt.current  = Date.now();
    speech.reset();
    speech.start();
  }

  async function finish() {
    speech.stop();

    const transcript = speech.transcript.trim();
    if (!transcript) {
      setError("Nothing was picked up. Check the microphone and try again.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/performance", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workId,
          partId,
          transcript,
          durationSecs:   Math.round((Date.now() - startedAt.current) / 1000),
          hesitations:    hesitations.current,
          longestPauseMs: longestGap.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not record that");
      setResult(data as RunResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that");
    } finally {
      setSending(false);
    }
  }

  if (!speech.isSupported) {
    return (
      <div style={notice}>
        Performance mode needs speech recognition — try Chrome, Edge, or Safari.
      </div>
    );
  }

  // ── Efterat ─────────────────────────────────────────────────────
  if (result) {
    const s = result.standing;
    return (
      <div>
        <p style={eyebrow}>{result.passed ? "Counted" : "Not counted"}</p>

        <p style={{
          fontFamily: "var(--fd)", fontSize: "58px", fontWeight: 300, lineHeight: 1,
          color: result.passed ? "var(--gold)" : "var(--parch2)", marginBottom: "6px",
        }}>
          {result.accuracy}%
        </p>
        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "22px" }}>
          {result.wordsCorrect} of {result.wordsTotal} words held
          {result.missedSections > 0 && ` · ${result.missedSections} section${result.missedSections === 1 ? "" : "s"} lost`}
          {result.isBest && " · your best yet"}
        </p>

        {result.justMastered ? (
          <div style={masteredBox}>
            <p style={{ fontFamily: "var(--fd)", fontSize: "24px", color: "var(--red)", marginBottom: "8px" }}>
              You have mastered {workTitle}
            </p>
            <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.7 }}>
              Ten performances at {passAccuracy}% or better. The medal is on your
              profile and the work is marked in your library. Perform it again
              within a few days to keep it.
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: "22px" }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", marginBottom: "7px",
            }}>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                {s.passed} of {s.required} performances
              </span>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                {!result.passed && `${passAccuracy}% needed to count`}
              </span>
            </div>
            <div style={track}>
              <div style={{ ...fill, width: `${s.percent}%` }} />
            </div>
          </div>
        )}

        <p style={{ fontFamily: "var(--fd)", fontSize: "18px", color: "var(--gold)", marginBottom: "22px" }}>
          +{result.xpEarned} XP
        </p>

        {result.missed.length > 0 && (
          <p style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.7, marginBottom: "22px" }}>
            Slipped: {result.missed.slice(0, 12).join(", ")}
          </p>
        )}

        {/* Milstolpe: titeln togs just. Erbjudandet star EFTER resultatet
            och efter XP:n, inte i vagen for dem. */}
        {result.justMastered && !isPro && (
          <div style={{ marginBottom: "22px" }}>
            <UpgradeCard
              feature="PERFORMANCE_ANALYSIS"
              title="Now keep it"
              body="Holding a text is harder than taking it. Pro tracks how each performance actually went — where you hesitated, which lines drift first, whether the rhythm is holding — so the ones slipping away are the ones you rehearse."
            />
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={begin} style={primaryBtn}>Perform it again</button>
          <Link href={`/work/${workId}`} style={ghostBtn}>Back to {workTitle}</Link>
        </div>
      </div>
    );
  }

  // ── Under tiden ─────────────────────────────────────────────────
  if (speech.isListening) {
    return (
      <div>
        <p style={eyebrow}>Performing</p>
        <p style={{
          fontFamily: "var(--fd)", fontSize: "26px", fontWeight: 300,
          color: "var(--parch)", marginBottom: "20px",
        }}>
          {partName ?? workTitle}
        </p>

        {/* Ordrakningen ar allt som visas. Texten far inte synas — den som
            behover en ledtrad ar inte i ett framforande. */}
        <div style={liveBox}>
          <p style={{ fontFamily: "var(--fd)", fontSize: "40px", color: "var(--gold)", lineHeight: 1 }}>
            {speech.transcript.trim() ? speech.transcript.trim().split(/\s+/).length : 0}
          </p>
          <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>
            words spoken
          </p>
        </div>

        {speech.error && (
          <p style={{ fontSize: "12px", color: "var(--red)", marginBottom: "14px" }}>{speech.error}</p>
        )}

        <button onClick={finish} disabled={sending} style={stopBtn}>
          {sending ? "Marking…" : "Finish"}
        </button>
      </div>
    );
  }

  // ── Innan ───────────────────────────────────────────────────────
  return (
    <div>
      <p style={eyebrow}>Performance</p>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 300,
        color: "var(--parch)", letterSpacing: "0.02em", marginBottom: "6px",
      }}>
        {partName ? `${workTitle} · ${partName}` : workTitle}
      </p>
      <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "24px" }}>{author}</p>

      <p style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--parch2)", marginBottom: "22px" }}>
        {sectionCount} section{sectionCount === 1 ? "" : "s"}, start to finish, with
        nothing in front of you. Speak it through. You can stop whenever you like,
        but there is no going back to check.
      </p>

      <div style={{ marginBottom: "22px" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", marginBottom: "7px",
        }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {standing.passed} of {standing.required} performances at {passAccuracy}% or better
          </span>
          {standing.bestAccuracy !== null && (
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              best {standing.bestAccuracy}%
            </span>
          )}
        </div>
        <div style={track}>
          <div style={{ ...fill, width: `${standing.percent}%` }} />
        </div>
      </div>

      <div style={{ marginBottom: "22px" }}>
        <label style={label}>Language</label>
        <select value={lang} onChange={e => setLang(e.target.value)} style={select}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {error && <p style={{ fontSize: "12.5px", color: "var(--red)", marginBottom: "14px" }}>{error}</p>}

      <button onClick={begin} style={primaryBtn}>Begin</button>

      <p style={{ fontSize: "11.5px", color: "var(--bg4)", marginTop: "18px", lineHeight: 1.6 }}>
        Your voice is turned into text in the browser. No audio is recorded or sent.
      </p>
    </div>
  );
}

// ── Stilar ────────────────────────────────────────────────────────────
const eyebrow: CSSProperties = {
  fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase",
  color: "var(--red)", marginBottom: "10px",
};
const notice: CSSProperties = {
  padding: "24px", textAlign: "center", fontSize: "13px", lineHeight: 1.6,
  color: "var(--muted)", background: "var(--bg3)",
  borderRadius: "var(--r2)", border: "1px solid var(--bord)",
};
const liveBox: CSSProperties = {
  background: "var(--bg3)", border: "1px solid var(--bord)",
  borderRadius: "var(--r)", padding: "36px 24px",
  textAlign: "center", marginBottom: "20px",
};
const masteredBox: CSSProperties = {
  background: "rgba(192,95,114,0.07)", border: "1px solid rgba(192,95,114,0.32)",
  borderRadius: "var(--r)", padding: "20px 22px", marginBottom: "22px",
};
const track: CSSProperties = {
  height: "4px", background: "var(--bg4)", borderRadius: "2px", overflow: "hidden",
};
const fill: CSSProperties = {
  height: "100%", background: "linear-gradient(90deg, var(--red), var(--gold))",
  borderRadius: "2px", transition: "width .6s ease",
};
const label: CSSProperties = {
  display: "block", fontSize: "10px", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px",
};
const select: CSSProperties = {
  background: "var(--bg3)", border: "1px solid var(--bord)",
  borderRadius: "var(--r2)", padding: "9px 11px",
  fontSize: "13px", color: "var(--parch2)", fontFamily: "var(--fb)", outline: "none",
};
const primaryBtn: CSSProperties = {
  padding: "13px 30px", borderRadius: "999px",
  border: "1px solid var(--red)", background: "rgba(192,95,114,0.12)",
  color: "var(--red)", fontSize: "15px", fontFamily: "var(--fb)", cursor: "pointer",
};
const stopBtn: CSSProperties = {
  ...primaryBtn, background: "var(--red)", color: "var(--parch)",
};
const ghostBtn: CSSProperties = {
  padding: "13px 26px", borderRadius: "999px",
  border: "1px solid var(--bord)", background: "transparent",
  color: "var(--muted)", fontSize: "14px", textDecoration: "none",
  display: "inline-flex", alignItems: "center",
};
