// app/(app)/u/[handle]/page.tsx
// En annan människas profil.
//
// Vad som visas beror på om ni är vänner. Rang, XP och medaljer är
// öppet — det är hela poängen med att kunna se varandra. Vilka verk
// någon håller på med visas bara för vänner: en läslista säger en hel
// del om en person, och den ska inte ligga framme för vem som helst.
//
// Sektionsnivå visas aldrig för någon annan. Att se att någon kämpar
// med rad fyra i tredje sången är inte något man behöver veta.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { friendState, resolveHandle } from "@/lib/friends";
import { wornBorders } from "@/lib/repertoire";
import { duelsWithPeople, duelRecordAgainst } from "@/lib/duels";
import { Avatar } from "@/components/profile/Avatar";
import { sharedLibrary } from "@/lib/sharedLibrary";
import { postsBy, canSeePosts } from "@/lib/posts";
import { getRank, getNextRank } from "@/lib/xp";
import { getEntitlements } from "@/lib/billing/entitlements";
import { FriendButton } from "@/components/friends/FriendButton";
import { DuelInvite } from "@/components/duels/DuelInvite";
import { SharedWorks } from "@/components/friends/SharedWorks";
import { PostFeed } from "@/components/friends/PostFeed";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const id = await resolveHandle(handle);
  const u = id
    ? await prisma.user.findUnique({ where: { id }, select: { username: true } })
    : null;
  return { title: u?.username ?? "Profile" };
}

