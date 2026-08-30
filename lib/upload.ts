// lib/upload.ts
//
// Kontroll av uppladdade filer.
//
// Bakgrund: `file.type` kommer fran klienten och ar ett pastaende, inte
// ett faktum. Vem som helst kan skicka vilka bytes som helst med
// Content-Type: image/png. En kontroll som bara laser det faltet slapper
// igenom allt.
//
// Darfor las de forsta byten i stallet. Bildformat borjar med en fast
// signatur, och den ligger i filen — inte i ett falt avsandaren skriver.

export type ImageKind = "png" | "jpg" | "gif" | "webp";

interface Signature {
  kind:  ImageKind;
  mime:  string;
  /** null = valfri byte pa den positionen. */
  bytes: (number | null)[];
  offset?: number;
}

const SIGNATURES: Signature[] = [
  { kind: "png",  mime: "image/png",  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: "jpg",  mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { kind: "gif",  mime: "image/gif",  bytes: [0x47, 0x49, 0x46, 0x38] },
  // RIFF....WEBP — fyra byte filstorlek i mitten som far vara vad som helst.
  {
    kind: "webp", mime: "image/webp",
    bytes: [
      0x52, 0x49, 0x46, 0x46, null, null, null, null,
      0x57, 0x45, 0x42, 0x50,
    ],
  },
];

function matches(buf: Uint8Array, sig: Signature): boolean {
  const start = sig.offset ?? 0;
  if (buf.length < start + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => b === null || buf[start + i] === b);
}

export interface SniffResult {
  kind: ImageKind;
  mime: string;
  ext:  string;
}

/**
 * Vad filen FAKTISKT ar, enligt sina egna byte.
 *
 * Returnerar null for allt som inte ar ett av de fyra bildformaten —
 * inklusive SVG, som ar ett XML-dokument som kan innehalla skript och
 * darfor inte hor hemma i en publik bucket.
 */
export function sniffImage(buffer: Uint8Array): SniffResult | null {
  for (const sig of SIGNATURES) {
    if (matches(buffer, sig)) {
      return { kind: sig.kind, mime: sig.mime, ext: sig.kind };
    }
  }
  return null;
}

/** Bekvamlighet: sant nar bytena stammer med det klienten pastod. */
export function declaredTypeMatches(declared: string, sniffed: SniffResult): boolean {
  const normalised = declared.toLowerCase().split(";")[0].trim();
  if (normalised === "image/jpg") return sniffed.mime === "image/jpeg";
  return normalised === sniffed.mime;
}
