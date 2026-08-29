"use client";
// components/billing/SubscriptionPanel.tsx
// Settings → Subscription.
//
// Uppsägning, kortbyte och kvitton görs i Stripes kundportal. Att bygga
// om det själv vore veckor av arbete för att landa på något sämre, och
// det skulle betyda att vi rörde kortuppgifter.

import { useState, type CSSProperties } from "react";

export interface SubscriptionView {
  plan:      "free" | "pro";
  source:    "none" | "stripe" | "grant" | "developer";
  status:    string;
  isPro:     boolean;
  monthly:   string;
  yearly:    string;
  yearlySaving: number;
  allowance: { used: number; limit: number | null; resetsAt: string };
  worksUsed: number;
  worksLimit: number | null;
  currentPeriodEnd:  string | null;
  cancelAtPeriodEnd: boolean;
  billingConfigured: boolean;
}

export function SubscriptionPanel({ view }: { view: SubscriptionView }) {
  const [busy, setBusy]   = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode]   = useState("");
  const [redeemed, setRedeemed] = useState<string | null>(null);

  async function post(path: string, body?: unknown) {
    const res = await fetch(path, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body ?? {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong");
    return data;
  }

  async function checkout(interval: "month" | "year") {
    setBusy(interval); setError(null);
    try {
      const data = await post("/api/billing/checkout", { interval });
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(null);
    }
  }

  async function portal() {
    setBusy("portal"); setError(null);
    try {
      const data = await post("/api/billing/portal");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the portal");
      setBusy(null);
    }
  }

  async function redeem() {
    if (!code.trim()) return;
    setBusy("redeem"); setError(null);
    try {
      await post("/api/billing/redeem", { code });
      setRedeemed("Access granted. Reloading…");
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not redeem that code");
    } finally {
      setBusy(null);
    }
  }

  const renews = view.currentPeriodEnd
    ? new Date(view.currentPeriodEnd).toLocaleDateString("sv-SE")
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* ── Nuvarande plan ─────────────────────────────────────────── */}
      <section style={card}>
        <p style={eyebrow}>Current plan</p>
        <p style={planName}>{view.isPro ? "Rhapsode Pro" : "Rhapsode"}</p>

        <p style={{ ...small, marginTop: "6px" }}>
          {view.source === "developer" && "Developer access. Not billed."}
          {view.source === "grant" && (
            renews
              ? `Granted access, through ${renews}.`
              : "Granted access, with no end date."
          )}
          {view.source === "stripe" && (
            view.cancelAtPeriodEnd || view.status === "cancelled"
              ? `Ends ${renews}. You keep everything until then.`
              : view.status === "past_due"
                ? `A payment didn't go through. Pro stays on until ${renews} — update your card in the portal.`
                : view.status === "trialing"
                  ? `Trial, through ${renews}.`
                  : `Renews ${renews}.`
          )}
          {view.source === "none" && "Everything at the heart of Rhapsode, at no cost."}
        </p>

        <dl style={statRow}>
          <div>
            <dt style={statLabel}>Generations this month</dt>
            <dd style={statValue}>
              {view.allowance.limit === null
                ? `${view.allowance.used}`
                : `${view.allowance.used} / ${view.allowance.limit}`}
            </dd>
          </div>
          <div>
            <dt style={statLabel}>Works</dt>
            <dd style={statValue}>
              {view.worksLimit === null
                ? `${view.worksUsed}`
                : `${view.worksUsed} / ${view.worksLimit}`}
            </dd>
          </div>
        </dl>

        {view.isPro && view.source === "stripe" && (
          <button onClick={portal} disabled={busy !== null} style={primary}>
            {busy === "portal" ? "Opening…" : "Manage subscription"}
          </button>
        )}
      </section>

      {/* ── Uppgradering ───────────────────────────────────────────── */}
      {!view.isPro && (
        <section style={card}>
          <p style={eyebrow}>Rhapsode Pro</p>
          <p style={{ ...planName, fontSize: "22px" }}>The whole apparatus</p>
          <p style={{ ...small, marginTop: "8px", lineHeight: 1.75 }}>
            Unlimited works. Closer analysis of what your recitation actually
            missed, and of how your rhythm holds. Exercises and glossaries built
            from the passage in front of you. Translation and a language mode for
            texts you are reading in the original. Study sessions shaped around
            the lines you keep losing.
          </p>

          <ul style={list}>
            {[
              "Unlimited saved and custom texts",
              "Advanced recitation and rhythm analysis",
              "Generated exercises, glossaries and translation",
              "Language mode and personalised study sessions",
              "Performance analysis and fuller progress statistics",
              "A larger monthly allowance for generated material",
            ].map(item => (
              <li key={item} style={listItem}>
                <span aria-hidden style={marker}>·</span>
                {item}
              </li>
            ))}
          </ul>

          {view.billingConfigured ? (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "18px" }}>
              <button onClick={() => checkout("month")} disabled={busy !== null} style={primary}>
                {busy === "month" ? "Opening…" : `${view.monthly} / month`}
              </button>
              <button onClick={() => checkout("year")} disabled={busy !== null} style={secondary}>
                {busy === "year" ? "Opening…" : `${view.yearly} / year`}
                {view.yearlySaving > 0 && (
                  <span style={{ color: "var(--muted)" }}> · saves {view.yearlySaving}%</span>
                )}
              </button>
            </div>
          ) : (
            <p style={{ ...small, marginTop: "16px", color: "var(--muted)" }}>
              Billing isn&apos;t configured on this deployment yet.
            </p>
          )}
        </section>
      )}

      {/* ── Kod ────────────────────────────────────────────────────── */}
      <section style={card}>
        <p style={eyebrow}>Access code</p>
        <p style={{ ...small, marginBottom: "12px" }}>
          If someone gave you a code, enter it here.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") redeem(); }}
            placeholder="RHAP-XXXX-XXXX-XXXX"
            spellCheck={false}
            autoComplete="off"
            style={input}
          />
          <button onClick={redeem} disabled={busy !== null || !code.trim()} style={secondary}>
            {busy === "redeem" ? "…" : "Redeem"}
          </button>
        </div>
        {redeemed && (
          <p style={{ fontSize: "12.5px", color: "var(--green)", marginTop: "10px" }}>{redeemed}</p>
        )}
      </section>

      {error && (
        <p style={{ fontSize: "13px", color: "var(--red)" }}>{error}</p>
      )}
    </div>
  );
}

