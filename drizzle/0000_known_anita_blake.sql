-- Baseline migration: tabelle già esistenti nel DB di produzione.
-- Questa migrazione è un no-op; serve solo come punto di partenza per il journal.
-- Le tabelle (projects, tasks, dependencies, milestones, task_history, time_off, weekly_snapshots)
-- sono state create in precedenza con drizzle-kit push.

-- DO NOTHING (baseline)
SELECT 1;
