// tests/social.test.ts
//
// Inlagg, gillningar och profiltext.
//
// Det som gar att prova som ren funktion provas som ren funktion. Resten
// ar granskning av kallan, av samma skal som i security.test.ts: det som
// ska bevisas ar att en viss kontroll FINNS pa ratt stalle, och att den
// inte gar att kringga fran gransnittet.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { cleanBody, cleanBio, MAX_BODY, MAX_BIO } from "@/lib/postText";
import { visibleWorkTitle } from "@/lib/posts";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

// ── Texten ────────────────────────────────────────────────────────────
describe("what a post may contain", () => {
  it("trims and caps the body", () => {
    expect(cleanBody("  hello  ")).toBe("hello");
    expect(cleanBody("x".repeat(MAX_BODY + 50))).toHaveLength(MAX_BODY);
  });

  it("caps the description separately", () => {
    expect(cleanBio("y".repeat(MAX_BIO + 50))).toHaveLength(MAX_BIO);
  });

  it("collapses runs of blank lines but keeps a paragraph break", () => {
    // Utan detta kan ett inlagg pa tre ord ta halva flodet i hojd.
    expect(cleanBody("a\n\n\n\n\nb")).toBe("a\n\nb");
    expect(cleanBody("a\n\nb")).toBe("a\n\nb");
  });

  it("normalises Windows line endings", () => {
    expect(cleanBody("a\r\nb")).toBe("a\nb");
  });

  it("leaves markup as literal text", () => {
    // Ingenting tolkar uppmarkning, sa taggen ska overleva orord och
    // sedan ritas ut som text. Provet star kvar som en pamminnelse om
    // vad som far andras: inte det har.
    const raw = '<script>alert(1)</script>';
    expect(cleanBody(raw)).toBe(raw);
  });

  it("gives back nothing for whitespace alone", () => {
    expect(cleanBody("   \n\n  ")).toBe("");
    expect(cleanBio("\n \t ")).toBe("");
  });
});

// ── Privata verk ──────────────────────────────────────────────────────
describe("a private work is never named in a post", () => {
  it("names a public work", () => {
    expect(visibleWorkTitle({ title: "Invictus", visibility: "public" })).toBe("Invictus");
  });

  it("withholds the title of a private work", () => {
    expect(visibleWorkTitle({ title: "Eulogy for Dad", visibility: "private" })).toBeNull();
  });

  it("withholds it for any value that is not exactly public", () => {
    // Standardvardet ar "private", men regeln far inte hanga pa att
    // strangen stavas sa. Allt som inte ar "public" ar stangt.
    for (const v of ["", "Public", "unlisted", "friends", "PUBLIC"]) {
      expect(visibleWorkTitle({ title: "x", visibility: v })).toBeNull();
    }
  });

  it("handles a work that has been deleted", () => {
    // workId ar SetNull, sa ett gammalt inlagg kan peka pa ingenting.
    expect(visibleWorkTitle(null)).toBeNull();
    expect(visibleWorkTitle(undefined)).toBeNull();
  });

  it("drops the work id along with the title", () => {
    // Utan detta vore lanken en bekraftelse pa att verket finns.
    const posts = read("lib/posts.ts");
    expect(posts).toMatch(/workId:\s*workTitle \? row\.workId : null/);
  });
});

// ── Vem som far se ────────────────────────────────────────────────────
describe("posts are shown to friends and no one else", () => {
  const posts = read("lib/posts.ts");

  it("decides visibility from the friendship, in one place", () => {
    expect(posts).toMatch(/export async function canSeePosts/);
    expect(posts).toMatch(/friendState\(viewerId, authorId\)/);
    expect(posts).toMatch(/state === "friends" \|\| state === "self"/);
  });

  it("builds the feed from accepted friendships only", () => {
    // En obesvarad forfragan ska inte ge insyn.
    expect(posts).toMatch(/status:\s*"accepted"/);
  });

  it("checks before letting anyone like a post", () => {
    // Utan kontrollen vore gillningen ett satt att bekrafta att ett visst
    // inlagg finns hos nagon man inte ar van med.
    const like = read("app/api/posts/[id]/like/route.ts");
    expect(like).toMatch(/canSeePosts\(user\.id, post\.userId\)/);
    // 404, inte 403 — ett nekande skulle bekrafta att inlagget finns.
    expect(like).toMatch(/status: 404/);
    expect(like).not.toMatch(/status: 403/);
  });

  it("never returns the names of everyone who liked something", () => {
    // likes filtreras pa betraktaren; antalet kommer fran _count.
    expect(posts).toMatch(/likes: \{ where: \{ userId: viewerId \}/);
    expect(posts).toMatch(/_count: \{ select: \{ likes: true \} \}/);
  });

  it("shows the description only to friends", () => {
    const profile = read("app/(app)/u/[handle]/page.tsx");
    expect(profile).toMatch(/isFriend && person\.bio/);
  });
});

// ── Vem som far skriva ────────────────────────────────────────────────
describe("you can only write as yourself", () => {
  const route = read("app/api/posts/route.ts");

  it("takes no author from the request body", () => {
    // Fanns det en mottagare i nyttolasten gick det att skriva i nagon
    // annans namn. Forfattaren kommer fran sessionen, alltid.
    expect(route).toMatch(/userId: user\.id/);
    expect(route).not.toMatch(/raw\.userId|body\.userId|json\.userId/);
  });

  it("only lets you delete your own", () => {
    // Villkoret pa userId ar det som gor att ett gissat id inte racker.
    expect(route).toMatch(/deleteMany\(\{ where: \{ id, userId: user\.id \} \}\)/);
  });

  it("rate limits writing and liking", () => {
    expect(route).toMatch(/rateLimit\(`post:/);
    expect(read("app/api/posts/[id]/like/route.ts")).toMatch(/rateLimit\(`like:/);
    expect(read("app/api/profile/bio/route.ts")).toMatch(/rateLimit\(`bio:/);
  });
});

// ── Milstolpar ────────────────────────────────────────────────────────
describe("the app writes a milestone when a work is mastered", () => {
  const store = read("lib/performanceStore.ts");

  it("writes one only when the title is newly earned", () => {
    expect(store).toMatch(/if \(justMastered\) \{\s*\n\s*await recordMilestone/);
  });

  it("does not put the work title into the post body", () => {
    // Inlagget pekar pa verket; titeln hamtas vid lasningen, sa att en
    // gammal rad inte namnger nagot som sedan gjorts privat.
    expect(store).not.toMatch(/recordMilestone\([^)]*work\.title/);
  });

  it("does not repeat itself for the same work within a day", () => {
    const posts = read("lib/posts.ts");
    expect(posts).toMatch(/kind: "milestone", body, createdAt: \{ gte: since \}/);
  });
});

// ── Klientpaketet ─────────────────────────────────────────────────────
describe("the browser bundle stays clean", () => {
  it("keeps the database out of the components that write posts", () => {
    // En klientkomponent som importerar lib/posts drar med prisma in i
    // webblasarpaketet. Darfor bor langderna i lib/postText.ts.
    for (const f of ["components/friends/PostFeed.tsx", "components/profile/BioEditor.tsx"]) {
      const text = read(f);
      expect(text).toMatch(/"use client"/);
      expect(text, `${f} imports the server-side posts module`).not.toMatch(/from "@\/lib\/posts"/);
    }
    expect(read("lib/postText.ts")).not.toMatch(/@\/lib\/db|from "\.\/db"/);
  });
});
