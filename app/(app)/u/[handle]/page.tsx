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
import { friendState } from "@/lib/friends";
import { getRank, getNextRank } from "@/lib/xp";
import { FriendButton } from "@/components/friends/FriendButton";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const u = await prisma.user.findUnique({
    where: { handle: handle.toLowerCase() },
    select: { username: true },
  });
  return { title: u?.username ?? "Profile" };
}

export default async function PublicProfile({ params }: Props) {
  const { handle } = await params;
  const viewer = await requireUser();

  const person = await prisma.user.findUnique({
    where: { handle: handle.toLowerCase() },
    select: {
      id: true, handle: true, username: true, avatarUrl: true,
      xp: true, rank: true, streakDays: true, createdAt: true,
      medals: {
        orderBy: { earnedAt: "desc" },
        take: 30,
        select: {
          id: true, title: true, earnedAt: true,
          work: { select: { title: true, author: true, type: true } },
        },
      },
      _count: { select: { works: true } },
    },
  });
  if (!person) notFound();

  const { state, friendshipId } = await friendState(viewer.id, person.id);
  const isFriend = state === "friends" || state === "self";

  const rank     = getRank(person.xp);
  const next     = getNextRank(person.xp);
  const progress = next
    ? Math.round(((person.xp - rank.xpRequired) / (next.xpRequired - rank.xpRequired)) * 100)
    : 100;

  // Verkslistan bara för vänner
  const works = isFriend
    ? await prisma.work.findMany({
        where:   { userId: person.id },
        orderBy: { createdAt: "desc" },
        take:    40,
        select:  { id: true, title: true, author: true, type: true },
      })
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
        <div style={{
          width: "68px", height: "68px", borderRadius: "50%",
          background: "var(--bg3)", border: "1px solid var(--bord)",
          overflow: "hidden", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {person.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontFamily: "var(--fd)", fontSize: "26px", color: "var(--gold)" }}>
              {person.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </div>

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
        </div>
      </div>

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
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
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
          {person.medals.map(m => (
            <div key={m.id} style={{
              background: "var(--bg2)", border: "1px solid var(--bord)",
              borderRadius: "var(--r2)", padding: "13px 16px",
              display: "flex", gap: "13px", alignItems: "center",
            }}>
              <span style={{
                width: "34px", height: "34px", borderRadius: "50%",
                border: "1px solid rgba(200,164,80,0.35)", background: "var(--gold4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "14px", color: "var(--gold)", flexShrink: 0,
              }}>
                ✦
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "var(--fd)", fontSize: "15px", color: "var(--parch)" }}>
                  {m.title}
                </p>
                <p style={{ fontSize: "11px", color: "var(--muted)" }}>
                  {m.work.title} · {m.work.author}
                </p>
              </div>
            </div>
          ))}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {works.map(w => (
            <div key={w.id} style={{
              background: "var(--bg2)", border: "1px solid var(--bord)",
              borderRadius: "var(--r2)", padding: "12px 16px",
            }}>
              <p style={{ fontSize: "14px", color: "var(--parch)" }}>{w.title}</p>
              <p style={{ fontSize: "11px", color: "var(--muted)" }}>
                {w.author} · {w.type.toLowerCase()}
              </p>
            </div>
          ))}
        </div>
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
