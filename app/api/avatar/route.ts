// app/api/avatar/route.ts
// POST /api/avatar  → ladda upp profilbild till Supabase Storage, returnerar publik URL
// Stöder: JPEG, PNG, GIF, WebP — max 2 MB

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/http/guard";
import { sniffImage } from "@/lib/upload";
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

    // Uppladdning ar dyr: hela kroppen buffras, bilden skrivs till
    // Storage. Utan tak gar det att halla igang i all evighet.
    const limited = await rateLimit(`avatar:${user.id}`, 10, 3600);
    if (limited) return limited;

    const formData = await req.formData();
    const file     = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Storleken forst — innan filen lases in i minnet.
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // RATTAT: kontrollen last tidigare bara file.type, som kommer fran
    // klienten och ar ett pastaende. Vem som helst kunde skicka vilka
    // bytes som helst med Content-Type: image/png och fa dem lagrade i
    // en publik bucket — en gratis filhotell-tjanst pa din bekostnad,
    // och ett stalle att lagga saker man vill lanka till.
    //
    // Nu avgors typen av filens egna forsta byte. SVG slapps med flit
    // inte igenom: det ar ett XML-dokument som kan innehalla skript.
    const sniffed = sniffImage(buffer);
    if (!sniffed) {
      return NextResponse.json(
        { error: "That file isn't a PNG, JPEG, GIF or WebP image." },
        { status: 400 }
      );
    }

    const ext      = sniffed.ext;
    const filename = `${user.id}/avatar.${ext}`;

    const supabase  = getSupabase();

    // Ladda upp (upsert: ersätt om befintlig)
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filename, buffer, {
        // Fran signaturen, inte fran klientens pastaende. Serveras filen
        // med en typ nagon annan valt kan den tolkas som nagot annat an
        // en bild.
        contentType: sniffed.mime,
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
