"use client";
// components/today/TodayQueue.tsx
// Dagens kö. En sektion i taget, ingen navigering.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  applyCue, suggestCue, gradeAttempt, scoreToQuality,
  CUE_LEVELS, type CueLevel, type Diff,
} from "@/lib/cue";
import type { QueueItem, QueueSummary } from "@/lib/queue";

type Phase = "loading" | "empty" | "prompt" | "marked" | "done";

interface Result {
  score:  number;
  diff:   Diff[];
  missed: string[];
}

export function TodayQueue() {
  const router = useRouter();

  const [items, setItems]     = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [index, setIndex]     = useState(0);
  const [phase, setPhase]     = useState<Phase>("loading");

  const [cue, setCue]         = useState<CueLevel>("initials");
  const [attempt, setAttempt] = useState("");
  const [result, setResult]   = useState<Result | null>(null);
  const [sending, setSending] = useState(false);
  const [earned, setEarned]   = useState(0);
  const [error, setError]     = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const current  = items[index] ?? null;

  // ── Hämta kön ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch("/api/today?fresh=5");
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) throw new Error(data.error ?? "Could not load");

        setItems(data.items);
        setSummary(data.summary);
        setPhase(data.items.length ? "prompt" : "empty");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load");
          setPhase("empty");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Stödnivån följer hur väl sektionen sitter
  useEffect(() => {
    if (current) setCue(suggestCue(current.status));
  }, [current]);

  // ── Rätta ─────────────────────────────────────────────────────────
  const mark = useCallback(() => {
    if (!current) return;
    setResult(gradeAttempt(current.content, attempt));
    setPhase("marked");
  }, [current, attempt]);

  const reveal = useCallback(() => {
    if (!current) return;
    setResult({ score: -1, diff: [], missed: [] });  // -1 = självbedömning
    setPhase("marked");
  }, [current]);

  // ── Skicka och gå vidare ──────────────────────────────────────────
  const submit = useCallback(
    async (quality: number, score: number | null) => {
      if (!current || sending) return;
      setSending(true);
      setError(null);

      try {
        const res = await fetch(`/api/sections?id=${current.id}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quality,
            score,
            mode: attempt.trim() ? "write" : "hide",
            durationSecs: 0,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not save");

        setEarned(e => e + (data.xpEarned ?? 0));

        setAttempt("");
        setResult(null);

        if (index + 1 >= items.length) {
          setPhase("done");
          router.refresh();
        } else {
          setIndex(i => i + 1);
          setPhase("prompt");
        }
      } catch (err) {
        // Gick sparandet inte igenom står vi kvar på samma sektion. Att gå
        // vidare ändå — som koden gjorde i finally — såg ut som att passet
        // räknats, fast ingenting hade skrivits.
        setError(err instanceof Error ? err.message : "Could not save");
      } finally {
        setSending(false);
      }
    },
    [current, sending, attempt, index, items.length, router]
  );

  // ── Tangentbord ───────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = document.activeElement?.tagName === "TEXTAREA";

      if (phase === "prompt") {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          attempt.trim() ? mark() : reveal();
        }
        if (e.key === " " && !typing) {
          e.preventDefault();
          reveal();
        }
      }

      if (phase === "marked" && !typing) {
        const auto = result && result.score >= 0;
        if (e.key === "1") submit(auto ? scoreToQuality(result!.score, cue) : 1, auto ? result!.score : null);
        if (e.key === "2") submit(3, auto ? result!.score : null);
        if (e.key === "3") submit(4, auto ? result!.score : null);
        if (e.key === "4") submit(5, auto ? result!.score : null);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, attempt, mark, reveal, submit, result, cue]);

  const shown = useMemo(
    () => (current ? applyCue(current.content, cue) : ""),
    [current, cue]
  );

  // ── Vyer ──────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div style={wrap}>
        <div className="skeleton" style={{ height: "34px", width: "160px", marginBottom: "26px" }} />
        <div className="skeleton" style={{ height: "220px" }} />
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div style={{ ...wrap, textAlign: "center", paddingTop: "80px" }}>
        <p style={{ fontSize: "34px", color: "var(--bg4)", marginBottom: "18px", lineHeight: 1 }}>◇</p>
        <h1 style={{
          fontFamily: "var(--fd)", fontSize: "28px", fontWeight: 300,
          color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "10px",
        }}>
          Nothing due today
        </h1>
        <p style={{
          fontSize: "14px", color: "var(--muted)",
          lineHeight: 1.65, maxWidth: "380px", margin: "0 auto 28px",
        }}>
          {error
            ? error
            : "Everything you have started is resting. Coming back before a section is due doesn't strengthen it — the interval is doing the work."}
        </p>
        <Link href="/library" style={btnGhost}>Add something new</Link>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ ...wrap, textAlign: "center", paddingTop: "70px" }}>
        <p style={{ fontSize: "34px", color: "var(--gold)", marginBottom: "18px", lineHeight: 1 }}>✦</p>
        <h1 style={{
          fontFamily: "var(--fd)", fontSize: "30px", fontWeight: 300,
          color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "10px",
        }}>
          The queue is clear
        </h1>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "6px" }}>
          {items.length} {items.length === 1 ? "section" : "sections"} reviewed
        </p>
        {earned > 0 && (
          <p style={{ fontFamily: "var(--fd)", fontSize: "22px", color: "var(--gold)", marginBottom: "30px" }}>
            +{earned} XP
          </p>
        )}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <Link href="/library" style={btnPrimary}>Library</Link>
          <Link href="/progress" style={btnGhost}>See progress</Link>
        </div>
      </div>
    );
  }

  // ── Kortet ────────────────────────────────────────────────────────
  const pct = Math.round((index / items.length) * 100);
  const auto = result && result.score >= 0;

  return (
    <div style={wrap}>
      {/* Framsteg genom kön */}
      <div style={{ marginBottom: "22px" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", marginBottom: "7px",
        }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {index + 1} of {items.length}
            {summary && summary.works > 1 && ` · ${summary.works} works`}
          </span>
          {earned > 0 && (
            <span style={{ fontSize: "12px", color: "var(--gold)" }}>+{earned} XP</span>
          )}
        </div>
        <div style={{ height: "2px", background: "var(--bg4)", borderRadius: "1px", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: "var(--gold)", transition: "width .4s ease",
          }} />
        </div>
      </div>

      {/* Varifrån */}
      {current && (
        <div style={{ marginBottom: "16px" }}>
          <p style={{
            fontSize: "10px", letterSpacing: "0.2em",
            color: "var(--gold)", textTransform: "uppercase", marginBottom: "4px",
          }}>
            {current.part ? current.part.name : current.work.title}
          </p>
          <p style={{ fontSize: "12px", color: "var(--muted)" }}>
            {current.part ? `${current.work.title} · ` : ""}{current.work.author}
            {current.overdueDays > 0 && (
              <span style={{ color: "var(--gold)" }}>
                {" "}· {current.overdueDays}d overdue
              </span>
            )}
          </p>
        </div>
      )}

      {/* Stödnivå */}
      {phase === "prompt" && (
        <div style={{ display: "flex", gap: "5px", marginBottom: "14px", flexWrap: "wrap" }}>
          {CUE_LEVELS.map(l => {
            const active = l.id === cue;
            return (
              <button
                key={l.id}
                onClick={() => setCue(l.id)}
                title={l.hint}
                style={{
                  padding: "6px 11px", borderRadius: "var(--r3)", fontSize: "12px",
                  cursor: "pointer",
                  background: active ? "var(--gold3)" : "var(--bg2)",
                  border: `1px solid ${active ? "rgba(200,164,80,0.4)" : "var(--bord)"}`,
                  color: active ? "var(--gold)" : "var(--muted)",
                  transition: "all .15s",
                }}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Texten */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--bord)",
        borderRadius: "var(--r)", padding: "24px 26px", marginBottom: "16px",
        minHeight: "130px",
      }}>
        {phase === "marked" ? (
          auto ? (
            <p style={{
              fontFamily: "var(--fd)", fontSize: "17px",
              lineHeight: 1.85, whiteSpace: "pre-wrap",
            }}>
              {result!.diff.map((d, i) => (
                <span key={i} style={{
                  color: d.correct ? "var(--parch2)" : "var(--red)",
                  borderBottom: d.correct ? "none" : "1px solid var(--red)",
                }}>
                  {d.word}{" "}
                </span>
              ))}
            </p>
          ) : (
            <p style={{
              fontFamily: "var(--fd)", fontSize: "17px", lineHeight: 1.85,
              color: "var(--parch2)", whiteSpace: "pre-wrap",
            }}>
              {current?.content}
            </p>
          )
        ) : (
          <p style={{
            fontFamily: cue === "hidden" ? "var(--fb)" : "var(--fd)",
            fontSize: cue === "hidden" ? "14px" : "17px",
            lineHeight: 1.85,
            color: cue === "hidden" ? "var(--muted)" : "var(--parch2)",
            whiteSpace: "pre-wrap",
            fontStyle: cue === "hidden" ? "italic" : "normal",
            letterSpacing: cue === "initials" || cue === "skeleton" ? "0.06em" : "0",
          }}>
            {cue === "hidden" ? "From memory. Nothing shown." : shown}
          </p>
        )}
      </div>

      {/* Inmatning eller bedömning */}
      {phase === "prompt" ? (
        <>
          <textarea
            ref={inputRef}
            value={attempt}
            onChange={e => setAttempt(e.target.value)}
            placeholder="Write it out, or press space to reveal and mark yourself…"
            rows={5}
            style={{
              width: "100%", padding: "14px",
              background: "var(--bg2)", border: "1px solid var(--bord)",
              borderRadius: "var(--r2)", color: "var(--parch)",
              fontSize: "15px", lineHeight: 1.7, resize: "vertical",
              outline: "none", marginBottom: "12px",
            }}
          />
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => (attempt.trim() ? mark() : reveal())}
              style={{ ...btnPrimary, padding: "11px 26px" }}
            >
              {attempt.trim() ? "Check" : "Reveal"}
            </button>
            <span style={{ fontSize: "11px", color: "var(--bg4)" }}>
              space to reveal · ⌘↵ to check
            </span>
          </div>
        </>
      ) : (
        <>
          {auto && (
            <div style={{ marginBottom: "14px" }}>
              <p style={{
                fontFamily: "var(--fd)", fontSize: "26px",
                color: result!.score >= 90 ? "var(--gold)"
                     : result!.score >= 70 ? "var(--green)" : "var(--red)",
                marginBottom: "4px",
              }}>
                {result!.score}%
              </p>
              {result!.missed.length > 0 && (
                <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                  Slipped: {result!.missed.join(", ")}
                </p>
              )}
            </div>
          )}

          <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px" }}>
            How did that feel?
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { q: 1, label: "Lost it",   key: "1", color: "var(--red)" },
              { q: 3, label: "Struggled", key: "2", color: "var(--parch2)" },
              { q: 4, label: "Solid",     key: "3", color: "var(--green)" },
              { q: 5, label: "Effortless",key: "4", color: "var(--gold)" },
            ].map(b => (
              <button
                key={b.q}
                onClick={() => submit(
                  auto && b.q >= 4 ? scoreToQuality(result!.score, cue) : b.q,
                  auto ? result!.score : null
                )}
                disabled={sending}
                style={{
                  flex: "1 1 110px", padding: "12px 10px",
                  borderRadius: "var(--r2)", background: "var(--bg2)",
                  border: `1px solid var(--bord)`, color: b.color,
                  fontSize: "13px", cursor: sending ? "wait" : "pointer",
                  transition: "all .15s",
                }}
              >
                {b.label}
                <span style={{
                  display: "block", fontSize: "10px",
                  color: "var(--bg4)", marginTop: "3px",
                }}>
                  {b.key}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "12px" }}>{error}</p>
      )}

      {current && (
        <p style={{ marginTop: "22px", textAlign: "center" }}>
          <Link
            href={`/work/${current.work.id}`}
            style={{ fontSize: "12px", color: "var(--bg4)", textDecoration: "none" }}
          >
            Open {current.work.title}
          </Link>
        </p>
      )}
    </div>
  );
}

// ── Stilar ────────────────────────────────────────────────────────────
const wrap: React.CSSProperties = {
  maxWidth: "660px", margin: "0 auto", padding: "32px 24px 80px",
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 22px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "14px",
  cursor: "pointer", textDecoration: "none", display: "inline-block",
};
const btnGhost: React.CSSProperties = {
  padding: "10px 22px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--muted)", fontSize: "14px",
  cursor: "pointer", textDecoration: "none", display: "inline-block",
};
