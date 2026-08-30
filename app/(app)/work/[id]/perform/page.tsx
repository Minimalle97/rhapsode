// app/(app)/work/[id]/perform/page.tsx
// Performance Mode.
//
// Verk som ryms i ett svep framfors i sin helhet. Ar de langre pekar
// sidan vidare till delarna — samma grans som recitationssidan drar, och
// av samma skal: ingen framfor fyratusen sektioner i rad.

import { requireUser, getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PerformanceMode } from "@/components/practice/PerformanceMode";
import { standingForWork } from "@/lib/performanceStore";
import { fitsOneSitting, RULES } from "@/lib/performance";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ part?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser();
  const work = user && await prisma.work.findFirst({
    where: { id, userId: user.id }, select: { title: true },
  });
  return { title: work ? `Perform · ${work.title}` : "Perform" };
}

export default async function PerformPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const sp   = await searchParams;
  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:  { id, userId: user.id },
    select: { id: true, title: true, author: true },
  });
  if (!work) notFound();

  const partId = sp.part ?? null;

  const [total, standing] = await Promise.all([
    prisma.section.count({ where: { workId: id, ...(partId ? { partId } : {}) } }),
    standingForWork(user.id, id),
  ]);

  // ── For langt for ett svep: valj en del ─────────────────────────
  if (!partId && !fitsOneSitting(total)) {
    const parts = await prisma.part.findMany({
      where:   { workId: id },
      orderBy: { orderIndex: "asc" },
      select:  { id: true, name: true, _count: { select: { sections: true } } },
    });

    return (
      <div style={{ maxWidth: "660px", margin: "0 auto", padding: "36px 24px 80px" }}>
        <Link href={`/work/${work.id}`} style={back}>← {work.title}</Link>

        <h1 style={heading}>Perform a part</h1>
        <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.75, marginBottom: "26px" }}>
          {work.title} runs to {total.toLocaleString()} sections. Nobody performs
          that in one sitting, and the rhapsodes never did either — a book in an
          evening was the unit. Choose one.
        </p>

        {parts.length ? (
          <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "5px" }}>
            {parts.map((p, i) => (
              <li key={p.id}>
                <Link href={`/work/${work.id}/perform?part=${p.id}`} className="section-row" style={{ textDecoration: "none", display: "block" }}>
                  <div style={row}>
                    <span style={{ fontFamily: "var(--fd)", fontSize: "13px", color: "var(--bg4)", width: "28px" }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: "14px", color: "var(--parch)" }}>{p.name}</span>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {p._count.sections} sections
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--muted)" }}>
            This work has no parts to choose from. Split it under Clean up first.
          </p>
        )}
      </div>
    );
  }

  const part = partId
    ? await prisma.part.findFirst({
        where: { id: partId, workId: id }, select: { id: true, name: true },
      })
    : null;
  if (partId && !part) notFound();

  return (
    <div style={{ maxWidth: "620px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link href={`/work/${work.id}`} style={back}>← {work.title}</Link>

      <PerformanceMode
        workId={work.id}
        workTitle={work.title}
        author={work.author}
        partId={part?.id ?? null}
        partName={part?.name ?? null}
        sectionCount={total}
        standing={standing}
        passAccuracy={RULES.passAccuracy}
      />
    </div>
  );
}

const back: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)", textDecoration: "none",
  display: "inline-block", marginBottom: "24px",
};
const heading: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "30px", fontWeight: 300,
  color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "10px",
};
const row: React.CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--bord)",
  borderRadius: "var(--r2)", padding: "14px 18px",
  display: "flex", alignItems: "center", gap: "14px",
};
