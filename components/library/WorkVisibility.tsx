"use client";
// components/library/WorkVisibility.tsx
//
// Privat eller synlig for vanner.
//
// Standard ar privat, och det ar ett val snarare an en installning nagon
// glomt: en text nagon ovar pa kan vara ett tal till en begravning, ett
// vigselloftе eller nagot de inte vill forklara. Den som vill visa vad de
// arbetar med far saga till.
//
// Publikt betyder titeln och forfattaren, ingenting annat. Vannerna ser
// vad du studerar — inte texten, inte dina forsok, inte dina siffror.

import { useState, type CSSProperties } from "react";

interface WorkVisibilityProps {
  workId:     string;
  visibility: string;
}

export function WorkVisibility({ workId, visibility }: WorkVisibilityProps) {
  const [value, setValue] = useState(visibility);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(false);

  const isPublic = value === "public";

  async function toggle() {
    const next = isPublic ? "private" : "public";
    setBusy(true);
    setError(false);

    // Optimistiskt: vaxeln ska kannas direkt. Gar det fel gar den tillbaka.
    setValue(next);
    try {
      const res = await fetch(`/api/works/${workId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ visibility: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setValue(isPublic ? "public" : "private");
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={isPublic}
      title={
        isPublic
          ? "Friends can see you are studying this. Title and author only."
          : "Only you can see this."
      }
      style={{
        ...button,
        borderColor: isPublic ? "rgba(200,164,80,0.4)" : "var(--bord)",
        color:       error ? "var(--red)" : isPublic ? "var(--gold)" : "var(--muted)",
      }}
    >
      {error ? "Didn't save" : isPublic ? "Shared" : "Private"}
    </button>
  );
}

const button: CSSProperties = {
  padding:      "6px 14px",
  borderRadius: "var(--r3)",
  border:       "1px solid var(--bord)",
  background:   "transparent",
  fontSize:     "12px",
  fontFamily:   "var(--fb)",
  cursor:       "pointer",
  whiteSpace:   "nowrap",
};
