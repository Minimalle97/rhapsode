"use client";
// components/library/WorkEditor.tsx
// Städa och rätta ett importerat verk.

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { flagJunk, guessFirstRealSection } from "@/lib/junk";

interface Section {
  id:         string;
  name:       string;
  content:    string;
  status:     string;
  orderIndex: number;
  partName:   string | null;
}

interface Props {
  workId:   string;
  title:    string;
  author:   string;
  sections: Section[];
}

const PAGE = 40;

export function WorkEditor({ workId, title, author, sections }: Props) {
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing]   = useState<string | null>(null);
  const [draft, setDraft]       = useState({ name: "", content: "" });
  const [filter, setFilter]     = useState("");
  const [onlyJunk, setOnlyJunk] = useState(false);
  const [page, setPage]         = useState(0);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [confirm, setConfirm]   = useState<null | { action: string; count: number; run: () => void }>(null);

  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Markera misstänkta sektioner
  const flagged = useMemo(
    () => new Map(sections.map(s => [s.id, flagJunk(s.content, s.name)])),
    [sections]
  );

  const junkCount = useMemo(
    () => [...flagged.values()].filter(f => f.isLikelyJunk).length,
    [flagged]
  );

  const suggestedStart = useMemo(
    () => guessFirstRealSection(sections),
    [sections]
  );

  // Filtrering
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return sections.filter(s => {
      if (onlyJunk && !flagged.get(s.id)?.isLikelyJunk) return false;
      if (!q) return true;
      return (
        s.content.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.partName ?? "").toLowerCase().includes(q)
      );
    });
  }, [sections, filter, onlyJunk, flagged]);

  const pageItems = visible.slice(page * PAGE, page * PAGE + PAGE);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));

  // ── Anrop ─────────────────────────────────────────────────────────
  async function bulk(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/works/${workId}/sections`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSelected(new Set());
      setConfirm(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function splitAtCursor(id: string) {
    const at = areaRef.current?.selectionStart ?? 0;
    if (at <= 0 || at >= draft.content.length) {
      setError("Put the cursor where the break should fall.");
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/sections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const res = await fetch(`/api/sections/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "split", splitAt: at }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visible.map(s => s.id)));
  }

  function selectFlagged() {
    setSelected(new Set(sections.filter(s => flagged.get(s.id)?.isLikelyJunk).map(s => s.id)));
  }

  // ── Vy ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "880px", margin: "0 auto", padding: "0 24px 120px" }}>
      <Link href={`/work/${workId}`} style={{
        fontSize: "13px", color: "var(--muted)",
        textDecoration: "none", display: "inline-block", marginBottom: "20px",
      }}>
        ← {title}
      </Link>

      <h1 style={{
        fontFamily: "var(--fd)", fontSize: "30px", fontWeight: 300,
        color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "4px",
      }}>
        Clean up
      </h1>
      <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "22px" }}>
        {sections.length.toLocaleString()} sections · {author}
      </p>

      {/* Förslag */}
      {suggestedStart && junkCount > 2 && (
        <div style={{
          background: "var(--gold4)", border: "1px solid rgba(200,164,80,0.28)",
          borderRadius: "var(--r)", padding: "16px 18px", marginBottom: "18px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.6, marginBottom: "12px" }}>
            {junkCount} sections look like front matter or editorial apparatus
            rather than the work itself. The text proper seems to begin further
            down.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={selectFlagged} style={btnGhost}>
              Select the {junkCount} flagged
            </button>
            <button
              onClick={() => setConfirm({
                action: "Delete everything before the suggested start",
                count:  sections.findIndex(s => s.id === suggestedStart),
                run:    () => bulk("trimBefore", { sectionId: suggestedStart }),
              })}
              style={btnGhost}
            >
              Start the work at section {(sections.findIndex(s => s.id === suggestedStart) + 1)}
            </button>
          </div>
        </div>
      )}

      {/* Sök och filter */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        <input
          value={filter}
          onChange={e => { setFilter(e.target.value); setPage(0); }}
          placeholder="Search the text…"
          style={{ ...field, flex: "1 1 220px" }}
        />
        <button
          onClick={() => { setOnlyJunk(v => !v); setPage(0); }}
          style={{
            ...btnGhost,
            background: onlyJunk ? "var(--gold3)" : "transparent",
            color:      onlyJunk ? "var(--gold)" : "var(--muted)",
            borderColor: onlyJunk ? "rgba(200,164,80,0.4)" : "var(--bord)",
          }}
        >
          Flagged only {junkCount > 0 && `(${junkCount})`}
        </button>
      </div>

      {error && (
        <p style={{
          fontSize: "12px", color: "var(--red)", marginBottom: "14px",
          padding: "9px 12px", background: "rgba(192,95,114,0.08)",
          border: "1px solid rgba(192,95,114,0.25)", borderRadius: "var(--r3)",
        }}>
          {error}
        </p>
      )}

      {/* Sektionerna */}
      <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "5px" }}>
        {pageItems.map(s => {
          const flag   = flagged.get(s.id);
          const isSel  = selected.has(s.id);
          const isEdit = editing === s.id;
          const n      = s.orderIndex + 1;

          return (
            <li key={s.id}>
              <div style={{
                background:   isEdit ? "var(--bg3)" : "var(--bg2)",
                border: `1px solid ${
                  isSel ? "rgba(200,164,80,0.5)"
                  : flag?.isLikelyJunk ? "rgba(192,95,114,0.28)"
                  : "var(--bord)"
                }`,
                borderRadius: "var(--r2)",
                padding:      "12px 14px",
              }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(s.id)}
                    style={{ marginTop: "3px", accentColor: "var(--gold)", flexShrink: 0 }}
                    aria-label={`Select section ${n}`}
                  />

                  <span style={{
                    fontFamily: "var(--fd)", fontSize: "12px",
                    color: "var(--bg4)", width: "34px",
                    flexShrink: 0, paddingTop: "2px",
                  }}>
                    {n}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEdit ? (
                      <>
                        <input
                          value={draft.name}
                          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                          style={{ ...field, marginBottom: "8px", fontSize: "13px" }}
                        />
                        <textarea
                          ref={areaRef}
                          value={draft.content}
                          onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
                          rows={10}
                          style={{
                            ...field,
                            fontFamily: "var(--fd)", fontSize: "15px",
                            lineHeight: 1.8, resize: "vertical", marginBottom: "10px",
                          }}
                        />
                        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                          <button onClick={() => saveEdit(s.id)} disabled={busy} style={btnPrimary}>
                            Save
                          </button>
                          <button onClick={() => splitAtCursor(s.id)} disabled={busy} style={btnGhost}>
                            Split at cursor
                          </button>
                          <button onClick={() => setEditing(null)} style={btnGhost}>
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{
                          display: "flex", alignItems: "baseline",
                          gap: "8px", marginBottom: "4px", flexWrap: "wrap",
                        }}>
                          <span style={{ fontSize: "12px", color: "var(--parch2)" }}>
                            {s.partName ? `${s.partName} · ${s.name}` : s.name}
                          </span>
                          {flag?.isLikelyJunk && (
                            <span style={{
                              fontSize: "10px", color: "var(--red)",
                              border: "1px solid rgba(192,95,114,0.3)",
                              borderRadius: "3px", padding: "1px 6px",
                            }}>
                              {flag.label}
                            </span>
                          )}
                          {s.status !== "not_started" && (
                            <span style={{ fontSize: "10px", color: "var(--green)" }}>
                              in progress
                            </span>
                          )}
                        </div>
                        <p style={{
                          fontSize: "13px", color: "var(--muted)",
                          lineHeight: 1.55,
                          display: "-webkit-box", WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>
                          {s.content}
                        </p>
                      </>
                    )}
                  </div>

                  {!isEdit && (
                    <button
                      onClick={() => {
                        setEditing(s.id);
                        setDraft({ name: s.name, content: s.content });
                        setError(null);
                      }}
                      style={{
                        background: "transparent", border: "none",
                        color: "var(--bg4)", cursor: "pointer",
                        fontSize: "13px", padding: "2px 6px", flexShrink: 0,
                      }}
                      title="Edit"
                    >
                      ✎
                    </button>
                  )}
                </div>

                {/* Trimma härifrån */}
                {isSel && !isEdit && (
                  <div style={{
                    display: "flex", gap: "7px", marginTop: "10px",
                    paddingTop: "10px", borderTop: "1px solid var(--bord)",
                    flexWrap: "wrap",
                  }}>
                    <button
                      onClick={() => setConfirm({
                        action: `Delete the ${s.orderIndex} sections before this one`,
                        count:  s.orderIndex,
                        run:    () => bulk("trimBefore", { sectionId: s.id }),
                      })}
                      disabled={s.orderIndex === 0}
                      style={{ ...btnGhost, fontSize: "12px", opacity: s.orderIndex === 0 ? 0.4 : 1 }}
                    >
                      Work starts here
                    </button>
                    <button
                      onClick={() => setConfirm({
                        action: `Delete the ${sections.length - s.orderIndex - 1} sections after this one`,
                        count:  sections.length - s.orderIndex - 1,
                        run:    () => bulk("trimAfter", { sectionId: s.id }),
                      })}
                      disabled={s.orderIndex === sections.length - 1}
                      style={{ ...btnGhost, fontSize: "12px", opacity: s.orderIndex === sections.length - 1 ? 0.4 : 1 }}
                    >
                      Work ends here
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Sidor */}
      {pageCount > 1 && (
        <div style={{
          display: "flex", justifyContent: "center",
          alignItems: "center", gap: "12px", marginTop: "22px",
        }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={btnGhost}>
            ←
          </button>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {page + 1} / {pageCount}
          </span>
          <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={btnGhost}>
            →
          </button>
        </div>
      )}

      {/* Åtgärdsrad */}
      {selected.size > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "rgba(12,16,21,0.95)", backdropFilter: "blur(16px)",
          borderTop: "1px solid var(--bord)",
          padding: "14px 20px calc(14px + env(safe-area-inset-bottom))",
          zIndex: 150,
        }}>
          <div style={{
            maxWidth: "880px", margin: "0 auto",
            display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "13px", color: "var(--parch2)" }}>
              {selected.size} selected
            </span>
            <button onClick={selectAllVisible} style={btnGhost}>
              Select all {visible.length}
            </button>
            <button onClick={() => setSelected(new Set())} style={btnGhost}>
              Clear
            </button>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => setConfirm({
                action: `Delete ${selected.size} sections`,
                count:  selected.size,
                run:    () => bulk("deleteMany", { ids: [...selected] }),
              })}
              disabled={busy}
              style={{
                ...btnGhost,
                color: "var(--red)",
                borderColor: "rgba(192,95,114,0.4)",
              }}
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      {/* Bekräftelse */}
      {confirm && (
        <div
          onClick={() => setConfirm(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px",
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg2)", border: "1px solid var(--bord)",
            borderRadius: "var(--r)", padding: "26px 28px",
            maxWidth: "420px", width: "100%", boxShadow: "var(--sh)",
          }}>
            <p style={{
              fontFamily: "var(--fd)", fontSize: "20px",
              color: "var(--parch)", marginBottom: "10px",
            }}>
              {confirm.action}?
            </p>
            <p style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.6, marginBottom: "22px" }}>
              This cannot be undone. Any progress on those sections goes with them.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={confirm.run}
                disabled={busy}
                style={{ ...btnPrimary, background: "var(--red)", borderColor: "var(--red)", color: "#fff" }}
              >
                {busy ? "…" : "Delete"}
              </button>
              <button onClick={() => setConfirm(null)} style={btnGhost}>
                Keep them
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  background: "var(--bg3)", border: "1px solid var(--bord)",
  borderRadius: "var(--r3)", color: "var(--parch)",
  fontSize: "14px", outline: "none",
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 18px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "13px", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "13px", cursor: "pointer",
};
