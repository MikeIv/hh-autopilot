-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN "employerUrl" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "employerTrusted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vacancy" ADD COLUMN "employerRating" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "employerReviews" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "employerHhRating" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vacancy" ADD COLUMN "employerHrBrand" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vacancy" ADD COLUMN "employerLogo" TEXT;
