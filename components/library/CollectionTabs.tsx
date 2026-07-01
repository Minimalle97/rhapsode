"use client";
// components/library/CollectionTabs.tsx
// Fas 5: tab-rad för samlingar ("All works" + en flik per Collection),
// plus ett litet inline-formulär för att skapa en ny samling.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
import type { Collection } from "@/types";

interface CollectionTabsProps {
  collections: Collection[];
}

export function CollectionTabs({ collections }: CollectionTabsProps) {
  const router       = useRouter();
  const pathname      = usePathname();
  const searchParams = useSearchParams();
  const activeId     = searchParams.get("collection");

  const [creating, setCreating] = useState(false);
  const [name, setName]         = useState("");
  const [saving, setSaving]     = useState(false);

  function go(collectionId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (collectionId) params.set("collection", collectionId);
    else params.delete("collection");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function createCollection() {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/collections", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const created = await res.json();
        setName("");
        setCreating(false);
        router.refresh();
        go(created.id);
        return;
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "8px", overflowX: "auto", alignItems: "center" }}>
      <TabButton active={!activeId} onClick={() => go(null)}>
        All works
      </TabButton>

      {collections.map((c) => (
        <TabButton key={c.id} active={activeId === c.id} onClick={() => go(c.id)}>
          {c.name} <span style={{ opacity: 0.55 }}>· {c.workIds.length}</span>
        </TabButton>
      ))}

      {creating ? (
        <span style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createCollection();
              if (e.key === "Escape") { setCreating(false); setName(""); }
            }}
            placeholder="Collection name"
            style={inputStyle}
          />
          <button onClick={createCollection} disabled={saving} style={tabBtnStyle(false)}>
            {saving ? "…" : "Save"}
          </button>
        </span>
      ) : (
        <button onClick={() => setCreating(true)} style={tabBtnStyle(false)}>
          + New
        </button>
      )}
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={tabBtnStyle(active)}>
      {children}
    </button>
  );
}

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    padding:       "6px 14px",
    borderRadius:  "999px",
    fontSize:      "12.5px",
    whiteSpace:    "nowrap",
    cursor:        "pointer",
    border:        active ? "1px solid var(--gold)" : "1px solid var(--bord)",
    background:    active ? "var(--gold3)" : "transparent",
    color:         active ? "var(--gold)" : "var(--muted)",
    fontFamily:    "var(--fb)",
    letterSpacing: "0.02em",
    transition:    "all .15s",
    flexShrink:    0,
  };
}

const inputStyle: CSSProperties = {
  background:   "var(--bg3)",
  border:       "1px solid var(--bord)",
  borderRadius: "999px",
  padding:      "6px 12px",
  fontSize:     "12.5px",
  color:        "var(--parch)",
  outline:      "none",
  width:        "150px",
  fontFamily:   "var(--fb)",
};
