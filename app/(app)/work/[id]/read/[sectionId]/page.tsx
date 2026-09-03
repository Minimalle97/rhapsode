// app/(app)/work/[id]/read/[sectionId]/page.tsx
//
// Las igenom ett verk, sektion for sektion.
//
// Ligger bredvid /practice/[id]/[sectionId] och delar dess form med flit:
// samma agarkontroll, samma satt att hitta grannarna, samma sektionsdata.
// Skillnaden ar vad som gors med texten — har visas den, dar provas den —
// och det ar den enda skillnaden som behovs.
//
// Sjalva lasningen ar oppen for alla. Det som kraver Pro ar markeringen av
// egna svaga stallen, och den fragan stalls HAR pa servern: en gratis
// anvandare far aldrig platserna skickade till sig, sa det finns inget att
// lasa ur svaret.

import { notFound } from "next/navigation";
import { requireUser, getUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { weaknessFor, spansFor } from "@/lib/weakSpots";
import { ReadingView } from "@/components/reading/ReadingView";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; sectionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, sectionId } = await params;
  const user = await getUser();
  const section = user && await prisma.section.findFirst({
    where:  { id: sectionId, workId: id, work: { userId: user.id } },
    select: { name: true, work: { select: { title: true } } },
  });
  return { title: section ? `${section.work.title} · ${section.name}` : "Read" };
}

export default async function ReadSectionPage({ params }: Props) {
  const { id, sectionId } = await params;
  // Prisma laser `undefined` som "inget villkor" och hade da gett forsta
  // basta rad. Samma vakt som ovningssidan har, av samma skal.
  if (!id || !sectionId) notFound();

  const user = await requireUser();

  const section = await prisma.section.findFirst({
    where: { id: sectionId, workId: id, work: { userId: user.id } },
    select: {
      id: true, name: true, content: true, orderIndex: true,
      work: { select: { id: true, title: true, author: true } },
      part: { select: { name: true } },
    },
  });
  if (!section) notFound();

  // Ordningen genom verket. Delarna respekteras via orderIndex, som ar
  // det falt hela appen sorterar sektioner pa.
  const ordered = await prisma.section.findMany({
    where:   { workId: id },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    select:  { id: true },
  });

  const at = ordered.findIndex(s => s.id === sectionId);

  const ent = await getEntitlements(user);

  // Svagheten slas upp fardigrakad — den skrevs nar ovningen rattades.
  // Utan Pro stalls fragan inte alls.
  const weakness = ent.isPro ? await weaknessFor(section.id) : null;
  const spans    = weakness ? spansFor(section.content, weakness) : [];

  return (
    <ReadingView
      workId={section.work.id}
      workTitle={section.work.title}
      author={section.work.author}
      section={{
        id:       section.id,
        name:     section.name,
        content:  section.content,
        partName: section.part?.name ?? null,
      }}
      position={at >= 0 ? at + 1 : 1}
      total={ordered.length}
      prevId={at > 0 ? ordered[at - 1].id : null}
      nextId={at >= 0 && at < ordered.length - 1 ? ordered[at + 1].id : null}
      firstId={ordered[0]?.id ?? section.id}
      isPro={ent.isPro}
      spans={spans}
      hasHistory={weakness?.enough ?? false}
      saturated={weakness?.saturated ?? false}
    />
  );
}
