"use client";
// components/profile/BioEditor.tsx
//
// Nagra rader om sig sjalv, synliga for vanner.
//
// Rutan star tom och tyst tills man klickar. En profil utan text ska inte
// se ut som ett formular man glomt fylla i.

import { useState } from "react";
import { cleanBio, MAX_BIO } from "@/lib/postText";

export function BioEditor({ initial }: { initial: string | null }) {
  const [bio,     setBio]     = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(initial ?? "");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/bio", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ bio: cleanBio(draft) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      setBio(json.bio ?? "");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div style={{ marginBottom: "24px" }}>
        {bio ? (
          <p style={text}>{bio}</p>
        ) : (
          <p style={{ ...text, color: "var(--bg4)", fontStyle: "italic" }}>
            No description yet.
          </p>
        )}
        <button
          onClick={() => { setDraft(bio); setEditing(true); }}
          style={link}
        >
          {bio ? "Edit description" : "Add a description"}
        </button>
      </div>
    );
  }

  const left = MAX_BIO - draft.length;

  return (
    <div style={{ marginBottom: "24px" }}>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value.slice(0, MAX_BIO))}
        placeholder="A line or two your friends will see."
        rows={3}
        autoFocus
        style={area}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
        <span style={{ fontSize: "11px", color: left < 40 ? "var(--gold)" : "var(--bg4)", flex: 1 }}>
          {left} left
        </span>
        <button onClick={() => setEditing(false)} disabled={busy} style={ghost}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ ...primary, opacity: busy ? 0.5 : 1 }}>
          {busy ? "…" : "Save"}
        </button>
      </div>
      {error && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "8px" }}>{error}</p>}
    </div>
  );
}

const text: React.CSSProperties = {
  fontSize: "14px", color: "var(--parch2)", lineHeight: 1.7,
  whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: "6px",
};
const link: React.CSSProperties = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  fontSize: "12px", color: "var(--muted)", textDecoration: "underline",
};
const area: React.CSSProperties = {
  width: "100%", padding: "11px 13px",
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r3)", color: "var(--parch)",
  fontSize: "14px", lineHeight: 1.6, outline: "none",
  resize: "vertical", fontFamily: "inherit",
};
const primary: React.CSSProperties = {
  padding: "8px 18px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "12.5px", cursor: "pointer",
};
const ghost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "12.5px", cursor: "pointer",
};
