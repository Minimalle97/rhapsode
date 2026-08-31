// lib/postText.ts
//
// Langderna och stadningen for inlagg och profiltext.
//
// Ligger i en egen fil UTAN databasberoenden med flit: skrivrutan ar en
// klientkomponent, och importerar den fran lib/posts.ts foljer prisma
// med in i webblasarpaketet. Ren aritmetik och strangar hor hemma pa
// bada sidor; det som pratar med databasen gor det inte.

export const MAX_BODY = 280;
export const MAX_BIO  = 300;

/** Normaliserar radbrytningar, trimmar och kapar. */
function tidy(raw: string, max: number): string {
  return raw.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

/** Ett inlagg. Ren text — ingen uppmarkning tolkas nagonstans. */
export function cleanBody(raw: string): string {
  return tidy(raw, MAX_BODY);
}

/** Profiltexten. Samma stadning, annat tak. */
export function cleanBio(raw: string): string {
  return tidy(raw, MAX_BIO);
}
