import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarClock, FileText, Monitor, PlayCircle, ScanFace, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell, GlassCard, StatCard } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { RiskBadge } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { loadDB, type Exam, type ExamSession } from "@/lib/proctor-store";
import { STUDENT_NAV } from "@/lib/nav";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [
      { title: "Student dashboard — NextGen AI Proctor" },
      {
        name: "description",
        content:
          "View upcoming proctored exams, start a session and review past integrity reports.",
      },
      { property: "og:title", content: "Student dashboard — NextGen AI Proctor" },
      {
        property: "og:description",
        content: "Upcoming exams, room scan status and previous proctoring reports.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["student"]}>
      <StudentDashboard />
    </RequireRole>
  ),
});

function StudentDashboard() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);

  useEffect(() => {
    const sync = () => {
      const db = loadDB();
      setExams(db.exams);
      setSessions(db.sessions.filter((s) => s.studentId === user?.id));
    };
    sync();
    window.addEventListener("proctor-db-change", sync);
    return () => window.removeEventListener("proctor-db-change", sync);
  }, [user?.id]);

  const avg = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + s.riskScore, 0) / sessions.length)
    : 0;

  return (
    <AppShell
      nav={STUDENT_NAV}
      title={`Welcome, ${user?.name?.split(" ")[0]}`}
      subtitle="Your exam schedule, environment checks and integrity history."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Upcoming exams"
          value={exams.length}
          icon={<CalendarClock className="size-5" />}
        />
        <StatCard
          label="Completed sessions"
          value={sessions.length}
          icon={<FileText className="size-5" />}
        />
        <StatCard
          label="Average risk"
          value={`${avg}%`}
          icon={<ShieldAlert className="size-5" />}
        />
        <StatCard
          label="Face biometric ID"
          value={user?.faceEnrolled ? "Verified" : user?.photoUrl ? "Photo Registered" : "Pending"}
          hint={user?.photoUrl ? "Biometric baseline active" : "Upload photo before exam"}
          icon={
            user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt="Student"
                className="size-7 rounded-full object-cover ring-2 ring-primary/40 border border-primary/20 shadow-sm"
              />
            ) : (
              <ScanFace className="size-5 text-primary" />
            )
          }
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GlassCard>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Upcoming exams</h2>
              <Sparkles className="size-4 text-primary" />
            </div>
            <div className="mt-5 space-y-3">
              {exams.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-glass-border bg-background/40 p-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{e.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold flex items-center gap-1">
                        <Monitor className="size-3" /> Normal Window Mode
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {e.subject} · {e.durationMin} min · {new Date(e.scheduledAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" className="brand-surface font-semibold shadow-sm">
                      <Link to="/student/exam" search={{ exam: e.id }}>
                        <PlayCircle className="size-4 mr-1.5" /> Attend Exam (Normal Mode)
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-xs">
                      <Link to="/student/precheck" search={{ exam: e.id }}>
                        Pre-Check
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <GlassCard>
          <h2 className="font-display text-xl font-bold">Recent reports</h2>
          <div className="mt-5 space-y-3">
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No completed sessions yet.</p>
            )}
            {sessions.slice(0, 4).map((s) => (
              <Link
                key={s.id}
                to="/student/reports"
                className="block rounded-2xl border border-glass-border bg-background/40 p-4 transition-colors hover:bg-secondary/50"
              >
                <div className="text-sm font-semibold">{s.examTitle}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(s.startedAt).toLocaleDateString()}
                </div>
                <div className="mt-3">
                  <RiskBadge level={s.riskLevel} score={s.riskScore} />
                </div>
              </Link>
            ))}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="mt-8">
        <h2 className="font-display text-xl font-bold">Before you begin</h2>
        <ul className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          {[
            "Sit in a well-lit, quiet, private room",
            "Remove phones, books and printed notes",
            "Keep your full face inside the frame",
            "Do not switch tabs or leave the window",
          ].map((t) => (
            <li key={t} className="rounded-2xl border border-glass-border bg-background/40 p-4">
              {t}
            </li>
          ))}
        </ul>
      </GlassCard>
    </AppShell>
  );
}
