/* task-defaults.ts — Tempi medi di default per tipo di task (in giorni). Usati quando non ci sono dati storici. */

export const DEFAULT_DAYS_BY_TYPE: Record<string, number> = {
  frontend: 5,
  backend: 4,
  database: 2,
  api: 3,
  design: 3,
  testing: 2,
  devops: 2,
  documentation: 1,
  bug_fix: 1,
  feature: 5,
  refactoring: 3,
  research: 2,
  meeting: 0.5,
  setup: 1,
  deployment: 1,
  altro: 3,
};

export function getDefaultDays(taskType: string | null | undefined): number {
  if (!taskType) return 3;
  return DEFAULT_DAYS_BY_TYPE[taskType] ?? 3;
}

/**
 * Calcola la data di fine dato un inizio e le ore stimate (8h/giorno lavorativo, salta weekend).
 * Restituisce YYYY-MM-DD.
 */
export function calculateEndFromHours(startDate: string, hours: number): string {
  const workingDays = Math.max(1, Math.ceil(hours / 8));
  const d = new Date(startDate + "T00:00:00Z");
  // Snap a giorno lavorativo
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // Aggiungi workingDays - 1 giorni lavorativi (il primo giorno conta)
  let remaining = workingDays - 1;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) remaining--;
  }
  return d.toISOString().split("T")[0]!;
}
