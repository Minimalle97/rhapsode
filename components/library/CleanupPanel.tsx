"use client";
// components/library/CleanupPanel.tsx
//
// Städningen, överst på Clean up-sidan.
//
// Två knappar, ingen av dem med hänglås. Den första är gratis och kostar
// ingenting att trycka på; den andra har en ranson som tar slut. Skälet
// att inte låsa den andra är att ett hänglås ber om pengar innan någon
// vet vad de skulle köpa — en förbrukad ranson ber om dem i det ögonblick
// de precis blivit hjälpta.
//
// Ingenting skrivs förrän man sett vad som skulle hända. Städning är
// destruktiv, och den enda ärliga ordningen är förhandsgranska → godkänn.

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { UpgradeCard } from "@/components/billing/UpgradeCard";

interface Change  { label: string; count: number }
interface Preview { id: string; content: string }

interface Result {
  mode:      "basic" | "advanced";
  changed:   number;
  changes?:  Change[];
  summary?:  string;
  notes?:    string[];
  preview:   Preview[];
  remaining?: number | null;
}

interface Allowance {
  used:      number;
  limit:     number | null;
  remaining: number | null;
}

interface CleanupPanelProps {
  workId:       string;
  sectionCount: number;
  /** Ur den befintliga listan, så förhandsgranskningen kan visa före/efter. */
  originals:    Record<string, string>;
}

