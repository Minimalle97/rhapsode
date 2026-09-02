// app/(app)/work/[id]/drills/skeleton/page.tsx
//
// Drill 1 — Skelettet.
//
// Sidan gor tre saker: kontrollerar att verket ar ditt, plattar ut det
// till en lista rader, och hamtar dina instalningar. Sjalva nedskarningen
// sker i webblasaren, i lib/drills/skeleton.ts — den ar ren rakning, och
// att gora om den pa servern vid varje reglageryck hade betytt ett anrop
// per klick pa en skjutreglage.
//
// Behorigheten provas HAR pa servern, inte bara i granssnittet. Ransonen
// dras forst nar ett kort bedoms, av /api/drills/attempt.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { settingsFor, allowanceFor } from "@/lib/drills";
import { SkeletonDrill, type DrillLine } from "@/components/drills/SkeletonDrill";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Skeleton drill" };

export default async function SkeletonDrillPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:  { id, userId: user.id },
    select: {
      id: true, title: true, author: true,
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

  // Ut med raderna, en och en. Tomma rader ar mellanrum i dikten och
  // hor inte hemma som kort — det finns ingenting att minnas i dem.
  const lines: DrillLine[] = [];
  for (const section of work.sections) {
    section.content.split("\n").forEach((text, lineIndex) => {
      if (text.trim() === "") return;
      lines.push({
        sectionId:   section.id,
        sectionName: section.name,
        lineIndex,
        text,
      });
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
    <SkeletonDrill
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
