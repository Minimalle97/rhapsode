"use client";
// components/friends/FriendButton.tsx
// Knappen på någon annans profil. Vad den gör beror på var ni står.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FriendState } from "@/lib/friends";

interface Props {
  state:        FriendState;
  friendshipId: string | null;
  handle:       string;
  username:     string;
}

export function FriendButton({ state, friendshipId, handle, username }: Props) {
  const router = useRouter();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const res  = await fn();
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(() =>
      fetch("/api/friends", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ handle }),
      })
    );

  const accept = () =>
    run(() => fetch(`/api/friends/${friendshipId}`, { method: "PATCH" }));

  const drop = () =>
    run(() => fetch(`/api/friends/${friendshipId}`, { method: "DELETE" }));

  return (
    <div>
      <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
        {state === "none" && (
          <button onClick={send} disabled={busy} style={primary}>
            {busy ? "…" : "Add friend"}
          </button>
        )}

        {state === "pending-received" && (
          <>
            <button onClick={accept} disabled={busy} style={primary}>
              Accept
            </button>
            <button onClick={drop} disabled={busy} style={ghost}>
              Decline
            </button>
          </>
        )}

        {state === "pending-sent" && (
          <>
            <span style={{ ...ghost, cursor: "default", opacity: 0.7 }}>
              Request sent
            </span>
            <button onClick={drop} disabled={busy} style={ghost}>
              Withdraw
            </button>
          </>
        )}

        {state === "friends" && (
          <>
            <span style={{
              ...ghost, cursor: "default",
              color: "var(--gold)", borderColor: "rgba(200,164,80,0.4)",
            }}>
              Friends
            </span>
            <button onClick={drop} disabled={busy} style={ghost}>
              Remove
            </button>
          </>
        )}
      </div>

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "8px" }}>{error}</p>
      )}
    </div>
  );
}

const primary: React.CSSProperties = {
  padding: "8px 18px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "13px", cursor: "pointer",
};
const ghost: React.CSSProperties = {
  padding: "8px 15px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "13px", cursor: "pointer",
  display: "inline-block",
};
