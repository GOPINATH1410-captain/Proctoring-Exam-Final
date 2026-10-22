import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { homeFor } from "@/lib/routes";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — NextGen AI Proctor" },
      {
        name: "description",
        content: "Secure JWT sign-in for students, faculty and administrators.",
      },
      { property: "og:title", content: "Sign in — NextGen AI Proctor" },
      {
        property: "og:description",
        content: "Secure role-based sign-in to the AI exam proctoring platform.",
      },
    ],
  }),
  component: LoginPage,
});

const DEMO = [
  { role: "Student", email: "student@demo.com", password: "student123" },
  { role: "Faculty", email: "faculty@demo.com", password: "faculty123" },
  { role: "Admin", email: "admin@demo.com", password: "admin123" },
];

function LoginPage() {
  const { login, user, ready } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (ready && user) navigate({ to: homeFor(user.role), replace: true });
  }, [ready, user, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = login(email, password);
    if (!res.ok || !res.user) {
      toast.error(res.error ?? "Login failed");
      return;
    }
    toast.success(`Welcome back, ${res.user.name}`);
    navigate({ to: homeFor(res.user.role), replace: true });
  };

  return (
    <div className="grid min-h-screen aurora place-items-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <GlassCard className="w-full max-w-md animate-scale-in">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl brand-surface">
            <ShieldCheck className="size-5" />
          </span>
          <span className="font-display text-sm font-bold">NextGen AI Proctor</span>
        </Link>
        <h1 className="font-display text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Role-based access for students, faculty and admins.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>

        <div className="mt-6 rounded-2xl border border-glass-border bg-secondary/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Demo accounts
          </div>
          <div className="mt-2 space-y-1.5">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-secondary"
              >
                <span className="font-medium">{d.role}</span>
                <span className="text-muted-foreground">{d.email}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Register
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
