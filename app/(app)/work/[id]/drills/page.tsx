// app/(app)/work/[id]/drills/page.tsx
//
// Drillistan for ett verk.
//
// Drillarna ar inte lasta bakom Pro — de ar rantionerade. Gratis far ett
// antal kort per dygn, Pro har inget tak, och det star har i klartext
// innan man borjar. Rakningen sker forst nar ett kort BEDOMS, sa att
// oppna listan och titta kostar ingenting.
//
// Behorigheten fragas via lib/drills.ts, som i sin tur fragar
// canUseFeature(). Ingen andra kontroll och ingen jamforelse mot planen
// pa den har sidan.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { DRILLS, allowanceFor } from "@/lib/drills";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const work = await prisma.work.findFirst({
    where: { id, userId: user.id }, select: { title: true },
  });
  return { title: work ? `Drills · ${work.title}` : "Drills" };
}

export default async function DrillsPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:  { id, userId: user.id },
    select: { id: true, title: true, author: true, _count: { select: { sections: true } } },
  });
  if (!work) notFound();

  const ent       = await getEntitlements(user);
  const allowance = await allowanceFor(user.id, ent);

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link href={`/work/${work.id}`} style={backLink}>← {work.title}</Link>

      <h1 style={{
        fontFamily: "var(--fd)", fontSize: "clamp(26px, 5vw, 32px)", fontWeight: 300,
        letterSpacing: "0.04em", color: "var(--parch)", marginBottom: "6px",
      }}>
        Drills
      </h1>
      <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.7, marginBottom: "22px" }}>
        Ways of working the same text that a straight read-through cannot give you.
        Each one takes the words away differently.
      </p>

      {/* ── Hur mycket som ar kvar ── */}
      <div style={{
        padding: "12px 15px", marginBottom: "24px",
        background: allowance.unlimited ? "var(--gold4)" : "var(--bg2)",
        border: `1px solid ${allowance.unlimited ? "rgba(200,164,80,0.32)" : "var(--bord)"}`,
        borderRadius: "var(--r2)",
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
      }}>
        {allowance.unlimited ? (
          <p style={{ fontSize: "13px", color: "var(--parch2)" }}>
            <span style={{ color: "var(--gold)" }}>Pro</span> — drill as much as you like.
          </p>
        ) : (
          <>
            <p style={{ fontSize: "13px", color: "var(--parch2)", flex: "1 1 auto" }}>
              {allowance.remaining > 0
                ? <>{allowance.remaining} of {allowance.limit} drill cards left today</>
                : <>Today&apos;s {allowance.limit} drill cards are used up</>}
            </p>
            <Link href="/settings/subscription" style={upgradeLink}>
              Pro removes the cap
            </Link>
          </>
        )}
      </div>

      {work._count.sections === 0 ? (
        <p style={emptyBox}>
          This work has no sections yet, so there is nothing to drill.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {DRILLS.map(drill => (
            <DrillRow
              key={drill.id}
              workId={work.id}
              name={drill.name}
              blurb={drill.blurb}
              href={drill.ready ? `/work/${work.id}/drills/${drill.id}` : null}
            />
          ))}
        </div>
      )}

      {/*
        Drill 6 — replikstickord — saknas med flit, och det ar arligare
        att saga varfor an att lata listan se ofardig ut.
      */}
      <p style={{
        fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.7,
        marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--bord)",
      }}>
        A cue-line drill for scripts — where you get the previous speaker&apos;s line
        and deliver your own — needs texts to be split by speaker. Nothing in your
        library records who says what yet, so it is not here rather than guessing
        wrongly at who is speaking.
      </p>
    </div>
  );
}

function DrillRow({
  name, blurb, href,
}: {
  workId: string; name: string; blurb: string; href: string | null;
}) {
  const inner = (
    <div style={{
      background: "var(--bg2)",
      border: "1px solid var(--bord)",
      borderRadius: "var(--r2)",
      padding: "15px 17px",
      display: "flex", alignItems: "center", gap: "13px",
      opacity: href ? 1 : 0.55,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "var(--fd)", fontSize: "18px",
          color: "var(--parch)", marginBottom: "3px",
        }}>
          {name}
        </p>
        <p style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.55 }}>
          {blurb}
        </p>
      </div>
      <span style={{ fontSize: "13px", color: href ? "var(--gold)" : "var(--bg4)", flexShrink: 0 }}>
        {href ? "→" : "soon"}
      </span>
    </div>
  );

  return href
    ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>
    : inner;
}

const backLink: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)",
  textDecoration: "none", display: "inline-block", marginBottom: "20px",
};
const upgradeLink: React.CSSProperties = {
  fontSize: "12px", color: "var(--gold)",
  textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
};
const emptyBox: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)", textAlign: "center",
  padding: "28px", background: "var(--bg2)",
  border: "1px solid var(--bord)", borderRadius: "var(--r2)",
};
