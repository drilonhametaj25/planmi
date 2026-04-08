-- Migrazione incrementale: aggiunge tags, orari intra-giornalieri, e tabella task_links.

-- 1. Colonna tags sulla tabella tasks (JSON array come text)
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "tags" text;
--> statement-breakpoint

-- 2. Colonne orario intra-giornaliero sulla tabella tasks
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "start_time" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "end_time" text;
--> statement-breakpoint

-- 3. Tabella task_links per collegamenti cross-parent
CREATE TABLE IF NOT EXISTS "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_task_id" uuid NOT NULL,
	"target_task_id" uuid NOT NULL,
	"link_type" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "task_links_source_task_id_target_task_id_unique" UNIQUE("source_task_id","target_task_id")
);
--> statement-breakpoint

-- 4. Foreign keys per task_links
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'task_links_source_task_id_tasks_id_fk'
  ) THEN
    ALTER TABLE "task_links"
      ADD CONSTRAINT "task_links_source_task_id_tasks_id_fk"
      FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'task_links_target_task_id_tasks_id_fk'
  ) THEN
    ALTER TABLE "task_links"
      ADD CONSTRAINT "task_links_target_task_id_tasks_id_fk"
      FOREIGN KEY ("target_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
