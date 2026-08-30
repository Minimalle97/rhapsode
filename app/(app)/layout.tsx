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
import { DevViewSwitch } from "@/components/billing/DevViewSwitch";

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
          Utvecklarmarkoren, som ocksa ar en vaxel mellan Pro och gratis.
          Finns for att svara pa tva fragor: las miljovariabeln (eller
          dev-koden) och kande den igen just det har kontot, och hur ser
          appen ut for nagon som inte betalar.

          Vaxeln kan bara SANKA behorigheten. Se lib/billing/devView.ts.

          Ritas bara for konton som ar utvecklarkonton — antingen for att
          de har Pro den vagen, eller for att de just nu tittar som gratis
          och maste kunna ta sig tillbaka.
        */}
        {(ent.source === "developer" || ent.devViewingFree) && (
          <DevViewSwitch viewingFree={ent.devViewingFree === true} />
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
