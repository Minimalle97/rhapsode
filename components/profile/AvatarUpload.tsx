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

interface AvatarUploadProps {
  username:  string;
  avatarUrl: string | null;
}

export function AvatarUpload({ username, avatarUrl }: AvatarUploadProps) {
  const { openUserProfile } = useClerk();

  return (
    <button
      type="button"
      onClick={() => openUserProfile()}
      title="Change your picture"
      style={wrap}
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
