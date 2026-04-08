/* validators.ts — Schemi Zod per validazione request body nelle API routes. */
import { z } from "zod";

// ── Projects ──
export const createProjectSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(200),
  description: z.string().optional(),
  status: z.enum(["active", "on_hold", "completed", "archived"]).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  category: z
    .enum(["freelance", "saas", "gestionale", "side_project", "altro"])
    .optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

// ── Tasks ──
export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  title: z.string().min(1, "Titolo obbligatorio").max(500),
  description: z.string().optional(),
  status: z
    .enum(["todo", "in_progress", "in_review", "done", "blocked"])
    .optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  taskType: z
    .enum([
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
    ])
    .optional(),
  startDate: z.string(),
  endDate: z.string(),
  estimatedHours: z.number().min(0).optional(),
  executionMode: z.enum(["internal", "supplier"]).optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().optional(),
});

export const updateTaskSchema = z.object({
  parentTaskId: z.string().uuid().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  status: z
    .enum(["todo", "in_progress", "in_review", "done", "blocked"])
    .optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  taskType: z
    .enum([
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
    ])
    .nullable()
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  actualStartDate: z.string().nullable().optional(),
  actualEndDate: z.string().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  estimatedHours: z.number().min(0).nullable().optional(),
  actualHours: z.number().min(0).nullable().optional(),
  executionMode: z.enum(["internal", "supplier"]).optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().nullable().optional(),
});

// ── Dependencies ──
export const createDependencySchema = z.object({
  predecessorId: z.string().uuid(),
  successorId: z.string().uuid(),
  dependencyType: z.enum(["FS", "SS", "FF", "SF"]).optional(),
  lagDays: z.number().int().optional(),
});

// ── Milestones ──
export const createMilestoneSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  date: z.string(),
  description: z.string().optional(),
});

export const updateMilestoneSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  date: z.string().optional(),
  description: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
});

// ── Move task ──
export const moveTaskSchema = z.object({
  newStartDate: z.string(),
  newEndDate: z.string(),
});

// ── Auto-schedule ──
export const autoScheduleSchema = z.object({
  taskType: z.string().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  predecessorDeps: z
    .array(
      z.object({
        predecessorId: z.string().uuid(),
        dependencyType: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
        lagDays: z.number().int().default(0),
      })
    )
    .default([]),
});

// ── Time Off ──
export const createTimeOffSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum(["ferie", "permesso", "malattia", "altro"]),
  hoursPerDay: z.number().min(0.5).max(8).nullable().optional(),
  note: z.string().optional(),
});

export const updateTimeOffSchema = createTimeOffSchema.partial();

// ── Reorder tasks ──
export const reorderTasksSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int(),
    })
  ),
});
