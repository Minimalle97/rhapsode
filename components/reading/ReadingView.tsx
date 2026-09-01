"use client";
// components/reading/ReadingView.tsx
//
// Att lasa igenom ett verk, sektion for sektion.
//
// Skilt fran ovningen med flit. Ovningen provar dig; det har later dig
// lasa. Man ska kunna ga igenom en pjas eller en dikt fran borjan till
// slut utan att en enda gang bli ombedd att betygsatta sig sjalv — och
// sedan ova nar man sjalv vill, inte nar appen tycker det.
//
// Ingen del av lasningen ar last. Det som ar Pro ar markeringen av egna
// svaga stallen, och den slas av och pa har.

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SectionText } from "./SectionText";
import type { WeakSpan } from "@/lib/weakSpots";

export interface ReadingSection {
  id:      string;
  name:    string;
  content: string;
  /** Delens namn, nar verket har delar. */
  partName: string | null;
}

interface Props {
  workId:    string;
  workTitle: string;
  author:    string;
  section:   ReadingSection;
  /** 1-baserat, for "Section 4 of 12". */
  position:  number;
  total:     number;
  prevId:    string | null;
  nextId:    string | null;
  firstId:   string;
  isPro:     boolean;
  /**
   * Fardigraknade stallen. Tomt nar historik saknas, nar anvandaren inte
   * har Pro, eller nar sektionen sitter — servern har redan avgjort det.
   */
  spans:     WeakSpan[];
  /** Sant nar det finns nog med historik for att markeringen ska betyda nagot. */
  hasHistory: boolean;
}

const SEEN_KEY = "rhapsode.weakspots.explained";

const WORST_LABEL: Record<"moderate" | "strong" | "severe", string> = {
  moderate: "needs a look",
  strong:   "needs practice",
  severe:   "keeps slipping",
};

