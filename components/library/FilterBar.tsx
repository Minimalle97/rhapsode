"use client";
// components/library/FilterBar.tsx
// Typ/svarighet (select) och status (segmented control) — alla skriver
// till URL-querystring.
//
// Taggraden ar borttagen. Taggarna sattes av katalogiseringen, inte av
// anvandaren, sa raden var en filtermeny over ord ingen valt: med tjugo
// verk i biblioteket blev den trettio hashtaggar lang och nastan varje
// filter tomde listan till ett enda verk. Perioden och temat star kvar
// dar de hor hemma — pa verket sjalvt, som text.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";

const TYPES: { value: string; label: string }[] = [
  { value: "POEM",          label: "Poem" },
  { value: "EPIC",          label: "Epic" },
  { value: "PLAY",          label: "Play" },
  { value: "SPEECH",        label: "Speech" },
  { value: "PHILOSOPHICAL", label: "Philosophical" },
  { value: "RELIGIOUS",     label: "Religious" },
  { value: "PROFESSIONAL",  label: "Professional" },
  { value: "OTHER",         label: "Other" },
];

const DIFFICULTIES = ["easy", "medium", "hard"];

const STATUSES: { value: string; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "mastered",    label: "Mastered" },
];

export function FilterBar() {
  const router       = useRouter();
  const pathname      = usePathname();
  const searchParams = useSearchParams();

  const type       = searchParams.get("type");
  const difficulty = searchParams.get("difficulty");
  const status     = searchParams.get("status");

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggle(key: string, value: string) {
    setParam(key, searchParams.get(key) === value ? null : value);
  }

  const hasFilters = Boolean(type || difficulty || status || searchParams.get("q"));

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    // "tag" rensas fortfarande bort. Filtret gar inte att satta langre,
    // men en gammal bokmarkt adress kan bara det med sig, och da ska
    // Clear filters gora rent aven fran den.
    ["q", "type", "difficulty", "status", "tag"].forEach((k) => params.delete(k));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={type ?? ""}
          onChange={(e) => setParam("type", e.target.value || null)}
          style={selectStyle}
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={difficulty ?? ""}
          onChange={(e) => setParam("difficulty", e.target.value || null)}
          style={selectStyle}
        >
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>
          ))}
        </select>

        <div style={{ width: "1px", height: "20px", background: "var(--bord)" }} />

        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => toggle("status", s.value)}
            style={pillStyle(status === s.value)}
          >
            {s.label}
          </button>
        ))}

        {hasFilters && (
          <button onClick={clearAll} style={clearStyle}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

const selectStyle: CSSProperties = {
  background:   "var(--bg3)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r2)",
  padding:      "8px 10px",
  fontSize:     "12.5px",
  color:        "var(--parch2)",
  fontFamily:   "var(--fb)",
  outline:      "none",
  cursor:       "pointer",
};

function pillStyle(active: boolean): CSSProperties {
  return {
    padding:       "7px 14px",
    borderRadius:  "999px",
    fontSize:      "12.5px",
    cursor:        "pointer",
    border:        active ? "1px solid var(--gold)" : "1px solid var(--bord)",
    background:    active ? "var(--gold3)" : "transparent",
    color:         active ? "var(--gold)" : "var(--muted)",
    fontFamily:    "var(--fb)",
    letterSpacing: "0.02em",
    transition:    "all .15s",
    whiteSpace:    "nowrap",
  };
}


const clearStyle: CSSProperties = {
  background:    "none",
  border:        "none",
  cursor:        "pointer",
  fontSize:      "12px",
  color:         "var(--muted)",
  textDecoration: "underline",
  fontFamily:    "var(--fb)",
  marginLeft:    "2px",
};
