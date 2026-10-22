import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — NextGen AI Proctor" },
      {
        name: "description",
        content: "Request a secure password reset link for your proctoring account.",
      },
      { property: "og:title", content: "Reset password — NextGen AI Proctor" },
      { property: "og:description", content: "Request a secure password reset link." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [sent, setSent] = useState(false);

  return (
    <div className="grid min-h-screen aurora place-items-center px-4">
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
        {sent ? (
          <div className="space-y-4 text-center">
            <MailCheck className="mx-auto size-10 text-success" />
            <h1 className="font-display text-2xl font-bold">Check your inbox</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for that address, a reset link is on its way.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold">Forgot password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your institution email and we&apos;ll send a reset link.
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required />
              </div>
              <Button type="submit" className="w-full">
                Send reset link
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </GlassCard>
    </div>
  );
}
