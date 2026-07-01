"use client";
// components/sync/SyncIndicator.tsx
// Liten statusindikator som visar om Realtime-anslutningen är live.
// Visas i navbaren.

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Status = "connecting" | "live" | "offline";

export function SyncIndicator({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel(`sync-indicator-${userId}`)
      .subscribe((state) => {
        if (state === "SUBSCRIBED")  setStatus("live");
        if (state === "CLOSED")      setStatus("offline");
        if (state === "CHANNEL_ERROR") setStatus("offline");
      });

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const dot: Record<Status, string> = {
    connecting: "var(--muted)",
    live:       "var(--green)",
    offline:    "var(--red)",
  };

  const label: Record<Status, string> = {
    connecting: "Syncing…",
    live:       "Live",
    offline:    "Offline",
  };

  return (
    <div
      title={`Sync status: ${label[status]}`}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        "5px",
        fontSize:   "11px",
        color:      "var(--muted)",
        letterSpacing: "0.03em",
        userSelect: "none",
      }}
    >
      <span style={{
        width:        "6px",
        height:       "6px",
        borderRadius: "50%",
        background:   dot[status],
        flexShrink:   0,
        // Pulsande animation när live
        animation:    status === "live" ? "pulse 2.5s ease-in-out infinite" : "none",
      }} />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
      `}</style>
      {label[status]}
    </div>
  );
}
