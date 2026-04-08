/* providers.tsx — Provider wrapper con SWR config globale, TooltipProvider e Toaster per notifiche. */
"use client";

import { SWRConfig } from "swr";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const error = new Error("Errore nel caricamento dati");
    throw error;
  }
  return res.json();
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        dedupingInterval: 5000,
      }}
    >
      <TooltipProvider>
        {children}
        <Toaster position="bottom-right" richColors />
      </TooltipProvider>
    </SWRConfig>
  );
}
