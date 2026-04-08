/* task-links.ts — Utility per collegamenti cross-parent tra task. */

export type LinkType = "continues_in" | "continued_from" | "related_to";

/** Ritorna il tipo inverso di un link (per creare il link bidirezionale). */
export function getInverseType(type: LinkType): LinkType {
  switch (type) {
    case "continues_in":
      return "continued_from";
    case "continued_from":
      return "continues_in";
    case "related_to":
      return "related_to";
  }
}

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  continues_in: "Continua in",
  continued_from: "Continuato da",
  related_to: "Correlato",
};

export const LINK_TYPE_COLORS: Record<LinkType, string> = {
  continues_in: "text-blue-400 bg-blue-400/10",
  continued_from: "text-cyan-400 bg-cyan-400/10",
  related_to: "text-purple-400 bg-purple-400/10",
};
