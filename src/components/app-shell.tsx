import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import type { AppRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";

export interface NavItem {
  to: AppRoute;
  label: string;
}

/** Shared dashboard chrome: brand bar, role nav, theme switch and sign-out. */
export function AppShell({
  nav,
  title,
  subtitle,
  children,
}: {
  nav: NavItem[];
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen aurora">
      <header className="sticky top-0 z-40 border-b border-glass-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="ProctoGuard AI Logo"
              className="size-9 rounded-xl object-cover shadow-sm border border-glass-border"
            />
            <span className="hidden font-display text-sm font-bold sm:block">
              NextGen AI Proctor
            </span>
          </Link>

          <nav className="ml-2 flex flex-1 items-center gap-1 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  pathname === item.to && "bg-secondary text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold leading-tight">{user?.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {user?.role}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => {
                logout();
                navigate({ to: "/login", replace: true });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8 animate-fade-in">
          <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

/** Rounded glassmorphism surface used for every dashboard panel. */
export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("glass rounded-3xl p-6", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && (
          <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </span>
        )}
      </div>
    </GlassCard>
  );
}
