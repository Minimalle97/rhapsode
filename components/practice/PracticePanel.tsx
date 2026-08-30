"use client";
// components/practice/PracticePanel.tsx
// Fas 8: orkestrerar de fyra praktik-lägena, mäter tid (durationSecs — den
// sista pusselbiten Fas 6/7 byggde plumbing för men aldrig fick data till),
// skickar in resultatet via usePracticeSession och visar XPToast.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePracticeSession } from "@/hooks/usePracticeSession";
import { XPToast } from "@/components/rank/XPToast";
import { ReadMode } from "./ReadMode";
import { HideMode } from "./HideMode";
import { WriteMode } from "./WriteMode";
import { ReciteMode } from "./ReciteMode";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import type { GradeDetail } from "./WriteMode";
import type { PracticeMode } from "@/types";

interface PracticePanelProps {
  workId:      string;
  workTitle:   string;
  sectionId:   string;
  sectionName: string;
  content:     string;
  prevRank:    string;
  /** Uträknat på servern. Styr bara vad som ritas, aldrig vad som tillåts. */
  isPro:       boolean;
}

const MODES: { value: PracticeMode; label: string }[] = [
  { value: "read",   label: "Read" },
  { value: "hide",   label: "Hide" },
  { value: "write",  label: "Write" },
  { value: "recite", label: "Recite" },
];

export function PracticePanel({
  workId, workTitle, sectionId, sectionName, content, prevRank, isPro,
}: PracticePanelProps) {
  const { submitSession, result, clearResult } = usePracticeSession(prevRank);
  const [mode, setMode]           = useState<PracticeMode>("read");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [lastDetail, setLastDetail] = useState<GradeDetail | null>(null);

  // Tiden räknas från senaste lägesbytet, inte från sidladdning — annars
  // skulle den som provar Read, ångrar sig och byter till Write få en
  // konstgjort lång durationSecs som inkluderar tid i ett läge de inte
  // slutförde.
  const startRef = useRef(Date.now());
  useEffect(() => { startRef.current = Date.now(); }, [mode]);

  function elapsedSecs(): number {
    return Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
  }

  async function handleComplete(
    quality: number,
    score?: number,
    detail?: GradeDetail
  ) {
    setSubmitting(true);
    try {
      await submitSession(
        sectionId, quality, mode, score, elapsedSecs(), detail
      );
      if (detail) setLastDetail(detail);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "40px 24px" }}>
      <Link href={`/work/${workId}`} style={backLinkStyle}>← {workTitle}</Link>

      <h1 style={titleStyle}>{sectionName}</h1>

      {!submitted ? (
        <>
          <div style={tabRowStyle}>
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                disabled={submitting}
                style={tabStyle(mode === m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div style={cardStyle}>
            {mode === "read" && (
              <ReadMode content={content} onComplete={(q) => handleComplete(q)} />
            )}
            {mode === "hide" && (
              <HideMode content={content} onComplete={(q) => handleComplete(q)} />
            )}
            {mode === "write" && (
              <WriteMode
                sectionId={sectionId}
                onComplete={(q, s, d) => handleComplete(q, s, d)}
              />
            )}
            {mode === "recite" && (
              <ReciteMode
                sectionId={sectionId}
                onComplete={(q, s, d) => handleComplete(q, s, d)}
              />
            )}
          </div>
        </>
      ) : (
        <div style={doneStyle}>
          <p style={doneTextStyle}>Saved. Well practiced.</p>

          {lastDetail && lastDetail.wordsTotal > 0 && (
            <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>
              {lastDetail.wordsCorrect} of {lastDetail.wordsTotal} words held.
            </p>
          )}

          <Link href={`/work/${workId}`} style={continueLinkStyle}>
            Back to {workTitle}
          </Link>

          {/*
            Erbjudandet kommer HÄR och ingen annanstans: efter att arbetet
            är gjort, med en siffra att peka på. Aldrig före — den som inte
            hunnit recitera en gång har ingenting att värdera erbjudandet
            mot, och att fråga då är bara att stå i vägen.
          */}
          {!isPro && lastDetail && lastDetail.missed.length >= 2 && (
            <div style={{ marginTop: "34px", textAlign: "left" }}>
              <UpgradeCard
                feature="PERSONALIZED_STUDY"
                title="Train the lines you keep losing"
                body={
                  <>
                    You slipped on {lastDetail.missed.slice(0, 3).join(", ")}
                    {lastDetail.missed.length > 3 ? " and others" : ""}. Rhapsode Pro
                    can turn exactly those lines into a targeted session — the passage
                    broken down, the words drilled, and the rhythm checked against how
                    you actually said it.
                  </>
                }
              />
            </div>
          )}
        </div>
      )}

      {result && (
        <XPToast
          xpEarned={result.xpEarned}
          newXP={result.newXP}
          rankName={result.rank}
          rankUp={result.rankUp}
          medal={result.medal}
          streakDays={result.streakDays}
          streakBonusXP={result.streakBonusXP}
          onDone={clearResult}
        />
      )}
    </div>
  );
}

const backLinkStyle: CSSProperties = {
  fontSize:       "13px",
  color:          "var(--muted)",
  textDecoration: "none",
  display:        "inline-block",
  marginBottom:   "20px",
};

const titleStyle: CSSProperties = {
  fontFamily:    "var(--fd)",
  fontSize:      "26px",
  fontWeight:    300,
  color:         "var(--parch)",
  letterSpacing: "0.03em",
  marginBottom:  "24px",
};

const tabRowStyle: CSSProperties = {
  display:      "flex",
  gap:          "6px",
  marginBottom: "20px",
};

function tabStyle(active: boolean): CSSProperties {
  return {
    flex:          1,
    padding:       "9px 0",
    borderRadius:  "var(--r2)",
    border:        active ? "1px solid var(--gold)" : "1px solid var(--bord)",
    background:    active ? "var(--gold3)" : "transparent",
    color:         active ? "var(--gold)" : "var(--muted)",
    fontSize:      "13px",
    fontFamily:    "var(--fb)",
    letterSpacing: "0.03em",
    cursor:        "pointer",
    transition:    "all .15s",
  };
}

const cardStyle: CSSProperties = {
  background:   "var(--bg2)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r)",
  padding:      "28px 24px",
};

const doneStyle: CSSProperties = {
  textAlign: "center",
  padding:   "60px 0",
};

const doneTextStyle: CSSProperties = {
  fontFamily:   "var(--fd)",
  fontSize:     "22px",
  fontWeight:   300,
  color:        "var(--parch)",
  marginBottom: "18px",
};

const continueLinkStyle: CSSProperties = {
  display:        "inline-block",
  padding:        "10px 22px",
  borderRadius:   "var(--r2)",
  border:         "1px solid var(--gold)",
  background:     "var(--gold3)",
  color:          "var(--gold)",
  fontSize:       "13px",
  textDecoration: "none",
};
