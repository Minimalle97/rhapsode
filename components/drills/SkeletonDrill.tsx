"use client";
// components/drills/SkeletonDrill.tsx
//
// Drill 1 — Skelettet.
//
// Ett kort i taget: raden nedskuren till sina begynnelsebokstaver. Man
// sager den hogt, trycker Reveal, och bedomer sig sjalv.
//
// ── Vad som mats ──────────────────────────────────────────────────────
//
// Tiden fran att kortet visas till att Reveal trycks. Den sparas men
// visas inte an — den ar underlaget for att sedan kunna schemalagga
// enskilda rader efter hur trogt de sitter.
//
// Klockan nollstalls nar KORTET byts, inte nar sidan laddas. Ett kort man
// suttit och tittat pa i en minut ar inte samma sak som ett man svarade
// pa direkt, och skillnaden ar hela poangen med att mata.
//
// ── Peek ──────────────────────────────────────────────────────────────
//
// Tar fram ett ord i taget utan att doma raden som missad. Det ar en
// ventil, inte ett svar: den som behover ett enda ord for att komma vidare
// ska inte behova markera hela raden som borttappad. Att den ANVANTS
// sparas anda — ett kort med en tjuvtitt ar inte samma bevis som ett utan.

import { useState, useEffect, useRef, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { skeletonLine, type SkeletonSettings, type Segment } from "@/lib/drills/skeleton";

export interface DrillLine {
  sectionId:   string;
  sectionName: string;
  lineIndex:   number;
  text:        string;
}

type Mark = "got_it" | "hesitated" | "missed";

interface Props {
  workId:    string;
  workTitle: string;
  lines:     DrillLine[];
  settings:  SkeletonSettings;
  allowance: { unlimited: boolean; remaining: number; limit: number };
}

export function SkeletonDrill({ workId, workTitle, lines, settings: initial, allowance }: Props) {
  const [settings, setSettings] = useState<SkeletonSettings>(initial);
  const [at, setAt]             = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [peeks, setPeeks]       = useState(0);
  const [left, setLeft]         = useState(allowance.remaining);
  const [blocked, setBlocked]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);

  // Nar kortet visades. En ref och inte state — den far inte orsaka en
  // omritning, och den ska inte nollstallas av att nagot annat andras.
  //
  // Startvardet ar noll och satts forst i effekten. Date.now() under
  // sjalva renderingen ar orent: samma rendering kan koras om och ge ett
  // annat varde, och tiden vi mater ska vara nar kortet FAKTISKT kom upp.
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, [at]);

  const line = lines[at];
  const segments = useMemo(
    () => (line ? skeletonLine(line.text, settings) : []),
    [line, settings]
  );

  /** Hur manga ord raden har. Behovs for att veta nar Peek tagit slut. */
  const wordCount = segments.filter(s => s.kind === "word").length;

  async function saveSettings(next: SkeletonSettings) {
    setSettings(next);   // genast, sa reglaget kanns direkt
    try {
      await fetch("/api/drills/settings", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(next),
      });
    } catch {
      // Instalningen galler anda for det har passet. Att avbryta en
      // ovning for att en preferens inte kunde sparas vore fel ordning.
    }
  }

  async function mark(m: Mark) {
    setError(null);
    try {
      const res = await fetch("/api/drills/attempt", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drill:      "skeleton",
          sectionId:  line.sectionId,
          lineIndex:  line.lineIndex,
          mark:       m,
          msToReveal: revealedAt.current,
          peeked:     peeks > 0,
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
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    }
  }

  // Tiden fram till Reveal, last i det ogonblick Reveal trycktes. Utan
  // den skulle bedomningsknappen ocksa raknas in, och da mater siffran
  // hur snabbt man klickar snarare an hur snabbt man mindes.
  const revealedAt = useRef<number | null>(null);

  function reveal() {
    // Hann effekten inte satta klockan finns ingen mattid att spara.
    // Hellre ingen siffra an en pa femtiofem ar.
    revealedAt.current = shownAt.current ? Date.now() - shownAt.current : null;
    setRevealed(true);
  }

  function next() {
    if (at + 1 >= lines.length) { setDone(true); return; }
    setAt(n => n + 1);
    setRevealed(false);
    setPeeks(0);
    revealedAt.current = null;
  }

  // ── Slut pa rader ───────────────────────────────────────────────
  if (done) {
    return (
      <Frame workId={workId} workTitle={workTitle}>
        <div style={endBox}>
          <p style={{ fontFamily: "var(--fd)", fontSize: "22px", color: "var(--gold)", marginBottom: "8px" }}>
            That is the last line
          </p>
          <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.7, marginBottom: "16px" }}>
            You have worked through all {lines.length} lines of {workTitle}.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => { setAt(0); setRevealed(false); setPeeks(0); setDone(false); }}
              style={primaryBtn}
            >
              ↺ Go again
            </button>
            <Link href={`/work/${workId}/drills`} style={ghostBtn}>Back to drills</Link>
          </div>
        </div>
      </Frame>
    );
  }

  // ── Ransonen slut ───────────────────────────────────────────────
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

  return (
    <Frame workId={workId} workTitle={workTitle}>
      {/* ── Var man ar ── */}
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: "10px", flexWrap: "wrap", marginBottom: "8px",
      }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)" }}>
          Line {at + 1} of {lines.length}
        </p>
        <p style={{ fontSize: "11.5px", color: "var(--muted)" }}>
          {allowance.unlimited ? line.sectionName : `${line.sectionName} · ${left} cards left today`}
        </p>
      </div>

      <div style={{ height: "3px", background: "var(--bg4)", borderRadius: "2px", marginBottom: "22px" }}>
        <div style={{
          height: "100%", width: `${Math.round(((at + 1) / lines.length) * 100)}%`,
          background: "linear-gradient(90deg, var(--gold2), var(--gold))",
          borderRadius: "2px", transition: "width .3s ease",
        }} />
      </div>

      <Settings settings={settings} onChange={saveSettings} />

      {/* ── Kortet ── */}
      <div style={card}>
        {revealed ? (
          <p style={trueLine}>{line.text}</p>
        ) : (
          <p style={skeletonStyle}>
            <SkeletonSegments segments={segments} peeks={peeks} />
          </p>
        )}
      </div>

      {error && !blocked && <p style={errorText}>{error}</p>}

      {/* ── Knapparna ── */}
      {revealed ? (
        <>
          <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px" }}>
            How did that go?
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={() => mark("got_it")}    style={markBtn("var(--green)")}>Got it</button>
            <button onClick={() => mark("hesitated")} style={markBtn("var(--gold)")}>Hesitated</button>
            <button onClick={() => mark("missed")}    style={markBtn("var(--red)")}>Missed</button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={reveal} style={primaryBtn}>Reveal</button>
          <button
            onClick={() => setPeeks(n => n + 1)}
            disabled={peeks >= wordCount}
            style={{ ...ghostBtn, opacity: peeks >= wordCount ? 0.4 : 1, cursor: "pointer" }}
          >
            Peek a word
          </button>
          {peeks > 0 && (
            <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
              {peeks} {peeks === 1 ? "word" : "words"} shown — this still counts as your own
            </span>
          )}
        </div>
      )}
    </Frame>
  );
}

