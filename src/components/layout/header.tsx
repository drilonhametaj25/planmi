/* header.tsx — Header PlanMi. Ricerca globale (Ctrl+K), logout button. */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/search/global-search";

export function Header() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / Cmd+K per aprire la ricerca
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 h-8 px-3 rounded-md border border-border text-muted-foreground text-sm hover:bg-muted transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Cerca...</span>
          <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
            Ctrl+K
          </kbd>
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Esci"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
