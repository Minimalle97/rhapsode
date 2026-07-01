// app/api/avatar/route.ts
// POST /api/avatar  → ladda upp profilbild till Supabase Storage, returnerar publik URL
// Stöder: JPEG, PNG, GIF, WebP — max 2 MB

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";

// Supabase-klienten initieras med service role key för Storage-access (server-only)
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials missing in env");
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const formData = await req.formData();
    const file     = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validera MIME-typ
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    // Validera storlek: max 2 MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });
    }

    const ext       = file.type.split("/")[1].replace("jpeg", "jpg");
    const filename  = `${user.id}/avatar.${ext}`;
    const buffer    = Buffer.from(await file.arrayBuffer());

    const supabase  = getSupabase();

    // Ladda upp (upsert: ersätt om befintlig)
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert:      true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    // Hämta publik URL
    const { data } = supabase.storage
      .from("avatars")
      .getPublicUrl(filename);

    const publicUrl = data.publicUrl;

    // Spara ny URL i DB
    await prisma.user.update({
      where: { id: user.id },
      data:  { avatarUrl: publicUrl },
    });

    return NextResponse.json({ avatarUrl: publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
