/* markdown-field.tsx — Campo testo con supporto markdown: edit (textarea) / preview toggle. */
"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Pencil, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface MarkdownFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
  className?: string;
}

export function MarkdownField({
  label,
  value,
  placeholder,
  onSave,
  className,
}: MarkdownFieldProps) {
  const [mode, setMode] = useState<"edit" | "preview">(value ? "preview" : "edit");
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync draft when value changes externally (task switch)
  const lastValueRef = useRef(value);
  if (value !== lastValueRef.current) {
    lastValueRef.current = value;
    setDraft(value);
    setMode(value ? "preview" : "edit");
  }

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed !== value.trim()) {
      onSave(trimmed || "");
    }
  }, [draft, value, onSave]);

  const switchToEdit = useCallback(() => {
    setMode("edit");
    // Focus textarea after render
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const switchToPreview = useCallback(() => {
    handleSave();
    setMode("preview");
  }, [handleSave]);

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Header con label e toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={switchToEdit}
            className={cn(
              "rounded p-1 transition-colors",
              mode === "edit"
                ? "bg-pm-accent/15 text-pm-accent"
                : "text-foreground-muted hover:text-foreground"
            )}
            title="Modifica"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={switchToPreview}
            className={cn(
              "rounded p-1 transition-colors",
              mode === "preview"
                ? "bg-pm-accent/15 text-pm-accent"
                : "text-foreground-muted hover:text-foreground"
            )}
            title="Anteprima"
          >
            <Eye className="h-3 w-3" />
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <>
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSave}
            placeholder={placeholder}
            className="text-xs min-h-20"
          />
          <p className="text-[10px] text-foreground-muted">
            Supporta **grassetto**, *corsivo*, `codice`, # titoli, - liste, [link](url)
          </p>
        </>
      ) : (
        <div
          onClick={switchToEdit}
          className="cursor-text rounded-lg border border-input bg-transparent px-2.5 py-2 min-h-20"
        >
          {draft ? (
            <div className="markdown-preview text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{placeholder}</p>
          )}
        </div>
      )}
    </div>
  );
}
