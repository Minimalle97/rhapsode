"use client";
// components/profile/UsernameEdit.tsx
// Inline username-redigering. Klicka på pennan → redigeringsläge → spara med PATCH /api/profile

import { useState, useTransition } from "react";

interface UsernameEditProps {
  initialUsername: string;
}

export function UsernameEdit({ initialUsername }: UsernameEditProps) {
  const [editing, setEditing]     = useState(false);
  const [username, setUsername]   = useState(initialUsername);
  const [draft, setDraft]         = useState(initialUsername);
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit() {
    setDraft(username);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed) { setError("Username cannot be empty."); return; }
    if (trimmed === username) { setEditing(false); return; }

    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ username: trimmed }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Update failed");
        }
        const data = await res.json();
        setUsername(data.username);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter")  save();
    if (e.key === "Escape") cancel();
  }

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKey}
            maxLength={40}
            style={{
              fontFamily:  "var(--fd)",
              fontSize:    "28px",
              fontWeight:  300,
              color:       "var(--parch)",
              letterSpacing: "0.04em",
              background:  "transparent",
              border:      "none",
              borderBottom: "1px solid var(--gold)",
              outline:     "none",
              width:       "220px",
              padding:     "2px 0",
            }}
          />
          <button
            onClick={save}
            disabled={isPending}
            style={{
              padding:      "5px 13px",
              borderRadius: "var(--r3)",
              background:   "var(--gold)",
              color:        "var(--bg)",
              border:       "none",
              fontSize:     "12px",
              cursor:       isPending ? "wait" : "pointer",
              letterSpacing: "0.05em",
            }}
          >
            {isPending ? "…" : "Save"}
          </button>
          <button
            onClick={cancel}
            style={{
              padding:      "5px 10px",
              borderRadius: "var(--r3)",
              background:   "transparent",
              color:        "var(--muted)",
              border:       "1px solid var(--bord)",
              fontSize:     "12px",
              cursor:       "pointer",
            }}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p style={{ fontSize: "12px", color: "var(--red)" }}>{error}</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <h1 style={{
        fontFamily:    "var(--fd)",
        fontSize:      "28px",
        fontWeight:    300,
        color:         "var(--parch)",
        letterSpacing: "0.04em",
      }}>
        {username}
      </h1>
      <button
        onClick={startEdit}
        title="Edit username"
        style={{
          background:   "transparent",
          border:       "none",
          cursor:       "pointer",
          color:        "var(--bg4)",
          fontSize:     "14px",
          padding:      "2px 4px",
          borderRadius: "var(--r3)",
          lineHeight:   1,
          transition:   "color .15s",
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "var(--gold)")}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "var(--bg4)")}
      >
        ✎
      </button>
    </div>
  );
}
