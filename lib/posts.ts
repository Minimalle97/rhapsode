// lib/posts.ts
//
// Inlagg pa profilen, och gillningar.
//
// Tva regler bar hela filen:
//
//   Vanskap avgor vad man far se. Ett inlagg ar synligt for sin
//   forfattare och for dennes vanner, ingen annan. Kontrollen sker har,
//   inte i komponenten som ritar ut det.
//
//   Ett privat verk namnges aldrig. En milstolpe pekar pa ett verk, och
//   ar det privat visas inlagget utan titeln. Annars vore inlaggen en
//   bakvag runt synlighetsvaljaren.

import { prisma } from "@/lib/db";
import { friendState } from "@/lib/friends";
import { cleanBody, MAX_BODY, MAX_BIO } from "@/lib/postText";

export { cleanBody, MAX_BODY, MAX_BIO };

export type PostKind = "note" | "milestone";

export interface PostView {
  id:        string;
  kind:      PostKind;
  body:      string;
  createdAt: Date;
  /** Verkets titel, eller null nar det ar privat eller saknas. */
  workTitle: string | null;
  workId:    string | null;
  likes:     number;
  likedByMe: boolean;
  author: {
    id:        string;
    username:  string;
    handle:    string | null;
    avatarUrl: string | null;
  };
}

/**
 * Far betraktaren se den har personens inlagg?
 *
 * Sig sjalv alltid. Vanner ja. Alla andra nej — aven om de kanner
 * handtaget och skriver in adressen for hand.
 */
export async function canSeePosts(viewerId: string, authorId: string): Promise<boolean> {
  if (viewerId === authorId) return true;
  const { state } = await friendState(viewerId, authorId);
  return state === "friends" || state === "self";
}

/**
 * Verkets titel — eller null nar den inte far skrivas ut.
 *
 * Egen funktion sa att regeln gar att prova, och sa att det finns EN
 * plats dar den bestams. Ett privat verk namnges aldrig, inte ens i ett
 * inlagg forfattaren skrivit sjalv: sidan gar att dela, och en skarmbild
 * ska inte avsloja vad nagon ovar pa i tysthet.
 */
export function visibleWorkTitle(
  work: { title: string; visibility: string } | null | undefined
): string | null {
  return work?.visibility === "public" ? work.title : null;
}

function toView(
  row: {
    id: string; kind: string; body: string; createdAt: Date; workId: string | null;
    user: { id: string; username: string; handle: string | null; avatarUrl: string | null };
    work: { title: string; visibility: string } | null;
    likes: { userId: string }[];
    _count: { likes: number };
  },
  viewerId: string
): PostView {
  const workTitle = visibleWorkTitle(row.work);

  return {
    id:        row.id,
    kind:      row.kind === "milestone" ? "milestone" : "note",
    body:      row.body,
    createdAt: row.createdAt,
    workTitle,
    // Id:t foljer bara med nar titeln gor det. Annars vore lanken en
    // bekraftelse pa att verket finns, aven utan namnet.
    workId:    workTitle ? row.workId : null,
    likes:     row._count.likes,
    likedByMe: row.likes.some(l => l.userId === viewerId),
    author:    row.user,
  };
}

/**
 * Vad som hamtas for ett inlagg.
 *
 * `likes` filtreras pa betraktaren — vi behover bara veta om DEN har
 * gillat, aldrig vilka andra som gjort det. Antalet kommer fran _count.
 * Att lista namnen vore att lamna ut vilka som lasar vems flode.
 */
const select = (viewerId: string) => ({
  id: true, kind: true, body: true, createdAt: true, workId: true,
  user: { select: { id: true, username: true, handle: true, avatarUrl: true } },
  work: { select: { title: true, visibility: true } },
  likes: { where: { userId: viewerId }, select: { userId: true } },
  _count: { select: { likes: true } },
});

/** En persons inlagg. Anroparen har redan kontrollerat behorigheten. */
export async function postsBy(
  authorId: string,
  viewerId: string,
  take = 20
): Promise<PostView[]> {
  const rows = await prisma.post.findMany({
    where:   { userId: authorId },
    orderBy: { createdAt: "desc" },
    take,
    select:  select(viewerId),
  });
  return rows.map(r => toView(r, viewerId));
}

/**
 * Vannernas inlagg, senast forst. Flodet pa Friends-sidan.
 *
 * Bara accepterade vanner. En obesvarad forfragan ger ingen insyn.
 */
export async function friendFeed(viewerId: string, take = 30): Promise<PostView[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
    },
    select: { requesterId: true, addresseeId: true },
  });

  const friendIds = friendships.map(f =>
    f.requesterId === viewerId ? f.addresseeId : f.requesterId
  );
  // Egna inlagg ingar — man ska se vad man sjalv lagt ut i samma flode.
  const ids = [...friendIds, viewerId];

  const rows = await prisma.post.findMany({
    where:   { userId: { in: ids } },
    orderBy: { createdAt: "desc" },
    take,
    select:  select(viewerId),
  });
  return rows.map(r => toView(r, viewerId));
}

/**
 * Skriver en milstolpe.
 *
 * Anropas nar appen sjalv har nagot att beratta. Idempotent per verk och
 * sort inom ett dygn, sa att tio framforanden samma dag inte ger tio
 * identiska inlagg i vannernas flode.
 */
export async function recordMilestone(
  userId: string,
  workId: string,
  body: string
): Promise<void> {
  const since = new Date(Date.now() - 86_400_000);
  const already = await prisma.post.findFirst({
    where: { userId, workId, kind: "milestone", body, createdAt: { gte: since } },
    select: { id: true },
  });
  if (already) return;

  await prisma.post.create({
    data: { userId, workId, kind: "milestone", body: cleanBody(body) },
  });
}

/** Gillar eller tar tillbaka. Returnerar det nya laget. */
export async function toggleLike(
  postId: string,
  userId: string
): Promise<{ liked: boolean; likes: number }> {
  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.postLike.create({ data: { postId, userId } });
  }

  const likes = await prisma.postLike.count({ where: { postId } });
  return { liked: !existing, likes };
}
