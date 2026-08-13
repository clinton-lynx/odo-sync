"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { Pill } from "@/components/StatusBadge";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/activity", label: "Activity" },
  { href: "/intake", label: "Intake" },
  { href: "/close-out", label: "Close-out" },
  { href: "/settings", label: "Settings" },
] as const;

function useActive() {
  const pathname = usePathname() || "/";
  return (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function HealthDot() {
  const { data, error, reload } = useAsync(() => api.health(), []);

  // Keep the dot genuinely live without hammering the backend.
  useEffect(() => {
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  const online = !error && !!data?.ok && data?.db === "up";
  const tone = error ? "warn" : !data ? "muted" : online ? "good" : "warn";
  // Prefix the subject so the dot unambiguously reports the backend (API + DB) —
  // NOT CALL-E, whose mode is the separate LIVE / DRY-RUN pill rendered below.
  const label = error
    ? "Backend: Offline"
    : !data
      ? "Backend: Checking…"
      : online
        ? "Backend: Online"
        : "Backend: Degraded";

  const dotClass =
    tone === "good"
      ? "bg-good shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-good)_22%,transparent)]"
      : tone === "warn"
        ? "bg-warn"
        : "bg-muted animate-pulse";

  return (
    <div className="flex items-center gap-2" title={data?.time ?? label}>
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      <span className="hidden text-xs text-muted sm:inline">{label}</span>
      {data?.calle && (
        <Pill tone={data.calle === "live" ? "warn" : "muted"}>
          {data.calle === "live" ? "LIVE" : "DRY-RUN"}
        </Pill>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const isActive = useActive();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-base/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5">
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold tracking-tight text-ink"
          >
            OdoSync
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-ink/[0.06] text-ink"
                      : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <HealthDot />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
