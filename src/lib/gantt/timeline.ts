/* timeline.ts — Funzioni pure per conversione date/pixel nel Gantt chart. Zero side effects. */
import type { Task, Milestone } from "@/db/schema";
import type { ZoomLevel } from "@/lib/types";

export interface TimelineConfig {
  startDate: Date;
  endDate: Date;
  dayWidth: number;
  rowHeight: number;
  headerHeight: number;
  sidebarWidth: number;
}

/** Larghezza giorno in pixel per livello di zoom */
export function getDayWidth(zoom: ZoomLevel): number {
  switch (zoom) {
    case "hour":
      return 120; // 15px per ora × 8 ore lavorative
    case "day":
      return 40;
    case "week":
      return 16;
    case "month":
      return 5;
  }
}

/** Differenza in giorni tra due date (inclusi entrambi) */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/** Converte una data in posizione X pixel */
export function dateToX(date: Date, config: TimelineConfig): number {
  const days = daysBetween(config.startDate, date);
  return days * config.dayWidth;
}

/** Converte una posizione X pixel in data */
export function xToDate(x: number, config: TimelineConfig): Date {
  const days = Math.round(x / config.dayWidth);
  const result = new Date(config.startDate);
  result.setDate(result.getDate() + days);
  return result;
}

/** Calcola il range della timeline basandosi su task e milestones con padding */
export function calculateTimelineRange(
  tasks: Task[],
  milestones: Milestone[],
  paddingDays = 14
): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let earliest = today;
  let latest = today;

  for (const task of tasks) {
    const start = new Date(task.startDate);
    const end = new Date(task.endDate);
    if (start < earliest) earliest = start;
    if (end > latest) latest = end;
  }

  for (const m of milestones) {
    const d = new Date(m.date);
    if (d < earliest) earliest = d;
    if (d > latest) latest = d;
  }

  const startDate = new Date(earliest);
  startDate.setDate(startDate.getDate() - paddingDays);

  const endDate = new Date(latest);
  endDate.setDate(endDate.getDate() + paddingDays);

  return { startDate, endDate };
}

/** Restituisce array di date visibili in base allo scroll */
export function getVisibleDays(
  scrollLeft: number,
  viewportWidth: number,
  config: TimelineConfig
): Date[] {
  const startDay = Math.floor(scrollLeft / config.dayWidth);
  const endDay = Math.ceil((scrollLeft + viewportWidth) / config.dayWidth);
  const days: Date[] = [];

  for (let i = startDay - 1; i <= endDay + 1; i++) {
    const d = new Date(config.startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  return days;
}

/** Calcola la larghezza totale della timeline in pixel */
export function getTotalWidth(config: TimelineConfig): number {
  return daysBetween(config.startDate, config.endDate) * config.dayWidth;
}

/** Controlla se una data è weekend */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Controlla se una data è oggi */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/** Formatta data come "1 Apr" */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

/** Formatta data come "Aprile 2025" */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

/** Parse stringa data a Date object (normalizzato a mezzanotte) */
export function parseDate(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  return d;
}

// ── Funzioni per scheduling orario intra-giornaliero ──

export const WORKDAY_START = 9;  // 09:00
export const WORKDAY_END = 17;   // 17:00
export const WORKDAY_HOURS = 8;

/** Converte "HH:MM" in frazione della giornata lavorativa [0.0 - 1.0].
 *  "09:00" → 0.0, "13:00" → 0.5, "17:00" → 1.0. null → 0.0 (inizio giornata). */
export function timeToFractionOfDay(time: string | null): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  const hours = (h ?? WORKDAY_START) + (m ?? 0) / 60;
  const clamped = Math.max(WORKDAY_START, Math.min(WORKDAY_END, hours));
  return (clamped - WORKDAY_START) / WORKDAY_HOURS;
}

/** Converte una frazione della giornata [0.0 - 1.0] in "HH:MM", snap a 15 minuti. */
export function fractionToTime(fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const totalMinutes = Math.round((WORKDAY_START * 60 + clamped * WORKDAY_HOURS * 60) / 15) * 15;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Converte data + orario in posizione X pixel (per zoom orario). */
export function dateTimeToX(date: Date, time: string | null, config: TimelineConfig): number {
  return dateToX(date, config) + timeToFractionOfDay(time) * config.dayWidth;
}

/** Converte posizione X pixel in data + orario (per zoom orario), snap a 15 minuti. */
export function xToDateTime(x: number, config: TimelineConfig): { date: Date; time: string } {
  const dayFraction = x / config.dayWidth;
  const dayIndex = Math.floor(dayFraction);
  const timeFraction = dayFraction - dayIndex;

  const date = new Date(config.startDate);
  date.setDate(date.getDate() + dayIndex);

  return { date, time: fractionToTime(timeFraction) };
}
