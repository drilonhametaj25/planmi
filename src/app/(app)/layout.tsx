/* layout.tsx — Layout per route autenticate. Wrappa con AppShell e Providers. */
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
