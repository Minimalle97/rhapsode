"use client";
// components/medals/MedalCard.tsx
// Uppdaterad version av Fas 2 — identisk API men renare hover-effekt och fixad syntax

interface MedalCardProps {
  title:     string;
  workTitle: string;
  author:    string;
  type:      string;
  earnedAt:  string | Date;
  /**
   * work        = alla sektioner bemastrade (guld)
   * performance = tio framforanden (rod)
   * battle      = vunnen tvekamp (gron)
   */
  kind?:     "work" | "performance" | "battle";
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
  // Tvekampen har sin egen glyf. En vunnen strid ar inte samma sorts sak
  // som en bemastrad text, och den ska inte lana textsortens tecken.
  const isPerformance = kind === "performance";
  const isBattle      = kind === "battle";
  const glyph = isBattle ? "⚔" : TYPE_GLYPHS[type] ?? "◇";
  const lost   = Boolean(lostAt);

  const accent = lost
    ? "var(--bg4)"
    : isBattle ? "var(--green)" : isPerformance ? "var(--red)" : "var(--gold)";

  // Ramens vilolage foljer samma tre sorter.
  const restingBorder = lost
    ? "var(--bord)"
    : isBattle      ? "rgba(106,158,106,0.32)"
    : isPerformance ? "rgba(192,95,114,0.3)"
    :                 "var(--bord)";
  const date  = new Date(earnedAt).toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });

  return (
    <div style={{
      background:   "var(--bg2)",
      border:       `1px solid ${restingBorder}`,
      opacity:      lost ? 0.55 : 1,
      borderRadius: "var(--r)",
      padding:      "18px 20px",
      display:      "flex",
      gap:          "16px",
      alignItems:   "flex-start",
      transition:   "border-color .15s",
    }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = accent)}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = restingBorder)}
    >
      {/* Glyph seal */}
      <div style={{
        width:          "44px",
        height:         "44px",
        borderRadius:   "50%",
        border:         `1px solid ${
          lost            ? "rgba(200,164,80,0.35)"
          : isBattle      ? "rgba(106,158,106,0.42)"
          : isPerformance ? "rgba(192,95,114,0.4)"
          :                 "rgba(200,164,80,0.35)"
        }`,
        background:     !lost && isBattle      ? "rgba(106,158,106,0.09)"
                      : !lost && isPerformance ? "rgba(192,95,114,0.08)"
                      :                          "var(--gold4)",
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
          {nameWork
            ? title
            : isBattle      ? "Won a duel"
            : isPerformance ? "Performed from memory"
            :                 "A work held entire"}
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "2px" }}>
          {nameWork ? `${workTitle} · ${author}` : "A private work"}
        </p>
        <p style={{ fontSize: "11px", color: lost ? "var(--red)" : "var(--muted)", opacity: lost ? 1 : 0.7 }}>
          {lost ? "Lapsed — perform it again to relight it" : `Earned ${date}`}
          {isBattle && !lost && " · duel"}
        </p>
      </div>
    </div>
  );
}
