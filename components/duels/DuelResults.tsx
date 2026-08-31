"use client";
// components/duels/DuelResults.tsx
//
// Vad de tva gjorde av tiden, sida vid sida.
//
// Siffrorna ar de som avgjorde, i den ordning de avgjorde: ord som halls
// forst, sedan tratsakerhet, sedan tid. Att visa dem i avgorandets
// ordning ar hela poangen — annars ar det en tabell, och da gar det inte
// att se VARFOR nagon vann.
//
// Ingenting rakas fram har. Servern fryste resultatet nar klockan gick
// ut, och den har filen ritar det.

import { useState } from "react";
import type { DuelResult, DuelSide } from "@/lib/duels";

interface Props {
  duelId:    string;
  workTitle: string;
  /** Betraktarens id — avgor vilken sida som ar "du". */
  viewerId:  string;
  /** Redan hamtat resultat, om sidan haft det. Annars hamtas det. */
  initial?:  DuelResult | null;
}

const MARGIN_TEXT: Record<DuelResult["margin"], string> = {
  words:    "Decided on words held.",
  accuracy: "Level on words. Decided on accuracy.",
  time:     "Level on words and accuracy. Decided on time at the text.",
  draw:     "Level on every count. Both keep a medal.",
};

export function DuelResults({ duelId, workTitle, viewerId, initial = null }: Props) {
  const [result, setResult] = useState<DuelResult | null>(initial);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res  = await fetch(`/api/duels/${duelId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read the result");
      if (!json.result) throw new Error("The clock is still running.");
      setResult(json.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the result");
    } finally {
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <div>
        <button onClick={load} disabled={busy} style={showBtn}>
          {busy ? "Counting…" : "◆ Show results"}
        </button>
        {error && <p style={errorText}>{error}</p>}
      </div>
    );
  }

  // "Du" till vanster, alltid. Att leta efter sig sjalv i en tabell ar
  // en onodig sekund varje gang.
  const [mine, theirs] = result.challenger.userId === viewerId
    ? [result.challenger, result.opponent]
    : [result.opponent, result.challenger];

  const iWon  = result.winnerId === viewerId;
  const draw  = result.winnerId === null;
  const verdict = draw ? "A draw" : iWon ? "You won" : `${theirs.username} won`;
  const accent  = draw ? "var(--gold)" : iWon ? "var(--green)" : "var(--red)";

  return (
    <div style={{
      background: "var(--bg2)",
      border: `1px solid ${accent === "var(--gold)" ? "var(--bord)" : accent}`,
      borderRadius: "var(--r)", padding: "20px 22px",
    }}>
      <p style={{
        fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase",
        color: "var(--muted)", marginBottom: "6px",
      }}>
        Duel · {workTitle}
      </p>

      <p style={{
        fontFamily: "var(--fd)", fontSize: "26px", fontWeight: 300,
        color: accent, marginBottom: "4px",
      }}>
        {verdict}
      </p>
      <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "20px" }}>
        {MARGIN_TEXT[result.margin]}
        {(iWon || draw) && " A battle medal is on your profile."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "10px", alignItems: "start" }}>
        <Column side={mine}   label="You"            highlight={iWon || draw} />
        <div style={{ width: "1px", background: "var(--bord)", alignSelf: "stretch" }} />
        <Column side={theirs} label={theirs.username} highlight={(!iWon && !draw) || draw} align="right" />
      </div>

      <p style={{
        fontSize: "11px", color: "var(--muted)", lineHeight: 1.6,
        marginTop: "18px", paddingTop: "14px", borderTop: "1px solid var(--bord)",
      }}>
        Words held is the best graded attempt on each section, added up. Only
        attempts where the text was out of sight count — writing it out or
        reciting it, not reading along.
      </p>
    </div>
  );
}

function Column({
  side, label, highlight, align = "left",
}: {
  side: DuelSide; label: string; highlight: boolean; align?: "left" | "right";
}) {
  const pct = side.wordsPossible > 0
    ? Math.round((side.wordsHeld / side.wordsPossible) * 100)
    : 0;

  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <p style={{
        fontSize: "12px", color: highlight ? "var(--parch)" : "var(--muted)",
        marginBottom: "10px", overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </p>

      <p style={{
        fontFamily: "var(--fd)", fontSize: "34px", fontWeight: 300,
        color: highlight ? "var(--gold)" : "var(--parch2)", lineHeight: 1.1,
      }}>
        {side.wordsHeld.toLocaleString()}
      </p>
      <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "14px" }}>
        words held{side.wordsPossible > 0 && ` · ${pct}%`}
      </p>

      <Row label="Accuracy" value={`${side.accuracy}%`} align={align} />
      <Row label="Sections held" value={`${side.sectionsHeld}/${side.sectionsAttempted}`} align={align} />
      <Row label="At the text" value={minutes(side.seconds)} align={align} />
      <Row label="Attempts" value={String(side.attempts)} align={align} />
      <Row label="XP" value={side.xp.toLocaleString()} align={align} />
    </div>
  );
}

function Row({ label, value, align }: { label: string; value: string; align: "left" | "right" }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: "8px",
      flexDirection: align === "right" ? "row-reverse" : "row",
      fontSize: "11.5px", marginBottom: "5px",
    }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ color: "var(--parch2)" }}>{value}</span>
    </div>
  );
}

function minutes(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const showBtn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "13px", cursor: "pointer",
};
const errorText: React.CSSProperties = {
  fontSize: "12px", color: "var(--red)", marginTop: "10px",
};
