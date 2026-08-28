// app/(app)/work/[id]/part/[partId]/recite/page.tsx
// Recitera en enskild del — en sång, en scen, en bok.

import { requireUser, getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ReciteView } from "@/components/practice/ReciteView";
import { suggestMeter } from "@/lib/meter";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string; partId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { partId } = await params;
  const user = await getUser();
  const part = user && await prisma.part.findFirst({
    where: { id: partId, work: { userId: user.id } }, select: { name: true },
  });
  return { title: part ? `Recite · ${part.name}` : "Recite" };
}

export default async function RecitePartPage({ params }: Props) {
  const { id, partId } = await params;
  if (!id || !partId) notFound();

  const user = await requireUser();

  const part = await prisma.part.findFirst({
    where:  { id: partId, workId: id, work: { userId: user.id } },
    select: {
      id: true, name: true,
      work: { select: { id: true, title: true, author: true, type: true } },
      sections: {
        orderBy: { orderIndex: "asc" },
        select:  { content: true },
      },
    },
  });
  if (!part) notFound();

  const text = part.sections.map(s => s.content).join("\n\n");

  return (
    <ReciteView
      title={part.name}
      author={`${part.work.title} · ${part.work.author}`}
      text={text}
      suggestedMeter={suggestMeter(part.work.type, text)}
      backHref={`/work/${part.work.id}/part/${part.id}`}
      backLabel={part.name}
    />
  );
}
