// app/(app)/work/[id]/page.tsx
//
// RÄTTAT: numreringen. Listan skrev ut sektionens plats i HELA verket
// medan Continue-kortet skrev ut dess nummer INOM delen. Samma sektion
// kunde alltså heta 2 på ett ställe och 47 på ett annat.
// Nu visas sektionens namn på båda ställena.
//
// Visar verkets DELAR när det finns sådana, annars sektionerna direkt.
// Sektionsräkningen görs med groupBy, så sidan är lika snabb för
// Divina Commedia som för en sonett.
//
// FIX: statusen syns nu på varje sektion. Tidigare markerades bara
// "DUE" och "mastered", vilket gjorde att allt arbete däremellan såg
// ut som ingenting alls — trots att SM-2 flyttat sektionen framåt.

import { requireUser, getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProjectionCard } from "@/components/stats/ProjectionCard";
import { masteryOf } from "@/lib/mastery";
import { learningProgress, RULES } from "@/lib/performance";
import { standingForWork } from "@/lib/performanceStore";
import { WorkVisibility } from "@/components/library/WorkVisibility";
import { getEntitlements } from "@/lib/billing/entitlements";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import type { Metadata } from "next";

// Hämta alltid färsk data — annars kan sidan visa läget före
// den senaste övningen.
export const dynamic = "force-dynamic";

interface Props {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ sec?: string }>;
}

// Antal sektioner per sida i platta verk
const FLAT_PAGE = 100;

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
  const { id } = await params;
  const user = await getUser();
  // findUnique utan ägarkoll gjorde att fliktiteln avslöjade titeln på
  // vilket verk som helst för den som gissade ett id.
  const work = user && await prisma.work.findFirst({
    where: { id, userId: user.id }, select: { title: true },
  });
  return { title: work?.title ?? "Work" };
}

