// app/(app)/work/[id]/drills/cumulative/page.tsx
//
// Drill 2 — Kumulativ uppbyggnad.
//
// Samma form som skelettsidan: kontrollera att verket ar ditt, platta ut
// det till rader, hamta instalningarna. Sjalva fonstret raknas i
// webblasaren, i CumulativeDrill.
//
// Behorigheten provas HAR pa servern. Ransonen dras forst nar ett kort
// bedoms, av /api/drills/attempt.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { settingsFor, allowanceFor } from "@/lib/drills";
import { CumulativeDrill } from "@/components/drills/CumulativeDrill";
import type { DrillLine } from "@/components/drills/SkeletonDrill";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Cumulative build" };

export default async function CumulativeDrillPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:  { id, userId: user.id },
    select: {
      id: true, title: true,
      sections: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, content: true },
      },
    },
  });
  if (!work) notFound();

  const ent = await getEntitlements(user);
  const [settings, allowance] = await Promise.all([
    settingsFor(user.id),
    allowanceFor(user.id, ent),
  ]);

  // Tomma rader ar mellanrum i dikten och hor inte hemma som kort.
  const lines: DrillLine[] = [];
  for (const section of work.sections) {
    section.content.split("\n").forEach((text, lineIndex) => {
      if (text.trim() === "") return;
      lines.push({ sectionId: section.id, sectionName: section.name, lineIndex, text });
    });
  }

  if (lines.length === 0) {
    return (
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "36px 24px" }}>
        <Link href={`/work/${work.id}/drills`} style={{
          fontSize: "13px", color: "var(--muted)", textDecoration: "none",
        }}>
          ← Drills
        </Link>
        <p style={{
          marginTop: "24px", padding: "28px", textAlign: "center",
          fontSize: "13px", color: "var(--muted)", background: "var(--bg2)",
          border: "1px solid var(--bord)", borderRadius: "var(--r2)",
        }}>
          There are no lines in this work to drill yet.
        </p>
      </div>
    );
  }

  return (
    <CumulativeDrill
      workId={work.id}
      workTitle={work.title}
      lines={lines}
      settings={settings}
      allowance={{
        unlimited: allowance.unlimited,
        remaining: allowance.remaining,
        limit:     allowance.limit,
      }}
    />
  );
}