export function ReadingView({
  workId, workTitle, author, section, position, total,
  prevId, nextId, firstId, isPro, spans, hasHistory,
}: Props) {
  const router = useRouter();

  const [highlight, setHighlight] = useState(false);
  const [explained, setExplained] = useState(true);

  const canHighlight = isPro && hasHistory;
  const done = nextId === null;

  // Forklaringen visas EN gang, forsta gangen nagon slar pa markeringen.
  // Att upprepa den vid varje sektion vore att forklara samma sak tolv
  // ganger for den som redan forstatt.
  useEffect(() => {
    try {
      setExplained(window.localStorage.getItem(SEEN_KEY) === "1");
    } catch {
      // Privat lage, eller blockerad lagring. Da visas den inte alls,
      // vilket ar battre an att den visas vid varje sektion.
      setExplained(true);
    }
  }, []);

  function toggle(on: boolean) {
    setHighlight(on);
    if (on && !explained) {
      try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* strunt i det */ }
    }
  }

  // Piltangenter bladdrar. Den som laser en pjas pa fyrtio sektioner ska
  // inte behova sikta med musen fyrtio ganger.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

      if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        router.push(`/work/${workId}/read/${nextId}`);
      }
      if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        router.push(`/work/${workId}/read/${prevId}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workId, nextId, prevId, router]);

  const showing = highlight ? spans : [];

  // Varsta graden i sektionen, for en rad text vid genvagen till ovningen.
  const worst =
    spans.some(sp => sp.severity === "severe")   ? "severe" as const
    : spans.some(sp => sp.severity === "strong") ? "strong" as const
    : spans.length > 0                           ? "moderate" as const
    : null;

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 24px 90px" }}>
      <Link href={`/work/${workId}`} style={backLink}>← {workTitle}</Link>

      {/* ── Var man ar ── */}
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: "12px", flexWrap: "wrap", marginBottom: "6px",
      }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--gold)" }}>
          Section {position} of {total}
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted)" }}>{author}</p>
      </div>

      <h1 style={{
        fontFamily: "var(--fd)", fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 300,
        color: "var(--parch)", letterSpacing: "0.02em", marginBottom: "10px", lineHeight: 1.2,
      }}>
        {section.partName ? `${section.partName} · ${section.name}` : section.name}
      </h1>

      <div style={{ height: "3px", background: "var(--bg4)", borderRadius: "2px", marginBottom: "22px" }}>
        <div style={{
          height: "100%", width: `${Math.round((position / total) * 100)}%`,
          background: "linear-gradient(90deg, var(--gold2), var(--gold))",
          borderRadius: "2px", transition: "width .35s ease",
        }} />
      </div>

      {/* ── Markeringen ── */}
      <WeakSpotToggle
        isPro={isPro}
        hasHistory={hasHistory}
        canHighlight={canHighlight}
        on={highlight}
        onChange={toggle}
        found={spans.length}
      />

      {highlight && !explained && spans.length > 0 && (
        <p style={notice}>
          Your weak spots are highlighted in orange, based on where the text has
          actually slipped in your own practice. They fade as it starts to hold.
        </p>
      )}

      {/*
        Vagen fran "har tappar jag det" till att gora nagot at det.
        Lander i Write och inte i Read: att svara pa "ova det har" med att
        visa texten vore att racka over facit.
      */}
      {highlight && spans.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
          marginTop: "10px", padding: "10px 14px",
          background: "rgba(214,140,58,0.08)",
          border: "1px solid rgba(214,140,58,0.28)",
          borderRadius: "var(--r3)",
        }}>
          <span style={{ fontSize: "12.5px", color: "var(--parch2)", flex: "1 1 auto" }}>
            {spans.length === 1
              ? "One weak spot in this section"
              : `${spans.length} weak spots in this section`}
            {worst && ` · worst: ${WORST_LABEL[worst]}`}
          </span>
          <Link
            href={`/practice/${workId}/${section.id}?mode=write`}
            style={{
              padding: "7px 14px", borderRadius: "var(--r3)",
              background: "transparent",
              border: "1px solid rgba(214,140,58,0.5)",
              color: "#D68C3A", fontSize: "12.5px",
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Practise these →
          </Link>
        </div>
      )}

      {/* ── Texten ── */}
      <div style={{ margin: "26px 0 34px" }}>
        <SectionText content={section.content} spans={showing} />
      </div>

      {/* ── Slutet ── */}
      {done && (
        <div style={endBox}>
          <p style={{ fontFamily: "var(--fd)", fontSize: "22px", color: "var(--gold)", marginBottom: "8px" }}>
            That is the whole of it
          </p>
          <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.7, marginBottom: "16px" }}>
            You have read {workTitle} from beginning to end — {total}{" "}
            {total === 1 ? "section" : "sections"}. Read it again, or start
            putting it to memory.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href={`/work/${workId}/read/${firstId}`} style={ghostBtn}>
              ↺ Read from the top
            </Link>
            <Link href={`/practice/${workId}/${section.id}`} style={primaryBtn}>
              Practise this section
            </Link>
          </div>
        </div>
      )}

      {/* ── Bladdringen ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        flexWrap: "wrap", marginTop: "10px",
      }}>
        {prevId ? (
          <Link href={`/work/${workId}/read/${prevId}`} style={ghostBtn}>← Previous</Link>
        ) : (
          <span style={{ ...ghostBtn, opacity: 0.35, cursor: "default" }}>← Previous</span>
        )}

        <div style={{ flex: 1 }} />

        <Link href={`/practice/${workId}/${section.id}`} style={ghostBtn}>
          Practise this section
        </Link>

        {nextId && (
          <Link href={`/work/${workId}/read/${nextId}`} style={primaryBtn}>
            Next Section →
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Rutan som slar pa markeringen.
 *
 * Tre lagen, och alla tre sager nagot sant:
 *
 *   Pro med historik   — gar att kryssa i.
 *   Pro utan historik  — avstangd, med skalet: ova texten forst.
 *   Utan Pro           — synlig med PRO-markering, sa att man vet att den
 *                        finns och vad den gor.
 *
 * Kravet var att inte visa den alls utan historik ELLER visa den
 * avstangd med en forklaring. Det senare ar valt: en kryssruta som
 * forsvinner och dyker upp igen ar svarare att forsta an en som star
 * kvar och beratter varfor den inte gar att anvanda an.
 */
function WeakSpotToggle({
  isPro, hasHistory, canHighlight, on, onChange, found,
}: {
  isPro: boolean; hasHistory: boolean; canHighlight: boolean;
  on: boolean; onChange: (v: boolean) => void; found: number;
}) {
  const id = "weak-spot-toggle";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
      padding: "11px 14px", background: "var(--bg2)",
      border: "1px solid var(--bord)", borderRadius: "var(--r2)",
    }}>
      <input
        id={id}
        type="checkbox"
        checked={on && canHighlight}
        disabled={!canHighlight}
        onChange={e => onChange(e.target.checked)}
        style={{ width: "16px", height: "16px", accentColor: "#D68C3A", cursor: canHighlight ? "pointer" : "default" }}
      />
      <label
        htmlFor={id}
        style={{
          fontSize: "13px", flex: "1 1 auto",
          color: canHighlight ? "var(--parch2)" : "var(--muted)",
          cursor: canHighlight ? "pointer" : "default",
        }}
      >
        Highlight my weak spots
        {!isPro && (
          <Link href="/settings/subscription" style={proTag}>PRO</Link>
        )}
        {isPro && !hasHistory && (
          <span style={{ display: "block", fontSize: "11.5px", color: "var(--muted)", marginTop: "3px" }}>
            Practise this text first to unlock personalised weak-spot highlights.
          </span>
        )}
        {canHighlight && on && found === 0 && (
          <span style={{ display: "block", fontSize: "11.5px", color: "var(--green)", marginTop: "3px" }}>
            Nothing weak here — this section is holding.
          </span>
        )}
      </label>
    </div>
  );
}

// ── Stilar ────────────────────────────────────────────────────────────
const backLink: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)",
  textDecoration: "none", display: "inline-block", marginBottom: "20px",
};
const primaryBtn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: "var(--r3)",
  background: "var(--gold)", border: "1px solid var(--gold)",
  color: "var(--bg)", fontSize: "13.5px",
  textDecoration: "none", whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  padding: "10px 16px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "13px",
  textDecoration: "none", whiteSpace: "nowrap",
};
const proTag: React.CSSProperties = {
  marginLeft: "8px", fontSize: "9.5px", letterSpacing: "0.14em",
  color: "var(--gold)", border: "1px solid rgba(200,164,80,0.4)",
  borderRadius: "999px", padding: "2px 7px", textDecoration: "none",
};
const notice: React.CSSProperties = {
  marginTop: "10px", padding: "10px 13px",
  background: "rgba(214,140,58,0.10)",
  border: "1px solid rgba(214,140,58,0.30)",
  borderRadius: "var(--r3)",
  fontSize: "12.5px", color: "var(--parch2)", lineHeight: 1.6,
};
const endBox: React.CSSProperties = {
  padding: "22px 24px", marginBottom: "18px",
  background: "var(--bg2)", border: "1px solid rgba(200,164,80,0.35)",
  borderRadius: "var(--r)",
};