export default async function WorkPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const sp   = await searchParams;
  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true, title: true, author: true, type: true,
      analysis: true, practiceAdvice: true,
      difficulty: true, estimatedMinutes: true, visibility: true,
    },
  });
  if (!work) notFound();

  // Inlarningskurvan raknas ur sektionernas SM-2-lage, med delpoang, sa
  // att den ror sig medan man arbetar och inte forst nar nagot ar klart.
  const [levelRows, standing] = await Promise.all([
    prisma.section.findMany({
      where:  { workId: id },
      select: { status: true, sm2Reps: true, sm2Interval: true },
    }),
    standingForWork(user.id, id),
  ]);
  const learned = learningProgress(levelRows.map(masteryOf));
  const ent = await getEntitlements(user);

  const now = new Date();

  const [parts, statusRows, dueCount, nextSection] = await Promise.all([
    prisma.part.findMany({
      where:   { workId: id },
      orderBy: { orderIndex: "asc" },
      select:  { id: true, name: true, orderIndex: true },
    }),
    prisma.section.groupBy({
      by:     ["partId", "status"],
      where:  { workId: id },
      _count: { _all: true },
    }),
    prisma.section.count({ where: { workId: id, nextReview: { lte: now } } }),
    prisma.section.findFirst({
      where:   { workId: id, nextReview: { lte: now } },
      orderBy: { nextReview: "asc" },
      select:  { id: true, name: true, partId: true },
    }).then(due =>
      due ??
      prisma.section.findFirst({
        where:   { workId: id, status: "not_started" },
        orderBy: { orderIndex: "asc" },
        select:  { id: true, name: true, partId: true },
      })
    ),
  ]);

  // Sammanställ ur groupBy
  let total = 0, mastered = 0, started = 0;
  const perPart   = new Map<string, { total: number; mastered: number }>();
  const byStatus  = new Map<string, number>();

  for (const row of statusRows) {
    const n   = row._count._all;
    const key = row.partId ?? "__none__";
    const acc = perPart.get(key) ?? { total: 0, mastered: 0 };

    acc.total += n;
    total     += n;
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + n);

    if (row.status !== "not_started") started += n;
    if (MASTERED.includes(row.status)) {
      acc.mastered += n;
      mastered     += n;
    }
    perPart.set(key, acc);
  }

  const startedPct = total > 0 ? Math.round((started / total) * 100) : 0;

  const nextPartName = nextSection?.partId
    ? parts.find(p => p.id === nextSection.partId)?.name ?? null
    : null;

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link href="/library" style={backLink}>← Library</Link>

      <header style={{ marginBottom: "26px" }}>
        <p style={eyebrow}>{work.type}</p>
        <h1 style={{
          fontFamily: "var(--fd)", fontSize: "clamp(30px, 6vw, 42px)",
          fontWeight: 300, color: "var(--parch)", letterSpacing: "0.03em",
          lineHeight: 1.1, marginBottom: "6px",
        }}>
          {work.title}
        </h1>
        <p style={{ fontSize: "15px", color: "var(--muted)", marginBottom: "20px" }}>
          {work.author}
        </p>

        {/* Två lager: påbörjat i dämpad ton, bemästrat i guld */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: "7px",
          }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {mastered.toLocaleString()} held · {started.toLocaleString()} in progress · {total.toLocaleString()} sections
            </span>
            <span style={{
              fontFamily: "var(--fd)", fontSize: "16px",
              color: learned === 100 ? "var(--gold)" : "var(--parch2)",
            }}>
              {learned}%
            </span>
          </div>
          {/* Delpoang per sektion, sa att stapeln ror sig fran forsta passet. */}
          <div style={{ ...track, height: "5px", position: "relative" }}>
            <div style={{
              position: "absolute", inset: 0,
              width: `${startedPct}%`, background: "var(--gold3)",
              borderRadius: "2px", transition: "width .6s ease",
            }} />
            <div style={{
              ...fill, position: "relative", width: `${learned}%`,
              background: standing.isMastered
                ? "var(--red)"
                : "linear-gradient(90deg, var(--gold2), var(--gold))",
            }} />
          </div>
        </div>

        {/* Statusfördelning */}
        {started > 0 && (
          <div style={{
            display: "flex", gap: "14px", flexWrap: "wrap",
            fontSize: "11px", color: "var(--muted)", marginBottom: "12px",
          }}>
            {Object.entries(STATUS)
              .filter(([key]) => (byStatus.get(key) ?? 0) > 0)
              .map(([key, s]) => (
                <span key={key} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: s.color,
                  }} />
                  {s.label} {byStatus.get(key)}
                </span>
              ))}
          </div>
        )}

        <div style={{
          display: "flex", gap: "18px", fontSize: "12px",
          color: "var(--muted)", flexWrap: "wrap", alignItems: "center",
        }}>
          {parts.length > 0 && <span>{parts.length} parts</span>}
          <span>{work.difficulty}</span>
          {dueCount > 0 && <span style={{ color: "var(--gold)" }}>{dueCount} due now</span>}

          <span style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
            <WorkVisibility workId={work.id} visibility={work.visibility} />
            <Link href={`/work/${work.id}/edit`} style={headerBtn}>
              Clean up
            </Link>
            <Link href={`/work/${work.id}/recite`} style={headerBtn}>
              Recite to a beat
            </Link>
          </span>
        </div>
      </header>

      {/*
        Framforandet. Kortet byter ton med laget: en inbjudan nar texten
        sitter, en rakning medan man samlar de tio, och en varning nar
        titeln haller pa att falla.
      */}
      <div style={{
        background: standing.standing === "at_risk" ? "rgba(192,95,114,0.07)" : "var(--bg2)",
        border: `1px solid ${standing.isMastered ? "rgba(192,95,114,0.32)" : "var(--bord)"}`,
        borderRadius: "var(--r)", padding: "18px 22px", marginBottom: "22px",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <p style={{ ...eyebrow, color: standing.isMastered ? "var(--red)" : "var(--gold)", marginBottom: 0 }}>
            {standing.isMastered ? "Mastered" : "Performance"}
          </p>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {standing.passed} of {standing.required} performances
          </span>
        </div>

        <p style={{ fontSize: "13px", color: "var(--parch2)", lineHeight: 1.7, margin: "10px 0 14px" }}>
          {standing.standing === "at_risk" ? (
            <>Not performed in {standing.daysSinceLastPass} day
              {standing.daysSinceLastPass === 1 ? "" : "s"}. The title falls in{" "}
              {standing.daysUntilLapse} day{standing.daysUntilLapse === 1 ? "" : "s"}.</>
          ) : standing.standing === "lapsed" ? (
            <>The title has lapsed. Ten performances at {RULES.passAccuracy}% or better will bring it back.</>
          ) : standing.isMastered ? (
            <>Held. Perform it every few days to keep it.</>
          ) : learned >= 100 ? (
            <>Every section is holding. Perform the whole thing from memory —
              {" "}{RULES.runsForMastery} at {RULES.passAccuracy}% or better takes the title.</>
          ) : (
            <>Recite the whole work from memory, with nothing in front of you.
              Available at any point, but it bites before the sections settle.</>
          )}
        </p>

        <Link href={`/work/${work.id}/perform`} style={{
          ...headerBtn,
          border: `1px solid ${standing.isMastered || learned >= 100 ? "var(--red)" : "var(--bord)"}`,
          color: standing.isMastered || learned >= 100 ? "var(--red)" : "var(--parch2)",
        }}>
          {standing.passed > 0 ? "Perform it again" : "Begin a performance"}
        </Link>
      </div>

      {/*
        Milstolpe: hela verket sitter. Det ar forsta gangen erbjudandet
        har nagot konkret att erbjuda — man har just bevisat att man kan
        texten, och nasta steg ar det som Pro gor vassare.
      */}
      {learned >= 100 && !ent.isPro && !standing.isMastered && (
        <div style={{ marginBottom: "22px" }}>
          <UpgradeCard
            feature="ADVANCED_RECITATION"
            title="Every section is holding"
            body="The work is learned. What is left is performing it whole — and that is where Pro earns its keep: it reads which lines you hesitate on, how the rhythm holds against the metre, and builds a session out of the places you keep losing."
          />
        </div>
      )}

      {nextSection && (
        <Link href={`/practice/${work.id}/${nextSection.id}`} style={{ textDecoration: "none", display: "block", marginBottom: "26px" }}>
          <div style={{
            background: "var(--gold3)", border: "1px solid rgba(200,164,80,0.32)",
            borderRadius: "var(--r)", padding: "18px 22px",
            display: "flex", alignItems: "center", gap: "16px",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ ...eyebrow, marginBottom: "5px" }}>
                {dueCount > 0 ? "Due now" : "Continue"}
              </p>
              <p style={{ fontFamily: "var(--fd)", fontSize: "19px", color: "var(--parch)" }}>
                {nextPartName ? `${nextPartName} · ${nextSection.name}` : nextSection.name}
              </p>
            </div>
            <span style={{ color: "var(--gold)", fontSize: "18px", flexShrink: 0 }}>→</span>
          </div>
        </Link>
      )}

      {/* Inget förfallet just nu — förklara varför */}
      {!nextSection && total > 0 && (
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--bord)",
          borderRadius: "var(--r)", padding: "18px 22px",
          marginBottom: "26px", textAlign: "center",
        }}>
          <p style={{ fontSize: "13px", color: "var(--parch2)", marginBottom: "4px" }}>
            Nothing due right now.
          </p>
          <p style={{ fontSize: "12px", color: "var(--muted)" }}>
            Sections come back on their own schedule. Practising early doesn&apos;t
            strengthen the memory the way spacing does.
          </p>
        </div>
      )}

      {/* Den långa bågen — visas bara för verk stora nog att den säger något */}
      <ProjectionCard workId={work.id} />

      {work.analysis && (
        <div style={{
          background: "var(--bg3)", border: "1px solid var(--bord)",
          borderRadius: "var(--r)", padding: "20px 22px", marginBottom: "30px",
        }}>
          <p style={{ fontSize: "13px", lineHeight: 1.75, color: "var(--parch2)", fontStyle: "italic" }}>
            {work.analysis}
          </p>
          {work.practiceAdvice && (
            <p style={{
              fontSize: "12px", lineHeight: 1.7, color: "var(--muted)",
              marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--bord)",
            }}>
              {work.practiceAdvice}
            </p>
          )}
        </div>
      )}

      {parts.length > 0 ? (
        <>
          <h2 style={h2}>Parts</h2>
          <ol style={list}>
            {parts.map(part => {
              const s    = perPart.get(part.id) ?? { total: 0, mastered: 0 };
              const p    = s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0;
              const done = p === 100;

              return (
                <li key={part.id}>
                  <Link href={`/work/${work.id}/part/${part.id}`} className="section-row" style={rowLink}>
                    <div style={{
                      ...row,
                      border: `1px solid ${done ? "rgba(200,164,80,0.28)" : "var(--bord)"}`,
                    }}>
                      <span style={numCell}>{part.orderIndex + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: "14px",
                          color: done ? "var(--gold)" : "var(--parch)",
                          marginBottom: "6px",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {part.name}
                        </p>
                        <div style={{ ...track, height: "2px" }}>
                          <div style={{ ...fill, width: `${p}%` }} />
                        </div>
                      </div>
                      <span style={{
                        fontSize: "11px", color: "var(--muted)",
                        flexShrink: 0, minWidth: "58px", textAlign: "right",
                      }}>
                        {s.mastered}/{s.total}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <FlatSections workId={work.id} page={Math.max(0, (Number(sp.sec) || 1) - 1)} />
      )}
    </div>
  );
}

/** Verk utan delar — sektionerna direkt, hundra åt gången. */
async function FlatSections({ workId, page }: { workId: string; page: number }) {
  const total = await prisma.section.count({ where: { workId, partId: null } });
  const pageCount = Math.max(1, Math.ceil(total / FLAT_PAGE));
  const p = Math.min(pageCount - 1, page);

  const sections = await prisma.section.findMany({
    where:   { workId, partId: null },
    orderBy: { orderIndex: "asc" },
    skip:    p * FLAT_PAGE,
    take:    FLAT_PAGE,
    select: {
      id: true, name: true, content: true,
      status: true, nextReview: true, orderIndex: true,
    },
  });

  const now = new Date();

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
        <h2 style={{ ...h2, marginBottom: 0 }}>Sections</h2>
        {pageCount > 1 && (
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {p * FLAT_PAGE + 1}–{Math.min((p + 1) * FLAT_PAGE, total)} of {total.toLocaleString()}
          </span>
        )}
      </div>

      <ol style={list}>
        {sections.map(s => {
          const meta = STATUS[s.status] ?? STATUS.not_started;
          const due  = !!s.nextReview && new Date(s.nextReview) <= now;

          return (
            <li key={s.id}>
              <Link href={`/practice/${workId}/${s.id}`} className="section-row" style={rowLink}>
                <div style={{
                  ...row,
                  border: `1px solid ${due ? "rgba(200,164,80,0.3)" : "var(--bord)"}`,
                  alignItems: "flex-start",
                }}>
                  <span style={{ ...numCell, paddingTop: "2px" }}>{s.name}</span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: "13px", color: "var(--parch2)",
                      lineHeight: 1.5, marginBottom: "7px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {s.content.split("\n")[0]}
                    </p>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ display: "flex", gap: "3px" }}>
                        {[1, 2, 3, 4].map(step => (
                          <span key={step} style={{
                            width: "14px", height: "2px", borderRadius: "1px",
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

      {pageCount > 1 && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          gap: "12px", marginTop: "20px",
        }}>
          <Link
            href={`/work/${workId}?sec=${p}`}
            style={{ ...pagerLink, opacity: p === 0 ? 0.3 : 1, pointerEvents: p === 0 ? "none" : "auto" }}
          >
            ←
          </Link>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>{p + 1} / {pageCount}</span>
          <Link
            href={`/work/${workId}?sec=${p + 2}`}
            style={{ ...pagerLink, opacity: p >= pageCount - 1 ? 0.3 : 1, pointerEvents: p >= pageCount - 1 ? "none" : "auto" }}
          >
            →
          </Link>
        </div>
      )}
    </>
  );
}

const pagerLink: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "var(--r3)",
  border: "1px solid var(--bord)", color: "var(--parch2)",
  textDecoration: "none", fontSize: "13px",
};

function daysUntil(date: Date, now: Date): string {
  const days = Math.ceil((new Date(date).getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// ── Stilar ───────────────────────────────────────────────────────────
const headerBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: "var(--r3)",
  border: "1px solid var(--bord)",
  color: "var(--parch2)",
  textDecoration: "none",
  fontSize: "12px",
  whiteSpace: "nowrap",
};
const backLink: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)",
  textDecoration: "none", display: "inline-block", marginBottom: "24px",
};
const eyebrow: React.CSSProperties = {
  fontSize: "10px", letterSpacing: "0.2em",
  color: "var(--gold)", textTransform: "uppercase", marginBottom: "8px",
};
const h2: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "19px", fontWeight: 400,
  color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "14px",
};
const list: React.CSSProperties = {
  listStyle: "none", display: "flex", flexDirection: "column", gap: "6px",
};
const rowLink: React.CSSProperties = { textDecoration: "none", display: "block" };
const row: React.CSSProperties = {
  background: "var(--bg2)", borderRadius: "var(--r2)",
  padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px",
};
const numCell: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "13px",
  color: "var(--bg4)", width: "24px", flexShrink: 0,
};
const track: React.CSSProperties = {
  height: "3px", background: "var(--bg4)",
  borderRadius: "2px", overflow: "hidden",
};
const fill: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, var(--gold2), var(--gold))",
  borderRadius: "2px", transition: "width .6s ease",
};
