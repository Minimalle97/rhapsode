// app/api/posts/[id]/like/route.ts
// POST → gilla eller ta tillbaka.
//
// Man far bara gilla inlagg man har ratt att SE. Utan den kontrollen
// vore gillningen ett satt att bekrafta att ett visst inlagg finns hos
// nagon man inte ar van med.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { prisma } from "@/lib/db";
import { canSeePosts, toggleLike } from "@/lib/posts";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { user } = await session();

    const limited = await rateLimit(`like:${user.id}`, 120, 3600);
    if (limited) return limited;

    const post = await prisma.post.findUnique({
      where:  { id },
      select: { id: true, userId: true },
    });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await canSeePosts(user.id, post.userId))) {
      // 404, inte 403 — ett nekande skulle bekrafta att inlagget finns.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(await toggleLike(id, user.id));
  } catch (err) {
    return toResponse(err);
  }
}
