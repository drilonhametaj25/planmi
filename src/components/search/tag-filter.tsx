/* tag-filter.tsx — Dropdown multi-select per filtrare task per tag. */
"use client";

import { useState, useRef } from "react";
import { Tag, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TagFilterProps {
  availableTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagFilter({
  availableTags,
  selectedTags,
  onTagsChange,
}: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  if (availableTags.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setOpen(!open)}
      >
        <Tag className="h-3 w-3" />
        Tag
        {selectedTags.length > 0 && (
          <span className="ml-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
            {selectedTags.length}
          </span>
        )}
        <ChevronDown className="h-3 w-3" />
      </Button>

      {selectedTags.length > 0 && (
        <button
          type="button"
          onClick={() => onTagsChange([])}
          className="ml-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-50 mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-md">
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted cursor-pointer flex items-center gap-2"
              >
                <span
                  className={`h-3 w-3 rounded-sm border flex items-center justify-center ${
                    selectedTags.includes(tag)
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {selectedTags.includes(tag) && (
                    <svg width="8" height="8" viewBox="0 0 8 8">
                      <path
                        d="M1 4l2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                    </svg>
                  )}
                </span>
                {tag}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
