// app/api/friends/route.ts
//
// GET  — vänner, inkommande och utgående förfrågningar
// POST — skicka en förfrågan till ett handle

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listFriends, incomingRequests, outgoingRequests } from "@/lib/friends";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const [friends, incoming, outgoing] = await Promise.all([
      listFriends(user.id),
      incomingRequests(user.id),
      outgoingRequests(user.id),
    ]);

    return NextResponse.json({
      friends,
      incoming,
      outgoing,
      me: { handle: user.handle ?? null, username: user.username },
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { handle } = await req.json();

    const clean = String(handle ?? "").trim().toLowerCase().replace(/^@/, "");
    if (!clean) {
      return NextResponse.json({ error: "No handle given" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where:  { handle: clean },
      select: { id: true, username: true, handle: true },
    });

    if (!target) {
      return NextResponse.json({ error: `No one goes by @${clean}` }, { status: 404 });
    }
    if (target.id === user.id) {
      return NextResponse.json({ error: "That's you" }, { status: 400 });
    }

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: user.id,   addresseeId: target.id },
          { requesterId: target.id, addresseeId: user.id },
        ],
      },
      select: { id: true, status: true, requesterId: true },
    });

    if (existing) {
      // Har de redan bjudit in dig blir din förfrågan ett ja
      if (existing.status === "pending" && existing.requesterId === target.id) {
        await prisma.friendship.update({
          where: { id: existing.id },
          data:  { status: "accepted", respondedAt: new Date() },
        });
        return NextResponse.json({ accepted: true, username: target.username });
      }

      return NextResponse.json(
        {
          error: existing.status === "accepted"
            ? `You and ${target.username} are already friends`
            : "That request is already waiting",
        },
        { status: 409 }
      );
    }

    await prisma.friendship.create({
      data: { requesterId: user.id, addresseeId: target.id },
    });

    return NextResponse.json({ sent: true, username: target.username }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : "Unknown error";
  if (msg === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: msg }, { status: 500 });
}
