// app/(app)/practice/[id]/[sectionId]/page.tsx
//
// ── RÄTTAT: den allvarligaste buggen i appen ──────────────────────────
//
// params är en Promise i Next.js 16. Filen behandlade den som ett vanligt
// objekt, så params.sectionId blev undefined. Prisma tolkar undefined som
// "inget villkor", och frågan blev därmed:
//
//   ge mig första bästa sektion som tillhör den här användaren
//
// Därför landade VARJE övningslänk på sektion 1 — oavsett vad du klickade
// på och oavsett vilket verk. Det var det du märkte när du tryckte på
// session 2 och hamnade i session 1.

import { requireUser, getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PracticePanel } from "@/components/practice/PracticePanel";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string; sectionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sectionId } = await params;
  const user = await getUser();
  const section = user && await prisma.section.findFirst({
    where:  { id: sectionId, work: { userId: user.id } },
    select: { name: true, work: { select: { title: true } } },
  });
  return {
    title: section ? `${section.work.title} · ${section.name}` : "Practice",
  };
}

export default async function PracticePage({ params }: Props) {
  const { id, sectionId } = await params;
  if (!id || !sectionId) notFound();

// Prisma tolkar `undefined` i ett where-villkor som "inget villkor". Ett id
// som av någon anledning saknas gav därför inte ett fel utan FÖRSTA BÄSTA
// rad — vilket är precis så en trasig params-hantering kunde skicka dig in i
// ett annat verk utan att något såg fel ut. En uttrycklig vakt gör att den
// sortens miss blir en 404 i stället för fel text.

  const user = await requireUser();

  const section = await prisma.section.findFirst({
    where: { id: sectionId, workId: id, work: { userId: user.id } },
    select: {
      id: true, name: true, content: true,
      work: { select: { id: true, title: true } },
      part: { select: { id: true, name: true } },
    },
  });

  if (!section) notFound();

  return (
    <PracticePanel
      workId={section.work.id}
      workTitle={section.work.title}
      sectionId={section.id}
      // Utan delens namn är "2" omöjligt att placera i ett stort verk
      sectionName={
        section.part ? `${section.part.name} · ${section.name}` : section.name
      }
      content={section.content}
      prevRank={user.rank}
    />
  );
}
