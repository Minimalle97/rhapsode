"use client";
// components/duels/DuelPerformance.tsx
//
// Framforandet som raknas for tvekampen.
//
// Byggd pa samma rostlage som PerformanceMode — Web Speech i webblasaren,
// inget ljud lamnar enheten, bara transkriptet. Men den skickar till en
// annan route, och det ar hela skillnaden: ett forsok har ger ingen XP,
// flyttar ingen SM-2 och kan inte tanda en mastartitel. Det raknas for
// kampen och for ingenting annat.
//
// Det som visas hela tiden ar det basta forsoket hittills — ditt och
// deras. En tvekamp dar man inte ser hur man ligger till ar bara tva
// personer som ovar var for sig.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useSpeechRecitation } from "@/hooks/useSpeechRecitation";
import { useCountdown } from "./useCountdown";

interface Best {
  wordsHeld:     number;
  wordsPossible: number;
  accuracy:      number;
  attempts:      number;
}

interface AttemptResult {
  accuracy:     number;
  wordsTotal:   number;
  wordsCorrect: number;
  missed:       string[];
  isBest:       boolean;
  mine:   Best;
  theirs: { wordsHeld: number; accuracy: number; attempts: number };
}

interface Props {
  duelId:       string;
  workTitle:    string;
  author:       string;
  sectionCount: number;
  endsAt:       string;
  opponentName: string;
  mine:         Best;
  theirs:       { wordsHeld: number; accuracy: number; attempts: number };
}

const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "sv-SE", label: "Swedish" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
];

/** Tystnad langre an sa har raknas som en tvekan. Samma som PerformanceMode. */
const HESITATION_MS = 3_000;

/**
 * Vad som ritas.
 *
 * Samma rattning som i PerformanceMode, av samma skal: vyn villkorades
 * pa speech.isActive, och `speech.stop()` satter det till falskt synkront.
 * Ett tryck pa Finish kastade darfor tillbaka en till startlaget medan
 * anropet fortfarande var i luften — mitt i en tvekamp, dar det sag ut
 * som att forsoket gatt forlorat.
 */
type Phase = "idle" | "performing" | "review" | "marking" | "scored";

export function DuelPerformance({
  duelId, workTitle, author, sectionCount,
  endsAt, opponentName, mine: initialMine, theirs: initialTheirs,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang]   = useState("en-US");
  const speech = useSpeechRecitation({ lang });

  const [mine, setMine]     = useState(initialMine);
  const [theirs, setTheirs] = useState(initialTheirs);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const { label: timeLeft, done } = useCountdown(endsAt);

  const startedAt   = useRef(0);
  const lastWordAt  = useRef(0);
  const hesitations = useRef(0);
  const longestGap  = useRef(0);

  const noteSpeech = useCallback(() => {
    const now = Date.now();
    if (lastWordAt.current) {
      const gap = now - lastWordAt.current;
      if (gap > HESITATION_MS) hesitations.current += 1;
      if (gap > longestGap.current) longestGap.current = gap;
    }
    lastWordAt.current = now;
  }, []);

  useEffect(() => {
    if (speech.isActive) noteSpeech();
  }, [speech.transcript, speech.interimTranscript, speech.isActive, noteSpeech]);

  // Gar tiden ut mitt i ett framforande stoppas det. Att lata nagon tala
  // fardigt och sedan kasta forsoket vore samre an att saga till direkt.
  useEffect(() => {
    if (done && speech.isActive) speech.stop();
  }, [done, speech]);


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
   * Det som faktiskt sagts, interimtexten inraknad.
   *
   * Chrome hinner inte alltid gora sista frasen slutgiltig innan stop(),
   * och utan den tappades slutet av varje forsok — i en tvekamp betyder
   * det forlorade ord i den siffra som avgor.
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
      const res = await fetch(`/api/duels/${duelId}/attempt`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          durationSecs:   Math.round((Date.now() - startedAt.current) / 1000),
          hesitations:    hesitations.current,
          longestPauseMs: longestGap.current,
          // Var i forsoket det blev tyst. Hooken raknar platserna; utan
          // dem gar en tvekan inte att lagga pa ratt rad.
          hesitatedAt:    speech.hesitationIndices,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not mark that");

      setResult(data as AttemptResult);
      setMine(data.mine);
      setTheirs(data.theirs);
      setPhase("scored");
      // Biblioteket visar samma siffra i den grona rutan.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark that");
      // Tillbaka till granskningen, inte till borjan: forsoket finns kvar.
      setPhase("review");
    }
  }

  if (!speech.isSupported) {
    return (
      <div style={notice}>
        A duel performance needs speech recognition — try Chrome, Edge, or Safari.
      </div>
    );
  }

  // ── Tiden ar ute ────────────────────────────────────────────────
  if (done) {
    return (
      <div style={notice}>
        Time is up. Ask for the result to see how it went.
      </div>
    );
  }

  // ── Efterat ─────────────────────────────────────────────────────
  if (shown === "scored" && result) {
    return (
      <div>
        <p style={{ ...eyebrow, color: result.isBest ? "var(--green)" : "var(--muted)" }}>
          {result.isBest ? "Your best yet" : "Counted, but not your best"}
        </p>

        <p style={{
          fontFamily: "var(--fd)", fontSize: "58px", fontWeight: 300, lineHeight: 1,
          color: result.isBest ? "var(--green)" : "var(--parch2)", marginBottom: "6px",
        }}>
          {result.accuracy}%
        </p>
        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "24px" }}>
          {result.wordsCorrect} of {result.wordsTotal} words held
        </p>

        <Standings mine={mine} theirs={theirs} opponentName={opponentName} />

        {result.missed.length > 0 && (
          <p style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.7, margin: "20px 0" }}>
            Slipped: {result.missed.slice(0, 12).join(", ")}
          </p>
        )}

        <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "18px" }}>
          {timeLeft} left. Your best attempt is what counts — a worse one can&apos;t
          take it away.
        </p>

        <button onClick={begin} style={primaryBtn}>Perform it again</button>
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
          {workTitle}
        </p>

        {/* Samma andring som i PerformanceMode: det som horts frammast,
            rakningen vid sidan. Se kommentaren dar. */}
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
  if (shown === "review" || shown === "marking") {
    const said  = spoken();
    const words = said ? said.split(/\s+/).length : 0;
    const busy  = shown === "marking";

    return (
      <div>
        <p style={{ ...eyebrow, color: busy ? "var(--gold)" : "var(--green)" }}>
          {busy ? "Marking…" : "Recorded"}
        </p>
        <p style={{
          fontFamily: "var(--fd)", fontSize: "26px", fontWeight: 300,
          color: "var(--parch)", marginBottom: "20px",
        }}>
          {workTitle}
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
                Count this attempt
              </button>
              <button onClick={begin} style={stopBtn}>Start over</button>
            </div>
            <p style={{ fontSize: "11.5px", color: "var(--bg4)", marginTop: "16px", lineHeight: 1.6 }}>
              {said
                ? "Nothing counts toward the duel until you send it. Your best attempt stands."
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
      <p style={eyebrow}>Duel performance</p>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 300,
        color: "var(--parch)", letterSpacing: "0.02em", marginBottom: "6px",
      }}>
        {workTitle}
      </p>
      <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "24px" }}>{author}</p>

      <Standings mine={mine} theirs={theirs} opponentName={opponentName} />

      <p style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--parch2)", margin: "24px 0 22px" }}>
        {sectionCount} section{sectionCount === 1 ? "" : "s"}, start to finish, with
        nothing in front of you. Only this counts toward the duel — practising the
        work earns XP and moves your library progress as usual, but it adds nothing
        here. Perform as many times as you like; your best one stands.
      </p>

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

