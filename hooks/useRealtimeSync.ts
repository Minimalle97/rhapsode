"use client";
// hooks/useRealtimeSync.ts
// Prenumererar på Supabase Realtime för att synka sektions-uppdateringar
// mellan flikar / enheter i realtid.
//
// Användning:
//   useRealtimeSync(userId, (change) => { /* uppdatera lokal state */ })

import { useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type RealtimeChange =
  | { table: "sections"; event: "UPDATE"; record: RealtimeSection }
  | { table: "works";    event: "INSERT" | "DELETE"; record: RealtimeWork };

export interface RealtimeSection {
  id:          string;
  workId:      string;
  status:      string;
  sm2Reps:     number;
  sm2EF:       number;
  sm2Interval: number;
  nextReview:  string | null;
}

export interface RealtimeWork {
  id:     string;
  userId: string;
  title:  string;
}

// Supabase-klient med anon key (läsbehörighet — RLS skyddar data)
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export function useRealtimeSync(
  userId:   string | null,
  onChange: (change: RealtimeChange) => void
) {
  const channelRef  = useRef<RealtimeChannel | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseClient();

    // Prenumerera på Section-uppdateringar för alla verk som tillhör userId
    // OBS: Supabase Realtime filter kan bara filtrera på en kolumn per kanal,
    // och Section har ingen direkt userId-kolumn — vi filtrerar i callbacken istället.
    const channel = supabase
      .channel(`rhapsode-sync-${userId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "Section",
        },
        (payload) => {
          onChangeRef.current({
            table:  "sections",
            event:  "UPDATE",
            record: payload.new as RealtimeSection,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "Work",
          filter: `userId=eq.${userId}`,
        },
        (payload) => {
          onChangeRef.current({
            table:  "works",
            event:  "INSERT",
            record: payload.new as RealtimeWork,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event:  "DELETE",
          schema: "public",
          table:  "Work",
          filter: `userId=eq.${userId}`,
        },
        (payload) => {
          onChangeRef.current({
            table:  "works",
            event:  "DELETE",
            record: payload.old as RealtimeWork,
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
