// app/(app)/work/[id]/read/page.tsx
//
// Ingangen till lasningen: skickar vidare till forsta sektionen.
//
// Finns for att /work/<id>/read ska vara en adress som gar att lanka till
// och skriva for hand. Vilken sektion som ar den forsta ar en fraga om
// data, inte om adress, och den fragan besvaras har i stallet for i varje
// lank som vill borja fran borjan.

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ id: string }> }

export default async function ReadWorkPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const user = await requireUser();

  const first = await prisma.section.findFirst({
    where:   { workId: id, work: { userId: user.id } },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    select:  { id: true },
  });

  // Inget att lasa — verket finns inte, ar inte ditt, eller ar tomt. Alla
  // tre far samma svar: att skilja dem at vore att beratta for en
  // frammande att verket existerar.
  if (!first) notFound();

  redirect(`/work/${id}/read/${first.id}`);
}
