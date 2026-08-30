// app/(app)/library/page.tsx
//
// TVÅ RÄTTNINGAR
//
// 1. searchParams är en Promise i Next.js 16 och måste await:as. Det var
//    felet som stod i terminalen vid varje sidladdning.
//
// 2. Sidan hämtade `sections: true` — alltså varje sektions FULLA TEXT för
//    varje verk i biblioteket, bara för att räkna hur många som var
//    bemästrade. Med Divina Commedia i biblioteket lästes hela dikten från
//    databasen varje gång du öppnade Library.
//
//    Nu hämtas bara status per sektion, vilket är allt som räknas.

import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { masteryOf } from "@/lib/mastery";
import { learningProgress } from "@/lib/performance";
import { standingsForWorks } from "@/lib/performanceStore";
import { prisma } from "@/lib/db";
import { buildWorkWhere, getDistinctTags, hasActiveFilters } from "@/lib/works";
import { WorkCard } from "@/components/library/WorkCard";
import { SearchBar } from "@/components/library/SearchBar";
import { FilterBar } from "@/components/library/FilterBar";
import { CollectionTabs } from "@/components/library/CollectionTabs";
import type { LibraryFilters } from "@/types";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default async function LibraryPage({ searchParams }: Props) {
  const sp   = await searchParams;
  const user = await requireUser();
  const ent  = await getEntitlements(user);

  const filters: LibraryFilters = {
    q:            str(sp.q),
    type:         str(sp.type) as LibraryFilters["type"],
    tag:          str(sp.tag),
    difficulty:   str(sp.difficulty) as LibraryFilters["difficulty"],
    status:       str(sp.status) as LibraryFilters["status"],
    collectionId: str(sp.collection),
  };

  const [works, allWorks, collectionRows] = await Promise.all([
    prisma.work.findMany({
      where: buildWorkWhere(user.id, filters),
      select: {
        id: true, userId: true, title: true, author: true, type: true,
        tags: true, analysis: true, practiceAdvice: true,
        difficulty: true, estimatedMinutes: true, createdAt: true,
        // Status plus SM-2-lage. Fortfarande inte texten — det ar den
        // som ar stor.
        sections: {
          select: {
            id: true, status: true, nextReview: true,
            sm2Reps: true, sm2Interval: true,
          },
        },
        collections: { select: { collectionId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.work.findMany({ where: { userId: user.id }, select: { tags: true } }),
    prisma.collection.findMany({
      where:   { userId: user.id },
      include: { works: { select: { workId: true } } },
      orderBy: { orderIndex: "asc" },
    }),
  ]);

  // En fraga for alla verk, inte en per kort.
  const standings = await standingsForWorks(user.id, works.map(w => w.id));

  const progressByWork = new Map<string, number>(
    works.map(w => [
      w.id,
      learningProgress(w.sections.map(sec => masteryOf({
        status:      sec.status,
        sm2Reps:     sec.sm2Reps,
        sm2Interval: sec.sm2Interval,
      }))),
    ])
  );

  const availableTags = getDistinctTags(allWorks);
  const hasAnyWorks   = allWorks.length > 0;
  const filtersActive = hasActiveFilters(filters);

  const collections = collectionRows.map(c => ({
    id:         c.id,
    userId:     c.userId,
    name:       c.name,
    color:      c.color,
    orderIndex: c.orderIndex,
    createdAt:  c.createdAt,
    workIds:    c.works.map(w => w.workId),
  }));

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 24px" }}>
      <div style={{
        display: "flex", alignItems: "baseline",
        justifyContent: "space-between", marginBottom: "28px",
      }}>
        <h1 style={{
          fontFamily: "var(--fd)", fontSize: "32px", fontWeight: 300,
          letterSpacing: "0.06em", color: "var(--parch)",
        }}>
          Library
        </h1>
        <AddWorkButton />
      </div>

      {hasAnyWorks && (
        <Suspense fallback={null}>
          <div style={{ marginBottom: "20px" }}>
            <CollectionTabs collections={collections} />
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
            <SearchBar />
          </div>
          <div style={{ marginBottom: "28px" }}>
            <FilterBar availableTags={availableTags} />
          </div>
        </Suspense>
      )}

      {!hasAnyWorks ? (
        <EmptyLibrary />
      ) : works.length === 0 ? (
        <NoResults filtersActive={filtersActive} />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
        }}>
          {works.map(work => (
            <WorkCard
              key={work.id}
              /* WorkCard läser bara status och antal ur sections */
              work={work as never}
              collections={collections}
              memberCollectionIds={work.collections.map(c => c.collectionId)}
              activeTag={filters.tag ?? null}
              progress={progressByWork.get(work.id) ?? 0}
              performanceMastered={standings.get(work.id)?.isMastered ?? false}
              masteryAtRisk={standings.get(work.id)?.standing === "at_risk"}
            />
          ))}
        </div>
      )}

      {/*
        Vägen in till Pro för den som letar efter den.
        
        Resten av erbjudandena är avsiktligt kontextuella — de dyker upp
        när man stött på en gräns, inte innan. Men någon som redan bestämt
        sig ska inte behöva leta i profilen efter var man betalar. En rad
        längst ned, bara för den som inte redan har Pro.
      */}
      {!ent.isPro && hasAnyWorks && (
        <p style={{ marginTop: "40px", paddingTop: "22px", borderTop: "1px solid var(--bord)" }}>
          <Link href="/settings/subscription" style={{
            fontSize: "13px", color: "var(--muted)", textDecoration: "none",
          }}>
            <span style={{ color: "var(--gold)" }}>Rhapsode Pro</span>
            {" — unlimited works, closer analysis of what your recitation missed, "}
            {"and study sessions built around the lines you keep losing."}
          </Link>
        </p>
      )}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--muted)" }}>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "24px", fontWeight: 300,
        color: "var(--parch2)", marginBottom: "12px",
      }}>
        Your library is empty
      </p>
      <p style={{ fontSize: "14px", lineHeight: 1.6, maxWidth: "360px", margin: "0 auto 24px" }}>
        Add a work — a poem, a speech, a passage — and Rhapsode will help you
        carry it permanently.
      </p>
      <AddWorkButton />
    </div>
  );
}

function NoResults({ filtersActive }: { filtersActive: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px", color: "var(--muted)" }}>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "20px", fontWeight: 300,
        color: "var(--parch2)", marginBottom: "8px",
      }}>
        No works match
      </p>
      <p style={{ fontSize: "13px", lineHeight: 1.6 }}>
        {filtersActive
          ? "Try a different search term, or clear your filters above."
          : "Nothing here yet."}
      </p>
    </div>
  );
}

function AddWorkButton() {
  return (
    <a
      href="/library/add"
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            "6px",
        background:     "var(--gold)",
        color:          "#0C1015",
        padding:        "8px 18px",
        borderRadius:   "var(--r2)",
        fontSize:       "13px",
        fontWeight:     500,
        textDecoration: "none",
        letterSpacing:  ".02em",
      }}
    >
      + Add work
    </a>
  );
}
