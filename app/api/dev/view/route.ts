// app/api/dev/view/route.ts
// POST { view: "pro" | "free" } → vaxlar vad ett utvecklarkonto ser.
//
// Routen kontrollerar sjalv att kontot ar ett utvecklarkonto. Att den
// bara ritas ut for utvecklare i granssnittet ar ingen sakerhet — det
// ar servern som avgor, och for alla andra ar svaret 403.
//
// Aven om kontrollen skulle fallera kan kakan bara SANKA behorigheten:
// getEntitlements laser den enbart i riktningen pro → free, och enbart
// for konton som redan ar utvecklarkonton. Det finns ingen vag har som
// ger nagon nagot.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { DEV_VIEW_COOKIE } from "@/lib/billing/devView";
import { toResponse } from "@/lib/http/guard";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const ent  = await getEntitlements(user);

    // devViewingFree betyder att kontot ER utvecklare men tittar som
    // gratis just nu — da maste vaxeln fortfarande fungera.
    const isDeveloper = ent.source === "developer" || ent.devViewingFree === true;
    if (!isDeveloper) {
      return NextResponse.json({ error: "Not a developer account" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const view = body.view === "free" ? "free" : "pro";

    const res = NextResponse.json({ view });

    if (view === "free") {
      res.cookies.set(DEV_VIEW_COOKIE, "free", {
        httpOnly: true,
        sameSite: "lax",
        secure:   process.env.NODE_ENV === "production",
        path:     "/",
        maxAge:   60 * 60 * 24 * 30,
      });
    } else {
      res.cookies.delete(DEV_VIEW_COOKIE);
    }

    return res;
  } catch (err) {
    return toResponse(err);
  }
}
