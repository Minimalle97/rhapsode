-- supabase/recordings-bucket.sql
-- Fas 8: bucket för sparade recitation-inspelningar.
-- Kör i Supabase SQL Editor (eller skapa manuellt via Dashboard → Storage).
--
-- Till skillnad från 'avatars' (Fas 3, public) är denna bucket PRIVAT —
-- en röstinspelning är känsligare data än en profilbild, så vi vill inte
-- att filerna ligger bakom gissbara publika URL:er. Uppspelning sker via
-- signerade URL:er som genereras server-side (se app/api/recordings/route.ts),
-- giltiga en kort stund i taget.

-- 1. Skapa privat bucket för inspelningar
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Ingen RLS-policy för publik läsning (bucketen är privat by default).
-- All åtkomst — upload och signerade URL:er — sker via service role key på
-- servern (samma mönster som avatars: ägarskap kontrolleras av
-- requireUser() i API-routen, inte av Supabase RLS, eftersom appen
-- använder Clerk för auth, inte Supabase Auth).

-- 3. Valfritt: automatisk städning av gamla filer kan läggas till senare
-- via ett scheduled Edge Function om lagringsvolymen blir ett problem.
-- Ingen sådan funktion finns ännu — filer ligger kvar tills de tas bort
-- manuellt eller sektionen/kontot raderas (cascade tar bort DB-raden,
-- men INTE filen i Storage — det är en känd begränsning, se README).
