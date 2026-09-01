// app/(app)/duel/[id]/page.tsx
//
// Tvekampens egen sida: klockan, stallningen och rostlaget.
//
// Ligger under /duel och inte under /work/[id] med flit. Kampen ar inte en
// egenskap hos verket — det finns tva kopior av verket, en per person, och
// det som binder dem ar duellen. Adressen ska peka pa det som ar sant.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { duelSideFor, measureSide, DuelError } from "@/lib/duels";
import { DuelPerformance } from "@/components/duels/DuelPerformance";
import { DuelResults } from "@/components/duels/DuelResults";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Duel" };

export default async function DuelPage({ params }: Props) {
  const { id } = await params;
  const user   = await requireUser();

  let side;
  try {
    side = await duelSideFor(id, user.id);
  } catch (err) {
    // Bade "finns inte" och "inte din" blir samma sida. Skillnaden vore
    // en bekraftelse pa att duellen existerar, till nagon som inte ar i den.
    if (err instanceof DuelError) notFound();
    throw err;
  }

  const { duel, myWorkId, other, otherId } = side;

  // Ar den inte antagen an finns det inget att gora har. Svaret ges pa
  // Friends-sidan, dar inbjudan ligger.
  if (duel.status === "pending") redirect("/friends");

  const [mine, theirs, sectionCount] = await Promise.all([
    measureSide(duel.id, user.id),
    measureSide(duel.id, otherId),
    myWorkId ? prisma.section.count({ where: { workId: myWorkId } }) : Promise.resolve(0),
  ]);

  const over = duel.status !== "active" || !duel.endsAt || duel.endsAt.getTime() <= Date.now();

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link href="/library" style={{
        fontSize: "13px", color: "var(--muted)",
        textDecoration: "none", display: "inline-block", marginBottom: "24px",
      }}>
        ← Library
      </Link>

      {over ? (
        <DuelResults duelId={duel.id} workTitle={duel.workTitle} viewerId={user.id} />
      ) : !myWorkId ? (
        <p style={{
          padding: "24px", textAlign: "center", fontSize: "13px", lineHeight: 1.6,
          color: "var(--muted)", background: "var(--bg3)",
          borderRadius: "var(--r2)", border: "1px solid var(--bord)",
        }}>
          Your copy of this work has been removed, so there is nothing left to
          perform. The duel will settle on what you had already done.
        </p>
      ) : (
        <DuelPerformance
          duelId={duel.id}
          workTitle={duel.workTitle}
          author={duel.workAuthor}
          sectionCount={sectionCount}
          endsAt={duel.endsAt!.toISOString()}
          opponentName={other.username}
          mine={{
            wordsHeld:     mine.wordsHeld,
            wordsPossible: mine.wordsPossible,
            accuracy:      mine.accuracy,
            attempts:      mine.attempts,
          }}
          theirs={{
            wordsHeld: theirs.wordsHeld,
            accuracy:  theirs.accuracy,
            attempts:  theirs.attempts,
          }}
        />
      )}

      {!over && myWorkId && (
        <p style={{
          fontSize: "12px", color: "var(--muted)", lineHeight: 1.7,
          marginTop: "28px", paddingTop: "18px", borderTop: "1px solid var(--bord)",
        }}>
          Want to work on it first?{" "}
          <Link href={`/work/${myWorkId}`} style={{ color: "var(--gold)" }}>
            Open {duel.workTitle}
          </Link>
          {" "}— practise it however you like, then come back and perform.
        </p>
      )}
    </div>
  );
}
