// app/(app)/profile/page.tsx
//
// RÄTTAT: hämtade varje sektions fulla text bara för att räkna statusar.
// Uppdaterad Fas 4: BackupPanel tillagd längst ned på profilsidan

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getEntitlements, canUseFeature } from "@/lib/billing/entitlements";
import { FEATURE } from "@/lib/billing/plans";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { aiAllowance } from "@/lib/ai/run";
import { prisma } from "@/lib/db";
import { getRank, getNextRank, xpToNextRank, RANKS } from "@/lib/xp";
import { MedalCard } from "@/components/medals/MedalCard";
import { RankBar } from "@/components/rank/RankBar";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { UsernameEdit } from "@/components/profile/UsernameEdit";
import { BackupPanel } from "@/components/sync/BackupPanel";

export default async function ProfilePage() {
  const user = await requireUser();
  const ent  = await getEntitlements(user);
  const allowance = await aiAllowance(user.id, ent);

  const [medals, works] = await Promise.all([
    prisma.medal.findMany({
      where:   { userId: user.id },
      include: { work: { select: { title: true, author: true, type: true, visibility: true } } },
      orderBy: { earnedAt: "desc" },
    }),
    prisma.work.findMany({
      where:   { userId: user.id },
      // Bara status — sidan räknar bara, den läser aldrig texten
      select: { id: true, sections: { select: { status: true } } },
    }),
  ]);

  const rank     = getRank(user.xp);
  const nextRank = getNextRank(user.xp);
  const toNext   = xpToNextRank(user.xp);
  const progress = nextRank
    ? Math.round(((user.xp - rank.xpRequired) / (nextRank.xpRequired - rank.xpRequired)) * 100)
    : 100;

  const totalSections    = works.reduce((a, w) => a + w.sections.length, 0);
  const masteredSections = works.reduce(
    (a, w) => a + w.sections.filter(s => ["mastered", "permanent"].includes(s.status)).length, 0
  );
  const learningNow = works.reduce(
    (a, w) => a + w.sections.filter(s => ["learning", "learned"].includes(s.status)).length, 0
  );

  const memberSince = new Date(user.createdAt).toLocaleDateString("en-GB", {
    month: "long",
    year:  "numeric",
  });

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px 80px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", marginBottom: "40px" }}>
       <AvatarUpload
  username={user.username}
  avatarUrl={user.avatarUrl}
/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <UsernameEdit initialUsername={user.username} />
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px" }}>
            {user.streakDays} day streak
            <span style={{ margin: "0 8px", color: "var(--bg4)" }}>·</span>
            Member since {memberSince}
          </p>
        </div>
      </div>

      {/*
        Planen syns som en rad, inte som en märkning. Free ska inte känna
        sig påmind om något den saknar varje gång den öppnar sin profil —
        raden säger vad som gäller och var man ändrar det, och tiger sedan.
      */}
      <Link href="/settings/subscription" style={{ textDecoration: "none", display: "block", marginBottom: "24px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
          background: "var(--bg2)", border: "1px solid var(--bord)",
          borderRadius: "var(--r)", padding: "14px 18px",
        }}>
          <span style={{ fontFamily: "var(--fd)", fontSize: "16px", color: ent.isPro ? "var(--gold)" : "var(--parch)" }}>
            {ent.isPro ? "Rhapsode Pro" : "Rhapsode"}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: "12px", color: "var(--muted)" }}>
            {ent.isPro
              ? "Everything is open."
              : `${allowance.remaining} of ${allowance.limit} generations left this month`}
          </span>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Subscription →</span>
        </div>
      </Link>

      {/* ── Rank bar ── */}
      <div style={{ marginBottom: "24px" }}>
        <RankBar xp={user.xp} rank={rank} nextRank={nextRank} progressPct={progress} toNext={toNext} />
      </div>

      {/* ── Rank ladder ── */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--bord)",
        borderRadius: "var(--r)", padding: "20px 24px", marginBottom: "24px",
      }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.2em", color: "var(--gold)", textTransform: "uppercase", marginBottom: "16px" }}>
          All ranks
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {RANKS.map(r => {
            const isCurrent = r.level === rank.level;
            const isDone    = r.level < rank.level;
            return (
              <div key={r.level} style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "7px 10px", borderRadius: "var(--r3)",
                background: isCurrent ? "var(--gold4)" : "transparent",
              }}>
                <span style={{
                  fontFamily: "var(--fd)", fontSize: "13px",
                  color: isCurrent ? "var(--gold)" : isDone ? "var(--muted)" : "var(--bg4)",
                  opacity: isDone ? 0.65 : 1, flex: 1,
                }}>
                  {r.titleEn}
                  {isDone && <span style={{ fontSize: "11px", color: "var(--bg4)", marginLeft: "6px" }}>({r.titleSv})</span>}
                </span>
                <span style={{ fontSize: "11px", color: "var(--muted)", flexShrink: 0 }}>
                  {r.xpRequired.toLocaleString()} XP
                </span>
                {isDone    && <span style={{ fontSize: "11px", color: "var(--green)", flexShrink: 0 }}>✓</span>}
                {isCurrent && <span style={{ fontSize: "10px", color: "var(--gold)", letterSpacing: "0.1em", flexShrink: 0 }}>NOW</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/*
        Statistiken ligger bakom Pro. Rangen, medaljerna och streaken star
        kvar ovanfor — det ar vad man ASTADKOMMIT, och det tas inte ifran
        nagon. Det som ar last ar uppstallningen som later en lasa sin egen
        utveckling, och den ar analys snarare an framsteg.
      */}
      {canUseFeature(ent, FEATURE.ADVANCED_PROGRESS) ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "36px" }}>
          <StatTile label="Works"    value={works.length} />
          <StatTile label="Sections" value={totalSections} />
          <StatTile label="Mastered" value={masteredSections} accent />
          <StatTile label="Learning" value={learningNow} />
          <StatTile label="Medals"   value={medals.length} accent />
          <StatTile label="Streak"   value={user.streakDays} suffix="days" />
        </div>
      ) : (
        <div style={{ marginBottom: "36px" }}>
          <UpgradeCard
            feature="ADVANCED_PROGRESS"
            title="Read your own progress"
            body="How many sections are holding, how many are still moving, how the streak has run, and what the whole library adds up to. Pro keeps the ledger so you can see whether the practice is working, not just that you did it."
          />
        </div>
      )}

      {/* ── Medals ── */}
      <div style={{ marginBottom: "12px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ fontFamily: "var(--fd)", fontSize: "22px", fontWeight: 300, color: "var(--parch)", letterSpacing: "0.06em" }}>
          Medals
        </h2>
        {medals.length > 0 && <span style={{ fontSize: "12px", color: "var(--muted)" }}>{medals.length} earned</span>}
      </div>

      {medals.length === 0 ? (
        <div style={{
          padding: "48px 24px", textAlign: "center", color: "var(--muted)", fontSize: "14px",
          background: "var(--bg2)", border: "1px solid var(--bord)", borderRadius: "var(--r)",
          marginBottom: "36px",
        }}>
          <p style={{ fontFamily: "var(--fd)", fontSize: "18px", marginBottom: "8px", color: "var(--bg4)" }}>◇</p>
          Complete all sections of a work to earn your first medal.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "36px" }}>
          {medals.map(medal => (
            <MedalCard
              key={medal.id}
              title={medal.title}
              workTitle={medal.work.title}
              author={medal.work.author}
              type={medal.work.type}
              earnedAt={medal.earnedAt}
              kind={medal.kind === "performance" ? "performance" : "work"}
              lostAt={medal.lostAt}
              // Ett privat verk namnges inte ens pa din egen profil.
              // Sidan ar delbar, och en skarmbild av den ska inte avsloja
              // vad nagon ovar pa i tysthet.
              nameWork={medal.work.visibility === "public"}
            />
          ))}
        </div>
      )}

      {/* ── Backup & Restore ── */}
      <BackupPanel />
    </div>
  );
}

function StatTile({ label, value, accent, suffix }: {
  label: string; value: number; accent?: boolean; suffix?: string;
}) {
  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--bord)",
      borderRadius: "var(--r)", padding: "16px 18px",
    }}>
      <p style={{ fontSize: "10px", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "6px" }}>
        {label}
      </p>
      <p style={{ fontFamily: "var(--fd)", fontSize: "30px", fontWeight: 300, color: accent ? "var(--gold)" : "var(--parch)" }}>
        {value}
        {suffix && <span style={{ fontSize: "14px", color: "var(--muted)", marginLeft: "5px" }}>{suffix}</span>}
      </p>
    </div>
  );
}