// ── Stilar ────────────────────────────────────────────────────────────
const card: CSSProperties = {
  background:   "var(--bg2)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r)",
  padding:      "22px 24px",
};

const eyebrow: CSSProperties = {
  fontSize:      "10px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color:         "var(--gold)",
  marginBottom:  "10px",
};

const planName: CSSProperties = {
  fontFamily:    "var(--fd)",
  fontSize:      "26px",
  fontWeight:    300,
  color:         "var(--parch)",
  letterSpacing: "0.03em",
};

const small: CSSProperties = {
  fontSize:   "13px",
  color:      "var(--parch2)",
  lineHeight: 1.65,
};

const statRow: CSSProperties = {
  display:   "flex",
  gap:       "32px",
  marginTop: "18px",
  flexWrap:  "wrap",
};

const statLabel: CSSProperties = {
  fontSize:      "10px",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color:         "var(--muted)",
  marginBottom:  "4px",
};

const statValue: CSSProperties = {
  fontFamily: "var(--fd)",
  fontSize:   "20px",
  color:      "var(--parch)",
};

const list: CSSProperties = {
  listStyle:     "none",
  marginTop:     "16px",
  display:       "flex",
  flexDirection: "column",
  gap:           "7px",
};

const listItem: CSSProperties = {
  fontSize:    "13px",
  color:       "var(--parch2)",
  display:     "flex",
  gap:         "10px",
  lineHeight:  1.5,
};

const marker: CSSProperties = {
  color:      "var(--gold)",
  flexShrink: 0,
};

const primary: CSSProperties = {
  marginTop:    "18px",
  padding:      "10px 20px",
  borderRadius: "var(--r3)",
  border:       "1px solid var(--gold)",
  background:   "var(--gold3)",
  color:        "var(--gold)",
  fontSize:     "13px",
  cursor:       "pointer",
};

const secondary: CSSProperties = {
  padding:      "10px 20px",
  borderRadius: "var(--r3)",
  border:       "1px solid var(--bord)",
  background:   "transparent",
  color:        "var(--parch2)",
  fontSize:     "13px",
  cursor:       "pointer",
};

const input: CSSProperties = {
  flex:          "1 1 220px",
  padding:       "10px 13px",
  background:    "var(--bg3)",
  border:        "1px solid var(--bord)",
  borderRadius:  "var(--r3)",
  color:         "var(--parch)",
  fontSize:      "13px",
  letterSpacing: "0.08em",
  outline:       "none",
};
