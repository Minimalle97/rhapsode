// app/api/profile/bio/route.ts
// PATCH { bio } → nagra rader om dig sjalv, synliga for vanner.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { prisma } from "@/lib/db";
import { cleanBio } from "@/lib/postText";

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await session();

    const limited = await rateLimit(`bio:${user.id}`, 30, 3600);
    if (limited) return limited;

    const raw = await req.json().catch(() => ({}));
    const bio = cleanBio(typeof raw.bio === "string" ? raw.bio : "");

    await prisma.user.update({
      where: { id: user.id },
      // Tom strang betyder "ta bort", inte "spara tomt".
      data:  { bio: bio || null },
    });

    return NextResponse.json({ bio: bio || null });
  } catch (err) {
    return toResponse(err);
  }
}
