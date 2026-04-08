/* page.tsx — Dashboard PlanMi. KPI globali, progetti attivi, task urgenti, schedule giornaliero. */
"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  FolderKanban,
  Ban,
  Calendar,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Task, Project } from "@/db/schema";
import { formatShortDate, parseDate } from "@/lib/gantt/timeline";
import type { DailySchedule, OptimizedScheduleResult } from "@/lib/workload-optimizer";
import { cn } from "@/lib/utils";

interface DashboardData {
  data: {
    kpi: {
      totalOpen: number;
      overdue: number;
      inProgress: number;
      blocked: number;
      activeProjects: number;
    };
    projects: (Project & {
      totalTasks: number;
      completedTasks: number;
      overdueTasks: number;
      progress: number;
    })[];
    urgentTasks: Task[];
  };
}

interface ScheduleData {
  data: OptimizedScheduleResult;
}

export default function DashboardPage() {
  const { data, isLoading } = useSWR<DashboardData>("/api/dashboard");
  const { data: scheduleData, isLoading: scheduleLoading } = useSWR<ScheduleData>("/api/dashboard/schedule");
  const dashboard = data?.data;
  const schedule = scheduleData?.data;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-md bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const kpi = dashboard?.kpi;
  const projects = dashboard?.projects ?? [];
  const urgentTasks = dashboard?.urgentTasks ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Panoramica dei tuoi progetti
        </p>
      </div>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KPICard
          icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
          label="Task aperti"
          value={kpi?.totalOpen ?? 0}
        />
        <KPICard
          icon={<AlertTriangle className="h-4 w-4 text-critical" />}
          label="In ritardo"
          value={kpi?.overdue ?? 0}
          alert={!!kpi?.overdue && kpi.overdue > 0}
        />
        <KPICard
          icon={<Clock className="h-4 w-4 text-pm-accent" />}
          label="In progress"
          value={kpi?.inProgress ?? 0}
        />
        <KPICard
          icon={<Ban className="h-4 w-4 text-critical" />}
          label="Bloccati"
          value={kpi?.blocked ?? 0}
          alert={!!kpi?.blocked && kpi.blocked > 0}
        />
        <KPICard
          icon={<FolderKanban className="h-4 w-4 text-muted-foreground" />}
          label="Progetti attivi"
          value={kpi?.activeProjects ?? 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Progetti attivi */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Progetti attivi</h2>
          {projects.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-6 text-center text-muted-foreground text-sm">
              Nessun progetto attivo. Creane uno dalla sidebar!
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-3 rounded-md border border-border bg-card p-3 hover:border-primary/30 transition-colors"
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: project.color ?? "#3B82F6" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {project.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {project.completedTasks}/{project.totalTasks} task ·{" "}
                      {project.overdueTasks > 0 && (
                        <span className="text-critical">
                          {project.overdueTasks} in ritardo
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                      {project.progress}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Task urgenti */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Attenzione richiesta</h2>
          {urgentTasks.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-6 text-center text-muted-foreground text-sm">
              Nessun task urgente
            </div>
          ) : (
            <div className="space-y-2">
              {urgentTasks.map((task) => {
                const end = parseDate(task.endDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isOverdue = end < today;

                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
                  >
                    <AlertTriangle
                      className={`h-4 w-4 shrink-0 ${isOverdue ? "text-critical" : "text-warning"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        Scadenza: {formatShortDate(end)}
                        {isOverdue && (
                          <span className="text-critical ml-1">
                            (scaduto)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ SCHEDULE GIORNALIERO ═══════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Scaletta giornaliera</h2>
          <span className="text-xs text-muted-foreground">
            Piano ottimizzato basato su priorità e dipendenze
          </span>
        </div>

        {scheduleLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-md bg-muted" />
            ))}
          </div>
        ) : !schedule || schedule.days.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-center text-muted-foreground text-sm">
            Nessun task da schedulare. Aggiungi ore stimate ai task per generare il piano.
          </div>
        ) : (
          <>
            {/* Warnings */}
            {schedule.warnings.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-1">
                {schedule.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-warning flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {/* Daily schedule */}
            <div className="space-y-1.5">
              {schedule.days.map((day) => (
                <DayRow key={day.date} day={day} />
              ))}
            </div>

            {/* Task non schedulabili */}
            {schedule.unschedulable.length > 0 && (
              <div className="rounded-md border border-border bg-card p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Non schedulabili ({schedule.unschedulable.length})
                </p>
                {schedule.unschedulable.map((u) => (
                  <div key={u.taskId} className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                    <span className="truncate">{u.taskTitle}</span>
                    <span className="text-[10px] ml-auto shrink-0">{u.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-critical",
  high: "bg-warning",
  medium: "bg-pm-accent",
  low: "bg-muted-foreground",
};

function DayRow({ day }: { day: DailySchedule }) {
  const [expanded, setExpanded] = useState(false);
  const isToday = day.date === new Date().toISOString().split("T")[0];
  const isEmpty = day.slots.length === 0;

  if (isEmpty) return null;

  return (
    <div
      className={cn(
        "rounded-md border bg-card transition-colors",
        isToday ? "border-pm-accent/40 bg-pm-accent/5" : "border-border",
        day.overloaded && "border-critical/30"
      )}
    >
      <button
        className="flex items-center gap-3 w-full p-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium", isToday && "text-pm-accent")}>
              {day.dayOfWeek}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {day.date}
            </span>
            {isToday && (
              <span className="text-[10px] bg-pm-accent text-white px-1.5 py-0.5 rounded-full font-medium">
                OGGI
              </span>
            )}
          </div>
          {!expanded && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {day.slots.map((s) => s.taskTitle).join(" · ")}
            </p>
          )}
        </div>

        {/* Barra ore */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-1.5 w-16 rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                day.overloaded ? "bg-critical" : day.totalHours >= 7 ? "bg-success" : "bg-pm-accent"
              )}
              style={{ width: `${Math.min(100, (day.totalHours / 8) * 100)}%` }}
            />
          </div>
          <span className={cn(
            "text-xs font-mono w-10 text-right",
            day.overloaded ? "text-critical font-medium" : "text-muted-foreground"
          )}>
            {day.totalHours}h
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-border/50 pt-2">
          {day.slots.map((slot, i) => (
            <div
              key={`${slot.taskId}-${i}`}
              className="flex items-center gap-2 text-xs"
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_COLORS[slot.priority] ?? "bg-muted-foreground")} />
              <span className="truncate flex-1">{slot.taskTitle}</span>
              {slot.projectName && (
                <span className="text-[10px] text-muted-foreground shrink-0 max-w-24 truncate">
                  {slot.projectName}
                </span>
              )}
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-8 text-right">
                {slot.hours}h
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-card p-4 ${
        alert ? "border-critical/30" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-bold font-mono ${alert ? "text-critical" : ""}`}>
        {value}
      </p>
    </div>
  );
}
