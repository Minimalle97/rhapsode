"use client";
// components/friends/FriendsHub.tsx
// Vänlistan: rangordning, förfrågningar och sökning.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FriendCard } from "@/lib/friends";
import { PostFeed, type FeedPost } from "./PostFeed";
import { DuelInbox } from "@/components/duels/DuelInbox";
import { Avatar as SharedAvatar } from "@/components/profile/Avatar";

interface Data {
  friends:  FriendCard[];
  incoming: FriendCard[];
  outgoing: FriendCard[];
  me:       { id: string; handle: string | null; username: string; avatarUrl: string | null };
}

export function FriendsHub() {
  const router = useRouter();

  const [data, setData]     = useState<Data | null>(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [feed, setFeed]     = useState<FeedPost[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/friends");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Flodet hamtas for sig. Gar det fel ar vanlistan anda kvar — den ar
  // sidans uppgift, flodet ar en bonus, och de ska inte falla ihop.
  useEffect(() => {
    void (async () => {
      try {
        const res  = await fetch("/api/posts");
        const json = await res.json();
        if (res.ok) setFeed(json.posts);
      } catch { /* tyst */ }
    })();
  }, []);

  async function act(fn: () => Promise<Response>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res  = await fn();
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      if (success) setNotice(success);
      if (json.accepted && !success) setNotice(`You and ${json.username} are friends now`);
      if (json.sent) setNotice(`Request sent to ${json.username}`);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const sendRequest = () =>
    act(() =>
      fetch("/api/friends", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ handle: search }),
      })
    ).then(() => setSearch(""));

  const accept = (id: string) =>
    act(() => fetch(`/api/friends/${id}`, { method: "PATCH" }));

  const remove = (id: string, msg: string) =>
    act(() => fetch(`/api/friends/${id}`, { method: "DELETE" }), msg);

  if (!data) {
    return (
      <div style={wrap}>
        <div className="skeleton" style={{ height: "34px", width: "170px", marginBottom: "24px" }} />
        <div className="skeleton" style={{ height: "180px" }} />
      </div>
    );
  }

  // Utan handle går det inte att hittas
  if (!data.me.handle) {
    return <HandleSetup username={data.me.username} onDone={load} />;
  }

  // Rangordning: du själv inräknad, sorterat på XP
  const board = [...data.friends].sort((a, b) => b.xp - a.xp);

  return (
    <div style={wrap}>
      <h1 style={h1}>Friends</h1>
      <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "26px" }}>
        You are <strong style={{ color: "var(--gold)" }}>@{data.me.handle}</strong>
        {" "}· share it and others can find you
      </p>

      {/* Lägg till */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search.trim() && sendRequest()}
          placeholder="@handle"
          style={{ ...field, flex: "1 1 200px" }}
        />
        <button
          onClick={sendRequest}
          disabled={busy || !search.trim()}
          style={{ ...btnPrimary, opacity: busy || !search.trim() ? 0.45 : 1 }}
        >
          Send request
        </button>
      </div>

      {error && <p style={msgError}>{error}</p>}
      {notice && <p style={msgOk}>{notice}</p>}

      {/* Inkommande */}
      {data.incoming.length > 0 && (
        <section style={{ marginTop: "28px" }}>
          <h2 style={h2}>Waiting for you</h2>
          <div style={col}>
            {data.incoming.map(f => (
              <Row key={f.friendshipId} person={f}>
                <button onClick={() => accept(f.friendshipId)} disabled={busy} style={btnPrimary}>
                  Accept
                </button>
                <button
                  onClick={() => remove(f.friendshipId, "Declined")}
                  disabled={busy}
                  style={btnGhost}
                >
                  Decline
                </button>
              </Row>
            ))}
          </div>
        </section>
      )}

      {/*
        Tvekamperna. Star fore flodet: en inbjudan vantar pa ett svar och
        en pagaende kamp har en klocka som gar, medan ett inlagg kan lasas
        nar som helst. Det som ar tidsbundet hor hogst upp.
      */}
      <DuelInbox viewerId={data.me.id} />

      {/* Flodet */}
      {feed && data.friends.length > 0 && (
        <section style={{ marginTop: "28px" }}>
          <h2 style={h2}>Latest</h2>
          <PostFeed
            initial={feed}
            viewer={data.me}
            canWrite
            empty="Nothing yet. Say something, or master a work and it writes itself."
          />
        </section>
      )}

      {/* Rangordning */}
      <section style={{ marginTop: "28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
          <h2 style={{ ...h2, marginBottom: 0 }}>Standing</h2>
          {board.length > 0 && (
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {board.length} {board.length === 1 ? "friend" : "friends"}
            </span>
          )}
        </div>

        {board.length === 0 ? (
          <div style={{
            padding: "40px 24px", textAlign: "center",
            background: "var(--bg2)", border: "1px solid var(--bord)",
            borderRadius: "var(--r)",
          }}>
            <p style={{ fontSize: "26px", color: "var(--bg4)", marginBottom: "12px", lineHeight: 1 }}>◇</p>
            <p style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.6 }}>
              No one here yet. Send someone your handle and they can find you.
            </p>
          </div>
        ) : (
          <div style={col}>
            {board.map((f, i) => (
              <Row key={f.friendshipId} person={f} rank={i + 1} linked>
                <button
                  onClick={() => remove(f.friendshipId, `Removed ${f.username}`)}
                  disabled={busy}
                  style={{ ...btnGhost, fontSize: "12px", padding: "6px 11px" }}
                >
                  Remove
                </button>
              </Row>
            ))}
          </div>
        )}
      </section>

      {/* Utgående */}
      {data.outgoing.length > 0 && (
        <section style={{ marginTop: "28px" }}>
          <h2 style={h2}>Sent, not yet answered</h2>
          <div style={col}>
            {data.outgoing.map(f => (
              <Row key={f.friendshipId} person={f} muted>
                <button
                  onClick={() => remove(f.friendshipId, "Withdrawn")}
                  disabled={busy}
                  style={{ ...btnGhost, fontSize: "12px", padding: "6px 11px" }}
                >
                  Withdraw
                </button>
              </Row>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── En rad ────────────────────────────────────────────────────────────
function Row({
  person, rank, children, linked, muted,
}: {
  person:   FriendCard;
  rank?:    number;
  children: React.ReactNode;
  linked?:  boolean;
  muted?:   boolean;
}) {
  const inner = (
    <div style={{
      background: "var(--bg2)",
      border: `1px solid ${rank === 1 ? "rgba(200,164,80,0.32)" : "var(--bord)"}`,
      borderRadius: "var(--r2)",
      padding: "13px 16px",
      display: "flex", alignItems: "center", gap: "13px",
      opacity: muted ? 0.65 : 1,
    }}>
      {rank !== undefined && (
        <span style={{
          fontFamily: "var(--fd)", fontSize: "15px",
          color: rank === 1 ? "var(--gold)" : "var(--bg4)",
          width: "20px", flexShrink: 0,
        }}>
          {rank}
        </span>
      )}

      <Avatar person={person} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: "14px", color: "var(--parch)", marginBottom: "2px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {person.username}
          {person.handle && (
            <span style={{ color: "var(--bg4)", fontSize: "12px" }}> @{person.handle}</span>
          )}
        </p>
        <p style={{
          fontFamily: "var(--fd)", fontSize: "13px",
          color: "var(--gold)", marginBottom: "2px",
        }}>
          {person.rank}
        </p>
        <p style={{ fontSize: "11px", color: "var(--muted)" }}>
          {person.xp.toLocaleString()} XP
          {person.medals > 0 && ` · ${person.medals} ${person.medals === 1 ? "medal" : "medals"}`}
          {person.streakDays > 0 && ` · ${person.streakDays}d streak`}
        </p>
      </div>

      <div
        style={{ display: "flex", gap: "6px", flexShrink: 0 }}
        onClick={e => { e.preventDefault(); e.stopPropagation(); }}
      >
        {children}
      </div>
    </div>
  );

  if (linked && person.handle) {
    return (
      <Link href={`/u/${person.handle}`} className="section-row" style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function Avatar({ person }: { person: FriendCard }) {
  // Delad komponent i stallet for en egen kopia — barden ska ritas
  // likadant har som pa profilsidan, och den ska inte kunna glomma sig.
  return (
    <SharedAvatar
      username={person.username}
      avatarUrl={person.avatarUrl}
      border={person.border}
      size={38}
    />
  );
}

// ── Välj handle ───────────────────────────────────────────────────────
function HandleSetup({ username, onDone }: { username: string; onDone: () => void }) {
  const suggestion = username.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);

  const [value, setValue]   = useState(suggestion.length >= 3 ? suggestion : "");
  const [state, setState]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy]     = useState(false);

  // Kolla tillgänglighet medan man skriver
  useEffect(() => {
    if (value.trim().length < 3) { setState(null); return; }
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/handle?q=${encodeURIComponent(value)}`);
        const json = await res.json();
        setState({
          ok:  json.available,
          msg: json.available ? "Available" : json.error ?? "Taken",
        });
      } catch { /* tyst */ }
    }, 350);
    return () => clearTimeout(t);
  }, [value]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/handle", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ handle: value }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({ ok: false, msg: json.error ?? "Failed" });
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...wrap, maxWidth: "520px" }}>
      <h1 style={h1}>Choose a handle</h1>
      <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.7, marginBottom: "24px" }}>
        Your name isn&apos;t unique — there may well be another {username}. A
        handle is how someone finds exactly you.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
        <span style={{ fontFamily: "var(--fd)", fontSize: "22px", color: "var(--gold)" }}>@</span>
        <input
          value={value}
          onChange={e => setValue(e.target.value.toLowerCase())}
          placeholder="handle"
          autoFocus
          style={{ ...field, fontSize: "17px", fontFamily: "var(--fd)" }}
        />
      </div>

      {state && (
        <p style={{
          fontSize: "12px",
          color: state.ok ? "var(--green)" : "var(--red)",
          marginBottom: "16px",
        }}>
          {state.msg}
        </p>
      )}

      <p style={{ fontSize: "11px", color: "var(--bg4)", marginBottom: "20px" }}>
        Letters, numbers and underscores. Three to twenty characters.
      </p>

      <button
        onClick={save}
        disabled={busy || !state?.ok}
        style={{ ...btnPrimary, opacity: busy || !state?.ok ? 0.45 : 1 }}
      >
        {busy ? "…" : "Claim it"}
      </button>
    </div>
  );
}

// ── Stilar ────────────────────────────────────────────────────────────
const wrap: React.CSSProperties = {
  maxWidth: "660px", margin: "0 auto", padding: "36px 24px 80px",
};
const h1: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "30px", fontWeight: 300,
  color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "6px",
};
const h2: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "18px", fontWeight: 400,
  color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "12px",
};
const col: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "6px",
};
const field: React.CSSProperties = {
  width: "100%", padding: "11px 13px",
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r3)", color: "var(--parch)",
  fontSize: "14px", outline: "none",
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 20px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "13px", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "10px 16px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "13px", cursor: "pointer",
};
const msgError: React.CSSProperties = {
  fontSize: "12px", color: "var(--red)", marginTop: "10px",
  padding: "9px 12px", background: "rgba(192,95,114,0.08)",
  border: "1px solid rgba(192,95,114,0.25)", borderRadius: "var(--r3)",
};
const msgOk: React.CSSProperties = {
  fontSize: "12px", color: "var(--green)", marginTop: "10px",
  padding: "9px 12px", background: "rgba(106,158,106,0.08)",
  border: "1px solid rgba(106,158,106,0.25)", borderRadius: "var(--r3)",
};
