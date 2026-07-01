-- supabase/realtime-setup.sql
-- Aktivera Supabase Realtime för tabellerna Section och Work.
-- Kör i Supabase Dashboard → SQL Editor.

-- 1. Aktivera replication för Section-tabellen
ALTER PUBLICATION supabase_realtime ADD TABLE "Section";

-- 2. Aktivera replication för Work-tabellen
ALTER PUBLICATION supabase_realtime ADD TABLE "Work";

-- OBS: Prisma använder PascalCase-tabellnamn som standard.
-- Om dina tabeller heter 'sections' och 'works' (lowercase),
-- ersätt namnen ovan med:
-- ALTER PUBLICATION supabase_realtime ADD TABLE sections;
-- ALTER PUBLICATION supabase_realtime ADD TABLE works;

-- Verifiera att publicationen är aktiv:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 3. RLS måste vara aktiverat för Realtime att fungera.
-- Om du inte redan har RLS på, lägg till:
ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Work"    ENABLE ROW LEVEL SECURITY;

-- 4. Supabase Realtime använder anon key + RLS.
-- Med Clerk + service role key i API-routes skyddar du skrivningar,
-- men för Realtime (läs-prenumerationer) behöver anon key ha SELECT-rättigheter.
-- Enklaste RLS-policy för läsning (ingen auth på klientsidan → open read):
CREATE POLICY "Allow realtime read for all" ON "Section"
  FOR SELECT USING (true);

CREATE POLICY "Allow realtime read for all" ON "Work"
  FOR SELECT USING (true);

-- OBS: I produktion vill du byta ut USING (true) mot en faktisk
-- Supabase Auth-check. Men eftersom vi använder Clerk för auth
-- och service role key för skrivningar, är open read OK under beta —
-- ingen kan skriva utan att gå via din API med Clerk-autentisering.
