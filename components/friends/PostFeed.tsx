"use client";
// components/friends/PostFeed.tsx
//
// Inlagg och gillningar.
//
// Servern har redan avgjort vad som far synas — kommer ett inlagg hit ar
// det for att betraktaren far se det. Komponenten doljer ingenting pa
// egen hand, och ska inte gora det: en kontroll som bara finns i
// gransnittet ar ingen kontroll.
//
// Gillningen ar optimistisk. Hjartat fylls direkt, och rullas tillbaka
// om servern sager nej. Ett halvt sekunds vantan pa en sa liten sak
// kanns trasigt aven nar det fungerar.

import { useState } from "react";
import Link from "next/link";
import { MAX_BODY } from "@/lib/postText";

export interface FeedPost {
  id:        string;
  kind:      "note" | "milestone";
  body:      string;
  createdAt: string;
  workTitle: string | null;
  workId:    string | null;
  likes:     number;
  likedByMe: boolean;
  author: {
    id:        string;
    username:  string;
    handle:    string | null;
    avatarUrl: string | null;
  };
}

interface Props {
  initial: FeedPost[];
  /**
   * Betraktaren. Id:t avgor vilka inlagg som far tas bort; namnet och
   * bilden behovs for att ett nyss skrivet inlagg ska se ut som de
   * andra direkt, i stallet for att stå namnlost till nasta omladdning.
   */
  viewer: { id: string; username: string; handle: string | null; avatarUrl: string | null };
  /** Visa skrivrutan. Bara pa sin egen profil och i flodet. */
  canWrite?: boolean;
  /** Text nar det inte finns nagra inlagg. */
  empty?: string;
}

