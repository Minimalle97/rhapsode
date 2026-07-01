// app/(app)/layout.tsx
// Uppdaterad Fas 4: SyncIndicator i navbaren för live-synk-status

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getRank, getNextRank, xpToNextRank } from "@/lib/xp";
import { RankBar } from "@/components/rank/RankBar";
import { SyncIndicator } from "@/components/sync/SyncIndicator";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user   = await requireUser();
  const rank   = getRank(user.xp);
  const next   = getNextRank(user.xp);
  const toNext = xpToNextRank(user.xp);
  const pct    = next
    ? Math.round(((user.xp - rank.xpRequired) / (next.xpRequired - rank.xpRequired)) * 100)
    : 100;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <nav style={{
        display:        "flex",
        alignItems:     "center",
        gap:            "12px",
        padding:        "0 28px",
        height:         "58px",
        borderBottom:   "1px solid var(--bord)",
        position:       "sticky",
        top:            0,
        background:     "rgba(12,16,21,0.94)",
        backdropFilter: "blur(16px)",
        zIndex:         200,
      }}>
        {/* Logo */}
        <Link href="/library" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", marginRight: "8px" }}>
          <span style={{ fontFamily: "var(--fd)", fontSize: "20px", fontWeight: 300, letterSpacing: "0.1em", color: "var(--parch)" }}>
            Rhap<span style={{ color: "var(--gold)" }}>sode</span>
          </span>
        </Link>

        <div style={{ flex: 1 }} />

        {/* Sync indicator — döljs på mobil */}
        <div className="rank-nav-bar">
          <SyncIndicator userId={user.id} />
        </div>

        {/* Rank bar — döljs på mobil */}
        <div className="rank-nav-bar">
          <RankBar
            xp={user.xp}
            rank={rank}
            nextRank={next}
            progressPct={pct}
            toNext={toNext}
            compact
          />
        </div>

        {/* Nav tabs */}
        <NavTab href="/library"  label="Library"  />
        <NavTab href="/progress" label="Progress" />
        <NavTab href="/profile"  label="Profile"  />

        {/* Clerk user button */}
        <div style={{ marginLeft: "4px" }}>
          <UserButton />
        </div>
      </nav>

      <main>{children}</main>
    </div>
  );
}

function NavTab({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{
      padding:        "6px 13px",
      borderRadius:   "var(--r3)",
      fontSize:       "13px",
      color:          "var(--muted)",
      textDecoration: "none",
      transition:     "all .15s",
      letterSpacing:  ".02em",
    }}>
      {label}
    </Link>
  );
}
