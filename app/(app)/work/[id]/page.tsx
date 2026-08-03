// app/(app)/work/[id]/page.tsx
//
// TVÅ FIXAR:
// 1. `params` är en Promise i Next.js 15+ och måste await:as. Den gamla
//    koden läste params.id direkt, vilket kraschar sidan.
// 2. Inga onMouseEnter/onMouseLeave — event handlers får inte skickas
//    från serverkomponenter. Hover sköts nu i CSS.
//
// NYTT: sektioner som är dags att repetera lyfts fram överst.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  not_started: "var(--muted)",
  learning:    "var(--blue)",
  learned:     "var(--parch2)",
  stable:      "var(--green)",
  mastered:    "var(--gold)",
  permanent:   "var(--gold)",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  learning:    "Learning",
  learned:     "Learned",
  stable:      "Stable",
  mastered:    "Mastered",
  permanent:   "Permanent",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const work = await prisma.work.findUnique({
    where:  { id },
    select: { title: true },
  });
  return { title: work?.title ?? "Work" };
}

export default async function WorkPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:   { id, userId: user.id },
    include: { sections: { orderBy: { orderIndex: "asc" } } },
  });

  if (!work) notFound();

  const total    = work.sections.length;
  const mastered = work.sections.filter(s =>
    ["mastered", "permanent"].includes(s.status)
  ).length;
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

  const now = new Date();
  const due = work.sections.filter(
    s => s.nextReview && new Date(s.nextReview) <= now
  );
  const nextUp =
    due[0] ?? work.sections.find(s => s.status === "not_started") ?? null;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link
        href="/library"
        style={{
          fontSize:       "13px",
          color:          "var(--muted)",
          textDecoration: "none",
          display:        "inline-block",
          marginBottom:   "24px",
        }}
      >
        ← Library
      </Link>

      {/* Rubrik */}
      <header style={{ marginBottom: "28px" }}>
        <p style={{
          fontSize:      "10px",
          letterSpacing: "0.2em",
          color:         "var(--gold)",
          textTransform: "uppercase",
          marginBottom:  "8px",
        }}>
          {work.type}
        </p>
        <h1 style={{
          fontFamily:    "var(--fd)",
          fontSize:      "clamp(30px, 6vw, 42px)",
          fontWeight:    300,
          color:         "var(--parch)",
          letterSpacing: "0.03em",
          lineHeight:    1.1,
          marginBottom:  "6px",
        }}>
          {work.title}
        </h1>
        <p style={{ fontSize: "15px", color: "var(--muted)", marginBottom: "22px" }}>
          {work.author}
        </p>

        {/* Framsteg */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "baseline",
            marginBottom:   "7px",
          }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {mastered} of {total} mastered
            </span>
            <span style={{
              fontFamily: "var(--fd)",
              fontSize:   "16px",
              color:      pct === 100 ? "var(--gold)" : "var(--parch2)",
            }}>
              {pct}%
            </span>
          </div>
          <div style={{
            height:       "3px",
            background:   "var(--bg4)",
            borderRadius: "2px",
            overflow:     "hidden",
          }}>
            <div style={{
              height:       "100%",
              width:        `${pct}%`,
              background:   "linear-gradient(90deg, var(--gold2), var(--gold))",
              borderRadius: "2px",
              transition:   "width .6s ease",
            }} />
          </div>
        </div>

        <div style={{
          display:  "flex",
          gap:      "18px",
          fontSize: "12px",
          color:    "var(--muted)",
          flexWrap: "wrap",
        }}>
          <span>{work.difficulty}</span>
          <span>{work.estimatedMinutes} min estimated</span>
          {due.length > 0 && (
            <span style={{ color: "var(--gold)" }}>
              {due.length} due for review
            </span>
          )}
        </div>
      </header>

      {/* Nästa steg — den enda knappen som spelar roll just nu */}
      {nextUp && (
        <Link
          href={`/practice/${work.id}/${nextUp.id}`}
          style={{ textDecoration: "none", display: "block", marginBottom: "28px" }}
        >
          <div style={{
            background:   "var(--gold3)",
            border:       "1px solid rgba(200,164,80,0.32)",
            borderRadius: "var(--r)",
            padding:      "18px 22px",
            display:      "flex",
            alignItems:   "center",
            gap:          "16px",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize:      "10px",
                letterSpacing: "0.2em",
                color:         "var(--gold)",
                textTransform: "uppercase",
                marginBottom:  "5px",
              }}>
                {due.length > 0 ? "Due now" : "Start here"}
              </p>
              <p style={{
                fontFamily: "var(--fd)",
                fontSize:   "19px",
                color:      "var(--parch)",
              }}>
                {nextUp.name}
              </p>
            </div>
            <span style={{ color: "var(--gold)", fontSize: "18px", flexShrink: 0 }}>→</span>
          </div>
        </Link>
      )}

      {/* Analys */}
      {work.analysis && (
        <div style={{
          background:   "var(--bg3)",
          border:       "1px solid var(--bord)",
          borderRadius: "var(--r)",
          padding:      "20px 22px",
          marginBottom: "32px",
        }}>
          <p style={{
            fontSize:   "13px",
            lineHeight: 1.75,
            color:      "var(--parch2)",
            fontStyle:  "italic",
          }}>
            {work.analysis}
          </p>
          {work.practiceAdvice && (
            <p style={{
              fontSize:  "12px",
              lineHeight: 1.7,
              color:     "var(--muted)",
              marginTop: "14px",
              paddingTop: "14px",
              borderTop: "1px solid var(--bord)",
            }}>
              {work.practiceAdvice}
            </p>
          )}
        </div>
      )}

      {/* Sektioner */}
      <h2 style={{
        fontFamily:    "var(--fd)",
        fontSize:      "19px",
        fontWeight:    400,
        color:         "var(--parch)",
        letterSpacing: "0.04em",
        marginBottom:  "14px",
      }}>
        Sections
      </h2>

      <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
        {work.sections.map((section, i) => {
          const isDue = !!section.nextReview && new Date(section.nextReview) <= now;

          return (
            <li key={section.id}>
              <Link
                href={`/practice/${work.id}/${section.id}`}
                className="section-row"
                style={{ textDecoration: "none", display: "block" }}
              >
                <div style={{
                  background:   "var(--bg2)",
                  border:       `1px solid ${isDue ? "rgba(200,164,80,0.3)" : "var(--bord)"}`,
                  borderRadius: "var(--r2)",
                  padding:      "15px 18px",
                  display:      "flex",
                  alignItems:   "center",
                  gap:          "14px",
                }}>
                  <span style={{
                    fontFamily: "var(--fd)",
                    fontSize:   "14px",
                    color:      "var(--bg4)",
                    width:      "20px",
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize:     "14px",
                      color:        "var(--parch)",
                      marginBottom: "3px",
                    }}>
                      {section.name}
                    </p>
                    <p style={{
                      fontSize:     "12px",
                      color:        "var(--muted)",
                      lineHeight:   1.5,
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap",
                    }}>
                      {section.content.slice(0, 90)}
                    </p>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{
                      fontSize:     "11px",
                      color:        STATUS_COLORS[section.status] ?? "var(--muted)",
                      marginBottom: "3px",
                    }}>
                      {STATUS_LABELS[section.status] ?? section.status}
                    </p>
                    {isDue && (
                      <p style={{
                        fontSize:      "10px",
                        color:         "var(--gold)",
                        letterSpacing: "0.1em",
                      }}>
                        DUE
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
