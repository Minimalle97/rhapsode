"use client";
// components/repertoire/GroupCard.tsx
//
// En grupp i repertoaren, med stapel och las.
//
// Lasset har tre lagen och de sager tre olika saker:
//
//   stangt    — gruppen ar inte klar. Visar hur manga som aterstar.
//   oppningsbart — gruppen ar klar. Klicka for att ta barden.
//   oppet     — barden ar din och gar att bara fran profilen.
//
// Lasset ritas aven for den som inte har Pro, och det ar med flit. Att
// dolja det hade betytt att en gratisanvandare som just tagit hela
// Shakespeare inte fick veta att det finns nagot bakom. Trycker de pa det
// far de veta vad som kravs — men medaljen har de redan.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { borderById } from "@/lib/repertoire/borders";

interface Props {
  progress: {
    id: string; numeral: string; name: string; blurb: string;
    held: number; started: number; total: number;
    percent: number; complete: boolean;
  };
  award: { earned: boolean; unlocked: boolean } | null;
  isPro: boolean;
}

export function GroupCard({ progress: p, award, isPro }: Props) {
  const router = useRouter();
  const border = borderById(p.id);

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlocked = award?.unlocked === true;
  const earned   = award?.earned === true;

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/repertoire/border", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ groupId: p.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error === "upgrade_required"
            ? json.message ?? "Rhapsode Pro opens this up."
            : json.error ?? "Could not unlock"
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: "var(--bg2)",
      border: `1px solid ${p.complete ? "rgba(106,158,106,0.45)" : "var(--bord)"}`,
      borderRadius: "var(--r)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <Link href={`/repertoire/${p.id}`} style={{ textDecoration: "none", flex: 1 }}>
        <div style={{ padding: "18px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
            <span style={{
              fontSize: "10px", letterSpacing: "0.2em",
              color: p.complete ? "var(--green)" : "var(--gold)",
            }}>
              {p.numeral}
            </span>
            {p.complete && (
              <span style={{
                fontSize: "10px", letterSpacing: "0.14em",
                textTransform: "uppercase", color: "var(--green)",
              }}>
                Complete
              </span>
            )}
          </div>

          <h2 style={{
            fontFamily: "var(--fd)", fontSize: "19px", fontWeight: 400,
            color: "var(--parch)", lineHeight: 1.25, marginBottom: "6px",
          }}>
            {p.name}
          </h2>

          {p.blurb && (
            <p style={{
              fontSize: "12px", color: "var(--muted)",
              lineHeight: 1.55, marginBottom: "14px",
            }}>
              {p.blurb}
            </p>
          )}

          <div style={{
            height: "5px", background: "var(--bg4)", borderRadius: "3px",
            overflow: "hidden", marginBottom: "8px", position: "relative",
          }}>
            {/* Pabörjat i dampad ton under, hallet i gront over — samma
                tvalagersgrepp som verkssidan anvander. */}
            <div style={{
              position: "absolute", inset: 0,
              width: `${p.total ? Math.round((p.started / p.total) * 100) : 0}%`,
              background: "rgba(106,158,106,0.18)",
            }} />
            <div style={{
              position: "relative", height: "100%", width: `${p.percent}%`,
              background: p.complete
                ? "var(--green)"
                : "linear-gradient(90deg, rgba(106,158,106,0.65), var(--green))",
              transition: "width .5s ease",
            }} />
          </div>

          <p style={{ fontSize: "11.5px", color: "var(--muted)" }}>
            {p.held} of {p.total} held
            {p.started > p.held && ` · ${p.started - p.held} in progress`}
          </p>
        </div>
      </Link>

      {/* ── Lasset ── */}
      <div style={{
        borderTop: "1px solid var(--bord)",
        padding: "10px 14px",
        display: "flex", alignItems: "center", gap: "10px",
        background: unlocked ? "rgba(106,158,106,0.06)" : "transparent",
      }}>
        {border && (
          <span
            aria-hidden
            style={{
              width: "22px", height: "22px", borderRadius: "50%",
              background: `linear-gradient(${border.angle}deg, ${border.from}, ${border.to})`,
              opacity: unlocked ? 1 : 0.3,
              flexShrink: 0,
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: "11.5px",
            color: unlocked ? "var(--green)" : "var(--muted)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {unlocked
              ? "Border unlocked"
              : earned
                ? "Border ready"
                : `${p.total - p.held} more to unlock`}
          </p>
        </div>

        {unlocked ? (
          <Link href="/profile#borders" style={ghostBtn}>Wear it</Link>
        ) : earned ? (
          <button onClick={unlock} disabled={busy} style={unlockBtn}>
            {busy ? "…" : isPro ? "🔓 Unlock" : "🔒 Unlock"}
          </button>
        ) : (
          <span aria-hidden style={{ fontSize: "13px", color: "var(--bg4)" }}>🔒</span>
        )}
      </div>

      {error && (
        <p style={{
          fontSize: "11.5px", color: "var(--red)", lineHeight: 1.5,
          padding: "0 14px 12px",
        }}>
          {error}{" "}
          {!isPro && (
            <Link href="/settings/subscription" style={{ color: "var(--gold)" }}>
              See Pro
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

const unlockBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid rgba(106,158,106,0.45)",
  color: "var(--green)", fontSize: "11.5px", cursor: "pointer",
  whiteSpace: "nowrap", flexShrink: 0,
};
const ghostBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "11.5px",
  textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
};
