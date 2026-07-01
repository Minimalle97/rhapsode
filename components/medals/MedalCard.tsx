"use client";
// components/medals/MedalCard.tsx
// Uppdaterad version av Fas 2 — identisk API men renare hover-effekt och fixad syntax

interface MedalCardProps {
  title:     string;
  workTitle: string;
  author:    string;
  type:      string;
  earnedAt:  string | Date;
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

export function MedalCard({ title, workTitle, author, type, earnedAt }: MedalCardProps) {
  const glyph = TYPE_GLYPHS[type] ?? "◇";
  const date  = new Date(earnedAt).toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });

  return (
    <div style={{
      background:   "var(--bg2)",
      border:       "1px solid var(--bord)",
      borderRadius: "var(--r)",
      padding:      "18px 20px",
      display:      "flex",
      gap:          "16px",
      alignItems:   "flex-start",
      transition:   "border-color .15s",
    }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(200,164,80,0.3)")}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--bord)")}
    >
      {/* Glyph seal */}
      <div style={{
        width:          "44px",
        height:         "44px",
        borderRadius:   "50%",
        border:         "1px solid rgba(200,164,80,0.35)",
        background:     "var(--gold4)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       "18px",
        color:          "var(--gold)",
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
          {title}
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "2px" }}>
          {workTitle} · {author}
        </p>
        <p style={{ fontSize: "11px", color: "var(--muted)", opacity: 0.7 }}>
          Earned {date}
        </p>
      </div>
    </div>
  );
}
