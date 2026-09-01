"use client";
// components/repertoire/EntryList.tsx
//
// Dikterna i en grupp.
//
// Varje rad ar en titel, en upphovsperson och lankarna till arkiven. Ingen
// text visas — repertoaren for ingen. Lankarna ar forifyllda sokningar,
// inte direktadresser, sa de overlever att ett arkiv lagger om sina
// sidor; priset ar att forsta traffen inte alltid ar ratt.
//
// Tre lagen per rad:
//
//   gron     — verksmedaljen ar utdelad. Dikten sitter.
//   pabörjad — verket finns i biblioteket. Lanken gar dit.
//   ny       — inte tillagd. Lankarna hamtar texten, knappen lagger till.

import { useState } from "react";
import Link from "next/link";
import { ARCHIVES, archiveUrl, type ArchiveCode } from "@/lib/repertoire/archives";

export interface EntryRow {
  id:      number;
  title:   string;
  author:  string;
  starred: boolean;
  links:   ArchiveCode[];
  workId:  string | null;
  held:    boolean;
}

type Filter = "all" | "starred" | "todo" | "held";

export function EntryList({ entries }: { entries: EntryRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const shown = entries.filter(e =>
    filter === "starred" ? e.starred :
    filter === "held"    ? e.held :
    filter === "todo"    ? !e.held :
    true
  );

  const starredCount = entries.filter(e => e.starred).length;

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
        <Tab now={filter} me="all"     set={setFilter}>All {entries.length}</Tab>
        {starredCount > 0 && (
          <Tab now={filter} me="starred" set={setFilter}>★ Core {starredCount}</Tab>
        )}
        <Tab now={filter} me="todo"    set={setFilter}>Not yet held</Tab>
        <Tab now={filter} me="held"    set={setFilter}>Held</Tab>
      </div>

      {shown.length === 0 ? (
        <p style={{
          fontSize: "13px", color: "var(--muted)", textAlign: "center",
          padding: "28px", background: "var(--bg2)",
          border: "1px solid var(--bord)", borderRadius: "var(--r2)",
        }}>
          {filter === "held" ? "Nothing from this group yet." : "Nothing left here."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {shown.map(e => <Row key={e.id} entry={e} />)}
        </div>
      )}

      <p style={{
        fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.7,
        marginTop: "22px", paddingTop: "16px", borderTop: "1px solid var(--bord)",
      }}>
        Links open a search of that archive, not a fixed page — so they keep working
        when an archive moves things, but the first result is not always the right
        one. Roughly everything written before about 1930 is public domain and can be
        downloaded outright; most of what comes after can be read and copied for
        private study but not redistributed.
      </p>
    </div>
  );
}

function Row({ entry }: { entry: EntryRow }) {
  return (
    <div style={{
      background: entry.held ? "rgba(106,158,106,0.07)" : "var(--bg2)",
      border: `1px solid ${entry.held ? "rgba(106,158,106,0.42)" : "var(--bord)"}`,
      borderRadius: "var(--r2)",
      padding: "12px 15px",
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <p style={{
          fontSize: "14px", color: "var(--parch)",
          lineHeight: 1.4, marginBottom: "2px",
        }}>
          {entry.starred && (
            <span title="One of the 116 in the core set" style={{ color: "var(--gold)", marginRight: "5px" }}>
              ★
            </span>
          )}
          {entry.title}
          {entry.held && (
            <span style={{ color: "var(--green)", marginLeft: "7px", fontSize: "12px" }}>
              held
            </span>
          )}
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted)" }}>{entry.author}</p>
      </div>

      {/* Arkiven */}
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", flexShrink: 0 }}>
        {entry.links.map(code => {
          const a = ARCHIVES[code];
          if (!a) return null;
          return (
            <a
              key={code}
              href={archiveUrl(code, entry.title, entry.author)}
              target="_blank"
              rel="noopener noreferrer"
              title={`${a.label} — ${a.note}`}
              style={archiveChip}
            >
              {code}
            </a>
          );
        })}
      </div>

      {entry.workId ? (
        <Link href={`/work/${entry.workId}`} style={{ ...actionBtn, ...ghost }}>
          {entry.held ? "Open" : "Continue"}
        </Link>
      ) : (
        <Link
          // Titeln och upphovspersonen foljer med, och sa gor loptnumret:
          // det ar det som gor kopplingen exakt i stallet for gissad.
          href={`/library/add?title=${encodeURIComponent(entry.title)}&author=${encodeURIComponent(entry.author)}&canonical=${entry.id}`}
          style={{ ...actionBtn, ...primary }}
        >
          Add
        </Link>
      )}
    </div>
  );
}

function Tab({
  now, me, set, children,
}: {
  now: Filter; me: Filter; set: (f: Filter) => void; children: React.ReactNode;
}) {
  const on = now === me;
  return (
    <button
      onClick={() => set(me)}
      style={{
        padding: "6px 13px", borderRadius: "999px", cursor: "pointer",
        fontSize: "12px",
        border: `1px solid ${on ? "var(--gold)" : "var(--bord)"}`,
        color: on ? "var(--gold)" : "var(--muted)",
        background: on ? "var(--gold4)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

const archiveChip: React.CSSProperties = {
  fontSize: "10px", letterSpacing: "0.08em",
  padding: "3px 7px", borderRadius: "var(--r3)",
  border: "1px solid var(--bord)", color: "var(--muted)",
  textDecoration: "none", background: "var(--bg3)",
};
const actionBtn: React.CSSProperties = {
  padding: "6px 14px", borderRadius: "var(--r3)",
  fontSize: "12px", textDecoration: "none",
  whiteSpace: "nowrap", flexShrink: 0,
};
const primary: React.CSSProperties = {
  background: "var(--gold)", border: "1px solid var(--gold)", color: "var(--bg)",
};
const ghost: React.CSSProperties = {
  background: "transparent", border: "1px solid var(--bord)", color: "var(--parch2)",
};
