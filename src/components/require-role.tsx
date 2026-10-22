import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/proctor-store";

/**
 * RequireRole — client-side role gate.
 * The FastAPI reference enforces the same matrix server-side through
 * JWT claims + a `require_roles` dependency (backend/app/core/security.py).
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login", replace: true });
    else if (!roles.includes(user.role)) navigate({ to: "/", replace: true });
  }, [ready, user, roles, navigate]);

  if (!ready || !user || !roles.includes(user.role)) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
