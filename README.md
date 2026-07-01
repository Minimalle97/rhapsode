# Rhapsode — Fas 1 Setup

## 1. Skapa Next.js-projektet

```bash
npx create-next-app@latest rhapsode --typescript --tailwind --app --no-src-dir
cd rhapsode
```

## 2. Installera beroenden

```bash
npm install @clerk/nextjs prisma @prisma/client @supabase/supabase-js
npm install -D @types/node
```

## 3. Kopiera filerna

Ersätt / lägg till filerna från detta paket i ditt projekt enligt strukturen nedan.

## 4. Miljövariabler

Skapa `.env.local` (se `.env.example` i detta paket).

Du behöver:
- **Clerk**: https://dashboard.clerk.com → skapa ny app → kopiera nycklar
- **Supabase**: https://supabase.com → nytt projekt → Settings → API

## 5. Initiera Prisma

```bash
npx prisma init
# Ersätt prisma/schema.prisma med filen i detta paket
npx prisma db push
npx prisma generate
```

## 6. Kör lokalt

```bash
npm run dev
```

---

## Filstruktur (detta paket)

```
app/
├── layout.tsx                    ← Root layout med Clerk
├── page.tsx                      ← Redirect → /library
├── globals.css                   ← Ditt goldtheme (CSS variables)
├── (auth)/
│   ├── sign-in/page.tsx
│   └── sign-up/page.tsx
├── (app)/
│   ├── layout.tsx                ← Auth-protected layout
│   ├── library/page.tsx
│   ├── work/[id]/page.tsx
│   └── progress/page.tsx
├── api/
│   ├── works/route.ts            ← GET + POST
│   ├── sections/route.ts         ← PATCH (SM-2 update)
│   └── agents/
│       ├── analyze/route.ts      ← AI-analys
│       ├── grade/route.ts        ← Betygsättning
│       └── chat/route.ts         ← Scholar + Coach
lib/
├── db.ts                         ← Prisma singleton
├── auth.ts                       ← Clerk helpers
├── anthropic.ts                  ← API-wrapper
└── xp.ts                         ← XP + rank-logik
prisma/
└── schema.prisma
types/
└── index.ts
middleware.ts                     ← Clerk route protection
.env.example
```
