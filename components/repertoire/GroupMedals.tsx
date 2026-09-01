// components/repertoire/GroupMedals.tsx
//
// Medaljerna for avklarade grupper ur repertoaren.
//
// Egen sektion, skild fran verksmedaljerna ovanfor. Skalet ar att de
// betyder olika saker: en verksmedalj star for EN text som sitter, den
// har for hela gruppen den ingar i. Att blanda dem hade gjort en grupp pa
// sjuttio dikter till en rad bland sjuttio andra.
//
// Delas ut oavsett plan. Det ar bara barden som kraver Pro, och den
// skillnaden sags rakt ut har i stallet for att marka en medalj som
// halvfardig.

import { borderById } from "@/lib/repertoire/borders";

export interface GroupMedalRow {
  id:       string;
  name:     string;
  numeral:  string;
  total:    number;
  earnedAt: string;
  unlocked: boolean;
}

export function GroupMedals({ awards }: { awards: GroupMedalRow[] }) {
  if (awards.length === 0) return null;

  return (
    <>
      <div style={{
        marginBottom: "12px", marginTop: "36px",
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
      }}>
        <h2 style={{
          fontFamily: "var(--fd)", fontSize: "22px", fontWeight: 300,
          color: "var(--parch)", letterSpacing: "0.06em",
        }}>
          Groups held entire
        </h2>
        <span style={{ fontSize: "12px", color: "var(--muted)" }}>
          {awards.length} of 24
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {awards.map(a => {
          const border = borderById(a.id);
          const date = new Date(a.earnedAt).toLocaleDateString("en-GB", {
            day: "numeric", month: "long", year: "numeric",
          });

          return (
            <div key={a.id} style={{
              background: "var(--bg2)",
              border: "1px solid rgba(106,158,106,0.32)",
              borderRadius: "var(--r)",
              padding: "18px 20px",
              display: "flex", gap: "16px", alignItems: "center",
            }}>
              <span
                aria-hidden
                style={{
                  width: "44px", height: "44px", borderRadius: "50%",
                  background: border
                    ? `linear-gradient(${border.angle}deg, ${border.from}, ${border.to})`
                    : "var(--gold4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{
                  width: "34px", height: "34px", borderRadius: "50%",
                  background: "var(--bg2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "15px", color: border?.from ?? "var(--gold)",
                }}>
                  {border?.mark ?? "✦"}
                </span>
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: "var(--fd)", fontSize: "17px",
                  color: "var(--parch)", marginBottom: "2px", lineHeight: 1.3,
                }}>
                  {a.name}
                </p>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "2px" }}>
                  {a.numeral} · all {a.total} held
                </p>
                <p style={{ fontSize: "11px", color: "var(--muted)", opacity: 0.75 }}>
                  Earned {date}
                  {a.unlocked ? " · border unlocked" : " · border still locked"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
