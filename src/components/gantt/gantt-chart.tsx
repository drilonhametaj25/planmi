/* gantt-chart.tsx — Componente principale Gantt SVG. Collapse sincronizzato sidebar↔body, drag/resize fluido, nessun salto dopo release. */
"use client";

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import type { Task, Dependency, Milestone, TimeOff } from "@/db/schema";
import type { ZoomLevel } from "@/lib/types";
import type { TimelineConfig } from "@/lib/gantt/timeline";
import { useTimeOff } from "@/hooks/use-time-off";
import {
  getDayWidth,
  calculateTimelineRange,
  getTotalWidth,
  dateToX,
  daysBetween,
  isWeekend,
  timeToFractionOfDay,
  fractionToTime,
  WORKDAY_HOURS,
  WORKDAY_START,
} from "@/lib/gantt/timeline";
import { computeRows } from "@/lib/gantt/layout";
import type { RowLayout } from "@/lib/gantt/layout";
import { buildTaskTree, filterVisibleNodes } from "@/lib/task-tree";

import { GanttHeader } from "./gantt-header";
import { GanttSidebar } from "./gantt-sidebar";
import { GanttTaskBar } from "./gantt-task-bar";
import { GanttMilestone } from "./gantt-milestone";
import { GanttDependencyLines } from "./gantt-dependency-lines";
import { GanttTooltip } from "./gantt-tooltip";
import { GanttToolbar } from "./gantt-toolbar";

interface GanttChartProps {
  tasks: Task[];
  dependencies: Dependency[];
  milestones: Milestone[];
  onTaskSelect: (taskId: string | null) => void;
  onTaskMove: (taskId: string, newStart: string, newEnd: string, newStartTime?: string | null, newEndTime?: string | null) => void;
  onTaskResize: (taskId: string, newStart: string, newEnd: string, newStartTime?: string | null, newEndTime?: string | null) => void;
  onTaskToggleComplete: (taskId: string, done: boolean) => void;
  onReorderTasks?: (updates: { id: string; sortOrder: number }[]) => void;
  selectedTaskId: string | null;
}

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 48;