export function CleanupPanel({ workId, sectionCount, originals }: CleanupPanelProps) {
  const router = useRouter();

  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [busy, setBusy]           = useState<"basic" | "advanced" | "apply" | null>(null);
  const [result, setResult]       = useState<Result | null>(null);
  const [spent, setSpent]         = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    fetch(`/api/works/${workId}/cleanup`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setAllowance({ used: d.used, limit: d.limit, remaining: d.remaining }))
      .catch(() => {});
  }, [workId]);

  async function run(mode: "basic" | "advanced", apply = false) {
    setBusy(apply ? "apply" : mode);
    setError(null);
    setSpent(null);

    try {
      const res = await fetch(`/api/works/${workId}/cleanup`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, apply,
          ...(mode === "advanced" && instructions.trim()
            ? { instructions: instructions.trim() }
            : {}),
        }),
      });
      const data = await res.json();

      // Ransonen slut. Det här är den enda platsen erbjudandet visas, och
      // det gör det först nu — efter att de sett vad städningen gör.
      if (res.status === 402 && data.error === "cleanup_allowance_spent") {
        setSpent(data.message);
        return;
      }
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Cleanup failed");

      if (apply) {
        setResult(null);
        router.refresh();
      } else {
        setResult(data as Result);
        if (typeof data.remaining === "number") {
          setAllowance(a => (a ? { ...a, remaining: data.remaining } : a));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setBusy(null);
    }
  }

  const limited = allowance?.limit !== null && allowance?.limit !== undefined;

  return (
    <section style={panel}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <p style={eyebrow}>Cleanup</p>
        {limited && allowance && (
          <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
            {allowance.remaining} of {allowance.limit} deep cleans left this month
          </span>
        )}
      </div>

      <p style={{ ...body, marginBottom: "16px" }}>
        Scanned and converted texts arrive with things that are not the work:
        page numbers, running heads, lines broken where the page ended. Tidying
        is free and instant. A deep clean reads the text and repairs what only
        makes sense to a reader — stanza shape, chapter breaks, scanning damage.
      </p>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button onClick={() => run("basic")} disabled={busy !== null} style={primary}>
          {busy === "basic" ? "Looking…" : "Tidy up"}
        </button>
        <button onClick={() => run("advanced")} disabled={busy !== null} style={secondary}>
          {busy === "advanced" ? "Reading the text…" : "Deep clean"}
        </button>
        <button
          onClick={() => setShowInstructions(v => !v)}
          disabled={busy !== null}
          style={quiet}
        >
          {showInstructions ? "Hide instructions" : "Add instructions"}
        </button>
      </div>

      {showInstructions && (
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Anything specific? e.g. “the stanzas should be four lines”, “drop the editor's footnotes”"
          rows={2}
          style={textarea}
        />
      )}

      {sectionCount > 40 && (
        <p style={{ ...small, marginTop: "12px" }}>
          A deep clean takes 40 sections at a time. This work has{" "}
          {sectionCount.toLocaleString()} — it will start from the beginning.
        </p>
      )}

      {/* ── Ransonen slut ─────────────────────────────────────────── */}
      {spent && (
        <div style={{ marginTop: "18px" }}>
          <UpgradeCard
            feature="ADVANCED_CLEANUP"
            // Rubriken sager vad man far, texten under sager varfor den
            // dok upp. Att lata bada saga samma sak vore slosat utrymme.
            title="Clean as many as you like"
            body={spent}
          />
        </div>
      )}

      {error && <p style={{ ...small, color: "var(--red)", marginTop: "14px" }}>{error}</p>}

      {/* ── Förhandsgranskning ────────────────────────────────────── */}
      {result && (
        <div style={preview}>
          {result.changed === 0 ? (
            <p style={body}>
              {result.summary ?? "Nothing to change — this text is already clean."}
            </p>
          ) : (
            <>
              <p style={{ ...body, color: "var(--parch)" }}>
                {result.changed} section{result.changed === 1 ? "" : "s"} would change
                {result.summary ? ` · ${result.summary}` : ""}
              </p>

              {result.changes && result.changes.length > 0 && (
                <ul style={list}>
                  {result.changes.map(c => (
                    <li key={c.label} style={small}>
                      <span style={{ color: "var(--gold)" }}>{c.count}</span> · {c.label}
                    </li>
                  ))}
                </ul>
              )}

              {result.notes && result.notes.length > 0 && (
                <ul style={list}>
                  {result.notes.map((n, i) => (
                    <li key={i} style={{ ...small, color: "var(--parch2)" }}>{n}</li>
                  ))}
                </ul>
              )}

              {/* Före och efter, ord för ord är för mycket — men man ska
                  kunna se att det är samma text, bara städad. */}
              {result.preview.slice(0, 3).map(p => (
                <div key={p.id} style={compare}>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <p style={label}>Before</p>
                    <p style={excerpt}>{(originals[p.id] ?? "").slice(0, 260)}</p>
                  </div>
                  {/* Tunn linje mellan spalterna. Doljs nar de radbryts —
                      se .cleanup-divider i globals.css. */}
                  <div className="cleanup-divider" aria-hidden />
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <p style={{ ...label, color: "var(--gold)" }}>After</p>
                    <p style={{ ...excerpt, color: "var(--parch)" }}>{p.content.slice(0, 260)}</p>
                  </div>
                </div>
              ))}

              <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
                <button
                  onClick={() => run(result.mode, true)}
                  disabled={busy !== null}
                  style={primary}
                >
                  {busy === "apply" ? "Applying…" : `Apply to ${result.changed} section${result.changed === 1 ? "" : "s"}`}
                </button>
                <button onClick={() => setResult(null)} disabled={busy !== null} style={quiet}>
                  Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ── Stilar ────────────────────────────────────────────────────────────
const panel: CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r)", padding: "20px 22px", marginBottom: "22px",
};
const eyebrow: CSSProperties = {
  fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase",
  color: "var(--gold)", marginBottom: "10px",
};
const body: CSSProperties = {
  fontSize: "13px", lineHeight: 1.7, color: "var(--parch2)", maxWidth: "62ch",
};
const small: CSSProperties = { fontSize: "12px", lineHeight: 1.6, color: "var(--muted)" };
const primary: CSSProperties = {
  padding: "9px 20px", borderRadius: "var(--r3)",
  border: "1px solid var(--gold)", background: "var(--gold3)",
  color: "var(--gold)", fontSize: "13px", fontFamily: "var(--fb)", cursor: "pointer",
};
const secondary: CSSProperties = {
  padding: "9px 20px", borderRadius: "var(--r3)",
  border: "1px solid var(--bord)", background: "transparent",
  color: "var(--parch2)", fontSize: "13px", fontFamily: "var(--fb)", cursor: "pointer",
};
const quiet: CSSProperties = {
  padding: "9px 14px", borderRadius: "var(--r3)",
  border: "none", background: "transparent",
  color: "var(--muted)", fontSize: "12.5px", fontFamily: "var(--fb)", cursor: "pointer",
};
const textarea: CSSProperties = {
  width: "100%", marginTop: "12px", padding: "11px 13px",
  background: "var(--bg3)", border: "1px solid var(--bord)",
  borderRadius: "var(--r3)", color: "var(--parch)",
  fontSize: "13px", lineHeight: 1.6, resize: "vertical",
  outline: "none", fontFamily: "var(--fb)",
};
const preview: CSSProperties = {
  marginTop: "18px", paddingTop: "18px", borderTop: "1px solid var(--bord)",
};
const list: CSSProperties = {
  listStyle: "none", display: "flex", flexDirection: "column",
  gap: "4px", margin: "10px 0",
};
const compare: CSSProperties = {
  display: "flex", gap: "18px", flexWrap: "wrap",
  background: "var(--bg3)", border: "1px solid var(--bord)",
  borderRadius: "var(--r2)", padding: "14px 16px", marginTop: "10px",
};
const label: CSSProperties = {
  fontSize: "9.5px", letterSpacing: "0.16em", textTransform: "uppercase",
  color: "var(--muted)", marginBottom: "6px",
};
const excerpt: CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "13.5px", lineHeight: 1.65,
  color: "var(--parch2)", whiteSpace: "pre-wrap", wordBreak: "break-word",
  // En riktigt trasig sektion kan vara hundra rader tomrum. Taket haller
  // panelen lasbar; man behover se ATT det ar samma text, inte lasa hela.
  maxHeight: "150px", overflow: "hidden",
};

