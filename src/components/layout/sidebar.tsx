/* sidebar.tsx — Sidebar navigazione PlanMi. Logo, link Dashboard/Projects, lista progetti con colore. */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  LayoutDashboard,
  FolderKanban,
  Plus,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TimeOffManager } from "@/components/time-off/time-off-manager";
import type { Project } from "@/db/schema";

interface ProjectsResponse {
  data: Project[];
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Progetti", icon: FolderKanban },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data } = useSWR<ProjectsResponse>("/api/projects");
  const projects = data?.data ?? [];

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            Plan<span className="text-primary">Mi</span>
          </span>
        </Link>
      </div>

      {/* Nav principale */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {/* Ferie / Permessi */}
        <TimeOffManager />

        {/* Sezione progetti */}
        <div className="pt-4">
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Progetti
            </span>
            <Link href="/projects?new=true">
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <Plus className="h-3 w-3" />
              </Button>
            </Link>
          </div>

          <div className="space-y-0.5">
            {projects
              .filter((p) => p.status === "active")
              .map((project) => {
                const isActive = pathname === `/projects/${project.id}`;
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: project.color ?? "#3B82F6" }}
                    />
                    <span className="truncate">{project.name}</span>
                    <ChevronRight className="ml-auto h-3 w-3 opacity-0 group-hover:opacity-100" />
                  </Link>
                );
              })}
          </div>
        </div>
      </nav>
    </aside>
  );
}
