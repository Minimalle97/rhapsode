"use client";
// components/reading/SectionText.tsx
//
// Texten som den star skriven.
//
// EN renderare for hela appen. Laslaget och ovningens Read-lage anvander
// samma, sa att en dikt inte kan brytas pa ett satt pa ett stalle och ett
// annat pa ett annat. Ovningens lage anropar den utan markeringar.
//
// ── Vad den bevarar ───────────────────────────────────────────────────
//
// Anvandarens ord, ororda. Radbrytningar, indrag, skiljetecken och
// versaler star kvar precis som de skrevs — i en app dar texten ska
// kunnas utantill vore varje tyst normalisering ett fel man sedan lar sig.
//
// ── Repliker ──────────────────────────────────────────────────────────
//
// En rad som "HAMLET." eller "MARIA:" ar inte en replik utan en anvisning
// om vem som talar. Den satts darfor i kapitaler och guld, avskild fran
// det som sags. Igenkanningen ar avsiktligt snal: bara korta rader helt
// utan gemener raknas, sa att en rad som ropar i versaler mitt i en dikt
// inte forvaxlas med en rollangivelse.

import { useState, type CSSProperties } from "react";
import type { WeakSpan } from "@/lib/weakSpots";
import { explain } from "@/lib/weakSpots";

interface Props {
  content: string;
  /** Tomt nar markeringen ar avslagen eller historik saknas. */
  spans?:  WeakSpan[];
  /** Storre i laslaget an i ovningens smalare spalt. */
  size?:   "reading" | "compact";
}

/** En rollangivelse: kort, inga gemener, minst en bokstav. */
function isCharacterCue(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 40) return false;
  if (!/\p{Lu}/u.test(t)) return false;
  if (/\p{Ll}/u.test(t)) return false;
  return /^[\p{Lu}\p{N}\s.,':;()\-–—[\]]+$/u.test(t);
}

const TINT: Record<WeakSpan["severity"], { bg: string; line: string }> = {
  // Orange bakgrund, oforandrad textfarg. Att farga sjalva orden hade
  // gjort just de rader som ar svarast att minnas svarast att lasa.
  moderate: { bg: "rgba(214, 140, 58, 0.16)", line: "rgba(214, 140, 58, 0.45)" },
  strong:   { bg: "rgba(214, 140, 58, 0.30)", line: "rgba(214, 140, 58, 0.75)" },
  severe:   { bg: "rgba(214, 140, 58, 0.46)", line: "rgba(224, 150, 60, 1)"    },
};

export function SectionText({ content, spans = [], size = "reading" }: Props) {
  // Tryck oppnar rutan pa telefon, dar det inte finns nagon hovring.
  const [open, setOpen] = useState<number | null>(null);

  const lines = content.split("\n");
  const reading = size === "reading";

  let offset = 0;

  return (
    <div
      style={{
        fontFamily: "var(--fd)",
        fontSize:   reading ? "clamp(18px, 2.4vw, 21px)" : "20px",
        lineHeight: reading ? 1.85 : 1.7,
        color:      "var(--parch)",
      }}
      // Ett tryck vid sidan om stanger en oppen ruta.
      onClick={() => setOpen(null)}
    >
      {lines.map((line, i) => {
        const start = offset;
        offset += line.length + 1;          // +1 for radbrytningen

        if (line.trim() === "") {
          return <div key={i} style={{ height: reading ? "0.9em" : "0.7em" }} />;
        }

        const cue = isCharacterCue(line);

        return (
          <p
            key={i}
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak:  "break-word",
              ...(cue ? cueStyle : null),
            }}
          >
            {renderLine(line, start, spans, open, setOpen)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * En rad, med de markerade styckena inklippta.
 *
 * Styckena kommer som platser i HELA sektionen, sa de klipps ned till den
 * har radens del innan de ritas. Ett stalle som stracker sig over en
 * radbrytning blir da tva markeringar, en per rad — vilket ocksa ar det
 * enda som gar att gora med en bakgrund som ska folja radens form.
 */
function renderLine(
  line:   string,
  start:  number,
  spans:  WeakSpan[],
  open:   number | null,
  setOpen: (v: number | null) => void
) {
  const end = start + line.length;

  const here = spans
    .filter(s => s.end > start && s.start < end)
    .map(s => ({
      span:  s,
      from:  Math.max(0, s.start - start),
      to:    Math.min(line.length, s.end - start),
    }))
    .filter(s => s.to > s.from)
    .sort((a, b) => a.from - b.from);

  if (here.length === 0) return line;

  const out: React.ReactNode[] = [];
  let at = 0;

  for (const { span, from, to } of here) {
    if (from > at) out.push(line.slice(at, from));

    const tint = TINT[span.severity];
    const key  = span.start;
    const info = explain(span);
    const isOpen = open === key;

    out.push(
      <mark
        key={`${key}-${from}`}
        title={`${info.title} — ${info.detail}`}
        onClick={e => { e.stopPropagation(); setOpen(isOpen ? null : key); }}
        style={{
          background:   tint.bg,
          color:        "inherit",
          borderRadius: "3px",
          padding:      "0.06em 0.12em",
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          boxShadow:    `inset 0 -2px 0 ${tint.line}`,
          cursor:       "pointer",
          position:     "relative",
        }}
      >
        {line.slice(from, to)}
        {isOpen && (
          <span
            role="tooltip"
            style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 0,
              zIndex: 30, minWidth: "168px",
              background: "var(--bg3)", border: "1px solid var(--bord)",
              borderRadius: "var(--r3)", padding: "8px 11px",
              boxShadow: "var(--sh)",
              fontFamily: "var(--fb)", fontSize: "12px",
              lineHeight: 1.5, color: "var(--parch2)",
              whiteSpace: "normal", cursor: "default",
            }}
          >
            <strong style={{ display: "block", color: "var(--parch)", marginBottom: "2px" }}>
              {info.title}
            </strong>
            {info.detail}
          </span>
        )}
      </mark>
    );
    at = to;
  }

  if (at < line.length) out.push(line.slice(at));
  return out;
}

const cueStyle: CSSProperties = {
  fontFamily:    "var(--fb)",
  fontSize:      "0.62em",
  letterSpacing: "0.16em",
  color:         "var(--gold)",
  marginTop:     "0.9em",
  marginBottom:  "0.15em",
};