/** Hur ni ligger till. Ditt basta mot deras, sida vid sida. */
function Standings({
  mine, theirs, opponentName,
}: {
  mine: Best;
  theirs: { wordsHeld: number; accuracy: number; attempts: number };
  opponentName: string;
}) {
  const ahead  = mine.wordsHeld > theirs.wordsHeld;
  const level  = mine.wordsHeld === theirs.wordsHeld;

  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid rgba(106,158,106,0.3)",
      borderRadius: "var(--r)", padding: "16px 18px",
    }}>
      <p style={{
        fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase",
        color: "var(--muted)", marginBottom: "14px",
      }}>
        Best performance so far
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "12px", alignItems: "center" }}>
        <Side
          label="You"
          words={mine.wordsHeld}
          possible={mine.wordsPossible}
          accuracy={mine.accuracy}
          attempts={mine.attempts}
          lead={ahead || level}
        />
        <div style={{ width: "1px", background: "var(--bord)", alignSelf: "stretch" }} />
        <Side
          label={opponentName}
          words={theirs.wordsHeld}
          possible={mine.wordsPossible}
          accuracy={theirs.accuracy}
          attempts={theirs.attempts}
          lead={!ahead || level}
          align="right"
        />
      </div>

      <p style={{
        fontSize: "11.5px", color: "var(--muted)", textAlign: "center",
        marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--bord)",
      }}>
        {level && mine.wordsHeld === 0
          ? "Neither of you has performed it yet."
          : level
            ? "Dead level."
            : ahead
              ? `You are ahead by ${mine.wordsHeld - theirs.wordsHeld} words.`
              : `${opponentName} is ahead by ${theirs.wordsHeld - mine.wordsHeld} words.`}
      </p>
    </div>
  );
}

function Side({
  label, words, possible, accuracy, attempts, lead, align = "left",
}: {
  label: string; words: number; possible: number; accuracy: number;
  attempts: number; lead: boolean; align?: "left" | "right";
}) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <p style={{
        fontSize: "11.5px", color: "var(--muted)", marginBottom: "6px",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "30px", fontWeight: 300, lineHeight: 1.1,
        color: lead ? "var(--green)" : "var(--parch2)",
      }}>
        {words.toLocaleString()}
      </p>
      <p style={{ fontSize: "11px", color: "var(--muted)" }}>
        words{possible > 0 && ` of ${possible}`}
      </p>
      <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px" }}>
        {accuracy}% · {attempts} {attempts === 1 ? "run" : "runs"}
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
  color: "var(--green)", marginBottom: "10px",
};
const notice: CSSProperties = {
  padding: "24px", textAlign: "center", fontSize: "13px", lineHeight: 1.6,
  color: "var(--muted)", background: "var(--bg3)",
  borderRadius: "var(--r2)", border: "1px solid var(--bord)",
};
const liveBox: CSSProperties = {
  background: "var(--bg2)", border: "1px solid rgba(106,158,106,0.3)",
  borderRadius: "var(--r)", padding: "24px", marginBottom: "20px",
  textAlign: "left",
};
const primaryBtn: CSSProperties = {
  padding: "12px 26px", borderRadius: "var(--r3)",
  background: "var(--green)", border: "1px solid var(--green)",
  color: "var(--bg)", fontSize: "14px", cursor: "pointer",
};
const stopBtn: CSSProperties = {
  padding: "12px 26px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--green)",
  color: "var(--green)", fontSize: "14px", cursor: "pointer",
};
const label: CSSProperties = {
  display: "block", fontSize: "10px", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "var(--muted)", marginBottom: "7px",
};
const select: CSSProperties = {
  width: "100%", maxWidth: "260px", padding: "10px 12px",
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r3)", color: "var(--parch)", fontSize: "13px",
};
