"use client";
// components/duels/DuelInvite.tsx
//
// Utmaningen, sedd fran den andres profil.
//
// Ligger hopfalld tills nagon ber om den. En knapp som oppnar ett val ar
// arligare an ett formular som star framme: det ar inte det man kom till
// profilen for att gora.
//
// Knappen ritas for alla, ocksa for den som inte har Pro. Ett hanglas
// som gar att trycka pa och som beratter vad som ligger bakom sager mer
// an ingenting alls — och det ar servern, inte den har filen, som
// bestammer om inbjudan far skickas.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface WorkOption {
  id: string; title: string; author: string; sections: number;
}
interface Duration {
  minutes: number; label: string; hint: string;
}

interface Props {
  opponentId:   string;
  opponentName: string;
  /** Sant nar betraktaren far bjuda in. Servern kontrollerar det igen. */
  canInvite:    boolean;
  /**
   * Kampen som redan pagar med den har personen, eller null.
   *
   * Utan den erbjod knappen en ny utmaning till nagon man redan slogs
   * mot. Servern avvisade den, men forst efter att man tryckt — och
   * ingenstans pa profilen stod det att man var mitt i nagot med dem.
   */
  duel: {
    id: string; status: "pending" | "active"; mine: boolean;
    workTitle: string; endsAt: string | null;
  } | null;
}

