// app/(app)/work/[id]/page.tsx
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

interface Props {
  params: { id: string };
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

export default async function WorkPage({ params }: Props) {
  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where: { id: params.id, userId: user.id },
    include: { sections: { orderBy: { orderIndex: "asc" } } },
  });

  if (!work) notFound();

  const total    = work.sections.length;
  const mastered = work.sections.filter(s => ["mastered", "permanent"].includes(s.status)).length;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px" }}>
      <Link href="/library" style={{ fontSize: "13px", color: "var(--muted)", textDecoration: "none", display: "inline-block", marginBottom: "24px" }}>
        ← Library
      </Link>

      <div style={{ marginBottom: "32px" }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.2em", color: "var(--gold)", textTransform: "uppercase", marginBottom: "8px" }}>
          {work.type}
        </p>
        <h1 style={{ fontFamily: "var(--fd)", fontSize: "40px", fontWeight: 300, color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "4px" }}>
          {work.title}
        </h1>
        <p style={{ fontSize: "15px", color: "var(--muted)", marginBottom: "20px" }}>
          {work.author}
        </p>
        <div style={{ display: "flex", gap: "24px", fontSize: "13px", color: "var(--muted)" }}>
          <span>{total} sections</span>
          <span>{mastered} mastered</span>
          <span>{work.difficulty}</span>
          <span>{work.estimatedMinutes} min est.</span>
        </div>
      </div>

      {work.analysis && (
        <div style={{ background: "var(--bg3)", border: "1px solid var(--bord)", borderRadius: "var(--r)", padding: "20px", marginBottom: "32px" }}>
          <p style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--parch2)", fontStyle: "italic" }}>
            {work.analysis}
          </p>
        </div>
      )}

      <h2 style={{ fontFamily: "var(--fd)", fontSize: "18px", fontWeight: 400, color: "var(--parch)", marginBottom: "16px", letterSpacing: "0.04em" }}>
        Sections
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {work.sections.map((section) => {
          const isDue = section.nextReview && new Date(section.nextReview) <= new Date();
          return (
            <Link
              key={section.id}
              href={`/practice/${work.id}/${section.id}`}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                background: "var(--bg2)",
                border: `1px solid ${isDue ? "rgba(200,164,80,0.3)" : "var(--bord)"}`,
                borderRadius: "var(--r2)",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                cursor: "pointer",
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "14px", color: "var(--parch)", marginBottom: "4px" }}>
                    {section.name}
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
                    {section.content.slice(0, 80)}…
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: "11px", color: STATUS_COLORS[section.status] ?? "var(--muted)", marginBottom: "4px" }}>
                    {STATUS_LABELS[section.status] ?? section.status}
                  </p>
                  {isDue && (
                    <p style={{ fontSize: "10px", color: "var(--gold)", letterSpacing: "0.1em" }}>DUE</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}