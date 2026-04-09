/* layout.ts — Calcolo posizioni righe per il Gantt chart. Funzione pura. */
import type { Task } from "@/db/schema";
import type { TimelineConfig } from "./timeline";
import type { ZoomLevel } from "@/lib/types";
import { dateToX, daysBetween, parseDate, timeToFractionOfDay, WORKDAY_HOURS } from "./timeline";

export interface RowLayout {
  taskId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Calcola layout (posizione x/y, larghezza, altezza) di ogni barra task nel Gantt.
 *  In zoom orario, la larghezza è proporzionale alle ore stimate.
 *  Altrimenti, per task intra-giornalieri con ore < 8, scala proporzionalmente.
 *  @param allVisibleTasks — lista completa di tutti i task visibili (schedulati e non)
 *    per calcolare la posizione Y corretta allineata con la sidebar. */
export function computeRows(
  tasks: Task[],
  config: TimelineConfig,
  zoom?: ZoomLevel,
  allVisibleTasks?: Task[]
): RowLayout[] {
  const barHeight = config.rowHeight - 12; // 12px padding verticale
  const isHourZoom = zoom === "hour";
  const hourWidth = config.dayWidth / WORKDAY_HOURS; // px per ora

  // Mappa per lookup rapido dell'indice nel sidebar (tutti i task visibili)
  const visibleIndexMap = new Map<string, number>();
  if (allVisibleTasks) {
    allVisibleTasks.forEach((t, i) => visibleIndexMap.set(t.id, i));
  }

  return tasks.map((task, index) => {
    // Callers must filter to scheduled tasks only (startDate & endDate non-null)
    const startDate = parseDate(task.startDate!);
    const endDate = parseDate(task.endDate!);
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
    } else if (durationDays === 1 && hours > 0 && hours < WORKDAY_HOURS) {
      // Zoom giorno/settimana: scala per task intra-giornalieri
      const fraction = hours / WORKDAY_HOURS;
      const minWidth = config.dayWidth * 0.15;
      width = Math.max(config.dayWidth * fraction, minWidth);
    } else {
      width = Math.max(durationDays * config.dayWidth, config.dayWidth);
    }

    // Usa l'indice nella lista completa visibleTasks per allinearsi con la sidebar
    const rowIndex = visibleIndexMap.get(task.id) ?? index;
    const y = config.headerHeight + rowIndex * config.rowHeight + 6;

    return {
      taskId: task.id,
      x,
      y,
      width,
      height: barHeight,
    };
  });
}
