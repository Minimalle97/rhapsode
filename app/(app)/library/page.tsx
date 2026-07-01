// app/(app)/library/page.tsx
// Fas 5: server component — sök, filter, taggar och samlingar.
// Filtrering sker på serversidan via Prisma (lib/works.ts), inte i klienten,
// så biblioteket skalar lika bra med 10 som med 1000 verk.

import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildWorkWhere, getDistinctTags, hasActiveFilters } from "@/lib/works";
import { WorkCard } from "@/components/library/WorkCard";
import { SearchBar } from "@/components/library/SearchBar";
import { FilterBar } from "@/components/library/FilterBar";
import { CollectionTabs } from "@/components/library/CollectionTabs";
import type { LibraryFilters } from "@/types";

interface Props {
  searchParams: { [key: string]: string | string[] | undefined };
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default async function LibraryPage({ searchParams }: Props) {
  const user = await requireUser();

  const filters: LibraryFilters = {
    q:            str(searchParams.q),
    type:         str(searchParams.type) as LibraryFilters["type"],
    tag:          str(searchParams.tag),
    difficulty:   str(searchParams.difficulty) as LibraryFilters["difficulty"],
    status:       str(searchParams.status) as LibraryFilters["status"],
    collectionId: str(searchParams.collection),
  };

  const [works, allWorks, collectionRows] = await Promise.all([
    prisma.work.findMany({
      where:   buildWorkWhere(user.id, filters),
      include: { sections: true, collections: { select: { collectionId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // Lättviktig hämtning av alla verk — bara för att räkna ut den fullständiga
    // tagglistan, oberoende av aktiva filter (annars krymper tag-listan när man filtrerar).
    prisma.work.findMany({ where: { userId: user.id }, select: { tags: true } }),
    prisma.collection.findMany({
      where:   { userId: user.id },
      include: { works: { select: { workId: true } } },
      orderBy: { orderIndex: "asc" },
    }),
  ]);

  const availableTags = getDistinctTags(allWorks);
  const hasAnyWorks    = allWorks.length > 0;
  const filtersActive  = hasActiveFilters(filters);

  const collections = collectionRows.map((c) => ({
    id:         c.id,
    userId:     c.userId,
    name:       c.name,
    color:      c.color,
    orderIndex: c.orderIndex,
    createdAt:  c.createdAt,
    workIds:    c.works.map((w) => w.workId),
  }));

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "28px" }}>
        <h1 style={{ fontFamily: "var(--fd)", fontSize: "32px", fontWeight: 300, letterSpacing: "0.06em", color: "var(--parch)" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {works.map((work) => (
            <WorkCard
              key={work.id}
              work={work}
              collections={collections}
              memberCollectionIds={work.collections.map((c) => c.collectionId)}
              activeTag={filters.tag ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--muted)" }}>
      <p style={{ fontFamily: "var(--fd)", fontSize: "24px", fontWeight: 300, color: "var(--parch2)", marginBottom: "12px" }}>
        Your library is empty
      </p>
      <p style={{ fontSize: "14px", lineHeight: 1.6, maxWidth: "360px", margin: "0 auto 24px" }}>
        Add a work — a poem, a speech, a passage — and Rhapsode will help you carry it permanently.
      </p>
      <AddWorkButton />
    </div>
  );
}

function NoResults({ filtersActive }: { filtersActive: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px", color: "var(--muted)" }}>
      <p style={{ fontFamily: "var(--fd)", fontSize: "20px", fontWeight: 300, color: "var(--parch2)", marginBottom: "8px" }}>
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

// TODO: Ersätt med riktigt modal-flöde i en senare fas
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
