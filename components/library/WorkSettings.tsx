"use client";
// components/library/WorkSettings.tsx
// Rätta titel och författare, eller ta bort verket.

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = [
  "POEM", "EPIC", "PLAY", "SPEECH",
  "PHILOSOPHICAL", "RELIGIOUS", "PROFESSIONAL", "OTHER",
];

interface Props {
  workId:       string;
  title:        string;
  author:       string;
  type:         string;
  sectionCount: number;
}

export function WorkSettings({
  workId, title, author, type, sectionCount,
}: Props) {
  const router = useRouter();

  const [draftTitle, setTitle]   = useState(title);
  const [draftAuthor, setAuthor] = useState(author);
  const [draftType, setType]     = useState(type);
  const [busy, setBusy]          = useState(false);
  const [saved, setSaved]        = useState(false);
  const [error, setError]        = useState<string | null>(null);

  // Radering kräver att man skriver titeln — ett verk med tusen
  // sektioner och månaders arbete ska inte försvinna på ett felklick.
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped]           = useState("");

  const dirty =
    draftTitle !== title || draftAuthor !== author || draftType !== type;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/works/${workId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:  draftTitle,
          author: draftAuthor,
          type:   draftType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/works/${workId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push("/library");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div style={{
      background:   "var(--bg2)",
      border:       "1px solid var(--bord)",
      borderRadius: "var(--r)",
      padding:      "22px 24px",
      marginBottom: "22px",
    }}>
      <p style={{
        fontSize: "10px", letterSpacing: "0.2em", color: "var(--gold)",
        textTransform: "uppercase", marginBottom: "16px",
      }}>
        Details
      </p>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <div style={{ flex: "2 1 240px" }}>
          <label style={label}>Title</label>
          <input value={draftTitle} onChange={e => setTitle(e.target.value)} style={field} />
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label style={label}>Author</label>
          <input value={draftAuthor} onChange={e => setAuthor(e.target.value)} style={field} />
        </div>
      </div>

      <div style={{ marginBottom: "16px", maxWidth: "240px" }}>
        <label style={label}>Kind</label>
        <select value={draftType} onChange={e => setType(e.target.value)} style={field}>
          {TYPES.map(t => (
            <option key={t} value={t}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "9px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={busy || !dirty}
          style={{ ...btnPrimary, opacity: busy || !dirty ? 0.45 : 1 }}
        >
          {busy ? "…" : "Save"}
        </button>
        {saved && !dirty && (
          <span style={{ fontSize: "12px", color: "var(--green)" }}>Saved</span>
        )}
      </div>

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "12px" }}>{error}</p>
      )}

      {/* Radering */}
      <div style={{
        marginTop: "22px", paddingTop: "18px",
        borderTop: "1px solid var(--bord)",
      }}>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{ ...btnGhost, color: "var(--muted)" }}
          >
            Delete this work
          </button>
        ) : (
          <div>
            <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.6, marginBottom: "6px" }}>
              This removes the work, its {sectionCount.toLocaleString()} sections
              and every record of practising them.
            </p>
            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>
              The XP you earned stays. The work was done, even if the text goes.
            </p>
            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
              Type <strong style={{ color: "var(--parch)" }}>{title}</strong> to confirm.
            </p>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={title}
              style={{ ...field, marginBottom: "12px", maxWidth: "320px" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={remove}
                disabled={busy || typed.trim() !== title}
                style={{
                  ...btnPrimary,
                  background:  "var(--red)",
                  borderColor: "var(--red)",
                  color:       "#fff",
                  opacity:     busy || typed.trim() !== title ? 0.4 : 1,
                }}
              >
                {busy ? "…" : "Delete for good"}
              </button>
              <button
                onClick={() => { setConfirming(false); setTyped(""); }}
                style={btnGhost}
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const label: React.CSSProperties = {
  display: "block", fontSize: "11px",
  color: "var(--muted)", marginBottom: "5px",
};
const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
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
