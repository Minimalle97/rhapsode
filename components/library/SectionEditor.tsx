"use client";
// components/library/SectionEditor.tsx
// Rätta en sektion som importen delade fel.

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  sectionId: string;
  name:      string;
  content:   string;
  onClose:   () => void;
}

export function SectionEditor({ sectionId, name, content, onClose }: Props) {
  const router = useRouter();

  const [draftName, setDraftName]       = useState(name);
  const [draftContent, setDraftContent] = useState(content);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [confirmDelete, setConfirm]     = useState(false);

  const areaRef = useRef<HTMLTextAreaElement>(null);

  const dirty = draftName !== name || draftContent !== content;

  async function call(
    method: "PATCH" | "DELETE" | "POST",
    body?: unknown
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body:    body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (await call("PATCH", { name: draftName, content: draftContent })) {
      router.refresh();
      onClose();
    }
  }

  async function splitHere() {
    const at = areaRef.current?.selectionStart ?? 0;
    if (at <= 0 || at >= draftContent.length) {
      setError("Place the cursor where the split should fall.");
      return;
    }
    // Spara pågående ändringar först, annars delas den gamla texten
    if (dirty && !(await call("PATCH", { name: draftName, content: draftContent }))) return;
    if (await call("POST", { action: "split", splitAt: at })) {
      router.refresh();
      onClose();
    }
  }

  async function mergeNext() {
    if (dirty && !(await call("PATCH", { name: draftName, content: draftContent }))) return;
    if (await call("POST", { action: "mergeNext" })) {
      router.refresh();
      onClose();
    }
  }

  async function remove() {
    if (await call("DELETE")) {
      router.refresh();
      onClose();
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg2)", border: "1px solid var(--bord)",
          borderRadius: "var(--r)", padding: "26px 28px",
          width: "100%", maxWidth: "620px",
          maxHeight: "88vh", overflowY: "auto",
          boxShadow: "var(--sh)",
        }}
      >
        <p style={{
          fontSize: "10px", letterSpacing: "0.2em", color: "var(--gold)",
          textTransform: "uppercase", marginBottom: "16px",
        }}>
          Edit section
        </p>

        <label style={label}>Name</label>
        <input
          value={draftName}
          onChange={e => setDraftName(e.target.value)}
          style={{ ...field, marginBottom: "16px" }}
        />

        <label style={label}>Text</label>
        <textarea
          ref={areaRef}
          value={draftContent}
          onChange={e => setDraftContent(e.target.value)}
          rows={12}
          style={{
            ...field,
            fontFamily: "var(--fd)", fontSize: "15px", lineHeight: 1.8,
            resize: "vertical", marginBottom: "6px",
          }}
        />
        <p style={{ fontSize: "11px", color: "var(--bg4)", marginBottom: "18px" }}>
          {draftContent.trim().split(/\s+/).filter(Boolean).length} words
        </p>

        {error && (
          <p style={{
            fontSize: "12px", color: "var(--red)", marginBottom: "14px",
            padding: "9px 12px", background: "rgba(192,95,114,0.08)",
            border: "1px solid rgba(192,95,114,0.25)", borderRadius: "var(--r3)",
          }}>
            {error}
          </p>
        )}

        {/* Strukturändringar */}
        <div style={{
          display: "flex", gap: "8px", flexWrap: "wrap",
          paddingBottom: "16px", marginBottom: "16px",
          borderBottom: "1px solid var(--bord)",
        }}>
          <button onClick={splitHere} disabled={busy} style={btnGhost} title="Splits at the cursor">
            Split at cursor
          </button>
          <button onClick={mergeNext} disabled={busy} style={btnGhost}>
            Merge with next
          </button>
        </div>

        {/* Spara eller ta bort */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={save} disabled={busy || !dirty} style={{
            ...btnPrimary, opacity: busy || !dirty ? 0.45 : 1,
          }}>
            {busy ? "…" : "Save"}
          </button>
          <button onClick={onClose} disabled={busy} style={btnGhost}>
            Cancel
          </button>

          <span style={{ flex: 1 }} />

          {confirmDelete ? (
            <>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>Delete it?</span>
              <button onClick={remove} disabled={busy} style={{
                ...btnGhost, color: "var(--red)", borderColor: "rgba(192,95,114,0.4)",
              }}>
                Yes, delete
              </button>
              <button onClick={() => setConfirm(false)} style={btnGhost}>No</button>
            </>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy}
              style={{ ...btnGhost, color: "var(--muted)" }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const label: React.CSSProperties = {
  display: "block", fontSize: "11px",
  color: "var(--muted)", marginBottom: "6px",
};
const field: React.CSSProperties = {
  width: "100%", padding: "11px 13px",
  background: "var(--bg3)", border: "1px solid var(--bord)",
  borderRadius: "var(--r3)", color: "var(--parch)",
  fontSize: "14px", outline: "none",
};
const btnPrimary: React.CSSProperties = {
  padding: "9px 20px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "13px", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "9px 15px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "13px", cursor: "pointer",
};
