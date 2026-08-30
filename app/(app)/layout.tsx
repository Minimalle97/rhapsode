// app/(app)/layout.tsx
// Layout för alla inloggade sidor.

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getRank, getNextRank, xpToNextRank } from "@/lib/xp";
import { RankBar } from "@/components/rank/RankBar";
import { NavTabs } from "@/components/nav/NavTabs";
import { SyncIndicator } from "@/components/sync/SyncIndicator";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user   = await requireUser();
  const ent    = await getEntitlements(user);
  const rank   = getRank(user.xp);
  const next   = getNextRank(user.xp);
  const toNext = xpToNextRank(user.xp);
  const pct    = next
    ? Math.round(
        ((user.xp - rank.xpRequired) / (next.xpRequired - rank.xpRequired)) * 100
      )
    : 100;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="app-nav">
        <Link
          href="/library"
          className="brand"
          aria-label={ent.isPro ? "Rhapsode Pro home" : "Rhapsode home"}
        >
          Rhap<span>sode</span>
          {ent.isPro && <em className="brand-pro">Pro</em>}
        </Link>

        <div style={{ flex: 1 }} />

        <div className="nav-desktop-only" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <SyncIndicator userId={user.id} />
          <RankBar
            xp={user.xp}
            rank={rank}
            nextRank={next}
            progressPct={pct}
            toNext={toNext}
            compact
          />
        </div>

        <NavTabs />

        {/*
          Utvecklarmarkoren. Finns for att svara pa en enda fraga utan att
          man behover leta i loggar: las servern RHAPSODE_DEVELOPER_USER_IDS,
          och kande den igen just det har kontot?

          Syns bara for den som faktiskt star i variabeln. En vanlig
          anvandare ser aldrig detta, och en Pro-prenumerant heller inte —
          det ar inte en niva, det ar en flagga.
        */}
        {ent.source === "developer" && (
          <span
            title="RHAPSODE_DEVELOPER_USER_IDS matched this account. Pro is on, unbilled."
            style={{
              fontFamily:    "var(--fd)",
              fontSize:      "11px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color:         "var(--blue)",
              border:        "1px solid rgba(91,139,181,0.4)",
              borderRadius:  "var(--r3)",
              padding:       "3px 8px",
              marginLeft:    "8px",
              whiteSpace:    "nowrap",
            }}
          >
            Dev
          </span>
        )}

        <div style={{ marginLeft: "6px", display: "flex", alignItems: "center" }}>
          <UserButton />
        </div>
      </header>

      {/* Rank-remsa som visas istället på mobil */}
      <div className="nav-mobile-only rank-strip">
        <span>{rank.titleEn}</span>
        <div className="rank-strip-track">
          <div className="rank-strip-fill" style={{ width: `${pct}%` }} />
        </div>
        <span>{user.xp.toLocaleString()} XP</span>
      </div>

      <main id="main">{children}</main>
    </div>
  );
}
