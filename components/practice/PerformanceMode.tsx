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

/**
 * idle      — innan man borjat
 * performing — motorn lyssnar
 * review    — man har slutat tala; texten ligger och vantar pa att skickas
 * marking   — anropet ar i luften
 * done      — resultatet visas
 */
type Phase = "idle" | "performing" | "review" | "marking" | "done";

export function PerformanceMode({
  workId, workTitle, author, partId, partName,
  sectionCount, standing, passAccuracy, isPro,
}: PerformanceModeProps) {
  // Vad som ritas. Aldrig speech.isActive — se kommentaren vid begin().
  const [phase, setPhase]   = useState<Phase>("idle");
  const [lang, setLang]     = useState("en-US");
  const speech = useSpeechRecitation({ lang });

  const [result, setResult]   = useState<RunResult | null>(null);
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
    if (speech.isActive) noteSpeech();
  }, [speech.transcript, speech.interimTranscript, speech.isActive, noteSpeech]);


  /**
   * Allt som ratas ut styrs av `phase`, aldrig av `speech.isActive`.
   *
   * ── RATTAT: Finish kastade tillbaka en till startlaget ───────────────
   *
   * Vyn villkorades tidigare pa speech.isActive. `speech.stop()` satter
   * det till falskt SYNKRONT, sa i samma ogonblick man tryckte Finish föll
   * komponenten igenom till Begin-skarmen — medan anropet fortfarande var
   * i luften. Det sag ut som att framforandet plotsligt tog slut och att
   * inspelningen kastats bort, och stod inspelningen tom hamnade man
   * likaledes pa Begin, nu med ett felmeddelande ingen hann lasa.
   *
   * Motorn far darfor inte langre bestamma vad som visas. Stoppet leder
   * till ett EGET lage dar det man sagt ligger kvar och vantar pa att
   * skickas — samma tvastegsform som ReciteMode redan hade, och skalet
   * till att det laget alltid kants stadigare an det har.
   */
  /**
   * Laget som faktiskt ritas.
   *
   * Ger motorn upp av sig sjalv — nekad mikrofon, ingen enhet — ska det
   * man redan sagt tas till vara i stallet for att forsvinna. Det raknas
   * FRAM har i stallet for att synkas i en effekt: en effekt som satter
   * state pa nasta rad ar en extra rendering per tangenttryckning, och
   * React sager ifran om den med ratta.
   *
   * Under en omstart mitt i en paus star `isActive` kvar sant — det ar
   * hela poangen med hookens skillnad mellan "vill lyssna" och "lyssnar
   * just nu" — sa den har raden loser bara ut nar motorn verkligen gett
   * upp.
   */
  const shown: Phase =
    phase === "performing" && !speech.isActive ? "review" : phase;

  function begin() {
    setResult(null);
    setError(null);
    hesitations.current = 0;
    longestGap.current  = 0;
    startedAt.current   = Date.now();
    lastWordAt.current  = Date.now();
    speech.reset();
    speech.start();
    setPhase("performing");
  }

  /** Slutar tala. Skickar ingenting — det ar ett eget beslut. */
  function stopSpeaking() {
    speech.stop();
    setPhase("review");
  }

  /**
   * Det som faktiskt sagts.
   *
   * Interimtexten raknas med. Chrome hinner inte alltid gora sista
   * frasen slutgiltig innan stop(), och utan den tappades de sista orden
   * i varje framforande — vilket sag ut som att man missat slutet.
   */
  function spoken(): string {
    return [speech.transcript, speech.interimTranscript]
      .filter(t => t && t.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function submit() {
    const transcript = spoken();
    if (!transcript) {
      setError("Nothing was picked up. Check the microphone and try again.");
      setPhase("review");
      return;
    }
    setError(null);
    setPhase("marking");
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
          // Var i forsoket det blev tyst. Hooken raknar platserna; utan
          // dem gar en tvekan inte att lagga pa ratt rad.
          hesitatedAt:    speech.hesitationIndices,
          // Motorns egna alternativ — servern valjer bland dem.
          chunks:         speech.chunks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not record that");
      setResult(data as RunResult);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that");
      // Tillbaka till granskningen, inte till borjan: det man sagt finns
      // kvar och gar att skicka igen.
      setPhase("review");
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
  if (shown === "done" && result) {
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
  if (shown === "performing") {
    return (
      <div>
        <p style={eyebrow}>
          {speech.isListening ? "Performing" : "Performing · listening again…"}
        </p>
        <p style={{
          fontFamily: "var(--fd)", fontSize: "26px", fontWeight: 300,
          color: "var(--parch)", marginBottom: "20px",
        }}>
          {partName ?? workTitle}
        </p>

        {/*
          Det som horts, inte hur mycket.

          Rutan visade tidigare ordantalet i fyrtio punkter med de sista
          orden nedtryckta i en fotnot. Siffran var det enda som gick att
          se pa avstand, och den ar ocksa det minst intressanta som finns
          att veta mitt i ett framforande — den drog blicken till en
          rakning i stallet for till om mikrofonen faktiskt uppfattat
          orden ratt. Nu star transkriptet frammast och siffran vid sidan.

          Det ar ingen ledtrad: har star vad DU nyss sade, aldrig vad
          texten sager.
        */}
        <div style={liveBox}>
          <div style={liveHead}>
            <span style={{ fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>
              Heard
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {wordCount(spoken())} words
            </span>
          </div>

          <div style={liveText}>
            {speech.transcript || speech.interimTranscript ? (
              <>
                {speech.transcript}
                {speech.interimTranscript && (
                  <span style={{ color: "var(--muted)" }}>
                    {speech.transcript ? " " : ""}{speech.interimTranscript}
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: "var(--bg4)" }}>Listening…</span>
            )}
          </div>
        </div>

        {speech.error && (
          <p style={{ fontSize: "12px", color: "var(--red)", marginBottom: "14px" }}>{speech.error}</p>
        )}

        <button onClick={stopSpeaking} style={stopBtn}>
          Finish
        </button>
      </div>
    );
  }

  // ── Efter stoppet, innan man skickar ────────────────────────────
  //
  // Laget som saknades. Utan det foll man tillbaka till Begin i samma
  // ogonblick som motorn stangdes av, och det man just sagt sag ut att
  // vara borta.
  if (shown === "review" || shown === "marking") {
    const said  = spoken();
    const words = said ? said.split(/\s+/).length : 0;
    const busy  = shown === "marking";

    return (
      <div>
        <p style={{ ...eyebrow, color: busy ? "var(--gold)" : "var(--parch2)" }}>
          {busy ? "Marking…" : "Recorded"}
        </p>
        <p style={{
          fontFamily: "var(--fd)", fontSize: "26px", fontWeight: 300,
          color: "var(--parch)", marginBottom: "20px",
        }}>
          {partName ?? workTitle}
        </p>

        <div style={liveBox}>
          <div style={liveHead}>
            <span style={{ fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>
              Recorded
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {words} words
            </span>
          </div>
          <div style={liveText}>
            {said || <span style={{ color: "var(--bg4)" }}>Nothing was picked up.</span>}
          </div>
        </div>

        {error && (
          <p style={{ fontSize: "12.5px", color: "var(--red)", marginBottom: "14px" }}>{error}</p>
        )}

        {busy ? (
          <p style={{ fontSize: "13px", color: "var(--muted)" }}>
            Comparing it against the text…
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={submit} disabled={!said} style={{ ...primaryBtn, opacity: said ? 1 : 0.45 }}>
                Mark this performance
              </button>
              <button onClick={begin} style={ghostBtn}>Start over</button>
            </div>
            <p style={{ fontSize: "11.5px", color: "var(--bg4)", marginTop: "16px", lineHeight: 1.6 }}>
              {said
                ? "Nothing is counted until you mark it."
                : "Nothing was picked up. Check the microphone and start over."}
            </p>
          </>
        )}
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


/** Ord i en strang. Tom strang ar noll, inte ett. */
function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// ── Stilar ────────────────────────────────────────────────────────────
const liveHead: CSSProperties = {
  display: "flex", alignItems: "baseline", justifyContent: "space-between",
  gap: "10px", marginBottom: "10px",
  paddingBottom: "8px", borderBottom: "1px solid var(--bord)",
};

/**
 * Transkriptet.
 *
 * Rullar i stallet for att vaxa: ett langt framforande far inte trycka
 * ned Finish-knappen under skarmkanten mitt i en korning.
 */
const liveText: CSSProperties = {
  fontFamily:  "var(--fb)",
  fontSize:    "14px",
  lineHeight:  1.75,
  color:       "var(--parch2)",
  textAlign:   "left",
  maxHeight:   "42vh",
  overflowY:   "auto",
  wordBreak:   "break-word",
  whiteSpace:  "pre-wrap",
};

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
