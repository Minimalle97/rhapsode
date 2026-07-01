"use client";
// components/practice/WriteMode.tsx
// Fas 8: skriv sektionen ur minnet, betygsätt mot originalet via samma
// /api/agents/grade-endpoint som redan fanns (skrivet i Fas 1, aldrig
// anropat förrän nu).

import { useState, type CSSProperties } from "react";
import { scoreToQuality } from "@/lib/sm2";

interface WriteModeProps {
  content:    string;
  onComplete: (quality: number, score: number) => void;
}

interface GradeResult {
  score:    number;
  feedback: string;
  errors:   string[];
}

export function WriteMode({ content, onComplete }: WriteModeProps) {
  const [attempt, setAttempt] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult]   = useState<GradeResult | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function handleGrade() {
    if (!attempt.trim()) return;
    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/grade", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ original: content, attempt }),
      });
      if (!res.ok) throw new Error("Grading failed");
      const data: GradeResult = await res.json();
      setResult(data);
    } catch {
      setError("Couldn't grade that attempt — try again.");
    } finally {
      setGrading(false);
    }
  }

  if (result) {
    return (
      <div>
        <ScoreDisplay score={result.score} />
        <p style={feedbackStyle}>{result.feedback}</p>
        {result.errors.length > 0 && (
          <ul style={errorListStyle}>
            {result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        <button onClick={() => onComplete(scoreToQuality(result.score), result.score)} style={continueBtnStyle}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <textarea
        value={attempt}
        onChange={(e) => setAttempt(e.target.value)}
        placeholder="Write the section from memory…"
        style={textareaStyle}
        disabled={grading}
      />
      {error && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "8px" }}>{error}</p>}
      <button onClick={handleGrade} disabled={grading || !attempt.trim()} style={gradeBtnStyle}>
        {grading ? "Grading…" : "Check my attempt"}
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

const feedbackStyle: CSSProperties = {
  fontSize:     "14px",
  lineHeight:   1.6,
  color:        "var(--parch2)",
  marginBottom: "12px",
};

const errorListStyle: CSSProperties = {
  fontSize:     "13px",
  color:        "var(--muted)",
  lineHeight:   1.7,
  marginBottom: "20px",
  paddingLeft:  "18px",
};

const continueBtnStyle: CSSProperties = {
  padding:      "11px 24px",
  borderRadius: "var(--r2)",
  border:       "1px solid var(--gold)",
  background:   "var(--gold3)",
  color:        "var(--gold)",
  fontSize:     "14px",
  cursor:       "pointer",
};
