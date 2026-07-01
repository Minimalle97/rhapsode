"use client";
// components/practice/ReciteMode.tsx
// Fas 8: huvudfokus för fasen. Taligenkänning (transkription) och
// MediaRecorder (uppspelningsbart ljud) körs PARALLELLT — Web Speech API
// ger bara text, ingen ljuddata. Betygsätts mot samma /api/agents/grade
// som WriteMode, med transkriptet som "attempt".

import { useState, type CSSProperties } from "react";
import { useSpeechRecitation } from "@/hooks/useSpeechRecitation";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { scoreToQuality } from "@/lib/sm2";
import { ScoreDisplay } from "./WriteMode";

interface ReciteModeProps {
  content:    string;
  sectionId:  string;
  onComplete: (quality: number, score: number, recordingPath?: string) => void;
}

interface GradeResult {
  score:    number;
  feedback: string;
  errors:   string[];
}

const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "sv-SE", label: "Swedish" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
];

export function ReciteMode({ content, sectionId, onComplete }: ReciteModeProps) {
  const [lang, setLang] = useState("en-US");
  const speech = useSpeechRecitation({ lang });
  const audio  = useAudioRecorder();

  const [saveRecording, setSaveRecording] = useState(true);
  const [result, setResult]         = useState<GradeResult | null>(null);
  const [grading, setGrading]       = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const hasAttempt  = speech.transcript.trim().length > 0;
  const isRecording = speech.isListening || audio.isRecording;

  async function handleStart() {
    speech.reset();
    audio.reset();
    setResult(null);
    speech.start();
    await audio.start();
  }

  function handleStop() {
    speech.stop();
    audio.stop();
  }

  async function handleGrade() {
    if (!hasAttempt) return;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await fetch("/api/agents/grade", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ original: content, attempt: speech.transcript }),
      });
      if (!res.ok) throw new Error("Grading failed");
      setResult(await res.json());
    } catch {
      setGradeError("Couldn't grade that attempt — try again.");
    } finally {
      setGrading(false);
    }
  }

  async function handleContinue() {
    if (!result) return;

    let recordingPath: string | undefined;
    if (saveRecording && audio.audioBlob) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", audio.audioBlob, "recitation.webm");
        formData.append("sectionId", sectionId);
        const res = await fetch("/api/recordings", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          recordingPath = data.path;
        }
      } finally {
        setUploading(false);
      }
    }

    onComplete(scoreToQuality(result.score), result.score, recordingPath);
  }

  if (!speech.isSupported || !audio.isSupported) {
    return (
      <div style={unsupportedStyle}>
        <p>Recitation mode needs a browser with speech recognition and microphone
        support — try Chrome, Edge, or Safari on this device.</p>
      </div>
    );
  }

  return (
    <div>
      {!isRecording && !hasAttempt && (
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Recitation language</label>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={selectStyle}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      )}

      <div style={transcriptBoxStyle}>
        {hasAttempt || speech.interimTranscript ? (
          <p style={transcriptTextStyle}>
            {speech.transcript}
            <span style={{ color: "var(--muted)" }}> {speech.interimTranscript}</span>
          </p>
        ) : (
          <p style={placeholderStyle}>
            {isRecording ? "Listening — recite the section aloud…" : "Press Record and recite the section from memory."}
          </p>
        )}
      </div>

      {(speech.error || audio.error) && (
        <p style={{ fontSize: "12px", color: "var(--red)", marginBottom: "10px" }}>
          {speech.error || audio.error}
        </p>
      )}

      {audio.audioUrl && !result && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio src={audio.audioUrl} controls style={{ width: "100%", marginBottom: "14px" }} />
      )}

      {!result ? (
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          {!isRecording && !hasAttempt && (
            <button onClick={handleStart} style={recordBtnStyle}>● Record</button>
          )}
          {isRecording && (
            <button onClick={handleStop} style={stopBtnStyle}>■ Stop</button>
          )}
          {!isRecording && hasAttempt && (
            <>
              <button onClick={handleStart} style={secondaryBtnStyle}>Re-record</button>
              <button onClick={handleGrade} disabled={grading} style={gradeBtnStyle}>
                {grading ? "Grading…" : "Grade my recitation"}
              </button>
            </>
          )}
        </div>
      ) : (
        <div>
          <ScoreDisplay score={result.score} />
          <p style={feedbackStyle}>{result.feedback}</p>
          {result.errors.length > 0 && (
            <ul style={errorListStyle}>
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          {audio.audioBlob && (
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={saveRecording}
                onChange={(e) => setSaveRecording(e.target.checked)}
              />
              Save this recording for later playback
            </label>
          )}

          <button onClick={handleContinue} disabled={uploading} style={continueBtnStyle}>
            {uploading ? "Saving…" : "Continue"}
          </button>
        </div>
      )}

      {gradeError && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "10px" }}>{gradeError}</p>}
    </div>
  );
}

const unsupportedStyle: CSSProperties = {
  padding:      "24px",
  textAlign:    "center",
  fontSize:     "13px",
  lineHeight:   1.6,
  color:        "var(--muted)",
  background:   "var(--bg3)",
  borderRadius: "var(--r2)",
  border:       "1px solid var(--bord)",
};

const labelStyle: CSSProperties = {
  display:       "block",
  fontSize:      "10px",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color:         "var(--muted)",
  marginBottom:  "6px",
};

const selectStyle: CSSProperties = {
  background:   "var(--bg3)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r2)",
  padding:      "8px 10px",
  fontSize:     "13px",
  color:        "var(--parch2)",
  fontFamily:   "var(--fb)",
  outline:      "none",
};

const transcriptBoxStyle: CSSProperties = {
  minHeight:    "120px",
  background:   "var(--bg3)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r2)",
  padding:      "16px",
  marginBottom: "16px",
};

const transcriptTextStyle: CSSProperties = {
  fontSize:   "15px",
  lineHeight: 1.6,
  color:      "var(--parch)",
  fontFamily: "var(--fb)",
};

const placeholderStyle: CSSProperties = {
  fontSize:  "13px",
  color:     "var(--muted)",
  fontStyle: "italic",
};

const recordBtnStyle: CSSProperties = {
  padding:      "12px 26px",
  borderRadius: "999px",
  border:       "1px solid var(--red)",
  background:   "rgba(192,95,114,0.12)",
  color:        "var(--red)",
  fontSize:     "14px",
  fontFamily:   "var(--fb)",
  cursor:       "pointer",
};

const stopBtnStyle: CSSProperties = {
  ...recordBtnStyle,
  background: "var(--red)",
  color:      "var(--parch)",
};

const secondaryBtnStyle: CSSProperties = {
  padding:      "11px 20px",
  borderRadius: "var(--r2)",
  border:       "1px solid var(--bord)",
  background:   "transparent",
  color:        "var(--muted)",
  fontSize:     "13px",
  fontFamily:   "var(--fb)",
  cursor:       "pointer",
};

const gradeBtnStyle: CSSProperties = {
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
  marginBottom: "16px",
  paddingLeft:  "18px",
};

const checkboxLabelStyle: CSSProperties = {
  display:      "flex",
  alignItems:   "center",
  gap:          "8px",
  fontSize:     "13px",
  color:        "var(--parch2)",
  marginBottom: "18px",
  cursor:       "pointer",
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