/**
 * Raden, ord for ord.
 *
 * Strecken far en egen aria-label. Utan den laser en skarmlasare upp
 * "tankstreck tankstreck tankstreck" — vilket ar bade obegripligt och
 * outhardligt over en hel dikt. Bokstaven som star kvar lases som den ar,
 * for den ar sjalva ledtraden.
 */
function SkeletonSegments({ segments, peeks }: { segments: Segment[]; peeks: number }) {
  // Ordens loptnummer raknas fram FORE utritningen.
  //
  // Det gjordes tidigare med en raknare som okades mitt i map() — alltsa
  // en variabel som andrades under renderingen. React sager ifran om det
  // med ratta: kors renderingen om halvvags borjar rakningen inte fran
  // borjan, och Peek skulle da ta fram fel ord.
  const wordNo: number[] = [];
  let seen = 0;
  for (const seg of segments) {
    wordNo.push(seg.kind === "word" ? seen++ : -1);
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "literal") return <span key={i}>{seg.text}</span>;

        // Peek tar fram orden i ordning fran radens borjan, i klartext.
        // Ordet lases ur `seg.word` — ur en bokstav plus tre streck gar
        // originalet inte att fa tillbaka.
        if (wordNo[i] < peeks) {
          return <span key={i} style={{ color: "var(--gold)" }}>{seg.word}</span>;
        }

        // Ett ord som anda star helt: inget att markera.
        if (seg.hidden === "") return <span key={i}>{seg.shown}</span>;

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

// ── Instalningarna ────────────────────────────────────────────────────
function Settings({
  settings, onChange,
}: {
  settings: SkeletonSettings;
  onChange: (s: SkeletonSettings) => void;
}) {
  return (
    <div style={settingsBox}>
      <Choice
        label="Letters kept"
        value={settings.lettersPerWord}
        options={[1, 2, 3]}
        onPick={v => onChange({ ...settings, lettersPerWord: v as 1 | 2 | 3 })}
      />
      <Choice
        label="Whole words per line"
        value={settings.wholeWordsPerLine}
        options={[0, 1, 2]}
        onPick={v => onChange({ ...settings, wholeWordsPerLine: v as 0 | 1 | 2 })}
      />
      <Toggle
        label="Show word length"
        on={settings.showWordLength}
        onChange={v => onChange({ ...settings, showWordLength: v })}
      />
      <Toggle
        label="Keep short words"
        on={settings.keepShortWords}
        onChange={v => onChange({ ...settings, keepShortWords: v })}
      />
    </div>
  );
}

function Choice({
  label, value, options, onPick,
}: {
  label: string; value: number; options: number[]; onPick: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <span style={settingLabel}>{label}</span>
      <div style={{ display: "flex", gap: "3px" }}>
        {options.map(o => (
          <button
            key={o}
            onClick={() => onPick(o)}
            aria-pressed={value === o}
            style={{
              minWidth: "30px", padding: "5px 9px", cursor: "pointer",
              borderRadius: "var(--r3)", fontSize: "12px",
              border: `1px solid ${value === o ? "var(--gold)" : "var(--bord)"}`,
              background: value === o ? "var(--gold4)" : "transparent",
              color: value === o ? "var(--gold)" : "var(--muted)",
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label, on, onChange,
}: {
  label: string; on: boolean; onChange: (v: boolean) => void;
}) {
  const id = `drill-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <input
        id={id}
        type="checkbox"
        checked={on}
        onChange={e => onChange(e.target.checked)}
        style={{ width: "15px", height: "15px", accentColor: "var(--gold)", cursor: "pointer" }}
      />
      <label htmlFor={id} style={{ ...settingLabel, cursor: "pointer" }}>{label}</label>
    </div>
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

// ── Stilar ────────────────────────────────────────────────────────────
const settingsBox: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: "14px 20px",
  padding: "12px 15px", marginBottom: "18px",
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r2)",
};
const settingLabel: CSSProperties = {
  fontSize: "11.5px", color: "var(--muted)", whiteSpace: "nowrap",
};
const card: CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r)", padding: "26px 24px",
  marginBottom: "18px", minHeight: "120px",
  display: "flex", alignItems: "center",
};
const skeletonStyle: CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "clamp(20px, 3.4vw, 26px)",
  lineHeight: 1.8, color: "var(--parch)", whiteSpace: "pre-wrap",
  wordBreak: "break-word", width: "100%",
};
const trueLine: CSSProperties = {
  ...skeletonStyle, color: "var(--gold)",
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
const errorText: CSSProperties = {
  fontSize: "12.5px", color: "var(--red)", marginBottom: "12px",
};