export function DuelInvite({ opponentId, opponentName, canInvite, duel }: Props) {
  const router = useRouter();

  const [open, setOpen]         = useState(false);
  const [works, setWorks]       = useState<WorkOption[] | null>(null);
  const [durations, setDur]     = useState<Duration[]>([]);
  const [workId, setWorkId]     = useState("");
  const [minutes, setMinutes]   = useState(60);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [sent, setSent]         = useState(false);

  // Verken hamtas forst nar rutan oppnas. Att lasa hela biblioteket vid
  // varje profilbesok vore att betala for nagot nastan ingen ber om.
  useEffect(() => {
    if (!open || works !== null) return;
    void (async () => {
      try {
        const res  = await fetch("/api/duels");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load");
        setWorks(json.works ?? []);
        setDur(json.durations ?? []);
        if (json.works?.[0]) setWorkId(json.works[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load");
        setWorks([]);
      }
    })();
  }, [open, works]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/duels", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ opponentId, workId, minutes }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error === "upgrade_required"
            ? json.message ?? "Rhapsode Pro opens this up."
            : json.error ?? "Could not send"
        );
      }
      setSent(true);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div style={panel}>
        <p style={{ fontSize: "13px", color: "var(--green)" }}>
          Challenge sent. It starts when {opponentName} accepts.
        </p>
      </div>
    );
  }

  // Redan i en kamp med dem: sag det, och peka dit i stallet.
  if (duel) {
    const active = duel.status === "active";
    return (
      <div style={{ ...panel, marginTop: "8px", padding: "13px 15px" }}>
        <p style={{ fontSize: "13px", color: "var(--green)", marginBottom: "3px" }}>
          ⚔ {active
            ? `You are in a duel with ${opponentName}`
            : duel.mine
              ? `Waiting for ${opponentName} to answer`
              : `${opponentName} has challenged you`}
        </p>
        <p style={{ fontSize: "11.5px", color: "var(--muted)", marginBottom: active ? "11px" : "0" }}>
          {duel.workTitle}
          {active && duel.endsAt && ` · ends ${new Date(duel.endsAt).toLocaleString([], {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          })}`}
        </p>
        {active ? (
          <Link href={`/duel/${duel.id}`} style={{ ...primary, padding: "7px 14px", fontSize: "12.5px" }}>
            Go to the duel
          </Link>
        ) : (
          <Link href="/friends" style={{ fontSize: "11.5px", color: "var(--gold)" }}>
            Answer it on Friends →
          </Link>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={openBtn}>
        ⚔ Challenge to a duel
        {!canInvite && <span style={{ color: "var(--gold)", marginLeft: "7px" }}>Pro</span>}
      </button>
    );
  }

  // Utan Pro: sag vad det ar och var man far det, och stang.
  if (!canInvite) {
    return (
      <div style={panel}>
        <p style={heading}>A duel</p>
        <p style={body}>
          You and {opponentName} take the same text and the same clock. Whoever
          holds the most of it when time runs out takes the medal — and you both
          keep the work.
        </p>
        <p style={{ ...body, marginBottom: "16px" }}>
          Sending a challenge is part of Rhapsode Pro. Accepting one is not:
          anyone can be challenged, and both sides get the same tools for as
          long as the clock runs.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Link href="/settings/subscription" style={primary}>See Rhapsode Pro</Link>
          <button onClick={() => setOpen(false)} style={ghost}>Not now</button>
        </div>
      </div>
    );
  }

  return (
    <div style={panel}>
      <p style={heading}>Challenge {opponentName}</p>
      <p style={body}>
        They get a copy of the work you pick, with the same tools you have.
        Whoever holds the most words when the clock runs out wins.
      </p>

      {works === null ? (
        <div className="skeleton" style={{ height: "80px", marginBottom: "14px" }} />
      ) : works.length === 0 ? (
        <p style={{ ...body, color: "var(--muted)" }}>
          You have nothing to stake yet. Add a work with at least one section first.
        </p>
      ) : (
        <>
          <label style={label} htmlFor="duel-work">The work</label>
          <select
            id="duel-work"
            value={workId}
            onChange={e => setWorkId(e.target.value)}
            style={field}
          >
            {works.map(w => (
              <option key={w.id} value={w.id}>
                {w.title} — {w.author} ({w.sections} {w.sections === 1 ? "section" : "sections"})
              </option>
            ))}
          </select>

          <label style={{ ...label, marginTop: "16px" }}>How long</label>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "7px" }}>
            {durations.map(d => (
              <button
                key={d.minutes}
                onClick={() => setMinutes(d.minutes)}
                style={{
                  ...chip,
                  borderColor: minutes === d.minutes ? "var(--gold)" : "var(--bord)",
                  color:       minutes === d.minutes ? "var(--gold)" : "var(--parch2)",
                  background:  minutes === d.minutes ? "var(--gold4)" : "transparent",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: "11.5px", color: "var(--muted)", marginBottom: "18px", minHeight: "16px" }}>
            {durations.find(d => d.minutes === minutes)?.hint}
          </p>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={send}
              disabled={busy || !workId}
              style={{ ...primary, opacity: busy || !workId ? 0.45 : 1 }}
            >
              {busy ? "…" : "Send challenge"}
            </button>
            <button onClick={() => setOpen(false)} disabled={busy} style={ghost}>
              Cancel
            </button>
          </div>
        </>
      )}

      {error && <p style={errorText}>{error}</p>}
    </div>
  );
}

// ── Stilar ────────────────────────────────────────────────────────────
const openBtn: React.CSSProperties = {
  padding: "8px 15px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid rgba(106,158,106,0.4)",
  color: "var(--green)", fontSize: "13px", cursor: "pointer",
  marginTop: "8px",
};
const panel: React.CSSProperties = {
  marginTop: "12px", padding: "18px 20px",
  background: "var(--bg2)", border: "1px solid rgba(106,158,106,0.28)",
  borderRadius: "var(--r)",
};
const heading: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "19px",
  color: "var(--parch)", marginBottom: "8px",
};
const body: React.CSSProperties = {
  fontSize: "13px", color: "var(--parch2)",
  lineHeight: 1.65, marginBottom: "16px",
};
const label: React.CSSProperties = {
  display: "block", fontSize: "10px", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "var(--muted)", marginBottom: "7px",
};
const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  background: "var(--bg)", border: "1px solid var(--bord)",
  borderRadius: "var(--r3)", color: "var(--parch)",
  fontSize: "13px", outline: "none",
};
const chip: React.CSSProperties = {
  padding: "7px 13px", borderRadius: "999px",
  border: "1px solid var(--bord)", background: "transparent",
  fontSize: "12.5px", cursor: "pointer",
};
const primary: React.CSSProperties = {
  padding: "9px 18px", borderRadius: "var(--r3)",
  background: "var(--green)", border: "1px solid var(--green)",
  color: "var(--bg)", fontSize: "13px", cursor: "pointer",
  textDecoration: "none", display: "inline-block",
};
const ghost: React.CSSProperties = {
  padding: "9px 15px", borderRadius: "var(--r3)",
  background: "transparent", border: "1px solid var(--bord)",
  color: "var(--parch2)", fontSize: "13px", cursor: "pointer",
};
const errorText: React.CSSProperties = {
  fontSize: "12px", color: "var(--red)", marginTop: "12px",
  padding: "9px 12px", background: "rgba(192,95,114,0.08)",
  border: "1px solid rgba(192,95,114,0.25)", borderRadius: "var(--r3)",
};
