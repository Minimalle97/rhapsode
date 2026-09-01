"use client";
// components/profile/AvatarUpload.tsx
//
// Profilbilden.
//
// ── RÄTTAT: två bilder för samma person ───────────────────────────────
//
// Komponenten laddade tidigare upp en egen bild till Supabase, medan
// UserButton uppe till höger visade Clerks bild. Bytte man den ena
// ändrades inte den andra, så "Manage account" och profilsidan visade
// olika ansikten för samma konto.
//
// Nu äger Clerk bilden, och lib/auth.ts speglar den vid varje inloggning.
// Det går inte längre att glida isär, för det finns bara en bild.
//
// Följden är att uppladdningen sker i Clerks egen ruta i stället för
// här. Det är inte en förlust — den rutan gör samma sak, beskär bilden
// bättre, och är ett ställe färre där en fil kan laddas upp till oss.

import { useClerk } from "@clerk/nextjs";
import type { CSSProperties } from "react";
import { borderById } from "@/lib/repertoire/borders";

interface AvatarUploadProps {
  username:  string;
  avatarUrl: string | null;
  /**
   * Gruppbarden som bars, eller null.
   *
   * Servern har redan avgjort om den FAR visas — att gruppen ar klar,
   * lasset oppnat och prenumerationen aktiv. Den har filen ritar bara.
   */
  border?:   string | null;
}

export function AvatarUpload({ username, avatarUrl, border = null }: AvatarUploadProps) {
  const { openUserProfile } = useClerk();
  const ring = borderById(border);

  const button = (
    <button
      type="button"
      onClick={() => openUserProfile()}
      title="Change your picture"
      style={{
        ...wrap,
        // Ringen ager kanten nar en bard bars, sa den egna ramen tas bort.
        ...(ring ? { border: "none", width: "76px", height: "76px" } : {}),
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" style={image} />
      ) : (
        <span style={initial}>{username.trim().charAt(0).toUpperCase() || "?"}</span>
      )}

      <span style={hint}>Change</span>
    </button>
  );

  if (!ring) return button;

  return (
    <span
      title={`${ring.name} — held entire`}
      style={{
        display: "inline-flex", flexShrink: 0,
        padding: "3px", borderRadius: "50%",
        background: `linear-gradient(${ring.angle}deg, ${ring.from}, ${ring.to})`,
        position: "relative",
      }}
    >
      {button}
      <span style={{
        position: "absolute", bottom: "-4px", left: "50%",
        transform: "translateX(-50%)",
        fontSize: "15px", lineHeight: 1, color: ring.from,
        background: "var(--bg)", borderRadius: "999px", padding: "2px 7px",
      }}>
        {ring.mark}
      </span>
    </span>
  );
}

const wrap: CSSProperties = {
  position:     "relative",
  width:        "82px",
  height:       "82px",
  borderRadius: "50%",
  border:       "1px solid var(--bord)",
  background:   "var(--bg3)",
  padding:      0,
  cursor:       "pointer",
  overflow:     "hidden",
  flexShrink:   0,
};

const image: CSSProperties = {
  width: "100%", height: "100%", objectFit: "cover", display: "block",
};

const initial: CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  width:          "100%",
  height:         "100%",
  fontFamily:     "var(--fd)",
  fontSize:       "32px",
  color:          "var(--gold)",
};

const hint: CSSProperties = {
  position:   "absolute",
  left:       0,
  right:      0,
  bottom:     0,
  padding:    "3px 0",
  fontSize:   "9.5px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color:      "var(--parch)",
  background: "rgba(12,16,21,0.78)",
};
