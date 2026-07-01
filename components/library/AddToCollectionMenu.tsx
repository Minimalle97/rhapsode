"use client";
// components/library/AddToCollectionMenu.tsx
// Fas 5: liten "⋯"-meny på varje WorkCard för att lägga till/ta bort
// verket från en eller flera samlingar. Optimistisk UI-uppdatering.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Collection } from "@/types";

interface AddToCollectionMenuProps {
  workId:      string;
  collections: Collection[];
  memberIds:   string[];
}

export function AddToCollectionMenu({ workId, collections, memberIds }: AddToCollectionMenuProps) {
  const [open, setOpen]       = useState(false);
  const [members, setMembers] = useState<Set<string>>(new Set(memberIds));
  const [busyId, setBusyId]   = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function toggle(collectionId: string, isMember: boolean) {
    setBusyId(collectionId);
    try {
      const res = await fetch(`/api/collections?id=${collectionId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isMember ? { removeWorkId: workId } : { addWorkId: workId }
        ),
      });
      if (res.ok) {
        setMembers((prev) => {
          const next = new Set(prev);
          if (isMember) next.delete(collectionId);
          else next.add(collectionId);
          return next;
        });
      }
    } finally {
      setBusyId(null);
    }
  }

  // Hindra klick i menyn från att trigga det omslutande <Link> till verket.
  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div ref={ref} style={{ position: "relative" }} onClick={stop}>
      <button
        onClick={(e) => { stop(e); setOpen((o) => !o); }}
        style={triggerStyle}
        aria-label="Add to collection"
      >
        ⋯
      </button>

      {open && (
        <div style={dropdownStyle}>
          <p style={dropdownHeaderStyle}>Add to collection</p>
          {collections.length === 0 ? (
            <p style={{ fontSize: "12px", color: "var(--muted)", padding: "6px 12px 10px" }}>
              No collections yet
            </p>
          ) : (
            collections.map((c) => {
              const isMember = members.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={(e) => { stop(e); toggle(c.id, isMember); }}
                  disabled={busyId === c.id}
                  style={dropdownItemStyle}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--gold4)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
                >
                  <span style={{ width: "14px", textAlign: "center", color: "var(--gold)", flexShrink: 0 }}>
                    {isMember ? "✓" : ""}
                  </span>
                  <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const triggerStyle: CSSProperties = {
  width:          "26px",
  height:         "26px",
  borderRadius:   "50%",
  border:         "1px solid var(--bord)",
  background:     "var(--bg2)",
  color:          "var(--muted)",
  fontSize:       "14px",
  lineHeight:     1,
  cursor:         "pointer",
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
};

const dropdownStyle: CSSProperties = {
  position:     "absolute",
  top:          "32px",
  right:        0,
  width:        "180px",
  background:   "var(--bg3)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r2)",
  boxShadow:    "var(--sh)",
  padding:      "8px 0",
  zIndex:       10,
};

const dropdownHeaderStyle: CSSProperties = {
  fontSize:      "10px",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color:         "var(--gold)",
  padding:       "2px 12px 8px",
};

const dropdownItemStyle: CSSProperties = {
  display:      "flex",
  alignItems:   "center",
  gap:          "6px",
  width:        "100%",
  padding:      "7px 12px",
  fontSize:     "12.5px",
  color:        "var(--parch2)",
  background:   "none",
  border:       "none",
  cursor:       "pointer",
  fontFamily:   "var(--fb)",
};
