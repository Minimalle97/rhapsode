-- prisma/sql/2026-08-30-drop-recording-paths.sql
--
-- Tar bort platsen dar en sokvag till en rostinspelning kunde sparas.
--
-- OBS: det har ar den forsta migrationen i projektet som faktiskt
-- SLAPPER nagot. Den ar anda forlustfri, och det ar kontrollerat, inte
-- antaget:
--
--   PracticeSession: 29 rader, 0 med ett varde i recordingPath
--   Performance:      0 rader
--
-- Kontrollera sjalv innan du kor, om du vill:
--
--   SELECT count(*) FROM "PracticeSession" WHERE "recordingPath" IS NOT NULL;
--   SELECT count(*) FROM "Performance";
--
-- Bada ska ge 0. Ger de nagot annat: kor INTE det har, utan sag till.
--
-- `prisma db push` kommer att varna om dataforlust och fraga. Till
-- skillnad fran forra gangen ar varningen befogad — den beskriver en
-- riktig DROP. Svara ja forst efter att raknaren ovan visat noll.
--
-- Kvar att gora for hand: ta bort bucketen "recordings" i Supabase
-- Storage. Den ar tom, men en tom hink som heter recordings inbjuder
-- nagon att borja anvanda den igen.

-- AlterTable
ALTER TABLE "Performance" DROP COLUMN "recordingPath";

-- AlterTable
ALTER TABLE "PracticeSession" DROP COLUMN "recordingPath";

