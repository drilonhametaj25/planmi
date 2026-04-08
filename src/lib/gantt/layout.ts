/* layout.ts — Calcolo posizioni righe per il Gantt chart. Funzione pura. */
import type { Task } from "@/db/schema";
import type { TimelineConfig } from "./timeline";
import type { ZoomLevel } from "@/lib/types";
import { dateToX, daysBetween, parseDate, timeToFractionOfDay } from "./timeline";

export interface RowLayout {
  taskId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Calcola layout (posizione x/y, larghezza, altezza) di ogni barra task nel Gantt.
 *  In zoom orario, la larghezza è proporzionale alle ore stimate.
 *  Altrimenti, per task intra-giornalieri con ore < 8, scala proporzionalmente. */
export function computeRows(
  tasks: Task[],
  config: TimelineConfig,
  zoom?: ZoomLevel
): RowLayout[] {
  const barHeight = config.rowHeight - 12; // 12px padding verticale
  const isHourZoom = zoom === "hour";
  const hourWidth = config.dayWidth / 8; // px per ora

  return tasks.map((task, index) => {
    const startDate = parseDate(task.startDate);
    const endDate = parseDate(task.endDate);
    const baseX = dateToX(startDate, config);
    const durationDays = daysBetween(startDate, endDate) + 1; // +1 perché inclusive
    const hours = task.estimatedHours ? parseFloat(task.estimatedHours) : 0;
    const hasStartTime = !!task.startTime;
    const hasEndTime = !!task.endTime;
    const isSameDay = task.startDate === task.endDate;

    let x = baseX;
    let width: number;

    if (isHourZoom && hasStartTime && hasEndTime && isSameDay) {
      // Zoom orario + orari specifici su stesso giorno: posiziona e dimensiona per ora
      x = baseX + timeToFractionOfDay(task.startTime) * config.dayWidth;
      const startFrac = timeToFractionOfDay(task.startTime);
      const endFrac = timeToFractionOfDay(task.endTime);
      const timeDiff = Math.max(endFrac - startFrac, 0.0625); // min 30min
      width = Math.max(timeDiff * config.dayWidth, hourWidth * 0.5);
    } else if (isHourZoom && hasStartTime) {
      // Zoom orario + solo startTime: offset da startTime, larghezza da ore stimate
      x = baseX + timeToFractionOfDay(task.startTime) * config.dayWidth;
      width = hours > 0
        ? Math.max(hours * hourWidth, hourWidth * 0.5)
        : Math.max(durationDays * config.dayWidth, config.dayWidth);
    } else if (isHourZoom && hours > 0) {
      // Zoom orario senza orari: larghezza basata sulle ore stimate (backward compatible)
      width = Math.max(hours * hourWidth, hourWidth * 0.5);
    } else if (durationDays === 1 && hours > 0 && hours < 8) {
      // Zoom giorno/settimana: scala per task intra-giornalieri
      const fraction = hours / 8;
      const minWidth = config.dayWidth * 0.15;
      width = Math.max(config.dayWidth * fraction, minWidth);
    } else {
      width = Math.max(durationDays * config.dayWidth, config.dayWidth);
    }

    const y = config.headerHeight + index * config.rowHeight + 6;

    return {
      taskId: task.id,
      x,
      y,
      width,
      height: barHeight,
    };
  });
}
