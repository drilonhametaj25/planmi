/* suggestions-panel.tsx — Pannello suggerimenti collassabile. Mostra alert raggruppati per severity. */
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Suggestion, SuggestionSeverity } from "@/lib/suggestions-engine";
import { Badge } from "@/components/ui/badge";

interface SuggestionsPanelProps {
  suggestions: Suggestion[];
}

const SEVERITY_CONFIG: Record<
  SuggestionSeverity,
  { icon: typeof AlertTriangle; color: string; label: string; badgeVariant: "destructive" | "default" | "secondary" }
> = {
  critical: {
    icon: AlertTriangle,
    color: "text-critical",
    label: "Critici",
    badgeVariant: "destructive",
  },
  warning: {
    icon: AlertCircle,
    color: "text-warning",
    label: "Attenzione",
    badgeVariant: "default",
  },
  info: {
    icon: Info,
    color: "text-info",
    label: "Info",
    badgeVariant: "secondary",
  },
};

export function SuggestionsPanel({ suggestions }: SuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (suggestions.length === 0) return null;

  const critical = suggestions.filter((s) => s.severity === "critical");
  const warning = suggestions.filter((s) => s.severity === "warning");
  const info = suggestions.filter((s) => s.severity === "info");

  return (
    <div className="border border-border rounded-md bg-card overflow-hidden">
      <button
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium hover:bg-background-elevated transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Suggerimenti
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {suggestions.length}
          </Badge>
        </span>
        <span className="flex items-center gap-1.5">
          {critical.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {critical.length}
            </Badge>
          )}
          {warning.length > 0 && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              {warning.length}
            </Badge>
          )}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border divide-y divide-border-subtle">
          {suggestions.map((sug) => {
            const config = SEVERITY_CONFIG[sug.severity];
            const Icon = config.icon;
            return (
              <div
                key={sug.id}
                className="flex items-start gap-2 px-3 py-2 text-xs"
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", config.color)} />
                <div>
                  <p className="font-medium">{sug.title}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {sug.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