export default async function PublicProfile({ params }: Props) {
  const { handle } = await params;
  const viewer = await requireUser();

  // Handtaget slas upp via resolveHandle, inte direkt mot handleLower.
  // Skalet star i lib/friends.ts: kolumnen ar tom i alla rader som fanns
  // innan den infordes, och utan reservvagen ger varje van "Nothing here".
  const personId = await resolveHandle(handle);
  if (!personId) notFound();

  const person = await prisma.user.findUnique({
    where: { id: personId },
    select: {
      id: true, handle: true, username: true, avatarUrl: true, bio: true,
      xp: true, rank: true, streakDays: true, createdAt: true,
      medals: {
        // Se profilsidan: "work"-medaljerna ar en kvarleva och visas inte.
        where:   { kind: { not: "work" } },
        orderBy: { earnedAt: "desc" },
        take: 30,
        select: {
          id: true, title: true, earnedAt: true, kind: true, lostAt: true,
          // visibility hamtas for att kunna DOLJA titeln nedan. Medaljen
          // visas anda — bedriften ar deras — men vilken text den galler
          // ar inte allmangods bara for att den gav en medalj.
          work: { select: { title: true, author: true, type: true, visibility: true } },
        },
      },
      _count: { select: { works: true } },
    },
  });
  if (!person) notFound();

  const { state, friendshipId } = await friendState(viewer.id, person.id);
  const isFriend = state === "friends" || state === "self";

  // Vem som far bjuda in avgors av planen. Knappen ritas anda for alla
  // vanner — se DuelInvite: ett hanglas som beratter vad som ligger bakom
  // ar arligare an en knapp som inte finns. Servern kontrollerar igen.
  const ent = await getEntitlements(viewer);

  // Barden de bar. Kontrollen av att de FAR bara den — gruppen klar,
  // lasset oppnat, prenumerationen aktiv — sitter i wornBorders.
  const border = (await wornBorders([person.id])).get(person.id) ?? null;

  // Star ni i en tvekamp ska knappen saga det. Att erbjuda en utmaning
  // till nagon man redan slass mot ar bade fel och forvirrande — servern
  // avvisar den anda, men det ska inte behova ga sa langt.
  const duel = (await duelsWithPeople(viewer.id, [person.id])).get(person.id) ?? null;

  // Stallningen er emellan. Star pa profilen och inte i flodet: en tvekamp
  // ar nagot mellan tva personer, och det ar har man undrar over den.
  const record = state === "self" ? null : await duelRecordAgainst(viewer.id, person.id);

  const rank     = getRank(person.xp);
  const next     = getNextRank(person.xp);
  const progress = next
    ? Math.round(((person.xp - rank.xpRequired) / (next.xpRequired - rank.xpRequired)) * 100)
    : 100;

  // Verkslistan: bara för vänner, OCH bara det som delats.
  //
  // RÄTTAT: det här hämtade tidigare ALLA verk, inte bara de publika.
  // Synlighetsväljaren på verkssidan hade därmed ingen verkan här — den
  // som satte en text till privat fick ändå den visad för sina vänner.
  // "Privat" måste betyda privat överallt, annars är väljaren en lögn.
  //
  // Egna profilen är undantaget: där ser man förstås allt sitt eget.
  const works = isFriend
    ? await sharedLibrary(person.id, state === "self")
    : [];

  // Inlaggen foljer samma regel som verken: vanner, eller ingen. Fragan
  // stalls till lib/posts sa att svaret blir detsamma har som i API:et.
  const posts = (await canSeePosts(viewer.id, person.id))
    ? await postsBy(person.id, viewer.id)
    : [];

  const since = new Date(person.createdAt).toLocaleDateString("en-GB", {
    month: "long", year: "numeric",
  });

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link href="/friends" style={{
        fontSize: "13px", color: "var(--muted)",
        textDecoration: "none", display: "inline-block", marginBottom: "24px",
      }}>
        ← Friends
      </Link>

      {/* Huvud */}
      <div style={{ display: "flex", gap: "18px", alignItems: "flex-start", marginBottom: "28px" }}>
        <Avatar
          username={person.username}
          avatarUrl={person.avatarUrl}
          border={border}
          size={68}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontFamily: "var(--fd)", fontSize: "28px", fontWeight: 300,
            color: "var(--parch)", letterSpacing: "0.03em", marginBottom: "2px",
          }}>
            {person.username}
          </h1>
          <p style={{ fontSize: "12px", color: "var(--bg4)", marginBottom: "10px" }}>
            @{person.handle} · since {since}
          </p>

          {state !== "self" && (
            <FriendButton
              state={state}
              friendshipId={friendshipId}
              handle={person.handle!}
              username={person.username}
            />
          )}

          {/*
            Tvekampen erbjuds bara mellan vanner. Att kunna skicka en text
            till nagon man inte kanner ar ett satt att skicka vad som helst
            till nagon man inte kanner — samma regel galler i lib/duels.ts.
          */}
          {/*
            Bara siffrorna. Ingen rubrik, ingen ruta — den som vill veta
            hur det statt sig ser det pa en rad, och den som inte bryr sig
            laser forbi.
          */}
          {record && record.total > 0 && (
            <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
              <span style={{ color: "var(--green)" }}>{record.wins}W</span>
              {" · "}
              <span style={{ color: "var(--red)" }}>{record.losses}L</span>
              {record.draws > 0 && <>{" · "}{record.draws}D</>}
              <span style={{ color: "var(--bg4)" }}>
                {"  "}in {record.total} {record.total === 1 ? "duel" : "duels"}
              </span>
            </p>
          )}

          {state === "friends" && (
            <DuelInvite
              opponentId={person.id}
              opponentName={person.username}
              canInvite={ent.isPro}
              duel={duel ? {
                id:        duel.id,
                status:    duel.status,
                mine:      duel.mine,
                workTitle: duel.workTitle,
                endsAt:    duel.endsAt?.toISOString() ?? null,
              } : null}
            />
          )}
        </div>
      </div>

      {/* Beskrivning — bara for vanner, precis som verken */}
      {isFriend && person.bio && (
        <p style={{
          fontSize: "14px", color: "var(--parch2)", lineHeight: 1.7,
          whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: "24px",
        }}>
          {person.bio}
        </p>
      )}

      {/* Rang */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--bord)",
        borderRadius: "var(--r)", padding: "20px 22px", marginBottom: "16px",
      }}>
        <p style={{
          fontFamily: "var(--fd)", fontSize: "24px",
          color: "var(--gold)", marginBottom: "3px",
        }}>
          {rank.titleEn}
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
          {rank.titleSv}
        </p>

        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: "11px", color: "var(--muted)", marginBottom: "6px",
        }}>
          <span>{person.xp.toLocaleString()} XP</span>
          {next && <span>{next.xpRequired.toLocaleString()} for {next.titleEn}</span>}
        </div>
        <div style={{ height: "3px", background: "var(--bg4)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: "linear-gradient(90deg, var(--gold2), var(--gold))",
          }} />
        </div>
      </div>

      {/* Siffror */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
        gap: "10px", marginBottom: "26px",
      }}>
        <Stat label="Works"  value={person._count.works} />
        <Stat label="Medals" value={person.medals.length} accent />
        <Stat label="Streak" value={person.streakDays} suffix="d" />
      </div>

      {/* Medaljer */}
      <h2 style={h2}>Medals</h2>
      {person.medals.length === 0 ? (
        <p style={empty}>No medals yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "26px" }}>
          {person.medals.map(m => {
            // Tvekampsmedaljen ar gron och bar svard, precis som i
            // MedalCard. Samma sort ska se likadan ut var den an star.
            const battle = m.kind === "battle";
            return (
            <div key={m.id} style={{
              background: "var(--bg2)",
              border: `1px solid ${battle ? "rgba(106,158,106,0.32)" : "var(--bord)"}`,
              borderRadius: "var(--r2)", padding: "13px 16px",
              display: "flex", gap: "13px", alignItems: "center",
            }}>
              <span style={{
                width: "34px", height: "34px", borderRadius: "50%",
                border: `1px solid ${battle ? "rgba(106,158,106,0.42)" : "rgba(200,164,80,0.35)"}`,
                background: battle ? "rgba(106,158,106,0.09)" : "var(--gold4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "14px", color: battle ? "var(--green)" : "var(--gold)", flexShrink: 0,
              }}>
                {battle ? "⚔" : "✦"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "var(--fd)", fontSize: "15px", color: "var(--parch)" }}>
                  {m.work.visibility === "public"
                    ? m.title
                    : battle
                      ? "Won a duel"
                      : m.kind === "performance"
                        ? "Performed from memory"
                        : "A work held entire"}
                </p>
                <p style={{ fontSize: "11px", color: "var(--muted)" }}>
                  {m.work.visibility === "public"
                    ? `${m.work.title} · ${m.work.author}`
                    : "A private work"}
                </p>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Verk — bara för vänner */}
      <h2 style={h2}>Library</h2>
      {!isFriend ? (
        <p style={empty}>
          What {person.username} is learning is shown to friends.
        </p>
      ) : works.length === 0 ? (
        <p style={empty}>Nothing here yet.</p>
      ) : (
        <SharedWorks works={works} />
      )}

      {/* Inlagg */}
      <h2 style={{ ...h2, marginTop: "30px" }}>Posts</h2>
      {!isFriend ? (
        <p style={empty}>
          What {person.username} posts is shown to friends.
        </p>
      ) : (
        <PostFeed
          initial={posts.map(p => ({ ...p, createdAt: p.createdAt.toISOString() }))}
          viewer={{
            id: viewer.id, username: viewer.username,
            handle: viewer.handle, avatarUrl: viewer.avatarUrl,
          }}
          canWrite={state === "self"}
          empty={state === "self" ? "You haven't posted anything yet." : "Nothing posted yet."}
        />
      )}
    </div>
  );
}

function Stat({
  label, value, accent, suffix,
}: { label: string; value: number; accent?: boolean; suffix?: string }) {
  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--bord)",
      borderRadius: "var(--r2)", padding: "14px 16px",
    }}>
      <p style={{
        fontSize: "10px", letterSpacing: "0.15em", color: "var(--muted)",
        textTransform: "uppercase", marginBottom: "5px",
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "24px", fontWeight: 300,
        color: accent ? "var(--gold)" : "var(--parch)",
      }}>
        {value}{suffix && <span style={{ fontSize: "13px", color: "var(--muted)" }}>{suffix}</span>}
      </p>
    </div>
  );
}

const h2: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "18px", fontWeight: 400,
  color: "var(--parch)", letterSpacing: "0.04em", marginBottom: "12px",
};
const empty: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)", marginBottom: "26px",
  padding: "20px", background: "var(--bg2)",
  border: "1px solid var(--bord)", borderRadius: "var(--r2)",
  textAlign: "center",
};
