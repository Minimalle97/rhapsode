// components/friends/SharedWorks.tsx
//
// Vannens bibliotek: vad de arbetar med och hur langt de kommit.
//
// Tva olika matt star bredvid varandra, och de betyder olika saker:
//
//   Andelen sektioner som sitter — vad OVANDET gett. Rors varje gang de
//   repeterar, och gar bade upp och ned.
//
//   Framforandena — hur manga hela genomforanden fran minnet som klarat
//   sig. Det ar det som ger mastartiteln, och det ar strangare.
//
// Sektionernas namn och text visas aldrig. Att nagon kommit halvvags ar
// ett framsteg; att de fastnat pa rad fyra ar deras ensak.

import { MASTERY_COLOR, MASTERY_LABEL } from "@/lib/mastery";
import type { SharedWork } from "@/lib/sharedLibrary";

export function SharedWorks({ works }: { works: SharedWork[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {works.map(w => (
        <div
          key={w.id}
          style={{
            background: "var(--bg2)",
            // Den roda ramen ar Performance Mode-sprakets egen: den star
            // for en titel som galler just nu, inte for nagot fel.
            border: `1px solid ${w.standing.isMastered ? "rgba(178,74,74,0.42)" : "var(--bord)"}`,
            borderRadius: "var(--r2)",
            padding: "13px 16px",
          }}
        >
          <div style={{
            display: "flex", alignItems: "baseline",
            gap: "10px", flexWrap: "wrap", marginBottom: "9px",
          }}>
            <p style={{ fontSize: "14px", color: "var(--parch)", flex: "1 1 auto", minWidth: 0 }}>
              {w.title}
            </p>
            {w.standing.isMastered && (
              <span style={badge}>Mastered</span>
            )}
          </div>

          <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>
            {w.author} · {w.type.toLowerCase()}
          </p>

          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: "11px", color: "var(--muted)", marginBottom: "5px",
          }}>
            <span style={{ color: MASTERY_COLOR[w.level] }}>{MASTERY_LABEL[w.level]}</span>
            <span>
              {w.percent}% of {w.sections} {w.sections === 1 ? "section" : "sections"}
            </span>
          </div>

          <div style={bar}>
            <div style={{
              height: "100%",
              width: `${w.percent}%`,
              background: MASTERY_COLOR[w.level],
              opacity: 0.85,
            }} />
          </div>

          {w.standing.passed > 0 && (
            <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "8px" }}>
              {w.standing.passed} of {w.standing.required} performances
              {w.standing.bestAccuracy !== null && ` · best ${w.standing.bestAccuracy}%`}
              {/*
                Klockan syns aven har. Titeln ar densamma pa profilen som i
                biblioteket, och da ska villkoret for att behalla den vara
                lika synligt — annars ser en besokare en rod ram som redan
                halls pa att slockna utan att nagot antyder det.
              */}
              {w.standing.isMastered && w.standing.daysUntilLapse !== null && (
                <span style={{ color: "var(--red)" }}>
                  {" · "}
                  {w.standing.daysUntilLapse <= 0
                    ? "must perform today"
                    : `${w.standing.daysUntilLapse}d to perform`}
                </span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

const badge: React.CSSProperties = {
  fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
  color: "var(--red)", border: "1px solid rgba(178,74,74,0.35)",
  borderRadius: "999px", padding: "2px 9px", flexShrink: 0,
};
const bar: React.CSSProperties = {
  height: "3px", background: "var(--bg4)",
  borderRadius: "2px", overflow: "hidden",
};
