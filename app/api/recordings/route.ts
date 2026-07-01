// app/api/recordings/route.ts
// Fas 8
// POST /api/recordings   → ladda upp en recitation-inspelning (audio/webm el. liknande)
//                          form fields: file, sectionId
//                          → { path, signedUrl }
// GET  /api/recordings?path=xxx → ny signerad uppspelnings-URL för en redan
//                          uppladdad inspelning (signerade URL:er går ut)
//
// Mirrors app/api/avatar/route.ts, men mot en PRIVAT bucket ('recordings')
// — ingen publik URL sparas, bara storage-path. Uppspelning sker alltid
// via en färsk signerad URL.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECS = 60 * 10; // 10 minuter — räcker för uppspelning direkt efter övning
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — gott om utrymme för en sektions längd

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials missing in env");
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const formData  = await req.formData();
    const file       = formData.get("file") as File | null;
    const sectionId  = formData.get("sectionId") as string | null;

    if (!file || !sectionId) {
      return NextResponse.json({ error: "Missing file or sectionId" }, { status: 400 });
    }

    // Verifiera att sektionen tillhör användaren (samma kontroll-mönster
    // som överallt annars i appen — ägarskap via requireUser(), inte RLS).
    const section = await prisma.section.findFirst({
      where: { id: sectionId, work: { userId: user.id } },
    });
    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Recording too large (max 10 MB)" }, { status: 400 });
    }

    const ext      = (file.type.split("/")[1] || "webm").split(";")[0]; // "audio/webm;codecs=opus" → "webm"
    const filename = `${user.id}/${sectionId}/${Date.now()}.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    const supabase = getSupabase();

    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(filename, buffer, { contentType: file.type || "audio/webm" });

    if (uploadError) throw new Error(uploadError.message);

    const { data: signed, error: signError } = await supabase.storage
      .from("recordings")
      .createSignedUrl(filename, SIGNED_URL_TTL_SECS);

    if (signError) throw new Error(signError.message);

    return NextResponse.json({ path: filename, signedUrl: signed.signedUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");
    if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

    // Filnamnet börjar alltid med userId/ — billig ägarskapskontroll utan
    // en extra DB-träff (storage-path är inte gissningsbart i sig, men vi
    // dubbelkollar ändå att det är den inloggade användarens egen mapp).
    if (!path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from("recordings")
      .createSignedUrl(path, SIGNED_URL_TTL_SECS);

    if (error) throw new Error(error.message);

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
