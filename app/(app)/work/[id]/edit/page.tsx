// app/(app)/work/[id]/edit/page.tsx
// Städa och rätta ett importerat verk.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { WorkEditor } from "@/components/library/WorkEditor";
import { WorkSettings } from "@/components/library/WorkSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const work = await prisma.work.findUnique({
    where: { id }, select: { title: true },
  });
  return { title: work ? `Clean up · ${work.title}` : "Clean up" };
}

export default async function EditWorkPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:  { id, userId: user.id },
    select: {
      id: true, title: true, author: true, type: true,
      sections: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true, name: true, content: true,
          status: true, orderIndex: true,
          part: { select: { name: true } },
        },
      },
    },
  });
  if (!work) notFound();

  return (
    <>
      <div style={{ maxWidth: "880px", margin: "0 auto", padding: "32px 24px 0" }}>
        <WorkSettings
          workId={work.id}
          title={work.title}
          author={work.author}
          type={work.type}
          sectionCount={work.sections.length}
        />
      </div>

      <WorkEditor
        workId={work.id}
        title={work.title}
        author={work.author}
        sections={work.sections.map(s => ({
          id:         s.id,
          name:       s.name,
          content:    s.content,
          status:     s.status,
          orderIndex: s.orderIndex,
          partName:   s.part?.name ?? null,
        }))}
      />
    </>
  );
}
