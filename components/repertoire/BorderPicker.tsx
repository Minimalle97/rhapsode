"use client";
// components/repertoire/BorderPicker.tsx
//
// Valjaren for profilbardar.
//
// Visar ALLA tjugofyra, inte bara de man tagit. En laslista dar man inte
// ser vad som finns att ta ar ingen laslista — och de lasta ar det som
// gor de upplasta varda nagot.
//
// Tre lagen per ruta:
//
//   upplast — gar att valja
//   klar men last — gruppen ar tagen, lasset sitter kvar (kraver Pro)
//   olast  — gruppen ar inte klar an. Dampad, med hur manga som fattas.
//
// Servern provar valet en gang till. Den har filen far inte vara det enda
// som star mellan nagon och en bard de inte fortjanat.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BORDERS } from "@/lib/repertoire/borders";

export interface BorderState {
  /** Gruppens slug. */
  id:       string;
  /** Gruppen ar avklarad. */
  earned:   boolean;
  /** Lasset ar oppnat och barden gar att bara. */
  unlocked: boolean;
  /** Hur manga dikter som aterstar i gruppen. */
  remaining: number;
}

interface Props {
  states:  BorderState[];
  /** Vad som bars just nu, eller null. */
  current: string | null;
  isPro:   boolean;
}

export function BorderPicker({ states, current, isPro }: Props) {
  const router = useRouter();
  const byId   = new Map(states.map(s => [s.id, s]));

  const [busy, setBusy]     = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [worn, setWorn]     = useState<string | null>(current);

  async function choose(groupId: string | null) {
    setBusy(groupId ?? "none");
    setError(null);
    try {
      const res = await fetch("/api/repertoire/border", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ groupId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error === "upgrade_required"
            ? json.message ?? "Rhapsode Pro opens this up."
            : json.error ?? "Could not change it"
        );
      }
      setWorn(groupId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change it");
    } finally {
      setBusy(null);
    }
  }

  const anyUnlocked = states.some(s => s.unlocked);

  return (
    <div id="borders">
      <p style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.7, marginBottom: "18px" }}>
        Hold every poem in a group and its border is yours.{" "}
        {isPro
          ? "It shows on your picture everywhere you appear."
          : "Finishing a group earns the medal on any plan; wearing the border is part of Pro."}
      </p>

      {error && (
        <p style={{
          fontSize: "12px", color: "var(--red)", marginBottom: "14px",
          padding: "9px 12px", background: "rgba(192,95,114,0.08)",
          border: "1px solid rgba(192,95,114,0.25)", borderRadius: "var(--r3)",
        }}>
          {error}{" "}
          {!isPro && <Link href="/settings/subscription" style={{ color: "var(--gold)" }}>See Pro</Link>}
        </p>
      )}

      {anyUnlocked && (
        <button
          onClick={() => choose(null)}
          disabled={busy !== null || worn === null}
          style={{
            padding: "7px 14px", borderRadius: "var(--r3)", cursor: "pointer",
            background: "transparent",
            border: `1px solid ${worn === null ? "var(--gold)" : "var(--bord)"}`,
            color: worn === null ? "var(--gold)" : "var(--parch2)",
            fontSize: "12px", marginBottom: "14px",
          }}
        >
          {worn === null ? "No border · worn" : "Wear no border"}
        </button>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
        gap: "10px",
      }}>
        {BORDERS.map(b => {
          const s        = byId.get(b.id);
          const unlocked = s?.unlocked ?? false;
          const earned   = s?.earned ?? false;
          const isWorn   = worn === b.id;

          return (
            <button
              key={b.id}
              onClick={() => unlocked && !isWorn && choose(b.id)}
              disabled={!unlocked || busy !== null}
              title={
                unlocked ? b.name
                : earned  ? `${b.name} — finished, still locked`
                : `${b.name} — ${s?.remaining ?? 0} poems to go`
              }
              style={{
                background: isWorn ? "var(--gold4)" : "var(--bg2)",
                border: `1px solid ${isWorn ? "var(--gold)" : "var(--bord)"}`,
                borderRadius: "var(--r2)",
                padding: "14px 10px 11px",
                cursor: unlocked && !isWorn ? "pointer" : "default",
                opacity: unlocked ? 1 : 0.42,
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: "8px",
                textAlign: "center",
              }}
            >
              {/* Ringen som prov, med en tom mitt — samma gradient som
                  runt bilden, sa att det som valjs ar det som visas. */}
              <span style={{
                width: "44px", height: "44px", borderRadius: "50%",
                background: `linear-gradient(${b.angle}deg, ${b.from}, ${b.to})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                filter: unlocked ? "none" : "grayscale(0.7)",
              }}>
                <span style={{
                  width: "34px", height: "34px", borderRadius: "50%",
                  background: "var(--bg2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "14px", color: unlocked ? b.from : "var(--bg4)",
                }}>
                  {unlocked ? b.mark : "🔒"}
                </span>
              </span>

              <span style={{
                fontSize: "11px", lineHeight: 1.35,
                color: isWorn ? "var(--gold)" : "var(--parch2)",
              }}>
                {b.name}
              </span>

              <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                {isWorn ? "Worn"
                  : unlocked ? "Ready"
                  : earned ? "Locked"
                  : `${s?.remaining ?? 0} to go`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
