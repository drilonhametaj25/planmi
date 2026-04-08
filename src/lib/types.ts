/* types.ts — Tipi compositi per PlanMi. Re-export dei tipi Drizzle + tipi specifici per API e Gantt. */
import type { Task, Project, Dependency, Milestone } from "@/db/schema";

// ── Tipi compositi API ──
export type ProjectWithStats = Project & {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  progress: number;
};

export type TaskWithDependencies = Task & {
  predecessors: Dependency[];
  successors: Dependency[];
};

// ── Tipi Gantt ──
export type ZoomLevel = "hour" | "day" | "week" | "month";

export interface TimelineConfig {
  startDate: Date;
  endDate: Date;
  dayWidth: number;
  rowHeight: number;
  headerHeight: number;
  viewportWidth: number;
}

export interface GanttTaskBar {
  task: Task;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Tipi Shifting ──
export interface ShiftResult {
  shifts: ShiftEntry[];
  hasCircularDependency: boolean;
  circularPath?: string[];
}

export interface ShiftEntry {
  taskId: string;
  oldStartDate: string;
  oldEndDate: string;
  newStartDate: string;
  newEndDate: string;
  reason: string;
}

// ── Tipi Suggerimenti ──
export type SuggestionSeverity = "info" | "warning" | "critical";

export interface Suggestion {
  id: string;
  type: string;
  severity: SuggestionSeverity;
  title: string;
  description: string;
  affectedTaskIds: string[];
  suggestedAction?: string;
}

// ── API Response wrapper ──
export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: string;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ── Tipi Auto-Scheduler ──
export type {
  AutoScheduleInput,
  AutoScheduleResult,
  ScheduleConstraint,
  ScheduleWarning,
  PredecessorDep,
} from "./auto-scheduler";

// Re-export DB types per comodità
export type {
  Project,
  NewProject,
  Task,
  NewTask,
  Dependency,
  NewDependency,
  Milestone,
  NewMilestone,
  TaskHistory,
  WeeklySnapshot,
} from "@/db/schema";
