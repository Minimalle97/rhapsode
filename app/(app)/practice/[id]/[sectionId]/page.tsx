// app/(app)/practice/[id]/[sectionId]/page.tsx
// Fas 8: praktik-sidan. Stod med i den allra första filstrukturen från
// Fas 1, men har varit den enda saknade länken sedan dess — SM-2, XP,
// streaks och statistik-grafer har alla legat och väntat på den.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PracticePanel } from "@/components/practice/PracticePanel";

interface Props {
  params: { id: string; sectionId: string };
}

export default async function PracticePage({ params }: Props) {
  const user = await requireUser();

  const section = await prisma.section.findFirst({
    where:   { id: params.sectionId, workId: params.id, work: { userId: user.id } },
    include: { work: { select: { id: true, title: true } } },
  });

  if (!section) notFound();

  return (
    <PracticePanel
      workId={section.work.id}
      workTitle={section.work.title}
      sectionId={section.id}
      sectionName={section.name}
      content={section.content}
      prevRank={user.rank}
    />
  );
}
