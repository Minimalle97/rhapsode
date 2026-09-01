// lib/works.ts
// Fas 5: delad filterlogik för biblioteket.
// buildWorkWhere() omvandlar sök/filter-parametrar till ett Prisma
// where-villkor — används både av Library-sidan (server component) och
// av GET /api/works.

import type { Prisma } from "@prisma/client";
import type { LibraryFilters } from "@/types";

const MASTERED_STATUSES = ["mastered", "permanent"];

export function buildWorkWhere(userId: string, filters: LibraryFilters): Prisma.WorkWhereInput {
  const where: Prisma.WorkWhereInput = { userId };

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { title:  { contains: q, mode: "insensitive" } },
      { author: { contains: q, mode: "insensitive" } },
    ];
  }

  if (filters.type)       where.type       = filters.type;
  if (filters.difficulty) where.difficulty = filters.difficulty;
  if (filters.tag)        where.tags       = { has: filters.tag };

  if (filters.collectionId) {
    where.collections = { some: { collectionId: filters.collectionId } };
  }

  // Status-filtret bygger på sektionernas mastery-läge.
  // OBS: "every" på en tom relation är vakuöst sant i Prisma — det är ofarligt
  // här eftersom POST /api/works alltid kräver minst en sektion per verk.
  if (filters.status === "mastered") {
    where.sections = { every: { status: { in: MASTERED_STATUSES } } };
  } else if (filters.status === "not_started") {
    where.sections = { every: { status: "not_started" } };
  } else if (filters.status === "in_progress") {
    // Varken "allt orört" eller "allt bemästrat" — dvs något däremellan.
    where.NOT = [
      { sections: { every: { status: "not_started" } } },
      { sections: { every: { status: { in: MASTERED_STATUSES } } } },
    ];
  }

  return where;
}

// getDistinctTags ar borttagen. Den byggde taggraden i FilterBar, och den
// raden finns inte langre — taggarna sattes av katalogiseringen och inte
// av nagon anvandare, sa ett filter over dem lovade en ordning ingen valt.
// Perioden och temat star kvar pa verket sjalvt, som text.
//
// `tag` finns kvar i LibraryFilters och i buildWorkWhere med flit: en
// bokmarkt adress med ?tag= ska fortsatta fungera, och /api/works tar
// fortfarande emot den.

/** Sant om minst ett filter är aktivt (används för "Clear filters" / no-results-vy). */
export function hasActiveFilters(filters: LibraryFilters): boolean {
  return Boolean(
    filters.q || filters.type || filters.tag || filters.difficulty ||
    filters.status || filters.collectionId
  );
}
