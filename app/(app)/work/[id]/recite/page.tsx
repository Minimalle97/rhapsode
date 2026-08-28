// app/(app)/work/[id]/recite/page.tsx
// Recitera hela verket i takt.
//
// Med en gräns: att recitera fyratusen sektioner i ett svep är varken
// tekniskt rimligt eller något någon faktiskt gör. Är verket för långt
// pekar sidan vidare till delarna, som är den enhet man reciterar.

import { requireUser, getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ReciteView } from "@/components/practice/ReciteView";
import { suggestMeter } from "@/lib/meter";
import type { Metadata } from "next";

const MAX_SECTIONS = 300;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser();
  const work = user && await prisma.work.findFirst({
    where: { id, userId: user.id }, select: { title: true },
  });
  return { title: work ? `Recite · ${work.title}` : "Recite" };
}

export default async function ReciteWorkPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:  { id, userId: user.id },
    select: { id: true, title: true, author: true, type: true },
  });
  if (!work) notFound();

  const count = await prisma.section.count({ where: { workId: id } });

  // ── För långt att ta i ett svep ─────────────────────────────────
  if (count > MAX_SECTIONS) {
    const parts = await prisma.part.findMany({
      where:   { workId: id },
      orderBy: { orderIndex: "asc" },
      select:  { id: true, name: true },
    });

    return (
      <div style={{ maxWidth: "660px", margin: "0 auto", padding: "36px 24px 80px" }}>
        <Link href={`/work/${work.id}`} style={{
          fontSize: "13px", color: "var(--muted)",
          textDecoration: "none", display: "inline-block", marginBottom: "22px",
        }}>
          ← {work.title}
        </Link>

        <h1 style={{
          fontFamily: "var(--fd)", fontSize: "30px", fontWeight: 300,
          color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "10px",
        }}>
          Recite a part
        </h1>
        <p style={{
          fontSize: "14px", color: "var(--muted)",
          lineHeight: 1.7, marginBottom: "26px",
        }}>
          {work.title} runs to {count.toLocaleString()} sections. At a normal
          pace that is many hours without pause — and it was never recited
          that way. A rhapsode took a book in an evening.
        </p>

        {parts.length > 0 ? (
          <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "5px" }}>
            {parts.map((p, i) => (
              <li key={p.id}>
                <Link
                  href={`/work/${work.id}/part/${p.id}/recite`}
                  className="section-row"
                  style={{ textDecoration: "none", display: "block" }}
                >
                  <div style={{
                    background: "var(--bg2)", border: "1px solid var(--bord)",
                    borderRadius: "var(--r2)", padding: "14px 18px",
                    display: "flex", alignItems: "center", gap: "14px",
                  }}>
                    <span style={{
                      fontFamily: "var(--fd)", fontSize: "13px",
                      color: "var(--bg4)", width: "28px", flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: "14px", color: "var(--parch)" }}>
                      {p.name}
                    </span>
                    <span style={{ color: "var(--gold)", fontSize: "15px" }}>→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--muted)" }}>
            This work has no parts to choose from. Split it up under Clean up,
            or recite section by section from the work page.
          </p>
        )}
      </div>
    );
  }

  // ── Kort nog att ta i sin helhet ────────────────────────────────
  const sections = await prisma.section.findMany({
    where:   { workId: id },
    orderBy: { orderIndex: "asc" },
    select:  { content: true },
  });

  const text = sections.map(s => s.content).join("\n\n");

  return (
    <ReciteView
      title={work.title}
      author={work.author}
      text={text}
      suggestedMeter={suggestMeter(work.type, text)}
      backHref={`/work/${work.id}`}
      backLabel={work.title}
    />
  );
}
