// app/(app)/work/[id]/edit/page.tsx
//
// RÄTTAT: sidan skickade tidigare varje sektions FULLA text till
// webbläsaren. För en pjäs på femhundra sektioner innebar det hela
// pjäsen två gånger — en gång i serverpayloaden, en gång i React-state.
// För ett verk på flera tusen sektioner frös fliken.
//
// Nu skickas bara ett kort utdrag per sektion, och sidan hämtar hem
// hundra åt gången. Hela texten hämtas först när du öppnar en sektion
// för redigering.

import { requireUser, getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { WorkEditor } from "@/components/library/WorkEditor";
import { WorkSettings } from "@/components/library/WorkSettings";
import { CleanupPanel } from "@/components/library/CleanupPanel";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;
const PREVIEW  = 400;

interface Props {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser();
  const work = user && await prisma.work.findFirst({
    where: { id, userId: user.id }, select: { title: true },
  });
  return { title: work ? `Clean up · ${work.title}` : "Clean up" };
}

export default async function EditWorkPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const sp   = await searchParams;
  const user = await requireUser();

  const work = await prisma.work.findFirst({
    where:  { id, userId: user.id },
    select: { id: true, title: true, author: true, type: true },
  });
  if (!work) notFound();

  const total = await prisma.section.count({ where: { workId: id } });

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const page      = Math.min(
    pageCount - 1,
    Math.max(0, (Number(sp.page) || 1) - 1)
  );

  const rows = await prisma.section.findMany({
    where:   { workId: id },
    orderBy: { orderIndex: "asc" },
    skip:    page * PER_PAGE,
    take:    PER_PAGE,
    select: {
      id: true, name: true, status: true, orderIndex: true,
      content: true,
      part: { select: { name: true } },
    },
  });

  return (
    <>
      <div style={{ maxWidth: "880px", margin: "0 auto", padding: "32px 24px 0" }}>
        <WorkSettings
          workId={work.id}
          title={work.title}
          author={work.author}
          type={work.type}
          sectionCount={total}
        />
      </div>

      <div style={{ maxWidth: "880px", margin: "0 auto", padding: "22px 24px 0" }}>
        {/*
          Städningen först. Den är det man kom hit för — resten av sidan
          är för att rätta enstaka sektioner för hand, vilket man gör
          efteråt, om alls.
        */}
        <CleanupPanel
          workId={work.id}
          sectionCount={total}
          // Utdragen finns redan i listan. Att skicka med dem hit gör
          // före/efter möjligt utan en extra rundtur till servern.
          originals={Object.fromEntries(rows.map(r => [r.id, r.content]))}
        />
      </div>

      <WorkEditor
        workId={work.id}
        title={work.title}
        author={work.author}
        total={total}
        page={page}
        pageCount={pageCount}
        sections={rows.map(s => ({
          id:         s.id,
          name:       s.name,
          // Bara ett utdrag går över tråden. Nog för att söka i,
          // nog för att känna igen skräp, men inte hela verket.
          preview:    s.content.slice(0, PREVIEW),
          truncated:  s.content.length > PREVIEW,
          status:     s.status,
          orderIndex: s.orderIndex,
          partName:   s.part?.name ?? null,
        }))}
      />
    </>
  );
}
