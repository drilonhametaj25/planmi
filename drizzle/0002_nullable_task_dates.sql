-- Migrazione: rendi startDate/endDate nullable per supportare task "da schedulare"

ALTER TABLE "tasks" ALTER COLUMN "start_date" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "end_date" DROP NOT NULL;
