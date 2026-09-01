"use client";
// components/library/AddWorkForm.tsx
// Två vägar in: ladda upp en fil eller klistra in text.

import { useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "upload" | "paste";

interface ImportResult {
  work:         { id: string; title: string; author: string };
  partCount:    number;
  sectionCount: number;
  wordCount:    number;
  pageCount:    number | null;
  truncated:    boolean;
}

const LENGTHS = [
  {
    words: 35,
    label: "Short",
    hint:  "A stanza at a time. Best for verse and dense poetry.",
  },
  {
    words: 60,
    label: "Medium",
    hint:  "A few sentences. Works for most prose and speeches.",
  },
  {
    words: 110,
    label: "Long",
    hint:  "Full paragraphs. Fewer, larger pieces to hold.",
  },
];

const ACCEPTED = ".pdf,.txt,.md,text/plain,text/markdown,application/pdf";

export function AddWorkForm() {
  const router   = useRouter();
  const params   = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  // Kommer man fran repertoaren ar titel och upphovsperson redan kanda,
  // och loptnumret foljer med. Numret ar det som gor kopplingen till
  // listan EXAKT i stallet for gissad pa namnet — se lib/repertoire.ts.
  //
  // Fälten gar anda att andra. Listan kan ha en annan titelform an den
  // utgava man faktiskt har framfor sig, och det ar anvandarens text som
  // galler.
  const fromList  = params.get("canonical");
  const canonical = fromList && /^\d+$/.test(fromList) ? Number(fromList) : null;

  const [mode, setMode]         = useState<Mode>(canonical ? "paste" : "upload");
  const [file, setFile]         = useState<File | null>(null);
  const [text, setText]         = useState("");
  const [title, setTitle]       = useState(params.get("title")  ?? "");
  const [author, setAuthor]     = useState(params.get("author") ?? "");
  const [words, setWords]       = useState(60);

  const [dragging, setDragging] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [stage, setStage]       = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<ImportResult | null>(null);

  // ── Filhantering ────────────────────────────────────────────────
  const acceptFile = useCallback((f: File) => {
    const ok = /\.(pdf|txt|md)$/i.test(f.name);
    if (!ok) {
      setError("Upload a PDF, TXT or MD file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("That file is larger than 10 MB.");
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  }

  // ── Skicka ──────────────────────────────────────────────────────
  async function submit() {
    setError(null);
    setBusy(true);

    try {
      let res: Response;

      if (mode === "upload") {
        if (!file) throw new Error("Choose a file first.");
        setStage(
          file.name.toLowerCase().endsWith(".pdf")
            ? "Reading the PDF…"
            : "Reading the file…"
        );

        const fd = new FormData();
        fd.append("file", file);
        if (title)  fd.append("title", title);
        if (author) fd.append("author", author);
        fd.append("targetWords", String(words));
        if (canonical !== null) fd.append("canonicalId", String(canonical));

        res = await fetch("/api/import-text", { method: "POST", body: fd });
      } else {
        if (!text.trim()) throw new Error("Paste some text first.");
        setStage("Splitting into sections…");

        res = await fetch("/api/import-text", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ text, title, author, targetWords: words, canonicalId: canonical }),
        });
      }

      setStage("Cataloguing the work…");

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      setResult(data as ImportResult);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  // ── Klart ───────────────────────────────────────────────────────
  if (result) {
    return (
      <div style={{
        background:   "var(--bg2)",
        border:       "1px solid rgba(200,164,80,0.3)",
        borderRadius: "var(--r)",
        padding:      "36px 32px",
        textAlign:    "center",
      }}>
        <p style={{
          fontSize: "34px", color: "var(--gold)",
          lineHeight: 1, marginBottom: "18px",
        }}>
          ✦
        </p>

        <h2 style={{
          fontFamily: "var(--fd)", fontSize: "26px", fontWeight: 400,
          color: "var(--parch)", letterSpacing: "0.03em", marginBottom: "4px",
        }}>
          {result.work.title}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "22px" }}>
          {result.work.author}
        </p>

        <p style={{ fontSize: "13px", color: "var(--parch2)", marginBottom: "6px" }}>
          {result.partCount > 0 && `${result.partCount} parts · `}
          {result.sectionCount.toLocaleString()} sections ·{" "}
          {result.wordCount.toLocaleString()} words
          {result.pageCount ? ` · ${result.pageCount} pages` : ""}
        </p>

        {result.truncated && (
          <p style={{ fontSize: "12px", color: "var(--gold)", marginBottom: "8px" }}>
            The file was long, so only the first part was imported.
          </p>
        )}

        <div style={{
          display: "flex", gap: "10px",
          justifyContent: "center", marginTop: "26px",
        }}>
          <button
            onClick={() => router.push(`/work/${result.work.id}`)}
            style={btn("primary")}
          >
            Open the work
          </button>
          <button
            onClick={() => {
              setResult(null); setFile(null); setText("");
              setTitle(""); setAuthor("");
            }}
            style={btn("ghost")}
          >
            Add another
          </button>
        </div>
      </div>
    );
  }

  // ── Formulär ────────────────────────────────────────────────────
  return (
    <div>
      {/* Lägesväxel */}
      <div style={{
        display: "flex", gap: "3px", marginBottom: "22px",
        background: "var(--bg2)", border: "1px solid var(--bord)",
        borderRadius: "var(--r3)", padding: "3px", width: "fit-content",
      }}>
        {(["upload", "paste"] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); }}
            style={{
              padding:      "7px 18px",
              borderRadius: "3px",
              border:       "none",
              fontSize:     "13px",
              cursor:       "pointer",
              background:   mode === m ? "var(--gold3)" : "transparent",
              color:        mode === m ? "var(--gold)"  : "var(--muted)",
              transition:   "all .15s",
            }}
          >
            {m === "upload" ? "Upload a file" : "Paste text"}
          </button>
        ))}
      </div>

      {/* Släppzon */}
      {mode === "upload" ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          style={{
            border:       `1px dashed ${dragging ? "var(--gold)" : "var(--bord)"}`,
            background:   dragging ? "var(--gold4)" : "var(--bg2)",
            borderRadius: "var(--r)",
            padding:      "48px 24px",
            textAlign:    "center",
            cursor:       "pointer",
            transition:   "border-color .15s, background .15s",
            marginBottom: "20px",
          }}
        >
          {file ? (
            <>
              <p style={{
                fontFamily: "var(--fd)", fontSize: "18px",
                color: "var(--parch)", marginBottom: "6px",
              }}>
                {file.name}
              </p>
              <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                {(file.size / 1024).toFixed(0)} KB · click to choose another
              </p>
            </>
          ) : (
            <>
              <p style={{
                fontSize: "26px", color: "var(--bg4)",
                marginBottom: "14px", lineHeight: 1,
              }}>
                ◇
              </p>
              <p style={{
                fontFamily: "var(--fd)", fontSize: "18px",
                color: "var(--parch2)", marginBottom: "6px",
              }}>
                Drop a file here
              </p>
              <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                PDF, TXT or MD · up to 10 MB
              </p>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            style={{ display: "none" }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) acceptFile(f);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste the full text here…"
          rows={14}
          style={{
            width:        "100%",
            padding:      "16px",
            background:   "var(--bg2)",
            border:       "1px solid var(--bord)",
            borderRadius: "var(--r)",
            color:        "var(--parch)",
            fontSize:     "14px",
            lineHeight:   1.7,
            resize:       "vertical",
            marginBottom: "20px",
            outline:      "none",
          }}
        />
      )}

      {mode === "paste" && text.trim() && (
        <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "-12px", marginBottom: "20px" }}>
          {text.trim().split(/\s+/).length.toLocaleString()} words
        </p>
      )}

      {/* Sektionslängd */}
      <fieldset style={{ border: "none", marginBottom: "22px" }}>
        <legend style={{
          fontSize: "10px", letterSpacing: "0.2em", color: "var(--gold)",
          textTransform: "uppercase", marginBottom: "10px", padding: 0,
        }}>
          Section length
        </legend>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {LENGTHS.map(l => {
            const active = words === l.words;
            return (
              <button
                key={l.words}
                onClick={() => setWords(l.words)}
                style={{
                  flex:         "1 1 140px",
                  textAlign:    "left",
                  padding:      "12px 14px",
                  borderRadius: "var(--r2)",
                  cursor:       "pointer",
                  background:   active ? "var(--gold4)" : "var(--bg2)",
                  border:       `1px solid ${active ? "rgba(200,164,80,0.4)" : "var(--bord)"}`,
                  transition:   "all .15s",
                }}
              >
                <span style={{
                  display: "block", fontFamily: "var(--fd)", fontSize: "15px",
                  color: active ? "var(--gold)" : "var(--parch2)", marginBottom: "3px",
                }}>
                  {l.label}
                </span>
                <span style={{
                  display: "block", fontSize: "11px",
                  color: "var(--muted)", lineHeight: 1.45,
                }}>
                  {l.hint}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Titel & författare */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "22px", flexWrap: "wrap" }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title (optional)"
          style={field()}
        />
        <input
          value={author}
          onChange={e => setAuthor(e.target.value)}
          placeholder="Author (optional)"
          style={field()}
        />
      </div>
      <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "-14px", marginBottom: "22px" }}>
        Leave these blank and the work will be identified from the text.
      </p>

      {error && (
        <p style={{
          fontSize: "13px", color: "var(--red)", marginBottom: "16px",
          padding: "10px 14px", background: "rgba(192,95,114,0.08)",
          border: "1px solid rgba(192,95,114,0.25)", borderRadius: "var(--r3)",
        }}>
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy || (mode === "upload" ? !file : !text.trim())}
        style={{
          ...btn("primary"),
          width:   "100%",
          padding: "13px",
          opacity: busy || (mode === "upload" ? !file : !text.trim()) ? 0.45 : 1,
          cursor:  busy ? "wait" : "pointer",
        }}
      >
        {busy ? stage || "Working…" : "Add to library"}
      </button>

      {busy && (
        <p style={{
          fontSize: "12px", color: "var(--muted)",
          textAlign: "center", marginTop: "12px",
        }}>
          Long works can take up to a minute.
        </p>
      )}
    </div>
  );
}

// ── Stilhjälpare ──────────────────────────────────────────────────
function field(): React.CSSProperties {
  return {
    flex:         "1 1 200px",
    padding:      "11px 13px",
    background:   "var(--bg2)",
    border:       "1px solid var(--bord)",
    borderRadius: "var(--r3)",
    color:        "var(--parch)",
    fontSize:     "14px",
    outline:      "none",
  };
}

function btn(variant: "primary" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding:       "10px 22px",
    borderRadius:  "var(--r3)",
    fontSize:      "14px",
    cursor:        "pointer",
    letterSpacing: "0.02em",
    transition:    "all .15s",
  };
  return variant === "primary"
    ? { ...base, background: "var(--gold)", border: "1px solid var(--gold)", color: "var(--bg)" }
    : { ...base, background: "transparent", border: "1px solid var(--bord)", color: "var(--muted)" };
}
