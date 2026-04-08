/* tags.ts — Utility per serializzazione/deserializzazione tag. I tag sono salvati come JSON array in un campo text. */

/** Parsa la stringa JSON dei tag dal DB in un array. Ritorna [] se null/invalido. */
export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Serializza un array di tag in stringa JSON per il DB. Ritorna null se vuoto. */
export function serializeTags(tags: string[] | null | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  return JSON.stringify(normalizeTags(tags));
}

/** Normalizza tag: lowercase, trim, dedup, rimuove vuoti. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}