export function PostFeed({ initial, viewer, canWrite, empty }: Props) {
  const [posts, setPosts] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const left = MAX_BODY - draft.length;

  async function publish() {
    const body = draft.trim();
    if (!body || busy) return;

    setBusy(true);
    setError(null);
    try {
      const res  = await fetch("/api/posts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not post");

      // Servern svarar med raden den skrev. Id och tid kommer darifran,
      // sa att en omladdning visar exakt samma sak.
      setPosts(p => [{
        id:        json.id,
        kind:      "note",
        body:      json.body,
        createdAt: json.createdAt,
        workTitle: null,
        workId:    null,
        likes:     0,
        likedByMe: false,
        author:    viewer,
      }, ...p]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  async function like(id: string) {
    const before = posts;
    setPosts(p => p.map(x => x.id === id
      ? { ...x, likedByMe: !x.likedByMe, likes: x.likes + (x.likedByMe ? -1 : 1) }
      : x));

    try {
      const res  = await fetch(`/api/posts/${id}/like`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error();
      // Serverns rakning vinner over den optimistiska.
      setPosts(p => p.map(x => x.id === id
        ? { ...x, likedByMe: json.liked, likes: json.likes }
        : x));
    } catch {
      setPosts(before);
    }
  }

  async function remove(id: string) {
    const before = posts;
    setPosts(p => p.filter(x => x.id !== id));
    const res = await fetch(`/api/posts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) setPosts(before);
  }

  return (
    <div>
      {canWrite && (
        <div style={composer}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value.slice(0, MAX_BODY))}
            placeholder="What are you working on?"
            rows={2}
            style={area}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
            <span style={{
              fontSize: "11px", flex: 1,
              color: left < 30 ? "var(--gold)" : "var(--bg4)",
            }}>
              {left < 60 ? `${left} left` : ""}
            </span>
            <button
              onClick={publish}
              disabled={busy || !draft.trim()}
              style={{ ...btnPost, opacity: busy || !draft.trim() ? 0.4 : 1 }}
            >
              {busy ? "…" : "Post"}
            </button>
          </div>
          {error && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "8px" }}>{error}</p>}
        </div>
      )}

      {posts.length === 0 ? (
        <p style={emptyBox}>{empty ?? "Nothing posted yet."}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {posts.map(p => (
            <Card
              key={p.id}
              post={p}
              mine={p.author.id === viewer.id}
              onLike={() => like(p.id)}
              onDelete={() => remove(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  post, mine, onLike, onDelete,
}: {
  post: FeedPost; mine: boolean; onLike: () => void; onDelete: () => void;
}) {
  const milestone = post.kind === "milestone";

  return (
    <article style={{
      background: "var(--bg2)",
      border: `1px solid ${milestone ? "rgba(200,164,80,0.28)" : "var(--bord)"}`,
      borderRadius: "var(--r2)",
      padding: "14px 16px",
    }}>
      <header style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "9px" }}>
        <div style={avatar}>
          {post.author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.author.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontFamily: "var(--fd)", fontSize: "14px", color: "var(--gold)" }}>
              {post.author.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {post.author.handle ? (
            <Link href={`/u/${post.author.handle}`} style={{ textDecoration: "none" }}>
              <span style={name}>{post.author.username}</span>
            </Link>
          ) : (
            <span style={name}>{post.author.username}</span>
          )}
          <span style={{ fontSize: "11px", color: "var(--bg4)", marginLeft: "7px" }}>
            {ago(post.createdAt)}
          </span>
        </div>

        {mine && (
          <button onClick={onDelete} title="Delete" style={del}>×</button>
        )}
      </header>

      <p style={{
        fontSize: "14px", color: "var(--parch)", lineHeight: 1.6,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {milestone && <span style={{ color: "var(--gold)", marginRight: "6px" }}>✦</span>}
        {post.body}
        {/*
          Titeln star bara nar verket ar publikt. Servern har redan
          nollat den for ett privat verk, sa det finns ingenting att
          gora fel har — men det ar dar regeln bor, inte har.
        */}
        {post.workTitle && (
          <span style={{ color: "var(--gold)" }}> — {post.workTitle}</span>
        )}
      </p>

      <button
        onClick={onLike}
        style={{
          ...likeBtn,
          color:       post.likedByMe ? "var(--gold)" : "var(--muted)",
          borderColor: post.likedByMe ? "rgba(200,164,80,0.3)" : "transparent",
        }}
      >
        {post.likedByMe ? "♥" : "♡"}
        {post.likes > 0 && <span style={{ marginLeft: "6px" }}>{post.likes}</span>}
      </button>
    </article>
  );
}

/** "3h" hellre an ett datum. Ett flode handlar om nyss. */
function ago(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)     return "just now";
  if (secs < 3600)   return `${Math.floor(secs / 60)}m`;
  if (secs < 86400)  return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const composer: React.CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r2)", padding: "13px 14px", marginBottom: "10px",
};
const area: React.CSSProperties = {
  width: "100%", background: "transparent", border: "none",
  color: "var(--parch)", fontSize: "14px", lineHeight: 1.6,
  outline: "none", resize: "vertical", fontFamily: "inherit",
};
const btnPost: React.CSSProperties = {
  padding: "7px 16px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "12.5px", cursor: "pointer",
};
const avatar: React.CSSProperties = {
  width: "30px", height: "30px", borderRadius: "50%",
  background: "var(--bg3)", border: "1px solid var(--bord)",
  overflow: "hidden", flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const name: React.CSSProperties = {
  fontSize: "13px", color: "var(--parch2)",
};
const del: React.CSSProperties = {
  background: "none", border: "none", color: "var(--bg4)",
  fontSize: "17px", lineHeight: 1, cursor: "pointer", padding: "0 4px",
};
const likeBtn: React.CSSProperties = {
  marginTop: "10px", padding: "4px 10px",
  background: "transparent", border: "1px solid transparent",
  borderRadius: "999px", fontSize: "13px", cursor: "pointer",
};
const emptyBox: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)", textAlign: "center",
  padding: "22px", background: "var(--bg2)",
  border: "1px solid var(--bord)", borderRadius: "var(--r2)",
};
