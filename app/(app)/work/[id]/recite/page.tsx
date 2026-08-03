// app/(app)/work/[id]/recite/page.tsx
// Recitera hela verket i takt.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ReciteView } from "@/components/practice/ReciteView";
import { suggestMeter } from "@/lib/meter";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const work = await prisma.work.findUnique({
    where: { id }, select: { title: true },
  });
  return { title: work ? `Recite · ${work.title}` : "Recite" };
}

export default async function ReciteWorkPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:  { id, userId: user.id },
    select: {
      id: true, title: true, author: true, type: true,
      sections: {
        orderBy: { orderIndex: "asc" },
        select:  { content: true },
      },
    },
  });
  if (!work) notFound();

  const text = work.sections.map(s => s.content).join("\n\n");

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
