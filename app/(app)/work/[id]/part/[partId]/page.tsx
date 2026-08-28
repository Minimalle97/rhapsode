// app/(app)/work/[id]/part/[partId]/page.tsx
// Sektionerna inom en del — en sång, en scen, en bok.

import { requireUser, getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; partId: string }>;
}

const MASTERED = ["mastered", "permanent"];

const STATUS: Record<string, { label: string; color: string; step: number }> = {
  not_started: { label: "Not started", color: "var(--bg4)",    step: 0 },
  learning:    { label: "Learning",    color: "var(--blue)",   step: 1 },
  learned:     { label: "Learned",     color: "var(--parch2)", step: 2 },
  stable:      { label: "Stable",      color: "var(--green)",  step: 3 },
  mastered:    { label: "Mastered",    color: "var(--gold)",   step: 4 },
  permanent:   { label: "Permanent",   color: "var(--gold)",   step: 5 },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { partId } = await params;
  const user = await getUser();
  const part = user && await prisma.part.findFirst({
    where: { id: partId, work: { userId: user.id } }, select: { name: true },
  });
  return { title: part?.name ?? "Part" };
}

export default async function PartPage({ params }: Props) {
  const { id, partId } = await params;
  const user = await requireUser();

  const part = await prisma.part.findFirst({
    where: { id: partId, workId: id, work: { userId: user.id } },
    select: {
      id: true, name: true, orderIndex: true,
      work: { select: { id: true, title: true } },
      sections: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true, name: true, content: true,
          status: true, nextReview: true,
        },
      },
    },
  });
  if (!part) notFound();

  const [prev, next] = await Promise.all([
    prisma.part.findFirst({
      where:   { workId: id, orderIndex: { lt: part.orderIndex } },
      orderBy: { orderIndex: "desc" },
      select:  { id: true, name: true },
    }),
    prisma.part.findFirst({
      where:   { workId: id, orderIndex: { gt: part.orderIndex } },
      orderBy: { orderIndex: "asc" },
      select:  { id: true, name: true },
    }),
  ]);

  const now      = new Date();
  const total    = part.sections.length;
  const mastered = part.sections.filter(s => MASTERED.includes(s.status)).length;
  const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0;

  const nextUp =
    part.sections.find(s => s.nextReview && new Date(s.nextReview) <= now) ??
    part.sections.find(s => s.status === "not_started") ??
    null;

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link href={`/work/${part.work.id}`} style={{
        fontSize: "13px", color: "var(--muted)",
        textDecoration: "none", display: "inline-block", marginBottom: "22px",
      }}>
        ← {part.work.title}
      </Link>

      <header style={{ marginBottom: "24px" }}>
        <h1 style={{
          fontFamily: "var(--fd)", fontSize: "clamp(26px, 5vw, 34px)",
          fontWeight: 300, color: "var(--parch)",
          letterSpacing: "0.03em", marginBottom: "14px",
        }}>
          {part.name}
        </h1>

        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", marginBottom: "7px",
        }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {mastered} of {total} mastered
          </span>
          <span style={{
            fontFamily: "var(--fd)", fontSize: "15px",
            color: pct === 100 ? "var(--gold)" : "var(--parch2)",
          }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: "3px", background: "var(--bg4)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: "linear-gradient(90deg, var(--gold2), var(--gold))",
            transition: "width .6s ease",
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
          <Link href={`/work/${part.work.id}/part/${part.id}/recite`} style={{
            padding: "6px 14px",
            borderRadius: "var(--r3)",
            border: "1px solid var(--bord)",
            color: "var(--parch2)",
            textDecoration: "none",
            fontSize: "12px",
          }}>
            Recite to a beat
          </Link>
        </div>
      </header>

      {nextUp && (
        <Link href={`/practice/${part.work.id}/${nextUp.id}`} style={{ textDecoration: "none", display: "block", marginBottom: "24px" }}>
          <div style={{
            background: "var(--gold3)", border: "1px solid rgba(200,164,80,0.32)",
            borderRadius: "var(--r)", padding: "16px 20px",
            display: "flex", alignItems: "center", gap: "14px",
          }}>
            <span style={{ flex: 1, fontFamily: "var(--fd)", fontSize: "17px", color: "var(--parch)" }}>
              Practise section {nextUp.name}
            </span>
            <span style={{ color: "var(--gold)", fontSize: "17px" }}>→</span>
          </div>
        </Link>
      )}

      <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
        {part.sections.map(s => {
          const meta = STATUS[s.status] ?? STATUS.not_started;
          const due  = !!s.nextReview && new Date(s.nextReview) <= now;

          return (
            <li key={s.id}>
              <Link href={`/practice/${part.work.id}/${s.id}`} className="section-row" style={{ textDecoration: "none", display: "block" }}>
                <div style={{
                  background: "var(--bg2)",
                  border: `1px solid ${due ? "rgba(200,164,80,0.3)" : "var(--bord)"}`,
                  borderRadius: "var(--r2)", padding: "13px 16px",
                  display: "flex", alignItems: "flex-start", gap: "13px",
                }}>
                  <span style={{
                    fontFamily: "var(--fd)", fontSize: "13px",
                    color: "var(--bg4)", width: "22px", flexShrink: 0, paddingTop: "2px",
                  }}>
                    {s.name}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: "13px", color: "var(--parch2)", lineHeight: 1.5,
                      marginBottom: "6px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {s.content.split("\n")[0]}
                    </p>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ display: "flex", gap: "3px" }}>
                        {[1, 2, 3, 4].map(step => (
                          <span key={step} style={{
                            width: "12px", height: "2px", borderRadius: "1px",
                            background: meta.step >= step ? meta.color : "var(--bg4)",
                          }} />
                        ))}
                      </div>
                      <span style={{ fontSize: "11px", color: meta.color }}>{meta.label}</span>
                      {s.nextReview && !due && (
                        <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                          · back in {daysUntil(s.nextReview, now)}
                        </span>
                      )}
                    </div>
                  </div>

                  {due && (
                    <span style={{
                      fontSize: "10px", color: "var(--gold)",
                      letterSpacing: "0.1em", flexShrink: 0, paddingTop: "2px",
                    }}>
                      DUE
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      <nav style={{
        display: "flex", justifyContent: "space-between", gap: "10px",
        marginTop: "32px", paddingTop: "20px", borderTop: "1px solid var(--bord)",
      }}>
        {prev ? (
          <Link href={`/work/${part.work.id}/part/${prev.id}`} style={navLink}>← {prev.name}</Link>
        ) : <span />}
        {next ? (
          <Link href={`/work/${part.work.id}/part/${next.id}`} style={{ ...navLink, textAlign: "right" }}>{next.name} →</Link>
        ) : <span />}
      </nav>
    </div>
  );
}

function daysUntil(date: Date, now: Date): string {
  const days = Math.ceil((new Date(date).getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

const navLink: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)", textDecoration: "none",
  maxWidth: "45%", overflow: "hidden",
  textOverflow: "ellipsis", whiteSpace: "nowrap",
};
