// app/api/drills/settings/route.ts
//
// GET   — hamta mina drillinstalningar
// PATCH — spara dem
//
// Instalningarna ar per person, inte per verk. De sager hur mycket stod
// man vill ha, och det foljer vanan snarare an den enskilda texten.
//
// Routen fattar inga beslut om vardena: cleanSettings() i
// lib/drills/skeleton.ts tvingar in dem i det tillatna, och den gor det
// pa BADA hallen — bade nar de sparas och nar de lases tillbaka.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { settingsFor, saveSettings } from "@/lib/drills";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await session();
    return NextResponse.json({ settings: await settingsFor(user.id) });
  } catch (err) {
    return toResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await session();

    // Instalningarna sparas vid varje reglageryck. Taket ar hogt nog att
    // ingen mansklig hand nar det, och lagt nog att en snurrande klient
    // inte kan skriva tusen rader i minuten.
    const limited = await rateLimit(`drill-settings:${user.id}`, 60);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const settings = await saveSettings(user.id, {
      lettersPerWord:    Number(body.lettersPerWord),
      wholeWordsPerLine: Number(body.wholeWordsPerLine),
      showWordLength:    body.showWordLength,
      keepShortWords:    body.keepShortWords,
    });

    return NextResponse.json({ settings });
  } catch (err) {
    return toResponse(err);
  }
}
