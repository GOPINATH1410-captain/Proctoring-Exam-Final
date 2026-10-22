import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { resetDB } from "@/lib/proctor-store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const handleResetAndReload = () => {
    try {
      resetDB();
    } catch {}
    window.location.href = "/student/exam?exam=e1";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg text-center space-y-4">
        <div className="size-12 rounded-2xl bg-destructive/20 border border-destructive/40 flex items-center justify-center text-destructive mx-auto">
          ⚠️
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong on our end. You can enter the exam directly, reset your session, or head back home.
        </p>

        {error?.message && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-mono text-destructive text-left overflow-x-auto">
            {error.message}
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <a
            href="/student/exam?exam=e1"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
          >
            Enter Exam Directly
          </a>
          <button
            onClick={handleResetAndReload}
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Reset Exam State &amp; Launch
          </button>
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NextGen AI Online Exam Proctoring" },
      {
        name: "description",
        content:
          "Real-Time AI Online Exam Proctoring System with YOLOv8, MediaPipe, Context-Aware AI & Explainable AI (XAI)",
      },
      { name: "author", content: "NextGen AI Proctor" },
      { property: "og:title", content: "NextGen AI Online Exam Proctoring" },
      {
        property: "og:description",
        content:
          "Real-Time AI Online Exam Proctoring System with YOLOv8, MediaPipe, Context-Aware AI & Explainable AI (XAI)",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@NextGenProctor" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico?v=2", type: "image/x-icon" },
      { rel: "icon", href: "/favicon.png?v=2", type: "image/png" },
      { rel: "shortcut icon", href: "/favicon.ico?v=2" },
      { rel: "apple-touch-icon", href: "/logo.png?v=2" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
