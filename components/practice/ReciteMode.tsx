"use client";
// components/practice/ReciteMode.tsx
// Taligenkänning (transkription) och MediaRecorder (uppspelningsbart
// ljud) körs PARALLELLT — Web Speech API ger bara text, ingen ljuddata.
//
// Ändrat: rättningen går till /api/practice/grade, som jämför
// transkriptet med originalet deterministiskt i stället för att fråga en
// modell om ett tal. Modellen får läsa resultatet, inte sätta det — och
// den delen är Pro.
//
// INSPELNINGEN LÄMNAR ALDRIG ENHETEN.
//
// Tidigare laddades ljudet upp till Supabase Storage om en ruta var
// ikryssad, och rutan var förkryssad. En röstinspelning är biometriska
// personuppgifter; att samla dem som standard, för en funktion som inte
// behöver dem, är fel sorts insamling.
//
// Nu finns ingen uppladdning alls — routen som tog emot den är borttagen
// och kolumnen som höll sökvägen finns inte kvar i databasen. Man kan
// spara filen till sin egen enhet, eller låta den försvinna. Det är hela
// urvalet, och ingen av vägarna går via en server.

import { useState, type CSSProperties } from "react";
import { useSpeechRecitation } from "@/hooks/useSpeechRecitation";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { ScoreDisplay, type Analysis, type GradeDetail } from "./WriteMode";
import { UpgradeCard } from "@/components/billing/UpgradeCard";

interface ReciteModeProps {
  // Texten skickas inte längre in: servern hämtar sektionen själv när den
  // rättar, så klienten kan inte byta ut originalet mot något lättare.
  sectionId:  string;
  onComplete: (quality: number, score: number, detail: GradeDetail) => void;
}

interface GradeResult {
  score:    number;
  quality:  number;
  missed:   string[];
  wordsTotal:   number;
  wordsCorrect: number;
  analysis:          Analysis | null;
  analysisAvailable: boolean;
}

const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "sv-SE", label: "Swedish" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
];

export function ReciteMode({ sectionId, onComplete }: ReciteModeProps) {
  const [lang, setLang] = useState("en-US");
  const speech = useSpeechRecitation({ lang });
  const audio  = useAudioRecorder();

  const [downloaded, setDownloaded] = useState(false);
  const [result, setResult]         = useState<GradeResult | null>(null);
  const [grading, setGrading]       = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const hasAttempt  = speech.transcript.trim().length > 0;
  // isActive, inte isListening — motorn startar om vid pauser och
  // isListening blinkar da falskt. Se hooks/useSpeechRecitation.ts.
  const isRecording = speech.isActive || audio.isRecording;

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
      // Originalet skickas inte med — servern hämtar sektionens text själv.
      const res = await fetch("/api/practice/grade", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          attempt:     speech.transcript,
          cueLevel:    "hidden",
          hesitatedAt: speech.hesitationIndices,
          // Motorns egna alternativ. Servern kanner texten och kan darfor
          // avgora vilken av dem som troligen var den avsedda.
          chunks:      speech.chunks,
          spoken:      true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Grading failed");
      setResult(data as GradeResult);
    } catch (err) {
      setGradeError(err instanceof Error ? err.message : "Couldn't mark that attempt — try again.");
    } finally {
      setGrading(false);
    }
  }

  /**
   * Sparar inspelningen till anvandarens egen enhet.
   *
   * Blobben ligger redan i minnet. En object-URL och ett klick pa en
   * dold lank racker — filen gar aldrig via nagon server, och det finns
   * ingen endpoint som skulle kunna ta emot den.
   */
  function download() {
    if (!audio.audioBlob) return;

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const ext   = audio.audioBlob.type.includes("mp4") ? "m4a" : "webm";
    const url   = URL.createObjectURL(audio.audioBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `rhapsode-recitation-${stamp}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Slapp object-URL:en igen sa att blobben kan stadas bort.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setDownloaded(true);
  }

  function handleContinue() {
    if (!result) return;

    // Sista referensen till ljudet slapps har. Inget skickades nagonsin,
    // och nu finns det inte kvar i minnet heller.
    audio.reset();

    onComplete(result.quality, result.score, {
      wordsTotal:   result.wordsTotal,
      wordsCorrect: result.wordsCorrect,
      missed:       result.missed,
      cueLevel:     "hidden",
    });
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

          {result.missed.length > 0 && (
            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>
              Slipped: {result.missed.join(", ")}
            </p>
          )}

          {result.analysis?.summary && (
            <>
              <p style={feedbackStyle}>{result.analysis.summary}</p>
              {result.analysis.patterns.length > 0 && (
                <ul style={errorListStyle}>
                  {result.analysis.patterns.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {result.analysis.drill && (
                <p style={{ ...feedbackStyle, color: "var(--parch)" }}>{result.analysis.drill}</p>
              )}
            </>
          )}

          {!result.analysisAvailable && (
            <div style={{ marginBottom: "16px" }}>
              <UpgradeCard
                variant="compact"
                feature="ADVANCED_RECITATION"
                body="Pro listens past the score: which lines you hesitate on, how the rhythm holds, and what to drill next."
              />
            </div>
          )}

          {audio.audioBlob && (
            <div style={recordingChoiceStyle}>
              <p style={{ fontSize: "12.5px", color: "var(--parch2)", lineHeight: 1.6 }}>
                Your recording stayed on this device. Keep a copy if you want
                one — otherwise it goes when you continue.
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                <button onClick={download} style={downloadBtnStyle}>
                  {downloaded ? "Saved to your device" : "Download the recording"}
                </button>
              </div>
            </div>
          )}

          <button onClick={handleContinue} style={continueBtnStyle}>
            {audio.audioBlob ? "Continue and discard the recording" : "Continue"}
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

const recordingChoiceStyle: CSSProperties = {
  background:   "var(--bg3)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r2)",
  padding:      "14px 16px",
  marginBottom: "18px",
};

const downloadBtnStyle: CSSProperties = {
  padding:      "8px 16px",
  borderRadius: "var(--r3)",
  border:       "1px solid var(--bord)",
  background:   "transparent",
  color:        "var(--parch2)",
  fontSize:     "12.5px",
  fontFamily:   "var(--fb)",
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
