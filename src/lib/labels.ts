/* labels.ts — Label user-friendly per enum DB. Usati ovunque serve mostrare valori leggibili. */

export const STATUS_LABELS: Record<string, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
};

export const PRIORITY_LABELS: Record<string, string> = {
  critical: "Critica",
  high: "Alta",
  medium: "Media",
  low: "Bassa",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  database: "Database",
  api: "API",
  design: "Design",
  testing: "Testing",
  devops: "DevOps",
  documentation: "Docs",
  bug_fix: "Bug Fix",
  feature: "Feature",
  refactoring: "Refactoring",
  research: "Research",
  meeting: "Meeting",
  setup: "Setup",
  deployment: "Deploy",
  altro: "Altro",
};

export function statusLabel(status: string | null): string {
  return STATUS_LABELS[status ?? "todo"] ?? status ?? "Todo";
}

export function priorityLabel(priority: string | null): string {
  return PRIORITY_LABELS[priority ?? "medium"] ?? priority ?? "Media";
}

export function taskTypeLabel(type: string | null): string {
  if (!type) return "";
  return TASK_TYPE_LABELS[type] ?? type;
}
