"use client";
// components/practice/WriteMode.tsx
// Skriv sektionen ur minnet och få den rättad.
//
// Ändrat: rättningen gick tidigare till en språkmodell för att få ett tal
// mellan noll och hundra tillbaka. Nu görs jämförelsen på servern med
// Levenshtein på ordnivå — samma svar varje gång, på en millisekund, utan
// kostnad. Det är också det enda sättet att göra mästerskapsnivån
// reproducerbar.
//
// Originalet skickas INTE med i anropet. Servern hämtar texten själv ur
// sektionen; annars hade en klient kunnat skicka in en lättare text att
// jämföras mot.
//
// Läsningen ovanpå siffran — vad som gled och vad man gör åt det — är det
// som ligger i Pro, och den kommer med i samma svar när man har den.

import { useState, type CSSProperties } from "react";
import { UpgradeCard } from "@/components/billing/UpgradeCard";

interface WriteModeProps {
  sectionId:  string;
  onComplete: (quality: number, score: number, detail: GradeDetail) => void;
}

export interface Analysis {
  summary:  string;
  patterns: string[];
  drill:    string;
}

export interface GradeDetail {
  wordsTotal:   number;
  wordsCorrect: number;
  missed:       string[];
  cueLevel:     string;
}

interface GradeResult {
  score:    number;
  quality:  number;
  missed:   string[];
  diff:     { word: string; correct: boolean }[];
  wordsTotal:   number;
  wordsCorrect: number;
  analysis:          Analysis | null;
  analysisAvailable: boolean;
}

export function WriteMode({ sectionId, onComplete }: WriteModeProps) {
  const [attempt, setAttempt] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult]   = useState<GradeResult | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function handleGrade() {
    if (!attempt.trim()) return;
    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/practice/grade", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sectionId, attempt, cueLevel: "hidden" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not mark that");
      setResult(data as GradeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark that attempt.");
    } finally {
      setGrading(false);
    }
  }

  if (result) {
    return (
      <div>
        <ScoreDisplay score={result.score} />

        {/* Diffen är gratis och säger mest av allt: exakt vilka ord som gled. */}
        <p style={diffStyle}>
          {result.diff.map((d, i) => (
            <span
              key={i}
              style={{
                color: d.correct ? "var(--parch2)" : "var(--red)",
                borderBottom: d.correct ? "none" : "1px solid var(--red)",
              }}
            >
              {d.word}{" "}
            </span>
          ))}
        </p>

        {result.missed.length > 0 && (
          <p style={mutedLine}>Slipped: {result.missed.join(", ")}</p>
        )}

        {result.analysis?.summary && (
          <div style={analysisBox}>
            <p style={analysisText}>{result.analysis.summary}</p>
            {result.analysis.patterns.length > 0 && (
              <ul style={{ listStyle: "none", marginTop: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
                {result.analysis.patterns.map((p, i) => (
                  <li key={i} style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.55 }}>
                    {p}
                  </li>
                ))}
              </ul>
            )}
            {result.analysis.drill && (
              <p style={{ ...analysisText, marginTop: "12px", color: "var(--parch)" }}>
                {result.analysis.drill}
              </p>
            )}
          </div>
        )}

        {!result.analysisAvailable && result.missed.length > 0 && (
          <div style={{ marginTop: "18px" }}>
            <UpgradeCard
              variant="compact"
              feature="ADVANCED_RECITATION"
              body={`You lost ${result.missed.length} ${result.missed.length === 1 ? "word" : "words"}. Pro reads the pattern behind that and builds a drill for it.`}
            />
          </div>
        )}

        <button
          onClick={() =>
            onComplete(result.quality, result.score, {
              wordsTotal:   result.wordsTotal,
              wordsCorrect: result.wordsCorrect,
              missed:       result.missed,
              cueLevel:     "hidden",
            })
          }
          style={continueBtnStyle}
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <textarea
        value={attempt}
        onChange={e => setAttempt(e.target.value)}
        placeholder="Write the section from memory…"
        style={textareaStyle}
        disabled={grading}
      />
      {error && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "8px" }}>{error}</p>}
      <button onClick={handleGrade} disabled={grading || !attempt.trim()} style={gradeBtnStyle}>
        {grading ? "Marking…" : "Check my attempt"}
      </button>
    </div>
  );
}

export function ScoreDisplay({ score }: { score: number }) {
  const color = score >= 85 ? "var(--green)" : score >= 50 ? "var(--gold)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "14px" }}>
      <span style={{ fontFamily: "var(--fd)", fontSize: "44px", fontWeight: 300, color }}>{score}</span>
      <span style={{ fontSize: "14px", color: "var(--muted)" }}>/ 100</span>
    </div>
  );
}

const textareaStyle: CSSProperties = {
  width:        "100%",
  minHeight:    "160px",
  background:   "var(--bg3)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r2)",
  padding:      "14px",
  fontSize:     "15px",
  lineHeight:   1.6,
  color:        "var(--parch)",
  fontFamily:   "var(--fb)",
  outline:      "none",
  resize:       "vertical",
};

const diffStyle: CSSProperties = {
  fontFamily:  "var(--fd)",
  fontSize:    "16px",
  lineHeight:  1.85,
  whiteSpace:  "pre-wrap",
  marginBottom: "12px",
};

const mutedLine: CSSProperties = {
  fontSize:     "12px",
  color:        "var(--muted)",
  marginBottom: "4px",
};

const analysisBox: CSSProperties = {
  marginTop:    "16px",
  padding:      "16px 18px",
  background:   "var(--bg3)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r2)",
};

const analysisText: CSSProperties = {
  fontSize:   "13.5px",
  lineHeight: 1.7,
  color:      "var(--parch2)",
};

const gradeBtnStyle: CSSProperties = {
  marginTop:    "14px",
  padding:      "11px 24px",
  borderRadius: "var(--r2)",
  border:       "none",
  background:   "var(--gold)",
  color:        "#0C1015",
  fontSize:     "14px",
  fontWeight:   500,
  cursor:       "pointer",
};

const continueBtnStyle: CSSProperties = {
  marginTop:    "20px",
  padding:      "11px 24px",
  borderRadius: "var(--r2)",
  border:       "1px solid var(--gold)",
  background:   "var(--gold3)",
  color:        "var(--gold)",
  fontSize:     "14px",
  cursor:       "pointer",
};
