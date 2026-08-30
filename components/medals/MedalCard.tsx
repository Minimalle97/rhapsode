"use client";
// components/medals/MedalCard.tsx
// Uppdaterad version av Fas 2 — identisk API men renare hover-effekt och fixad syntax

interface MedalCardProps {
  title:     string;
  workTitle: string;
  author:    string;
  type:      string;
  earnedAt:  string | Date;
  /** work = alla sektioner bemastrade (guld). performance = tio framforanden (rod). */
  kind?:     "work" | "performance";
  /** Satt nar mastartiteln fallit. Medaljen visas slocknad, inte borttagen. */
  lostAt?:   string | Date | null;
  /**
   * Falskt for privata verk. Da visas medaljen utan att namnge texten —
   * bedriften ar din, men vad du ovar pa ar inte allas sak.
   */
  nameWork?: boolean;
}

const TYPE_GLYPHS: Record<string, string> = {
  POEM:          "✦",
  EPIC:          "⚔",
  PLAY:          "⬡",
  SPEECH:        "◈",
  PHILOSOPHICAL: "◉",
  RELIGIOUS:     "✧",
  PROFESSIONAL:  "◆",
  OTHER:         "◇",
};

export function MedalCard({
  title, workTitle, author, type, earnedAt,
  kind = "work", lostAt = null, nameWork = true,
}: MedalCardProps) {
  const glyph = TYPE_GLYPHS[type] ?? "◇";
  const isPerformance = kind === "performance";
  const lost   = Boolean(lostAt);

  const accent = lost
    ? "var(--bg4)"
    : isPerformance ? "var(--red)" : "var(--gold)";
  const date  = new Date(earnedAt).toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });

  return (
    <div style={{
      background:   "var(--bg2)",
      border:       `1px solid ${lost ? "var(--bord)" : isPerformance ? "rgba(192,95,114,0.3)" : "var(--bord)"}`,
      opacity:      lost ? 0.55 : 1,
      borderRadius: "var(--r)",
      padding:      "18px 20px",
      display:      "flex",
      gap:          "16px",
      alignItems:   "flex-start",
      transition:   "border-color .15s",
    }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = accent)}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor =
        lost ? "var(--bord)" : isPerformance ? "rgba(192,95,114,0.3)" : "var(--bord)")}
    >
      {/* Glyph seal */}
      <div style={{
        width:          "44px",
        height:         "44px",
        borderRadius:   "50%",
        border:         `1px solid ${isPerformance && !lost ? "rgba(192,95,114,0.4)" : "rgba(200,164,80,0.35)"}`,
        background:     isPerformance && !lost ? "rgba(192,95,114,0.08)" : "var(--gold4)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       "18px",
        color:          accent,
        flexShrink:     0,
      }}>
        {glyph}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily:   "var(--fd)",
          fontSize:     "16px",
          fontWeight:   400,
          color:        "var(--parch)",
          marginBottom: "3px",
          lineHeight:   1.3,
        }}>
          {nameWork ? title : isPerformance ? "Performed from memory" : "A work held entire"}
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "2px" }}>
          {nameWork ? `${workTitle} · ${author}` : "A private work"}
        </p>
        <p style={{ fontSize: "11px", color: lost ? "var(--red)" : "var(--muted)", opacity: lost ? 1 : 0.7 }}>
          {lost ? "Lapsed — perform it again to relight it" : `Earned ${date}`}
        </p>
      </div>
    </div>
  );
}
