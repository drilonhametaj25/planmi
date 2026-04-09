-- Migrazione: aggiunge deletedAt per soft delete dei progetti

ALTER TABLE "projects" ADD COLUMN "deleted_at" timestamp with time zone;
