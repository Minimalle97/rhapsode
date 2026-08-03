// app/api/handle/route.ts
//
// GET   — kolla om ett handle är ledigt
// PATCH — sätt eller byt sitt eget handle

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateHandle } from "@/lib/friends";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const check = validateHandle(q);

    if (!check.ok) {
      return NextResponse.json({ available: false, error: check.error });
    }

    const taken = await prisma.user.findUnique({
      where:  { handle: check.handle },
      select: { id: true },
    });

    return NextResponse.json({
      available: !taken,
      handle:    check.handle,
      error:     taken ? "Already taken" : undefined,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const { handle } = await req.json();

    const check = validateHandle(String(handle ?? ""));
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const taken = await prisma.user.findUnique({
      where:  { handle: check.handle },
      select: { id: true },
    });
    if (taken && taken.id !== user.id) {
      return NextResponse.json({ error: "Already taken" }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data:  { handle: check.handle },
    });

    return NextResponse.json({ handle: check.handle });
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
