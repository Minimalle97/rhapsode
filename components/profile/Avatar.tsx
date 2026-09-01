// components/profile/Avatar.tsx
//
// Profilbilden, med eller utan bard.
//
// Fanns tidigare som fem nastan identiska kopior — i vanlistan, i flodet,
// pa bada profilsidorna, i tvekampsrutan. Nar barden tillkom hade det
// blivit fem stallen att rita samma ring pa, och det femte hade glomts.
//
// Bardens id kommer alltid fran servern, aldrig fran klienten. Att den
// visas ar redan avgjort dar; den har filen ritar bara det den far.

import { borderById } from "@/lib/repertoire/borders";

interface Props {
  username:  string;
  avatarUrl: string | null;
  /** Gruppens slug, eller null. Servern har redan provat behorigheten. */
  border?:   string | null;
  size?:     number;
}

export function Avatar({ username, avatarUrl, border = null, size = 38 }: Props) {
  const ring = borderById(border);

  // Ringen tar plats fran bilden i stallet for att laggas utanpa den, sa
  // att en avatar med bard upptar exakt lika stor yta som en utan. Annars
  // hoppar varje lista dar bara vissa bar en.
  const thickness = Math.max(2, Math.round(size / 16));
  const inner     = ring ? size - thickness * 2 : size;

  const face = (
    <div style={{
      width: `${inner}px`, height: `${inner}px`, borderRadius: "50%",
      background: "var(--bg3)",
      border: ring ? "none" : "1px solid var(--bord)",
      overflow: "hidden", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{
          fontFamily: "var(--fd)",
          fontSize: `${Math.round(inner * 0.42)}px`,
          color: "var(--gold)",
        }}>
          {username[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </div>
  );

  if (!ring) return face;

  return (
    <span
      title={`${ring.name} — held entire`}
      style={{
        display: "inline-flex", flexShrink: 0,
        padding: `${thickness}px`, borderRadius: "50%",
        background: `linear-gradient(${ring.angle}deg, ${ring.from}, ${ring.to})`,
        // Tecknet sitter for smatt for att lasas under ungefar 44 px och
        // blir da bara grus i kanten. Over den storleken bars det.
        position: "relative",
      }}
    >
      {face}
      {size >= 44 && (
        <span style={{
          position: "absolute", bottom: `${-thickness}px`, left: "50%",
          transform: "translateX(-50%)",
          fontSize: `${Math.round(size * 0.2)}px`,
          lineHeight: 1,
          color: ring.from,
          background: "var(--bg)",
          borderRadius: "999px",
          padding: "1px 4px",
        }}>
          {ring.mark}
        </span>
      )}
    </span>
  );
}
