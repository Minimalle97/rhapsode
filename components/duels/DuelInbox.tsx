"use client";
// components/duels/DuelInbox.tsx
//
// Tvekamperna pa vanssidan: inbjudningar som vantar pa svar, kamper som
// pagar, och de som just avgjorts.
//
// Ligger bland vannerna och inte i biblioteket for att en inbjudan ar
// nagot en person skickat, inte nagot som hant en text. Sjalva verket
// dyker upp i biblioteket forst nar man sagt ja — det ar dar man ovar.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCountdown } from "./useCountdown";
import { DuelResults } from "./DuelResults";

interface DuelCard {
  id:        string;
  status:    "pending" | "active" | "finished" | "declined" | "cancelled";
  role:      "challenger" | "opponent";
  workTitle: string;
  workAuthor: string;
  myWorkId:  string | null;
  minutes:   number;
  endsAt:    string | null;
  awaitingResult: boolean;
  winnerId:  string | null;
  other: { id: string; username: string; handle: string | null; avatarUrl: string | null };
}

export function DuelInbox({ viewerId }: { viewerId: string }) {
  const router = useRouter();

  const [duels, setDuels] = useState<DuelCard[] | null>(null);
  const [busy, setBusy]   = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/duels");
      const json = await res.json();
      if (res.ok) setDuels(json.duels ?? []);
    } catch { /* tyst — vanlistan ar sidans uppgift, det har ar inte det */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, method: "PATCH" | "DELETE") {
    setBusy(id);
    setError(null);
    try {
      const res  = await fetch(`/api/duels/${id}`, { method });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (!duels || duels.length === 0) return null;

  const waiting  = duels.filter(d => d.status === "pending" && d.role === "opponent");
  const sent     = duels.filter(d => d.status === "pending" && d.role === "challenger");
  const running  = duels.filter(d => d.status === "active");
  const finished = duels.filter(d => d.status === "finished").slice(0, 3);

  return (
    <section style={{ marginTop: "28px" }}>
      <h2 style={h2}>Duels</h2>

      {error && <p style={errorText}>{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {waiting.map(d => (
          <Card key={d.id} duel={d} accent>
            <p style={line}>
              <strong style={{ color: "var(--parch)" }}>{d.other.username}</strong>
              {" challenges you over "}
              <strong style={{ color: "var(--parch)" }}>{d.workTitle}</strong>
              {` — ${label(d.minutes)}.`}
            </p>
            <p style={{ ...sub, marginBottom: "12px" }}>
              Accept and a copy lands in your library, with the same tools they
              have for as long as the clock runs. You keep it either way.
            </p>
            <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
              <button onClick={() => act(d.id, "PATCH")} disabled={busy === d.id} style={primary}>
                {busy === d.id ? "…" : "Accept"}
              </button>
              <button onClick={() => act(d.id, "DELETE")} disabled={busy === d.id} style={ghost}>
                Decline
              </button>
            </div>
          </Card>
        ))}

        {running.map(d => (
          <Running key={d.id} duel={d} viewerId={viewerId} />
        ))}

        {sent.map(d => (
          <Card key={d.id} duel={d} muted>
            <p style={line}>
              Waiting for <strong style={{ color: "var(--parch)" }}>{d.other.username}</strong>
              {" to answer — "}{d.workTitle}, {label(d.minutes)}.
            </p>
            <p style={{ ...sub, marginBottom: "10px" }}>
              The clock starts when they accept, not now.
            </p>
            <button onClick={() => act(d.id, "DELETE")} disabled={busy === d.id} style={ghost}>
              Withdraw
            </button>
          </Card>
        ))}

        {finished.map(d => (
          <Card key={d.id} duel={d}>
            <p style={{ ...line, marginBottom: "10px" }}>
              {d.winnerId === null
                ? `A draw with ${d.other.username} over ${d.workTitle}.`
                : d.winnerId === viewerId
                  ? `You beat ${d.other.username} over ${d.workTitle}.`
                  : `${d.other.username} beat you over ${d.workTitle}.`}
            </p>
            <DuelResults duelId={d.id} workTitle={d.workTitle} viewerId={viewerId} />
          </Card>
        ))}
      </div>
    </section>
  );
}

/** En pagaende kamp, med klockan. Egen komponent for hookens skull. */
function Running({ duel, viewerId }: { duel: DuelCard; viewerId: string }) {
  const { label: left, done } = useCountdown(duel.endsAt);

  return (
    <Card duel={duel} accent>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
        <p style={{ ...line, marginBottom: 0, flex: "1 1 auto" }}>
          Against <strong style={{ color: "var(--parch)" }}>{duel.other.username}</strong>
          {" — "}{duel.workTitle}
        </p>
        <span style={{
          fontFamily: "var(--fd)", fontSize: "17px", color: "var(--green)",
          fontVariantNumeric: "tabular-nums", flexShrink: 0,
        }}>
          {done ? "time's up" : left}
        </span>
      </div>

      {done ? (
        <DuelResults duelId={duel.id} workTitle={duel.workTitle} viewerId={viewerId} />
      ) : duel.myWorkId ? (
        <Link href={`/work/${duel.myWorkId}`} style={primary}>
          Go and learn it
        </Link>
      ) : (
        <p style={sub}>That work has been removed.</p>
      )}
    </Card>
  );
}

function Card({
  duel, children, accent, muted,
}: {
  duel: DuelCard; children: React.ReactNode; accent?: boolean; muted?: boolean;
}) {
  return (
    <div style={{
      background: "var(--bg2)",
      border: `1px solid ${accent ? "rgba(106,158,106,0.35)" : "var(--bord)"}`,
      borderRadius: "var(--r2)",
      padding: "15px 17px",
      opacity: muted ? 0.72 : 1,
    }}>
      <p style={{
        fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase",
        color: "var(--muted)", marginBottom: "7px",
      }}>
        {duel.workAuthor}
      </p>
      {children}
    </div>
  );
}

function label(minutes: number): string {
  if (minutes < 60)     return `${minutes} minutes`;
  if (minutes < 1_440)  return `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`;
  const days = minutes / 1_440;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

const h2: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "18px", fontWeight: 400,
  color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "12px",
};
const line: React.CSSProperties = {
  fontSize: "13px", color: "var(--parch2)", lineHeight: 1.6, marginBottom: "4px",
};
const sub: React.CSSProperties = {
  fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.6,
};
const primary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: "var(--r3)",
  background: "var(--green)", border: "1px solid var(--green)",
  color: "var(--bg)", fontSize: "13px", cursor: "pointer",
  textDecoration: "none", display: "inline-block",
};
const ghost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "13px", cursor: "pointer",
};
const errorText: React.CSSProperties = {
  fontSize: "12px", color: "var(--red)", marginBottom: "10px",
};
