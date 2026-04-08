/* gantt-header.tsx — Header timeline del Gantt SVG. Mostra mesi e giorni/settimane, evidenzia weekend e oggi. */
"use client";

import { memo, useMemo } from "react";
import type { TimelineConfig } from "@/lib/gantt/timeline";
import type { ZoomLevel } from "@/lib/types";
import {
  daysBetween,
  isWeekend,
  isToday,
  formatMonthYear,
} from "@/lib/gantt/timeline";

interface GanttHeaderProps {
  config: TimelineConfig;
  totalWidth: number;
  zoom?: ZoomLevel;
  timeOffMap?: Map<string, { type: string; isFullDay: boolean; hours: number }>;
}

interface MonthBlock {
  label: string;
  x: number;
  width: number;
}

function GanttHeaderInner({ config, totalWidth, zoom, timeOffMap }: GanttHeaderProps) {
  const isHourZoom = zoom === "hour";
  const totalDays = daysBetween(config.startDate, config.endDate);
  const monthRowHeight = 24;
  const dayRowHeight = config.headerHeight - monthRowHeight;

  const { months, days } = useMemo(() => {
    const monthsArr: MonthBlock[] = [];
    const daysArr: {
      date: Date;
      x: number;
      label: string;
      isWeekend: boolean;
      isToday: boolean;
      timeOff?: { type: string; isFullDay: boolean; hours: number };
    }[] = [];

    let currentMonth = -1;
    let monthStart = 0;

    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      const x = i * config.dayWidth;

      // Giorni
      if (config.dayWidth >= 16) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        daysArr.push({
          date: d,
          x,
          label: String(d.getDate()),
          isWeekend: isWeekend(d),
          isToday: isToday(d),
          timeOff: timeOffMap?.get(dateStr),
        });
      }

      // Mesi
      const month = d.getMonth() + d.getFullYear() * 12;
      if (month !== currentMonth) {
        if (currentMonth !== -1) {
          const last = monthsArr[monthsArr.length - 1];
          if (last) last.width = x - monthStart;
        }
        monthsArr.push({
          label: formatMonthYear(d),
          x,
          width: 0,
        });
        monthStart = x;
        currentMonth = month;
      }
    }

    // Chiudi ultimo mese
    const last = monthsArr[monthsArr.length - 1];
    if (last) last.width = totalWidth - last.x;

    return { months: monthsArr, days: daysArr };
  }, [config.startDate, config.dayWidth, totalDays, totalWidth, timeOffMap]);

  return (
    <g>
      {/* Sfondo header */}
      <rect
        x={0}
        y={0}
        width={totalWidth}
        height={config.headerHeight}
        fill="var(--background)"
      />

      {/* Riga mesi */}
      {months.map((m, i) => (
        <g key={i}>
          <rect
            x={m.x}
            y={0}
            width={m.width}
            height={monthRowHeight}
            fill="var(--background)"
            stroke="var(--gantt-grid)"
            strokeWidth={0.5}
          />
          <text
            x={m.x + 8}
            y={monthRowHeight / 2}
            dominantBaseline="central"
            className="text-[11px] fill-foreground-muted capitalize"
          >
            {m.label}
          </text>
        </g>
      ))}

      {/* Riga giorni (+ tick ore se zoom orario) */}
      {days.map((day, i) => {
        // Ferie hanno priorità sul weekend nella colorazione
        const hasTimeOff = !!day.timeOff;
        const bgFill = day.isToday
          ? "var(--gantt-today)"
          : hasTimeOff
            ? "var(--gantt-time-off)"
            : day.isWeekend
              ? "var(--gantt-weekend)"
              : "var(--background)";
        const bgOpacity = day.isToday ? 0.15 : hasTimeOff && !day.timeOff!.isFullDay ? day.timeOff!.hours / 8 : 1;
        const textClass = day.isToday
          ? "fill-[var(--gantt-today)]"
          : hasTimeOff
            ? "fill-warning"
            : "fill-foreground-muted";

        return (
          <g key={i}>
            <rect
              x={day.x}
              y={monthRowHeight}
              width={config.dayWidth}
              height={dayRowHeight}
              fill={bgFill}
              opacity={bgOpacity}
              stroke="var(--gantt-grid)"
              strokeWidth={0.5}
            />
            {isHourZoom ? (
              /* Zoom orario: mostra giorno + numero, e tick ore */
              <>
                <text
                  x={day.x + 4}
                  y={monthRowHeight + dayRowHeight / 2}
                  dominantBaseline="central"
                  className={`text-[9px] font-medium ${textClass}`}
                >
                  {day.date.toLocaleDateString("it-IT", { weekday: "short" })} {day.label}
                </text>
                {/* Tick ore lavorative 9-17 */}
                {!day.isWeekend && Array.from({ length: 8 }, (_, h) => {
                  const hourX = day.x + (h / 8) * config.dayWidth;
                  const hour = 9 + h;
                  return (
                    <g key={h}>
                      {h > 0 && (
                        <line
                          x1={hourX}
                          y1={monthRowHeight + dayRowHeight - 6}
                          x2={hourX}
                          y2={monthRowHeight + dayRowHeight}
                          stroke="var(--gantt-grid)"
                          strokeWidth={0.5}
                        />
                      )}
                      {h % 2 === 0 && (
                        <text
                          x={hourX + 2}
                          y={monthRowHeight + dayRowHeight - 2}
                          className="text-[7px] fill-foreground-muted"
                        >
                          {hour}
                        </text>
                      )}
                    </g>
                  );
                })}
              </>
            ) : (
              config.dayWidth >= 24 && (
                <text
                  x={day.x + config.dayWidth / 2}
                  y={monthRowHeight + dayRowHeight / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`text-[10px] ${textClass}`}
                >
                  {day.label}
                </text>
              )
            )}
          </g>
        );
      })}

      {/* Linea separatore sotto header */}
      <line
        x1={0}
        y1={config.headerHeight}
        x2={totalWidth}
        y2={config.headerHeight}
        stroke="var(--border)"
        strokeWidth={1}
      />
    </g>
  );
}

export const GanttHeader = memo(GanttHeaderInner);
