-- supabase/avatars-bucket.sql
-- Kör detta i Supabase SQL Editor (eller Dashboard → Storage → skapa bucket manuellt)

-- 1. Skapa bucket för avatarer
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS-policy: alla kan läsa (bucket är public)
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- 3. RLS-policy: inloggad användare kan ladda upp/ersätta sin egen fil
-- Filnamnet är userId/avatar.ext — vi kontrollerar att userId matchar auth.uid() via Clerk-mapping.
-- OBS: Om du använder Clerk (inte Supabase Auth) behöver du använda service role key
-- på server-sidan (i /api/avatar/route.ts) och skippa dessa RLS-regler.
-- Istället säkras upload via requireUser() i API-routen.

-- Vid bruk av Supabase Auth direkt (alternativt):
-- CREATE POLICY "User can upload own avatar"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = split_part(name, '/', 1));

-- CREATE POLICY "User can update own avatar"
--   ON storage.objects FOR UPDATE
--   USING (bucket_id = 'avatars' AND auth.uid()::text = split_part(name, '/', 1));
