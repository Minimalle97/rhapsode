"use client";
// components/duels/DuelBanner.tsx
//
// Remsan overst pa ett verk som star i en tvekamp.
//
// Tre lagen, och de sager olika saker:
//
//   Klockan gar     — hur lang tid som ar kvar, och mot vem.
//   Tiden ar ute    — knappen som hamtar resultatet.
//   Avgjort         — resultatet, utfallt.
//
// Nar klockan gar ut byter remsan lage av sig sjalv, utan omladdning.
// Det ar hela skalet till att den ar en klientkomponent: en tvekamp som
// tar slut medan man sitter och ovar ska sagas till pa en gang.

import { useCountdown } from "./useCountdown";
import { DuelResults } from "./DuelResults";

interface Props {
  duelId:       string;
  workTitle:    string;
  endsAt:       string;
  opponentName: string;
  viewerId:     string;
  /** Sant nar den inbjudne ar gratis och lanar redskapen sa lange. */
  toolsOnLoan:  boolean;
}

export function DuelBanner({
  duelId, workTitle, endsAt, opponentName, viewerId, toolsOnLoan,
}: Props) {
  const { label, done } = useCountdown(endsAt);

  if (done) {
    return (
      <div style={{ marginBottom: "22px" }}>
        <DuelResults duelId={duelId} workTitle={workTitle} viewerId={viewerId} />
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(106,158,106,0.07)",
      border: "1px solid rgba(106,158,106,0.35)",
      borderRadius: "var(--r)",
      padding: "14px 18px",
      marginBottom: "22px",
      display: "flex", alignItems: "center",
      gap: "14px", flexWrap: "wrap",
    }}>
      <span style={{
        fontFamily: "var(--fd)", fontSize: "20px",
        color: "var(--green)", lineHeight: 1,
      }}>
        ⚔
      </span>

      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <p style={{ fontSize: "13px", color: "var(--parch)", marginBottom: "2px" }}>
          Duel against {opponentName}
        </p>
        <p style={{ fontSize: "11.5px", color: "var(--muted)" }}>
          Whoever holds the most words wins
          {toolsOnLoan && " · Pro tools are open on this work while it runs"}
        </p>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{
          fontFamily: "var(--fd)", fontSize: "22px", fontWeight: 300,
          color: "var(--green)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
        }}>
          {label}
        </p>
        <p style={{
          fontSize: "10px", letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--muted)",
        }}>
          left
        </p>
      </div>
    </div>
  );
}
