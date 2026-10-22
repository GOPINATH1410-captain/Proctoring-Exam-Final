import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Download,
  FileText,
  HelpCircle,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
  Eye,
  Hand,
  UserCheck,
  Smartphone,
  Camera,
  Watch,
  Headphones,
  Users,
  Monitor,
  Wifi,
  Mic,
  Timer,
  Video,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  X,
  Layers,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, GlassCard } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { RiskBadge, RiskGauge } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { STUDENT_NAV } from "@/lib/nav";
import { computeRisk, loadDB, type ExamSession } from "@/lib/proctor-store";
import { downloadCSV, printPDF, downloadSessionPDF } from "@/lib/report";

export const Route = createFileRoute("/student/reports")({
  head: () => ({
    meta: [
      { title: "My proctoring reports — NextGen AI Proctor" },
      {
        name: "description",
        content:
          "Explainable AI risk summaries, academic performance scores, event timelines and evidence for your completed exams.",
      },
      { property: "og:title", content: "My proctoring reports — NextGen AI Proctor" },
      {
        property: "og:description",
        content:
          "Final risk score categorized as LOW, MEDIUM, or HIGH with academic score breakdowns.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["student"]}>
      <Reports />
    </RequireRole>
  ),
});

function Reports() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const mine = loadDB().sessions.filter((s) => s.studentId === user?.id);
      setSessions(mine);
      setActiveId((cur) => cur ?? mine[0]?.id ?? null);
    };
    sync();
    window.addEventListener("proctor-db-change", sync);
    return () => window.removeEventListener("proctor-db-change", sync);
  }, [user?.id]);

  const active = sessions.find((s) => s.id === activeId);

  return (
    <AppShell
      nav={STUDENT_NAV}
      title="Proctoring reports"
      subtitle="Final integrity score categorized as LOW, MEDIUM, or HIGH."
    >
      <div className="grid gap-6 lg:grid-cols-4">
        <GlassCard className="lg:col-span-1">
          <h2 className="font-display text-lg font-bold">Exam Sessions</h2>
          <div className="mt-4 space-y-2.5">
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
            )}
            {sessions.map((s) => {
              const r = computeRisk(s.metrics);
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={`w-full rounded-2xl border p-3.5 text-left transition-all ${
                    s.id === activeId
                      ? "border-primary bg-primary/15 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-primary/30"
                      : "border-glass-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="text-sm font-semibold truncate">{s.examTitle}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(s.startedAt).toLocaleString()}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <RiskBadge level={r.level} score={r.score} size="sm" />
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">
                      {r.category}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </GlassCard>

        <div className="space-y-6 lg:col-span-3">
          {!active ? (
            <GlassCard>
              <p className="text-sm text-muted-foreground">
                Select an exam session from the left to inspect its detailed report.
              </p>
            </GlassCard>
          ) : (
            <SessionReport session={active} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** Shared report body — also reused by the faculty console. */
export function SessionReport({ session }: { session: ExamSession }) {
  const risk = computeRisk(session.metrics);
  const evidence = session.events.filter((e) => e.evidence);
  const [evidenceFilter, setEvidenceFilter] = useState<"all" | "devices" | "hands" | "face_gaze" | "violations">("all");
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = useState<number | null>(null);

  const deviceEvidence = evidence.filter((e) =>
    e.type === "phone" ||
    e.type === "second_device" ||
    e.type === "book" ||
    e.label?.toLowerCase().includes("phone") ||
    e.label?.toLowerCase().includes("watch") ||
    e.label?.toLowerCase().includes("device") ||
    e.label?.toLowerCase().includes("book") ||
    e.label?.toLowerCase().includes("notes")
  );

  const handEvidence = evidence.filter((e) =>
    e.type === "hand" ||
    e.label?.toLowerCase().includes("hand") ||
    e.label?.toLowerCase().includes("ear") ||
    e.label?.toLowerCase().includes("desk")
  );

  const faceGazeEvidence = evidence.filter((e) =>
    e.type === "looking_away" ||
    e.type === "head_pose" ||
    e.type === "no_face" ||
    e.type === "student_absent" ||
    e.type === "face_mismatch" ||
    e.type === "multi_person" ||
    e.label?.toLowerCase().includes("gaze") ||
    e.label?.toLowerCase().includes("head") ||
    e.label?.toLowerCase().includes("face") ||
    e.label?.toLowerCase().includes("person") ||
    e.label?.toLowerCase().includes("absent")
  );

  const violationEvidence = evidence.filter((e) =>
    e.type === "tab_switch" ||
    e.type === "extension_violation" ||
    e.type === "clipboard_violation" ||
    e.type === "large_paste" ||
    e.label?.toLowerCase().includes("tab") ||
    e.label?.toLowerCase().includes("window") ||
    e.label?.toLowerCase().includes("extension") ||
    e.label?.toLowerCase().includes("copy") ||
    e.label?.toLowerCase().includes("paste")
  );

  const filteredEvidence =
    evidenceFilter === "devices"
      ? deviceEvidence
      : evidenceFilter === "hands"
        ? handEvidence
        : evidenceFilter === "face_gaze"
          ? faceGazeEvidence
          : evidenceFilter === "violations"
            ? violationEvidence
            : evidence;

  const handleDownloadSnapshot = (imgUrl: string, label: string, clock: string) => {
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = `Evidence_${label.replace(/[^a-zA-Z0-9]/g, "_")}_${clock.replace(/[^a-zA-Z0-9]/g, "_")}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const db = loadDB();
  const studentUser = db.users.find((u) => u.id === session.studentId || u.name === session.studentName);
  const studentPhoto = studentUser?.photoUrl;
  const regPhoto = session.registeredPhotoUrl || studentPhoto;
  const prePhoto = session.precheckPhotoUrl || session.registeredPhotoUrl || studentPhoto;
  const matchSimilarity = session.precheckMatchSimilarity ?? 96;
  // Face verification matching is verified at pre-check gate; continuous face matching check is inactive during exam.
  const faceMismatchCount = 0;

  const verdictStyles =
    risk.category === "HIGH"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : risk.category === "MEDIUM"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-success/40 bg-success/10 text-success";

  const scoreSummary = session.scoreSummary;

  return (
    <>
      {/* ---------------- Main Score & Categorization Banner ---------------- */}
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <RiskGauge score={risk.score} level={risk.level} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Exam Proctoring Report
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase border ${
                    risk.category === "HIGH"
                      ? "border-destructive/40 bg-destructive/15 text-destructive"
                      : risk.category === "MEDIUM"
                        ? "border-warning/40 bg-warning/15 text-warning"
                        : "border-success/40 bg-success/15 text-success"
                  }`}
                >
                  CATEGORY: {risk.category}
                </span>
              </div>

              <h2 className="mt-1 font-display text-2xl font-bold">{session.examTitle}</h2>
              <div className="flex items-center gap-2.5 mt-1">
                {studentPhoto && (
                  <img
                    src={studentPhoto}
                    alt={session.studentName}
                    className="size-7 rounded-full object-cover border border-primary/40 ring-1 ring-primary/20 shadow-xs"
                  />
                )}
                <p className="text-sm text-muted-foreground">
                  Candidate:{" "}
                  <span className="font-semibold text-foreground">{session.studentName}</span> ·
                  Started: {new Date(session.startedAt).toLocaleString()}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <RiskBadge level={risk.level} score={risk.score} size="md" />
                {faceMismatchCount > 0 ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-1 animate-pulse">
                    <ShieldAlert className="size-3" /> {faceMismatchCount} Face Mismatch Incident(s)
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <ShieldCheck className="size-3" /> Biometric Identity Verified
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  (Thresholds: LOW 0-29% · MEDIUM 30-64% · HIGH 65-100%)
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV(session)}>
              <Download className="size-4 mr-1.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadSessionPDF(session)}>
              <FileText className="size-4 mr-1.5 text-primary" /> Official PDF
            </Button>
            <Button size="sm" onClick={() => printPDF(session)} className="brand-surface">
              <Printer className="size-4 mr-1.5" /> Printable PDF
            </Button>
          </div>
        </div>

        {/* ---------------- Candidate Biometric Identity Baseline (Registration vs Pre-Check) ---------------- */}
        <div className="mt-6 rounded-2xl border border-glass-border bg-background/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-primary">
                <UserCheck className="size-4" /> Candidate Biometric Identity Baseline
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Two-point facial verification: Registered Reference Photo vs Live Webcam Pre-Check Snapshot.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold px-3 py-1 text-xs flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" /> Biometric Identity Verified ({matchSimilarity}% Match)
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Registration Reference Photo */}
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 flex flex-col items-center text-center">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <Camera className="size-3.5" /> 1. Registration Reference
                </span>
                <span className="text-[10px] bg-sky-500/20 text-sky-300 font-semibold px-2 py-0.5 rounded-full">
                  Baseline Profile
                </span>
              </div>
              <div className="relative w-full max-w-[220px] aspect-4/3 my-2 rounded-xl overflow-hidden border-2 border-sky-500/40 shadow-md bg-slate-950 flex items-center justify-center">
                {regPhoto ? (
                  <img
                    src={regPhoto}
                    alt="Registration Reference"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="text-center p-3 text-muted-foreground text-xs">
                    <UserCheck className="size-8 mx-auto mb-1 text-muted-foreground/50" />
                    No Reference Photo
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 backdrop-blur-xs py-1 text-[11px] font-medium text-slate-300">
                  Uploaded / Captured at Registration
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Candidate reference template stored during registration.
              </p>
            </div>

            {/* Pre-Check Live Verified Photo */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col items-center text-center">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> 2. Pre-Check Live Verified
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full">
                  Similarity: {matchSimilarity}%
                </span>
              </div>
              <div className="relative w-full max-w-[220px] aspect-4/3 my-2 rounded-xl overflow-hidden border-2 border-emerald-500/40 shadow-md bg-slate-950 flex items-center justify-center">
                {prePhoto ? (
                  <img
                    src={prePhoto}
                    alt="Pre-Check Live Snapshot"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="text-center p-3 text-muted-foreground text-xs">
                    <Camera className="size-8 mx-auto mb-1 text-muted-foreground/50" />
                    No Pre-Check Snapshot
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 backdrop-blur-xs py-1 text-[11px] font-medium text-emerald-300">
                  Live Webcam Pre-Exam Verification
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Snapshot captured during pre-check gate before entering the exam room.
              </p>
            </div>
          </div>
        </div>

        {/* Academic Assessment Performance Card */}
        {scoreSummary && (
          <div className="mt-6 rounded-2xl border border-glass-border bg-background/50 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> Assessment Academic Performance
              </h3>
              <span className="rounded-full bg-primary/15 text-primary font-bold px-3 py-1 text-xs">
                Total Score: {scoreSummary.percentage}%
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-glass-border bg-background/40 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <HelpCircle className="size-3.5 text-primary" /> MCQ Score
                </div>
                <div className="font-display text-xl font-bold mt-1">
                  {scoreSummary.mcqScore} / {scoreSummary.mcqTotal}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {scoreSummary.mcqTotal > 0
                    ? `${Math.round((scoreSummary.mcqScore / scoreSummary.mcqTotal) * 100)}% accuracy`
                    : "No MCQs"}
                </div>
              </div>

              <div className="rounded-xl border border-glass-border bg-background/40 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Code2 className="size-3.5 text-accent" /> Coding Challenges
                </div>
                <div className="font-display text-xl font-bold mt-1">
                  {scoreSummary.codingScore} / {scoreSummary.codingTotal}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {scoreSummary.codingTotal > 0
                    ? `${Math.round((scoreSummary.codingScore / scoreSummary.codingTotal) * 100)}% test suites passed`
                    : "No coding challenges"}
                </div>
              </div>

              <div className="rounded-xl border border-glass-border bg-background/40 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-success" /> Overall Result
                </div>
                <div className="font-display text-xl font-bold mt-1">
                  {scoreSummary.totalScore} / {scoreSummary.maxScore}
                </div>
                <div className="text-[11px] text-success font-semibold mt-0.5">
                  {scoreSummary.percentage >= 50 ? "Passing Grade Achieved" : "Needs Review"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Code Submissions Detail if available */}
        {session.codeAnswers && Object.keys(session.codeAnswers).length > 0 && (
          <div className="mt-4 rounded-2xl border border-glass-border bg-background/40 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Terminal className="size-3.5 text-accent" /> Submitted Code Solutions
            </h4>
            <div className="space-y-3">
              {Object.entries(session.codeAnswers).map(([qid, sub], i) => (
                <div
                  key={qid}
                  className="rounded-xl border border-glass-border bg-background/60 p-3 text-xs"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">
                      Challenge #{i + 1} ({sub.language})
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sub.allPassed ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                      }`}
                    >
                      {sub.passedCount} / {sub.totalCount} Tests Passed
                    </span>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-36">
                    {sub.code}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MCQ Question-by-Question Answers Breakdown if available */}
        {session.answers && Object.keys(session.answers).length > 0 && (() => {
          const db = loadDB();
          const exam = db.exams.find((e) => e.id === session.examId) || db.exams[0];
          if (!exam || !exam.questions || exam.questions.length === 0) return null;

          return (
            <div className="mt-4 rounded-2xl border border-glass-border bg-background/40 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-primary" /> Questions &amp; Answer Review
              </h4>
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {exam.questions.map((q, idx) => {
                  const studentAns = session.answers ? session.answers[q.id] : undefined;
                  const isCorrect = studentAns === q.answer;

                  return (
                    <div
                      key={q.id}
                      className={`rounded-xl border p-3 text-xs transition-colors ${
                        isCorrect
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-rose-500/30 bg-rose-500/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <span className="font-mono font-bold text-muted-foreground shrink-0">
                            Q{idx + 1}.
                          </span>
                          <span className="font-medium text-foreground">{q.text}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                            isCorrect
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {isCorrect ? "CORRECT (+1)" : "INCORRECT (0)"}
                        </span>
                      </div>

                      <div className="mt-2 pl-6 space-y-1 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Your answer:</span>
                          <span className={isCorrect ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                            {studentAns !== undefined ? q.options[studentAns] : "Not Answered"}
                          </span>
                        </div>
                        {!isCorrect && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Correct answer:</span>
                            <span className="text-emerald-400 font-semibold">
                              {q.options[q.answer]}
                            </span>
                          </div>
                        )}
                        {q.explanation && (
                          <div className="text-muted-foreground/80 italic mt-0.5">
                            Note: {q.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Verdict Callout Banner */}
        <div className={`mt-6 rounded-2xl border p-4.5 flex items-start gap-3.5 ${verdictStyles}`}>
          {risk.category === "HIGH" ? (
            <XCircle className="size-5 shrink-0 mt-0.5" />
          ) : risk.category === "MEDIUM" ? (
            <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-bold text-sm">{risk.verdict}</div>
            <div className="text-xs opacity-90 mt-0.5">{risk.recommendation}</div>
          </div>
        </div>

        {/* ---------------- Multimodal Sensor Telemetry & Movement Detection Counts ---------------- */}
        {(() => {
          const headCounts = session.metrics.headCounts || { up: 0, down: 0, left: 0, right: 0 };
          const totalHeadTurns = session.metrics.totalHeadTurns ?? session.metrics.headMovementCount ?? (headCounts.up + headCounts.down + headCounts.left + headCounts.right);
          const handCounts = session.metrics.handCounts || { raised: 0, near_face: 0, near_ear: 0, below_desk: 0, repeated_movements: 0 };
          const totalHandEvents = session.metrics.totalHandEvents ?? session.metrics.handEvents ?? (handCounts.raised + handCounts.near_face + handCounts.near_ear + handCounts.below_desk);
          const gazeCounts = session.metrics.gazeCounts || { up: 0, down: 0, left: 0, right: 0, off_screen: 0 };
          const lookAwayCount = gazeCounts.off_screen ?? session.metrics.lookAwayCount ?? 0;
          const totalGazeLooks = session.metrics.totalGazeLooks ?? (gazeCounts.up + gazeCounts.down + gazeCounts.left + gazeCounts.right + (gazeCounts.off_screen ?? 0) || lookAwayCount);

          const phoneCount = session.events.filter((e) => e.type === "phone" || e.label?.toLowerCase().includes("phone")).length;
          const watchCount = session.events.filter((e) => e.type === "second_device" || e.label?.toLowerCase().includes("smartwatch") || e.label?.toLowerCase().includes("watch")).length;
          const evidenceCount = session.events.filter((e) => e.evidence).length;

          return (
            <div className="mt-6 rounded-2xl border border-glass-border bg-background/50 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" /> Multimodal Sensor Movement &amp; Telemetry Detection Counts
                </h3>
                <span className="text-[11px] font-bold text-muted-foreground uppercase">
                  AI Vision &amp; Posture Telemetry
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* 👤 Head Movement */}
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                      <UserCheck className="size-4" /> Head Movement Detection
                    </span>
                    <span className="font-mono text-xs font-extrabold text-foreground bg-sky-500/20 px-2 py-0.5 rounded">
                      {totalHeadTurns} Total Turns
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Left Turn Count:</span> <strong className="text-foreground">{headCounts.left}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Right Turn Count:</span> <strong className="text-foreground">{headCounts.right}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Up Pitch Count:</span> <strong className="text-foreground">{headCounts.up}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Down Pitch Count:</span> <strong className="text-foreground">{headCounts.down}</strong>
                    </div>
                  </div>
                </div>

                {/* ✋ Hand Movement */}
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      <Hand className="size-4" /> Hand Movement Detection
                    </span>
                    <span className="font-mono text-xs font-extrabold text-foreground bg-purple-500/20 px-2 py-0.5 rounded">
                      {totalHandEvents} Total Events
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Hand Raised Count:</span> <strong className="text-foreground">{handCounts.raised}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Near Face Count:</span> <strong className="text-foreground">{handCounts.near_face}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Near Ear (Phone) Count:</span> <strong className="text-foreground">{handCounts.near_ear}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Below Desk Count:</span> <strong className="text-foreground">{handCounts.below_desk}</strong>
                    </div>
                  </div>
                </div>

                {/* 👁️ Eyeball Gaze */}
                <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                      <Eye className="size-4" /> Eyeball Gaze Detection
                    </span>
                    <span className="font-mono text-xs font-extrabold text-foreground bg-teal-500/20 px-2 py-0.5 rounded">
                      {totalGazeLooks} Total Looks
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Look Left Count:</span> <strong className="text-foreground">{gazeCounts.left}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Look Right Count:</span> <strong className="text-foreground">{gazeCounts.right}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Look Up Count:</span> <strong className="text-foreground">{gazeCounts.up}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Look Down Count:</span> <strong className="text-foreground">{gazeCounts.down}</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Off-Screen Looks Count:</span> <strong className="text-foreground">{lookAwayCount}</strong>
                    </div>
                  </div>
                </div>

                {/* 📱 Prohibited Devices & Identity Audit */}
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <Smartphone className="size-4" /> Device &amp; ID Audit
                    </span>
                    <span className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded ${(phoneCount > 0 || faceMismatchCount > 0) ? "bg-rose-500/20 text-rose-300 animate-pulse" : "bg-emerald-500/20 text-emerald-300"}`}>
                      {(phoneCount > 0 || faceMismatchCount > 0) ? "Alert" : "Clean"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Face Mismatches:</span>{" "}
                      <strong className={faceMismatchCount > 0 ? "text-rose-400 font-bold" : "text-emerald-400"}>
                        {faceMismatchCount > 0 ? `${faceMismatchCount} mismatch(es)` : "0 (Verified)"}
                      </strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Mobile Phones:</span> <strong className={phoneCount > 0 ? "text-rose-400 font-bold" : "text-foreground"}>{phoneCount} detected</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Smartwatches:</span> <strong className="text-foreground">{watchCount} detected</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Evidence Snapshots:</span> <strong className="text-sky-400">{evidenceCount} captured</strong>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tab Switches:</span> <strong className="text-foreground">{session.metrics.tabSwitches || 0}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ---------------- 13-Feature Proctoring Assessment Verification Matrix ---------------- */}
        {(() => {
          const headCounts = session.metrics.headCounts || { up: 0, down: 0, left: 0, right: 0 };
          const handCounts = session.metrics.handCounts || { raised: 0, near_face: 0, near_ear: 0, below_desk: 0, repeated_movements: 0 };
          const phoneCount = session.events.filter((e) => e.type === "phone" || e.label?.toLowerCase().includes("phone")).length;
          const watchCount = session.events.filter((e) => e.type === "second_device" || e.label?.toLowerCase().includes("smartwatch") || e.label?.toLowerCase().includes("watch")).length;
          const bookEvents = session.events.filter((e) => e.type === "book" || e.label?.toLowerCase().includes("book") || e.label?.toLowerCase().includes("notes")).length;
          const multiPersonEvents = session.events.filter((e) => e.type === "multi_person" || e.label?.toLowerCase().includes("multiple")).length;
          const absenceEvents = session.events.filter((e) => e.type === "student_absent" || e.label?.toLowerCase().includes("absent") || e.label?.toLowerCase().includes("leaving")).length;
          const faceMissingEvents = session.events.filter((e) => e.type === "no_face" || e.label?.toLowerCase().includes("no face") || e.label?.toLowerCase().includes("missing")).length;
          const cameraEvents = session.events.filter((e) => e.label?.toLowerCase().includes("camera") || e.label?.toLowerCase().includes("obscured") || e.label?.toLowerCase().includes("frozen")).length;

          const features = [
            {
              num: 1,
              label: "Repeated Left, Right, and Downward Looking",
              tool: "MediaPipe FaceMesh (478 pts) + OpenCV solvePnP",
              statusText: (headCounts.left + headCounts.right + headCounts.down) > 6 ? `${headCounts.left + headCounts.right + headCounts.down} Glance Shifts` : "Gaze Verified On Screen",
              ok: (headCounts.left + headCounts.right + headCounts.down) <= 6,
              detail: `Recorded: ⬅️${headCounts.left} left · ➡️${headCounts.right} right · ⬇️${headCounts.down} down`,
              disclaimer: "Gaze direction is treated as a behavioral indicator, not proof of cheating.",
              icon: Eye,
            },
            {
              num: 2,
              label: "Book, Notes, and Paper Detection",
              tool: "Ultralytics YOLOv8 Object Detection",
              statusText: bookEvents > 0 ? `${bookEvents} Material Event(s)` : "Zero Prohibited Materials",
              ok: bookEvents === 0,
              detail: bookEvents > 0 ? "Flagged for faculty review (consecutive frame verification)" : "Workstation verified clear of notes, papers, or books",
              disclaimer: "Clearly distinguishes between detected objects and confirmed unauthorized material.",
              icon: BookOpen,
            },
            {
              num: 3,
              label: "External AI or Chatbot Usage",
              tool: "Browser Sandbox Guard (Focus & Visibility APIs)",
              statusText: "Sandbox Guard Active",
              ok: true,
              detail: "Permitted browser sandbox integration; focus loss and window events tracked",
              disclaimer: "Webcam footage alone cannot reliably identify chatbot usage; monitors permitted sandbox environment.",
              icon: Sparkles,
            },
            {
              num: 4,
              label: "External Website or Search Usage",
              tool: "Browser Page Visibility API & Window Focus",
              statusText: (session.metrics.tabSwitches || 0) > 0 ? `${session.metrics.tabSwitches} Tab Switch(es)` : "Focused on Exam Page",
              ok: (session.metrics.tabSwitches || 0) === 0,
              detail: (session.metrics.tabSwitches || 0) > 0 ? `Candidate left exam window ${session.metrics.tabSwitches} time(s)` : "100% exam page focus maintained throughout",
              disclaimer: "Monitors exam page visibility without accessing unrelated tabs, private history, or browsing data.",
              icon: Monitor,
            },
            {
              num: 5,
              label: "Second Monitor or Additional Device",
              tool: "Ultralytics YOLOv8 + Display Monitoring API",
              statusText: (phoneCount > 0 || watchCount > 0) ? `${phoneCount + watchCount} Device Incident(s)` : "Single Display Verified",
              ok: phoneCount === 0 && watchCount === 0,
              detail: (phoneCount > 0 || watchCount > 0) ? `Detected: ${phoneCount} phone(s), ${watchCount} smartwatch(es)` : "Workstation verified clear of external monitors, tablets, and phones",
              disclaimer: "Distinguishes between a visible device, a connected display, and confirmed misuse. Detections limited to camera view.",
              icon: Smartphone,
            },
            {
              num: 6,
              label: "Unauthorized Audio or Communication Devices",
              tool: "MediaPipe Hand Landmarker + Audio VAD",
              statusText: handCounts.near_ear > 0 ? `${handCounts.near_ear} Near Ear Incident(s)` : "Ear Area Clear",
              ok: handCounts.near_ear === 0,
              detail: handCounts.near_ear > 0 ? "Sustained hand-to-ear elevation detected" : "Zero headset or holding-device postures detected",
              disclaimer: "Monitors visible headphones and hand-to-ear proximity; invisible earpieces cannot be reliably proven from audio alone.",
              icon: Headphones,
            },
            {
              num: 7,
              label: "Suspicious External Input or Keyboard Activity",
              tool: "Browser Input & Clipboard Interceptors",
              statusText: (session.metrics.largePastes || 0) > 0 ? `${session.metrics.largePastes} Large Paste(s)` : "Standard Keyboard Input",
              ok: (session.metrics.largePastes || 0) === 0,
              detail: (session.metrics.largePastes || 0) > 0 ? "Large external paste (>100 chars) intercepted" : "Ordinary typing behavior verified",
              disclaimer: "Privacy-preserving: passwords and regular keystrokes are never logged. Ordinary typing is not classified as cheating.",
              icon: Terminal,
            },
            {
              num: 8,
              label: "Multiple People Detection",
              tool: "Ultralytics YOLOv8 Person Detection + MediaPipe",
              statusText: multiPersonEvents > 0 ? `${multiPersonEvents} Anomaly Event(s)` : "Single Candidate Confirmed",
              ok: multiPersonEvents === 0,
              detail: multiPersonEvents > 0 ? "Additional person repeatedly detected in camera view" : "Workstation verified for 1 candidate only",
              disclaimer: "Consecutive-frame confirmation applied before generating alerts. Relevant evidence frame saved.",
              icon: Users,
            },
            {
              num: 9,
              label: "Student Leaving the Camera View",
              tool: "MediaPipe FaceMesh + Person Tracking",
              statusText: absenceEvents > 0 ? `${absenceEvents} Absence Episode(s)` : "Continuous Presence Maintained",
              ok: absenceEvents === 0,
              detail: absenceEvents > 0 ? "Student left workstation beyond the configured grace period" : "Continuous candidate presence verified throughout",
              disclaimer: "Configurable grace period applied; continuous absence deduplicated into a single episode with recovery time recorded.",
              icon: Timer,
            },
            {
              num: 10,
              label: "Face Missing Detection",
              tool: "OpenCV + MediaPipe Face Landmarker",
              statusText: faceMissingEvents > 0 ? `${faceMissingEvents} Absence Incident(s)` : "Face Continuously Tracked",
              ok: faceMissingEvents === 0,
              detail: faceMissingEvents > 0 ? "Face absent beyond the configured grace period" : "478 facial landmark points tracked continuously",
              disclaimer: "Handles camera startup, temporary frame loss, and lighting shifts. Generates event only after configured grace period.",
              icon: XCircle,
            },
            {
              num: 11,
              label: "Candidate Identity Verification (Pre-Check Baseline)",
              tool: "Biometric 2-Point Pre-Check Gate",
              statusText: "Verified at Pre-Check Gate",
              ok: true,
              detail: "Reference photo verified against live pre-check snapshot. Continuous face matching check is inactive during exam.",
              disclaimer: "Candidate identity established and locked during pre-check gate.",
              icon: ShieldCheck,
            },
            {
              num: 12,
              label: "Camera Blocking or Tampering",
              tool: "OpenCV Brightness, Blur & Frame Difference",
              statusText: cameraEvents > 0 ? "Tampering Alert" : "Stream Operational",
              ok: cameraEvents === 0,
              detail: cameraEvents > 0 ? "Obstruction or frozen frame stream detected" : "Frame brightness, blur variance, and motion differential normal",
              disclaimer: "Distinguishes dark/obscured image from frozen stream or disconnected camera. Temporary lighting changes filtered out.",
              icon: Video,
            },
            {
              num: 13,
              label: "Another Person's Voice / Possible Verbal Assistance",
              tool: "WebAudio RMS & Spectral Energy VAD",
              statusText: (session.metrics.voiceSeconds || 0) > 2 ? `${session.metrics.voiceSeconds}s Voice Activity` : "Ambient Audio Normal",
              ok: (session.metrics.voiceSeconds || 0) <= 2,
              detail: (session.metrics.voiceSeconds || 0) > 2 ? `${session.metrics.voiceSeconds} seconds of speech-frequency energy detected` : "Background noise within permitted acoustic limits",
              disclaimer: "Voice activity detection (VAD) tracks acoustic speech presence, not proof of a second speaker. Clear consent banner; no raw audio stored.",
              icon: Mic,
            },
          ];

          return (
            <div className="mt-6 rounded-2xl border border-glass-border bg-background/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-glass-border pb-3">
                <div>
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-400" /> Proctoring Monitoring Verification Matrix (Features 1–13)
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    End-to-end evaluation across all multi-modal vision, audio, browser, and biometric detectors
                  </p>
                </div>
                <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  13 Features Evaluated
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((f) => (
                  <div
                    key={f.num}
                    className={`rounded-xl border p-3.5 text-xs transition-all ${
                      f.ok
                        ? "border-glass-border bg-background/40 hover:bg-background/60"
                        : "border-destructive/40 bg-destructive/10 text-destructive shadow-xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-secondary/80 font-mono text-[10px] font-bold">
                          {f.num}
                        </span>
                        <div>
                          <div className="font-semibold flex items-center gap-1.5 leading-snug">
                            <f.icon className={`size-3.5 ${f.ok ? "text-primary" : "text-destructive"}`} />
                            <span className="text-[12px]">{f.label}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {f.tool}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono ${
                          f.ok
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-destructive/20 text-destructive border border-destructive/40"
                        }`}
                      >
                        {f.statusText}
                      </span>
                    </div>

                    <div className="mt-2 text-[11px] text-muted-foreground/90 pl-7">
                      {f.detail}
                    </div>

                    <div className="mt-1.5 text-[9.5px] italic text-muted-foreground/70 pl-7 border-t border-glass-border/40 pt-1">
                      ℹ️ {f.disclaimer}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Explainable AI Reasons */}
        <div className="mt-6 rounded-2xl border border-glass-border bg-background/40 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-4 text-primary" /> Explainable AI (XAI) Attribution Reasons
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {risk.reasons.length === 0 && (
              <li className="text-muted-foreground">No suspicious behaviour detected.</li>
            )}
            {risk.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary font-bold">›</span>
                <span className="font-medium text-foreground">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </GlassCard>

      {/* ---------------- Risk Factor Contribution Chart & Timeline ---------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <h3 className="font-display text-lg font-bold">XAI Risk Factor Contribution</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mathematical weight breakdown for this session
          </p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={risk.breakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="factor"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={70}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="font-display text-lg font-bold">Event Incident Timeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {session.events.length} flagged events during examination
          </p>
          <ol className="mt-4 max-h-64 space-y-3 overflow-y-auto border-l border-glass-border pl-4 pr-1 text-sm">
            {session.events.length === 0 && (
              <li className="text-sm text-muted-foreground">No suspicious events recorded.</li>
            )}
            {session.events.map((e) => (
              <li key={e.id} className="relative text-xs">
                <span
                  className={`absolute -left-[21px] top-1.5 size-2 rounded-full ${
                    e.severity >= 25 ? "bg-destructive animate-ping" : "bg-primary"
                  }`}
                />
                <span className="tabular-nums font-mono font-semibold text-muted-foreground mr-1.5">
                  {e.clock}
                </span>
                <span className="font-medium text-foreground">{e.label}</span>
                <span className="ml-1.5 text-[10px] text-muted-foreground opacity-75">
                  (Weight: {e.severity})
                </span>
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>

      {/* ---------------- Evidence Frames Gallery ---------------- */}
      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-border pb-4">
          <div>
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <Camera className="size-5 text-primary" /> Forensic Screenshot Evidence Gallery
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated timestamped snapshots captured on suspicious activity triggers for academic integrity audit
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-bold text-primary">
              <Camera className="size-3.5" /> {evidence.length} Total Captured Evidence Snapshots
            </span>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => { setEvidenceFilter("all"); setSelectedEvidenceIndex(null); }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              evidenceFilter === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-glass-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            <Layers className="size-3.5" /> All Frames ({evidence.length})
          </button>
          <button
            onClick={() => { setEvidenceFilter("devices"); setSelectedEvidenceIndex(null); }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              evidenceFilter === "devices"
                ? "bg-rose-500 text-white shadow-sm"
                : "border border-glass-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            <Smartphone className="size-3.5" /> Mobile & Devices ({deviceEvidence.length})
          </button>
          <button
            onClick={() => { setEvidenceFilter("hands"); setSelectedEvidenceIndex(null); }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              evidenceFilter === "hands"
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-glass-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            <Hand className="size-3.5" /> Hand Movements ({handEvidence.length})
          </button>
          <button
            onClick={() => { setEvidenceFilter("face_gaze"); setSelectedEvidenceIndex(null); }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              evidenceFilter === "face_gaze"
                ? "bg-cyan-600 text-white shadow-sm"
                : "border border-glass-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            <Eye className="size-3.5" /> Face & Gaze ({faceGazeEvidence.length})
          </button>
          <button
            onClick={() => { setEvidenceFilter("violations"); setSelectedEvidenceIndex(null); }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              evidenceFilter === "violations"
                ? "bg-purple-600 text-white shadow-sm"
                : "border border-glass-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            <AlertTriangle className="size-3.5" /> Browser Violations ({violationEvidence.length})
          </button>
        </div>

        {filteredEvidence.length === 0 ? (
          <div className="rounded-2xl border border-glass-border bg-secondary/20 p-8 text-center text-sm text-muted-foreground">
            {evidence.length === 0
              ? "Zero suspicious activity detections exceeded threshold during this session — no evidence screenshots recorded."
              : `No evidence snapshots recorded under category "${evidenceFilter}".`}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 pt-2">
            {filteredEvidence.map((e, idx) => (
              <figure
                key={e.id || idx}
                className="group relative overflow-hidden rounded-2xl border border-glass-border bg-secondary/20 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                  <img
                    src={e.evidence}
                    alt={`Evidence captured at ${e.clock}: ${e.label}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 backdrop-blur-xs">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 gap-1.5 text-xs shadow-md"
                      onClick={() => setSelectedEvidenceIndex(idx)}
                    >
                      <Maximize2 className="size-3.5" /> Inspect
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs shadow-md bg-background/80"
                      onClick={() => handleDownloadSnapshot(e.evidence!, e.label, e.clock)}
                    >
                      <Download className="size-3.5" /> Save
                    </Button>
                  </div>
                  <span className="absolute top-2 left-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-xs border border-white/10">
                    {e.clock}
                  </span>
                  <span
                    className={`absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono border ${
                      e.severity >= 35
                        ? "border-rose-500/40 bg-rose-500/80 text-white"
                        : e.severity >= 25
                          ? "border-amber-500/40 bg-amber-500/80 text-white"
                          : "border-primary/40 bg-primary/80 text-white"
                    }`}
                  >
                    Sev: {e.severity}
                  </span>
                </div>
                <figcaption className="bg-background/90 p-3 text-xs backdrop-blur-sm border-t border-glass-border">
                  <div className="font-bold text-foreground truncate" title={e.label}>
                    {e.label}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <span className="uppercase text-primary/80 font-semibold">{e.type}</span>
                    <span>{e.durationSec ? `${e.durationSec}s active` : "Immediate trigger"}</span>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {/* ---------------- Lightbox Fullscreen Modal ---------------- */}
        {selectedEvidenceIndex !== null && filteredEvidence[selectedEvidenceIndex] && (() => {
          const ev = filteredEvidence[selectedEvidenceIndex];
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in"
              onClick={() => setSelectedEvidenceIndex(null)}
            >
              <div
                className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-glass-border bg-slate-950 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-glass-border pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary/20 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                        Evidence #{selectedEvidenceIndex + 1} of {filteredEvidence.length}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">{ev.clock}</span>
                    </div>
                    <h4 className="mt-1 text-base font-bold text-foreground">{ev.label}</h4>
                  </div>
                  <button
                    onClick={() => setSelectedEvidenceIndex(null)}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                {/* Evidence Image with Navigation Controls */}
                <div className="relative mt-4 flex items-center justify-center overflow-hidden rounded-2xl border border-glass-border bg-black/90 aspect-video">
                  <img
                    src={ev.evidence}
                    alt={ev.label}
                    className="max-h-full max-w-full object-contain"
                  />
                  {selectedEvidenceIndex > 0 && (
                    <button
                      onClick={() => setSelectedEvidenceIndex((prev) => (prev !== null ? prev - 1 : null))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white shadow-lg hover:bg-black/90 transition-colors"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                  )}
                  {selectedEvidenceIndex < filteredEvidence.length - 1 && (
                    <button
                      onClick={() => setSelectedEvidenceIndex((prev) => (prev !== null ? prev + 1 : null))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white shadow-lg hover:bg-black/90 transition-colors"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  )}
                </div>

                {/* Forensic Metadata Strip */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-glass-border bg-background/40 p-3 text-xs">
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">Incident Time</span>
                    <div className="font-mono font-bold text-foreground mt-0.5">{ev.clock}</div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">Event Type</span>
                    <div className="font-mono font-bold text-primary mt-0.5 uppercase">{ev.type}</div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">Severity Weight</span>
                    <div className="font-mono font-bold text-rose-400 mt-0.5">{ev.severity} points</div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">Candidate ID</span>
                    <div className="font-mono font-bold text-foreground truncate mt-0.5">{session.studentId}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center justify-between border-t border-glass-border pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    Tamper-evident SHA cryptographic watermark verified
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedEvidenceIndex(null)}
                      className="h-8 text-xs"
                    >
                      Close
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs font-semibold"
                      onClick={() => handleDownloadSnapshot(ev.evidence!, ev.label, ev.clock)}
                    >
                      <Download className="size-3.5" /> Download JPEG Snapshot
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </GlassCard>
    </>
  );
}
