// components/practice/MasteryReminder.tsx
//
// Paminnelsen for den som har en mastartitel pa vag att falla.
//
// Serverkomponent — den hamtar sitt eget lage och visar ingenting alls
// nar det inte finns nagot att saga. Det ar avsiktligt: en ruta som alltid
// star dar slutar man se, och da fyller den ingen funktion den dagen den
// verkligen behovs.

import Link from "next/link";
import { masteryAlerts } from "@/lib/performanceStore";

export async function MasteryReminder({ userId }: { userId: string }) {
  const { atRisk, lapsed } = await masteryAlerts(userId);
  if (!atRisk.length && !lapsed.length) return null;

  return (
    <div style={{
      background:   "rgba(192,95,114,0.06)",
      border:       "1px solid rgba(192,95,114,0.28)",
      borderRadius: "var(--r)",
      padding:      "16px 20px",
      marginBottom: "22px",
    }}>
      <p style={{
        fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase",
        color: "var(--red)", marginBottom: "10px",
      }}>
        {lapsed.length ? "Lapsed" : "Slipping"}
      </p>

      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "9px" }}>
        {atRisk.map(a => (
          <li key={a.workId} style={{ fontSize: "13px", lineHeight: 1.6 }}>
            <Link href={`/work/${a.workId}/perform`} style={link}>
              <span style={{ color: "var(--parch)" }}>{a.title}</span>
              <span style={{ color: "var(--muted)" }}>
                {" — "}not performed in {a.standing.daysSinceLastPass} day
                {a.standing.daysSinceLastPass === 1 ? "" : "s"}. The title falls in{" "}
                {a.standing.daysUntilLapse} day{a.standing.daysUntilLapse === 1 ? "" : "s"}.
              </span>
            </Link>
          </li>
        ))}

        {lapsed.map(a => (
          <li key={a.workId} style={{ fontSize: "13px", lineHeight: 1.6 }}>
            <Link href={`/work/${a.workId}/perform`} style={link}>
              <span style={{ color: "var(--parch)" }}>{a.title}</span>
              <span style={{ color: "var(--muted)" }}>
                {" — "}the title has lapsed. Perform it again to bring it back.
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const link: React.CSSProperties = { textDecoration: "none" };
