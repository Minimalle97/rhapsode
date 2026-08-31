// app/api/posts/route.ts
//
// GET    → vannernas flode
// POST   → skriv ett inlagg pa din egen profil
// DELETE → ta bort ett eget inlagg
//
// Man kan bara skriva pa sin EGEN profil. Det finns ingen mottagare i
// nyttolasten, sa det gar inte att skriva i nagon annans namn.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { prisma } from "@/lib/db";
import { cleanBody, friendFeed, MAX_BODY } from "@/lib/posts";

export async function GET() {
  try {
    const { user } = await session();
    return NextResponse.json({ posts: await friendFeed(user.id) });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await session();

    const limited = await rateLimit(`post:${user.id}`, 20, 3600);
    if (limited) return limited;

    const raw  = await req.json().catch(() => ({}));
    const body = cleanBody(typeof raw.body === "string" ? raw.body : "");

    if (!body) {
      return NextResponse.json({ error: "Write something first." }, { status: 400 });
    }
    if (body.length > MAX_BODY) {
      return NextResponse.json({ error: `At most ${MAX_BODY} characters.` }, { status: 400 });
    }

    const post = await prisma.post.create({
      data: { userId: user.id, kind: "note", body },
      select: { id: true, body: true, createdAt: true },
    });

    return NextResponse.json({ ...post, likes: 0, likedByMe: false }, { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await session();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Villkoret pa userId ar det som gor att man inte kan radera nagon
    // annans inlagg genom att gissa ett id.
    const { count } = await prisma.post.deleteMany({ where: { id, userId: user.id } });
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return toResponse(err);
  }
}
