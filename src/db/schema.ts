/* schema.ts — Drizzle ORM schema per PlanMi. Definisce tutte le tabelle del database PostgreSQL (Neon). */
import { pgTable, uuid, text, date, integer, numeric, boolean, timestamp, unique } from "drizzle-orm/pg-core";

// ── Projects ──
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["active", "on_hold", "completed", "archived"],
  }).default("active"),
  color: text("color").default("#3B82F6"),
  category: text("category", {
    enum: ["freelance", "saas", "gestionale", "side_project", "altro"],
  }),
  startDate: date("start_date"),
  targetEndDate: date("target_end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── Time Off (ferie, permessi, malattia) ──
export const timeOff = pgTable("time_off", {
  id: uuid("id").defaultRandom().primaryKey(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: text("type", {
    enum: ["ferie", "permesso", "malattia", "altro"],
  }).notNull(),
  hoursPerDay: numeric("hours_per_day", { precision: 4, scale: 1 }),  // null = full day (8h off)
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Tasks ──
export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  parentTaskId: uuid("parent_task_id"),
  milestoneId: uuid("milestone_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["todo", "in_progress", "in_review", "done", "blocked"],
  }).default("todo"),
  priority: text("priority", {
    enum: ["critical", "high", "medium", "low"],
  }).default("medium"),
  executionMode: text("execution_mode", {
    enum: ["internal", "supplier"],
  }).default("internal"),
  taskType: text("task_type", {
    enum: [
      "frontend",
      "backend",
      "database",
      "api",
      "design",
      "testing",
      "devops",
      "documentation",
      "bug_fix",
      "feature",
      "refactoring",
      "research",
      "meeting",
      "setup",
      "deployment",
      "altro",
    ],
  }),
  startDate: date("start_date"),   // nullable = task "da schedulare"
  endDate: date("end_date"),       // nullable = task "da schedulare"
  actualStartDate: date("actual_start_date"),
  actualEndDate: date("actual_end_date"),
  progress: integer("progress").default(0),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 1 }),
  actualHours: numeric("actual_hours", { precision: 6, scale: 1 }),
  sortOrder: integer("sort_order").default(0),
  notes: text("notes"),
  tags: text("tags"),  // JSON array stored as text: '["tag1","tag2"]'
  startTime: text("start_time"),  // "HH:MM" format, nullable (null = day start)
  endTime: text("end_time"),      // "HH:MM" format, nullable (null = day end)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── Dependencies (relazioni tra task) ──
// FS = Finish-to-Start (A finisce → B inizia)
// SS = Start-to-Start (A inizia → B inizia)
// FF = Finish-to-Finish (A finisce → B finisce)
// SF = Start-to-Finish (A inizia → B finisce)
export const dependencies = pgTable(
  "dependencies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    predecessorId: uuid("predecessor_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    successorId: uuid("successor_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    dependencyType: text("dependency_type", {
      enum: ["FS", "SS", "FF", "SF"],
    }).default("FS"),
    lagDays: integer("lag_days").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique().on(table.predecessorId, table.successorId)]
);

// ── Task History (storico completamenti per calcolo medie) ──
export const taskHistory = pgTable("task_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  taskType: text("task_type"),
  category: text("category"),
  estimatedDays: integer("estimated_days"),
  actualDays: integer("actual_days"),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 1 }),
  actualHours: numeric("actual_hours", { precision: 6, scale: 1 }),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow(),
});

// ── Milestones ──
export const milestones = pgTable("milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  date: date("date").notNull(),
  description: text("description"),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Weekly Snapshots (per tracking velocity e health score) ──
export const weeklySnapshots = pgTable("weekly_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  weekStart: date("week_start").notNull(),
  totalTasks: integer("total_tasks"),
  completedTasks: integer("completed_tasks"),
  blockedTasks: integer("blocked_tasks"),
  overdueTasks: integer("overdue_tasks"),
  velocity: numeric("velocity", { precision: 5, scale: 2 }),
  healthScore: integer("health_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Task Links (collegamenti cross-parent tra task) ──
export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceTaskId: uuid("source_task_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    targetTaskId: uuid("target_task_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    linkType: text("link_type", {
      enum: ["continues_in", "continued_from", "related_to"],
    }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique().on(table.sourceTaskId, table.targetTaskId)]
);

// ── Inferred types ──
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Dependency = typeof dependencies.$inferSelect;
export type NewDependency = typeof dependencies.$inferInsert;
export type TaskHistory = typeof taskHistory.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type WeeklySnapshot = typeof weeklySnapshots.$inferSelect;
export type TimeOff = typeof timeOff.$inferSelect;
export type NewTimeOff = typeof timeOff.$inferInsert;
export type TaskLinkRow = typeof taskLinks.$inferSelect;
export type NewTaskLink = typeof taskLinks.$inferInsert;