/** Formatta una data UTC in YYYY-MM-DD. Usa getUTC* per evitare offset timezone. */
function toISODateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function GanttChart({
  tasks,
  dependencies,
  milestones,
  onTaskSelect,
  onTaskMove,
  onTaskResize,
  onTaskToggleComplete,
  onReorderTasks,
  selectedTaskId,
}: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { timeOff } = useTimeOff();
  const [scrollTop, setScrollTop] = useState(0);
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [showDependencies, setShowDependencies] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);

  // Collapse state — sollevato qui per sincronizzare sidebar e body
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // Tooltip state
  const [tooltipTask, setTooltipTask] = useState<Task | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Drag state — ref per evitare stale closures nel pointermove/up
  const dragRef = useRef<{
    taskId: string;
    type: "move" | "resize-left" | "resize-right";
    startX: number;
  } | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const dayWidth = getDayWidth(zoom);
  const { startDate, endDate } = useMemo(
    () => calculateTimelineRange(tasks, milestones),
    [tasks, milestones]
  );

  const config: TimelineConfig = useMemo(
    () => ({
      startDate,
      endDate,
      dayWidth,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      sidebarWidth: 256,
    }),
    [startDate, endDate, dayWidth]
  );

  // Albero e filtraggio visibilità — unica source of truth
  const allTreeNodes = useMemo(() => buildTaskTree(tasks), [tasks]);
  const visibleNodes = useMemo(
    () => filterVisibleNodes(allTreeNodes, collapsedIds),
    [allTreeNodes, collapsedIds]
  );
  const visibleTasks = useMemo(
    () => visibleNodes.map((n) => n.task),
    [visibleNodes]
  );

  // Task schedulati (con date) — solo questi vengono disegnati nel timeline SVG
  const scheduledTasks = useMemo(
    () => visibleTasks.filter((t) => t.startDate && t.endDate),
    [visibleTasks]
  );

  // Mappa date time-off → { type, isFullDay, hours }
  // Usa date locali (non UTC) per matchare il grid del Gantt che usa getFullYear/getMonth/getDate
  const timeOffMap = useMemo(() => {
    const map = new Map<string, { type: string; isFullDay: boolean; hours: number }>();
    for (const entry of timeOff) {
      const hoursOff = entry.hoursPerDay ? parseFloat(entry.hoursPerDay) : 8;
      const isFullDay = hoursOff >= 8;
      // Parsa come mezzogiorno locale per evitare problemi DST
      const cur = new Date(entry.startDate + "T12:00:00");
      const end = new Date(entry.endDate + "T12:00:00");
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        map.set(`${y}-${m}-${d}`, { type: entry.type, isFullDay, hours: hoursOff });
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [timeOff]);

  const totalWidth = getTotalWidth(config);
  const totalHeight = HEADER_HEIGHT + visibleTasks.length * ROW_HEIGHT + 60;

  const rows = useMemo(
    () => computeRows(scheduledTasks, config, zoom, visibleTasks),
    [scheduledTasks, config, zoom, visibleTasks]
  );
  const layoutMap = useMemo(() => {
    const map = new Map<string, RowLayout>();
    for (const row of rows) map.set(row.taskId, row);
    return map;
  }, [rows]);

  const totalDays = daysBetween(startDate, endDate);

  // ── Scroll ──
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  const scrollToToday = useCallback(() => {
    const todayX = dateToX(new Date(), config);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, todayX - 200);
    }
  }, [config]);

  useEffect(() => {
    scrollToToday();
  }, [scrollToToday]);

  // ── Hover ──
  const handleTaskHover = useCallback(
    (task: Task | null, rect: DOMRect | null) => {
      setTooltipTask(task);
      setTooltipPos(rect ? { x: rect.right, y: rect.top } : null);
    },
    []
  );

  // ── Select ──
  const handleSelectTask = useCallback(
    (taskId: string) => {
      onTaskSelect(selectedTaskId === taskId ? null : taskId);
    },
    [selectedTaskId, onTaskSelect]
  );

  // ── Drag & Resize (fluido) ──
  const handlePointerDown = useCallback(
    (
      e: React.PointerEvent,
      taskId: string,
      type: "move" | "resize-left" | "resize-right"
    ) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { taskId, type, startX: e.clientX };
      setDraggingTaskId(taskId);
      setDragOffsetX(0);
    },
    []
  );

  useEffect(() => {
    if (!draggingTaskId) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setDragOffsetX(e.clientX - dragRef.current.startX);
    };

    const handlePointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const finalOffset = e.clientX - drag.startX;
      const isHourZoom = zoom === "hour";

      // Reset drag state PRIMA dell'API call — la barra torna in posizione originale
      // ma l'optimistic update nel parent la sposterà subito alla nuova posizione
      dragRef.current = null;
      setDraggingTaskId(null);
      setDragOffsetX(0);

      const task = tasks.find((t) => t.id === drag.taskId);
      if (!task || !task.startDate || !task.endDate) return;

      const DAY_MS = 86400000;
      const startMs = new Date(task.startDate + "T00:00:00Z").getTime();
      const endMs = new Date(task.endDate + "T00:00:00Z").getTime();

      if (isHourZoom && task.startTime) {
        // ── Zoom orario: calcola delta in frazioni di giorno (snap 15min) ──
        const hourWidth = dayWidth / WORKDAY_HOURS; // px per ora
        const minutesPx = hourWidth / 60; // px per minuto
        const minutesDelta = Math.round(finalOffset / minutesPx / 15) * 15; // snap 15min

        if (minutesDelta === 0) return;

        const daysDelta = Math.floor(minutesDelta / (WORKDAY_HOURS * 60));
        const remainingMinutes = minutesDelta - daysDelta * WORKDAY_HOURS * 60;

        if (drag.type === "move") {
          // Calcola nuove date
          const newStart = toISODateStr(new Date(startMs + daysDelta * DAY_MS));
          const newEnd = toISODateStr(new Date(endMs + daysDelta * DAY_MS));

          // Calcola nuovi orari
          const startFrac = timeToFractionOfDay(task.startTime);
          const newStartFrac = startFrac + remainingMinutes / (WORKDAY_HOURS * 60);

          // Gestisci overflow/underflow giornata (se l'orario esce dal range 09:00-17:00)
          let finalDayOffset = 0;
          let clampedStartFrac = newStartFrac;
          if (newStartFrac >= 1) {
            finalDayOffset = Math.floor(newStartFrac);
            clampedStartFrac = newStartFrac - finalDayOffset;
          } else if (newStartFrac < 0) {
            finalDayOffset = Math.floor(newStartFrac);
            clampedStartFrac = newStartFrac - finalDayOffset;
          }

          const adjustedNewStart = finalDayOffset !== 0
            ? toISODateStr(new Date(new Date(newStart + "T00:00:00Z").getTime() + finalDayOffset * DAY_MS))
            : newStart;
          const adjustedNewEnd = finalDayOffset !== 0
            ? toISODateStr(new Date(new Date(newEnd + "T00:00:00Z").getTime() + finalDayOffset * DAY_MS))
            : newEnd;

          const newStartTime = fractionToTime(clampedStartFrac);
          let newEndTime: string | null = null;
          if (task.endTime) {
            const endFrac = timeToFractionOfDay(task.endTime);
            const newEndFrac = endFrac + remainingMinutes / (WORKDAY_HOURS * 60);
            newEndTime = fractionToTime(Math.max(0, Math.min(1, newEndFrac - (finalDayOffset !== 0 ? finalDayOffset : 0))));
          }

          onTaskMove(task.id, adjustedNewStart, adjustedNewEnd, newStartTime, newEndTime);
        } else if (drag.type === "resize-right" && task.endTime) {
          const endFrac = timeToFractionOfDay(task.endTime);
          const newEndFrac = endFrac + minutesDelta / (WORKDAY_HOURS * 60);
          const extraDays = Math.floor(newEndFrac);
          const clampedEndFrac = newEndFrac - extraDays;
          const newEndDate = extraDays > 0
            ? toISODateStr(new Date(endMs + extraDays * DAY_MS))
            : task.endDate;
          const newEndTime = fractionToTime(Math.max(0, Math.min(1, clampedEndFrac)));
          onTaskResize(task.id, task.startDate, newEndDate, task.startTime, newEndTime);
        } else if (drag.type === "resize-left") {
          const startFrac = timeToFractionOfDay(task.startTime);
          const newStartFrac = startFrac + minutesDelta / (WORKDAY_HOURS * 60);
          const extraDays = Math.floor(newStartFrac);
          const clampedStartFrac = newStartFrac - extraDays;
          const newStartDate = extraDays !== 0
            ? toISODateStr(new Date(startMs + extraDays * DAY_MS))
            : task.startDate;
          const newStartTime = fractionToTime(Math.max(0, Math.min(1, clampedStartFrac)));
          onTaskResize(task.id, newStartDate, task.endDate, newStartTime, task.endTime ?? null);
        }
      } else {
        // ── Zoom giorno/settimana/mese: calcola delta in giorni interi ──
        const daysDelta = Math.round(finalOffset / dayWidth);
        if (daysDelta === 0) return;

        const deltaMs = daysDelta * DAY_MS;

        if (drag.type === "move") {
          const newStart = toISODateStr(new Date(startMs + deltaMs));
          const newEnd = toISODateStr(new Date(endMs + deltaMs));
          onTaskMove(task.id, newStart, newEnd);
        } else if (drag.type === "resize-right") {
          const newEnd = new Date(endMs + deltaMs);
          if (newEnd.getTime() >= startMs) {
            onTaskResize(task.id, task.startDate, toISODateStr(newEnd));
          }
        } else if (drag.type === "resize-left") {
          const newStart = new Date(startMs + deltaMs);
          if (newStart.getTime() <= endMs) {
            onTaskResize(task.id, toISODateStr(newStart), task.endDate);
          }
        }
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingTaskId, dayWidth, zoom, tasks, onTaskMove, onTaskResize]);

  // ── Keyboard ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTaskSelect(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onTaskSelect]);

  return (
    <div className="flex flex-col h-full border border-border rounded-md overflow-hidden bg-background">
      <GanttToolbar
        zoom={zoom}
        onZoomChange={setZoom}
        onScrollToToday={scrollToToday}
        showDependencies={showDependencies}
        onToggleDependencies={() => setShowDependencies((v) => !v)}
        showMilestones={showMilestones}
        onToggleMilestones={() => setShowMilestones((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — riceve collapsedIds dal parent */}
        <GanttSidebar
          tasks={tasks}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          scrollTop={scrollTop}
          selectedTaskId={selectedTaskId}
          collapsedIds={collapsedIds}
          onSelectTask={handleSelectTask}
          onToggleCollapse={toggleCollapse}
          onToggleComplete={onTaskToggleComplete}
          onReorderTasks={onReorderTasks}
        />

        {/* Main scroll area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto"
          onScroll={handleScroll}
        >
          <svg
            width={totalWidth}
            height={totalHeight}
            className="select-none"
            onClick={() => onTaskSelect(null)}
          >
            <GanttHeader config={config} totalWidth={totalWidth} zoom={zoom} timeOffMap={timeOffMap} />

            {/* Grid colonne giorno */}
            {Array.from({ length: totalDays + 1 }, (_, i) => {
              const d = new Date(startDate);
              d.setDate(d.getDate() + i);
              const x = i * dayWidth;
              const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const off = timeOffMap.get(dateStr);
              const isWe = isWeekend(d);
              return (
                <g key={i}>
                  {/* Sfondo giorno: ferie > weekend > normale */}
                  {off ? (
                    <rect
                      x={x}
                      y={HEADER_HEIGHT}
                      width={dayWidth}
                      height={totalHeight - HEADER_HEIGHT}
                      fill="var(--gantt-time-off)"
                      opacity={off.isFullDay ? 1 : off.hours / 8}
                    />
                  ) : isWe ? (
                    <rect
                      x={x}
                      y={HEADER_HEIGHT}
                      width={dayWidth}
                      height={totalHeight - HEADER_HEIGHT}
                      fill="var(--gantt-weekend)"
                    />
                  ) : null}
                  <line
                    x1={x}
                    y1={HEADER_HEIGHT}
                    x2={x}
                    y2={totalHeight}
                    stroke="var(--gantt-grid)"
                    strokeWidth={zoom === "hour" ? 1 : 0.5}
                  />
                  {/* Linee orarie dentro il giorno (solo zoom ore, no weekend) */}
                  {zoom === "hour" && !isWe && Array.from({ length: WORKDAY_HOURS - 1 }, (_, h) => {
                    const hourX = x + ((h + 1) / WORKDAY_HOURS) * dayWidth;
                    // Linea solida a mezzogiorno (ora 12 = indice 7 da WORKDAY_START=5)
                    const isMidDay = (WORKDAY_START + h + 1) === 12;
                    return (
                      <line
                        key={h}
                        x1={hourX}
                        y1={HEADER_HEIGHT}
                        x2={hourX}
                        y2={totalHeight}
                        stroke="var(--gantt-grid)"
                        strokeWidth={0.3}
                        strokeDasharray={isMidDay ? "none" : "2 4"}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* Grid righe */}
            {visibleTasks.map((_, i) => (
              <line
                key={i}
                x1={0}
                y1={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT}
                x2={totalWidth}
                y2={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT}
                stroke="var(--gantt-grid)"
                strokeWidth={0.5}
              />
            ))}

            {/* Linea oggi */}
            {(() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              if (today >= startDate && today <= endDate) {
                const x = dateToX(today, config);
                return (
                  <line
                    x1={x} y1={0} x2={x} y2={totalHeight}
                    stroke="var(--gantt-today)"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    opacity={0.7}
                  />
                );
              }
              return null;
            })()}

            {/* Dipendenze */}
            {showDependencies && (
              <GanttDependencyLines
                dependencies={dependencies}
                layouts={layoutMap}
              />
            )}

            {/* Barre task — solo schedulati */}
            {rows.map((layout) => {
              const task = scheduledTasks.find((t) => t.id === layout.taskId);
              if (!task) return null;
              const isDragging = draggingTaskId === task.id;
              return (
                <GanttTaskBar
                  key={task.id}
                  task={task}
                  layout={layout}
                  isSelected={selectedTaskId === task.id}
                  isDragging={isDragging}
                  dragOffsetX={isDragging ? dragOffsetX : 0}
                  onSelect={handleSelectTask}
                  onPointerDown={handlePointerDown}
                  onHover={handleTaskHover}
                />
              );
            })}

            {/* Milestones */}
            {showMilestones &&
              milestones.map((m) => (
                <GanttMilestone
                  key={m.id}
                  milestone={m}
                  config={config}
                  totalRows={visibleTasks.length}
                />
              ))}
          </svg>
        </div>
      </div>

      <GanttTooltip task={tooltipTask} position={tooltipPos} />
    </div>
  );
}
