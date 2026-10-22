import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  ListOrdered,
  Plus,
  Play,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, GlassCard } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { RiskBadge } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_NAV } from "@/lib/nav";
import { apiClient } from "@/lib/api-client";
import { executeCode } from "@/lib/code-runner";
import {
  MAX_CODING_QUESTIONS,
  MAX_MCQ_QUESTIONS,
  PRESET_CODING_BANK,
  PRESET_MCQ_BANK,
  addCodingQuestion,
  addMCQQuestion,
  computeRisk,
  deleteCodingQuestion,
  deleteMCQQuestion,
  loadDB,
  loadPresetCodingQuestions,
  loadPresetMCQs,
  updateDB,
  updateExamMetadata,
  updateExamTiming,
  type CodingQuestion,
  type Exam,
  type ExamSession,
  type Question,
  type User,
} from "@/lib/proctor-store";
import {
  exportStudentMarksExcel,
  exportSingleSessionExcel,
  downloadMarksImportTemplate,
  parseMarksExcelFile,
  applyImportedMarksToDatabase,
  type ImportValidationSummary,
} from "@/lib/excel-service";
import { downloadSessionPDF, downloadBatchPDF } from "@/lib/report";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Portal — Exam & Question Bank Management" },
      {
        name: "description",
        content:
          "Configure exam attendance timing limits, load and manage up to 50 MCQ questions and 10 coding challenges, and monitor integrity analytics.",
      },
      { property: "og:title", content: "Admin Portal — Exam & Question Bank Management" },
      {
        property: "og:description",
        content:
          "Manage up to 50 MCQs, 10 Coding questions, and exam timing limits with real-time AI proctoring oversight.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["admin"]}>
      <AdminPortal />
    </RequireRole>
  ),
});

type TabType = "overview" | "timing" | "mcq" | "coding" | "users" | "marks";

function AdminPortal() {
  const [activeTab, setActiveTab] = useState<TabType>("timing");
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");

  const sync = useCallback(() => {
    const db = loadDB();
    setUsers(db.users);
    setSessions(db.sessions);
    setExams(db.exams);
    if (!selectedExamId && db.exams.length > 0) {
      setSelectedExamId(db.exams[0]!.id);
    }
  }, [selectedExamId]);

  // Sync with proctor store
  useEffect(() => {
    sync();
    window.addEventListener("proctor-db-change", sync);
    return () => window.removeEventListener("proctor-db-change", sync);
  }, [sync]);

  const currentExam = useMemo(() => {
    return exams.find((e) => e.id === selectedExamId) ?? exams[0];
  }, [exams, selectedExamId]);

  const flaggedCount = sessions.filter((s) => s.riskLevel !== "green").length;
  const totalMCQs = currentExam?.questions?.length ?? 0;
  const totalCoding = currentExam?.codingQuestions?.length ?? 0;

  return (
    <AppShell
      nav={ADMIN_NAV}
      title="Administration & Exam Control"
      subtitle="Configure exam timing limits, question banks (Max 50 MCQs, Max 10 Coding), and candidate proctoring."
    >
      {/* Top Level Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-glass-border pb-4 mb-6">
        <button
          onClick={() => setActiveTab("timing")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "timing"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-background/40 hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="size-4" />
          Exam &amp; Timing Limit
        </button>

        <button
          onClick={() => setActiveTab("mcq")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "mcq"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-background/40 hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <HelpCircle className="size-4" />
          MCQ Questions ({totalMCQs}/{MAX_MCQ_QUESTIONS})
        </button>

        <button
          onClick={() => setActiveTab("coding")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "coding"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-background/40 hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Code2 className="size-4" />
          Coding Questions ({totalCoding}/{MAX_CODING_QUESTIONS})
        </button>

        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "overview"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-background/40 hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="size-4" />
          Overview &amp; Stats
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "users"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-background/40 hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="size-4" />
          Users &amp; Sessions
        </button>

        <button
          onClick={() => setActiveTab("marks")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "marks"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-background/40 hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileSpreadsheet className="size-4" />
          Student Marks &amp; Excel
        </button>
      </div>

      {/* Global Exam Selector Pill */}
      {exams.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-glass-border bg-glass/60 p-3.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Active Exam:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {exams.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setSelectedExamId(ex.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    ex.id === currentExam?.id
                      ? "bg-primary/20 text-primary border border-primary/40 shadow-sm"
                      : "bg-secondary/40 text-muted-foreground hover:text-foreground border border-transparent"
                  }`}
                >
                  {ex.title}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" />
              <strong className="text-foreground">{currentExam?.durationMin ?? 0} mins</strong>{" "}
              limit
            </span>
            <span>·</span>
            <span>
              MCQs: <strong className="text-foreground">{totalMCQs}</strong> / {MAX_MCQ_QUESTIONS}
            </span>
            <span>·</span>
            <span>
              Coding: <strong className="text-foreground">{totalCoding}</strong> /{" "}
              {MAX_CODING_QUESTIONS}
            </span>
          </div>
        </div>
      )}

      {/* Tab Panels */}
      {activeTab === "timing" && currentExam && (
        <TimingAndSettingsTab exam={currentExam} exams={exams} onSelectExam={setSelectedExamId} />
      )}

      {activeTab === "mcq" && currentExam && <MCQManagerTab exam={currentExam} />}

      {activeTab === "coding" && currentExam && <CodingManagerTab exam={currentExam} />}

      {activeTab === "overview" && (
        <OverviewTab
          usersCount={users.length}
          examsCount={exams.length}
          sessionsCount={sessions.length}
          flaggedCount={flaggedCount}
          currentExam={currentExam}
        />
      )}

      {activeTab === "users" && <UsersAndSessionsTab users={users} sessions={sessions} />}

      {activeTab === "marks" && (
        <AdminMarksAndExcelTab
          sessions={sessions}
          exams={exams}
          currentExam={currentExam}
          onRefresh={sync}
        />
      )}
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 1: Exam & Timing Limit Configuration                                   */
/* -------------------------------------------------------------------------- */

function TimingAndSettingsTab({
  exam,
  exams,
  onSelectExam,
}: {
  exam: Exam;
  exams: Exam[];
  onSelectExam: (id: string) => void;
}) {
  const [durationInput, setDurationInput] = useState(exam.durationMin);
  const [titleInput, setTitleInput] = useState(exam.title);
  const [subjectInput, setSubjectInput] = useState(exam.subject);
  const [instructionsInput, setInstructionsInput] = useState(exam.instructions ?? "");

  useEffect(() => {
    setDurationInput(exam.durationMin);
    setTitleInput(exam.title);
    setSubjectInput(exam.subject);
    setInstructionsInput(exam.instructions ?? "");
  }, [exam]);

  const presetTimes = [15, 30, 45, 60, 90, 120, 180];

  const handleSaveTiming = (minutes: number) => {
    const ok = updateExamTiming(exam.id, minutes);
    if (ok) {
      setDurationInput(minutes);
      toast.success(`Exam time limit updated to ${minutes} minutes!`);
    } else {
      toast.error("Please enter a valid duration between 1 and 360 minutes.");
    }
  };

  const handleSaveAllMetadata = () => {
    const ok = updateExamMetadata(exam.id, {
      title: titleInput,
      subject: subjectInput,
      durationMin: Number(durationInput),
      instructions: instructionsInput,
    });
    if (ok) {
      toast.success("Exam details and timing successfully saved!");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left Column: Timing Limit Controls */}
      <GlassCard className="lg:col-span-2 p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
            <Clock className="size-4" /> Exam Attendance Timing Limit
          </div>
          <h2 className="font-display text-2xl font-bold mt-1">Set Exam Timing &amp; Duration</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure the countdown timer limit for students attending this assessment. The timer
            will automatically enforce this duration and auto-submit the exam upon expiry.
          </p>
        </div>

        {/* Current Active Timing Display */}
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground font-display font-bold text-lg">
              {exam.durationMin}m
            </div>
            <div>
              <div className="font-semibold text-foreground">Current Set Time Limit</div>
              <div className="text-xs text-muted-foreground">
                {Math.floor(exam.durationMin / 60) > 0
                  ? `${Math.floor(exam.durationMin / 60)} hr ${exam.durationMin % 60} mins`
                  : `${exam.durationMin} minutes total`}{" "}
                ({exam.durationMin * 60} seconds countdown)
              </div>
            </div>
          </div>
          <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success flex items-center gap-1.5">
            <Check className="size-3.5" /> Synchronized with Student Portal
          </span>
        </div>

        {/* Preset Duration Buttons */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Quick Timing Limit Presets
          </label>
          <div className="flex flex-wrap gap-2">
            {presetTimes.map((mins) => (
              <Button
                key={mins}
                variant={exam.durationMin === mins ? "default" : "outline"}
                size="sm"
                onClick={() => handleSaveTiming(mins)}
                className={exam.durationMin === mins ? "brand-surface" : ""}
              >
                {mins} Minutes
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Duration Input */}
        <div className="pt-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Or Set Custom Duration (Minutes)
          </label>
          <div className="flex gap-2 max-w-sm">
            <Input
              type="number"
              min={1}
              max={360}
              value={durationInput}
              onChange={(e) => setDurationInput(Math.max(1, Number(e.target.value)))}
              className="font-mono text-base"
            />
            <Button
              onClick={() => handleSaveTiming(Number(durationInput))}
              className="brand-surface shrink-0"
            >
              Apply Limit
            </Button>
          </div>
          <span className="text-[11px] text-muted-foreground mt-1.5 block">
            Allowed range: 1 minute to 360 minutes (6 hours).
          </span>
        </div>

        <hr className="border-glass-border" />

        {/* Exam Metadata Form */}
        <div className="space-y-4">
          <h3 className="font-display text-base font-bold">Exam Details &amp; Instructions</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Exam Title
              </label>
              <Input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Subject / Course
              </label>
              <Input value={subjectInput} onChange={(e) => setSubjectInput(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Student Instructions
            </label>
            <Textarea
              rows={3}
              value={instructionsInput}
              onChange={(e) => setInstructionsInput(e.target.value)}
              placeholder="e.g. Ensure you remain centered in front of the camera. Phones and books are prohibited."
            />
          </div>

          <Button onClick={handleSaveAllMetadata} className="brand-surface">
            Save All Changes
          </Button>
        </div>
      </GlassCard>

      {/* Right Column: Exam Status & Capacity Summary */}
      <div className="space-y-6">
        <GlassCard className="p-5">
          <h3 className="font-display text-base font-bold flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Exam Capacity Status
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Strict capacity limits imposed on questions per institutional exam policy.
          </p>

          <div className="mt-5 space-y-4">
            {/* MCQ Progress */}
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span>MCQ Questions</span>
                <span className="font-bold">
                  {exam.questions.length} / {MAX_MCQ_QUESTIONS}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full brand-surface transition-all"
                  style={{ width: `${(exam.questions.length / MAX_MCQ_QUESTIONS) * 100}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                {MAX_MCQ_QUESTIONS - exam.questions.length} slots remaining
              </span>
            </div>

            {/* Coding Progress */}
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span>Coding Questions</span>
                <span className="font-bold">
                  {exam.codingQuestions.length} / {MAX_CODING_QUESTIONS}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{
                    width: `${(exam.codingQuestions.length / MAX_CODING_QUESTIONS) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                {MAX_CODING_QUESTIONS - exam.codingQuestions.length} slots remaining
              </span>
            </div>
          </div>
        </GlassCard>

        {/* Switch or Create Exam */}
        <GlassCard className="p-5">
          <h3 className="font-display text-base font-bold">All Configured Exams</h3>
          <div className="mt-3 space-y-2">
            {exams.map((e) => (
              <div
                key={e.id}
                onClick={() => onSelectExam(e.id)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  e.id === exam.id
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-glass-border hover:bg-secondary/40"
                }`}
              >
                <div className="font-semibold text-sm">{e.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>{e.durationMin}m limit</span>
                  <span>·</span>
                  <span>{e.questions.length} MCQs</span>
                  <span>·</span>
                  <span>{e.codingQuestions.length} Coding</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 2: MCQ Questions Management (Max 50)                                   */
/* -------------------------------------------------------------------------- */

function MCQManagerTab({ exam }: { exam: Exam }) {
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [jsonInput, setJsonInput] = useState("");

  // New Question Form State
  const [newText, setNewText] = useState("");
  const [newOptions, setNewOptions] = useState(["", "", "", ""]);
  const [newAnswer, setNewAnswer] = useState(0);
  const [newExplanation, setNewExplanation] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newPoints, setNewPoints] = useState(2);

  const currentCount = exam.questions.length;
  const isFull = currentCount >= MAX_MCQ_QUESTIONS;
  const remainingSlots = MAX_MCQ_QUESTIONS - currentCount;

  const filtered = useMemo(() => {
    if (!search.trim()) return exam.questions;
    const term = search.toLowerCase();
    return exam.questions.filter(
      (q) => q.text.toLowerCase().includes(term) || q.category?.toLowerCase().includes(term),
    );
  }, [exam.questions, search]);

  const handleQuickLoad = (count: number) => {
    if (isFull) {
      toast.warning(`Maximum limit of ${MAX_MCQ_QUESTIONS} MCQs is already reached!`);
      return;
    }
    const res = loadPresetMCQs(exam.id, count);
    toast.success(
      `Loaded ${res.countLoaded} questions from the curated MCQ bank! Total: ${res.total}`,
    );
  };

  const handleCreateMCQ = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) {
      toast.error("Please enter question text.");
      return;
    }
    if (newOptions.some((o) => !o.trim())) {
      toast.error("Please fill all 4 options.");
      return;
    }

    const res = addMCQQuestion(exam.id, {
      text: newText,
      options: newOptions,
      answer: newAnswer,
      explanation: newExplanation,
      category: newCategory,
      points: newPoints,
    });

    if (res.success) {
      toast.success("MCQ question added successfully!");
      setShowAddModal(false);
      setNewText("");
      setNewOptions(["", "", "", ""]);
      setNewAnswer(0);
      setNewExplanation("");
    } else {
      toast.error(res.error ?? "Failed to add question.");
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this question from the exam?")) {
      deleteMCQQuestion(exam.id, id);
      toast.success("Question deleted.");
    }
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to remove all MCQ questions for this exam?")) {
      updateDB((db) => {
        const ex = db.exams.find((e) => e.id === exam.id);
        if (ex) ex.questions = [];
      });
      toast.success("All MCQ questions cleared.");
    }
  };

  const handleImportJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) throw new Error("JSON must be an array of questions.");

      let loaded = 0;
      updateDB((db) => {
        const ex = db.exams.find((e) => e.id === exam.id);
        if (!ex) return;
        for (const item of parsed) {
          if (ex.questions.length >= MAX_MCQ_QUESTIONS) break;
          if (item.text && Array.isArray(item.options)) {
            ex.questions.push({
              id: item.id || `mcq-${Math.random().toString(36).slice(2, 9)}`,
              text: item.text,
              options: item.options.slice(0, 4),
              answer: Number(item.answer ?? 0),
              explanation: item.explanation || "",
              category: item.category || "General",
              points: item.points || 2,
            });
            loaded++;
          }
        }
      });
      toast.success(`Imported ${loaded} questions successfully!`);
      setShowImportModal(false);
      setJsonInput("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Invalid JSON format: ${msg}`);
    }
  };

  const handleExportJSON = () => {
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exam.questions, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `${exam.title.replace(/\s+/g, "_")}_mcqs.json`);
    dlAnchor.click();
  };

  return (
    <div className="space-y-6">
      {/* Header bar with counter & actions */}
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Assessment Bank
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isFull ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                }`}
              >
                {currentCount} / {MAX_MCQ_QUESTIONS} Questions (Max Limit: 50)
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold mt-1">
              Multiple Choice Questions (MCQ)
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add individual questions, load curated question banks, or import JSON. Capped at
              exactly 50 MCQs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isFull}
              onClick={() => handleQuickLoad(10)}
            >
              <Plus className="size-4 mr-1.5" /> Load 10 MCQs
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isFull}
              onClick={() => handleQuickLoad(50)}
            >
              <Sparkles className="size-4 mr-1.5 text-primary" /> Load Full Bank (50)
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isFull}
              onClick={() => setShowAddModal(true)}
              className="brand-surface"
            >
              <Plus className="size-4 mr-1.5" /> Add New MCQ
            </Button>
          </div>
        </div>

        {/* Visual Capacity Bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1.5">
            <span>Question Bank Capacity</span>
            <span>
              {isFull ? "Maximum 50 Reached" : `${remainingSlots} slots remaining for this exam`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isFull ? "bg-destructive" : "brand-surface"
              }`}
              style={{ width: `${(currentCount / MAX_MCQ_QUESTIONS) * 100}%` }}
            />
          </div>
        </div>

        {/* Secondary controls */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-glass-border">
          <div className="relative flex-1 min-w-56 max-w-sm">
            <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search questions by text or topic…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
              <Upload className="size-3.5 mr-1.5" /> Import JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJSON}
              disabled={currentCount === 0}
            >
              <Download className="size-3.5 mr-1.5" /> Export JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={currentCount === 0}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5 mr-1.5" /> Clear All
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Question Cards List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <GlassCard className="p-8 text-center text-muted-foreground">
            <HelpCircle className="size-8 mx-auto mb-2 opacity-50" />
            <p className="font-semibold">No MCQ questions found.</p>
            <p className="text-xs mt-1">
              Click "Load Full Bank (50)" or "Add New MCQ" to add questions.
            </p>
          </GlassCard>
        ) : (
          filtered.map((q, idx) => (
            <GlassCard key={q.id} className="p-4 hover:border-primary/40 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                    Q{idx + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground leading-snug">{q.text}</h3>
                    {q.category && (
                      <span className="inline-block mt-1 text-[11px] rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground font-medium">
                        {q.category}
                      </span>
                    )}

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt, oIdx) => {
                        const isCorrect = q.answer === oIdx;
                        return (
                          <div
                            key={oIdx}
                            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs border ${
                              isCorrect
                                ? "border-success/40 bg-success/10 font-semibold text-foreground"
                                : "border-glass-border bg-background/40 text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                                isCorrect
                                  ? "bg-success text-success-foreground"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <span className="truncate">{opt}</span>
                            {isCorrect && (
                              <Check className="size-3 text-success ml-auto shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <p className="mt-2.5 text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2">
                        <strong className="text-primary">Explanation:</strong> {q.explanation}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {q.points ?? 2} pts
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(q.id)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* Add MCQ Dialog Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
          <GlassCard className="max-w-xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-glass-border pb-3">
              <h3 className="font-display text-lg font-bold">
                Add MCQ Question ({currentCount + 1}/50)
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                ✕
              </Button>
            </div>

            <form onSubmit={handleCreateMCQ} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Question Prompt</label>
                <Textarea
                  rows={3}
                  required
                  placeholder="Enter the question text here…"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold mb-1">Category / Topic</label>
                  <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Points</label>
                  <Input
                    type="number"
                    min={1}
                    value={newPoints}
                    onChange={(e) => setNewPoints(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold">Options &amp; Correct Answer</label>
                {newOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-answer"
                      checked={newAnswer === i}
                      onChange={() => setNewAnswer(i)}
                      className="size-4 accent-primary"
                    />
                    <span className="font-bold text-muted-foreground w-4">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <Input
                      required
                      placeholder={`Option ${String.fromCharCode(65 + i)} text`}
                      value={opt}
                      onChange={(e) => {
                        const copy = [...newOptions];
                        copy[i] = e.target.value;
                        setNewOptions(copy);
                      }}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-semibold mb-1">Explanation (Optional)</label>
                <Textarea
                  rows={2}
                  placeholder="Explanation shown in answer reviews…"
                  value={newExplanation}
                  onChange={(e) => setNewExplanation(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-glass-border">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="brand-surface">
                  Add Question
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Import JSON Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4">
          <GlassCard className="max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-glass-border pb-3">
              <h3 className="font-display text-lg font-bold">Import Questions via JSON</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowImportModal(false)}>
                ✕
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste an array of objects matching:{" "}
              <code>{`[{"text": "...", "options": ["A","B","C","D"], "answer": 0, "points": 2}]`}</code>
            </p>
            <Textarea
              rows={8}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Paste JSON array here..."
              className="font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleImportJSON} className="brand-surface">
                Import Questions
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 3: Coding Questions Management (Max 10)                                 */
/* -------------------------------------------------------------------------- */

function CodingManagerTab({ exam }: { exam: Exam }) {
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [testTestingState, setTestTestingState] = useState<Record<string, boolean>>({});

  // New Coding Question Form
  const [newTitle, setNewTitle] = useState("");
  const [newDifficulty, setNewDifficulty] = useState<"Easy" | "Medium" | "Hard">("Easy");
  const [newDescription, setNewDescription] = useState("");
  const [newPoints, setNewPoints] = useState(10);
  const [newJsStarter, setNewJsStarter] = useState(
    "function solution(args) {\n  // Write your code here\n  return true;\n}",
  );
  const [newPyStarter, setNewPyStarter] = useState(
    "def solution(args):\n    # Write your code here\n    return True",
  );
  const [testCasesInput, setTestCasesInput] = useState([
    { input: "[1, 2, 3]", expectedOutput: "6", label: "Sample 1", isHidden: false },
    { input: "[4, 5, 6]", expectedOutput: "15", label: "Sample 2", isHidden: false },
  ]);

  const currentCount = exam.codingQuestions.length;
  const isFull = currentCount >= MAX_CODING_QUESTIONS;
  const remainingSlots = MAX_CODING_QUESTIONS - currentCount;

  const handleQuickLoad = (count: number) => {
    if (isFull) {
      toast.warning(
        `Maximum limit of ${MAX_CODING_QUESTIONS} Coding questions is already reached!`,
      );
      return;
    }
    const res = loadPresetCodingQuestions(exam.id, count);
    toast.success(
      `Loaded ${res.countLoaded} challenges from preset coding bank! Total: ${res.total}`,
    );
  };

  const handleCreateCodingQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Please enter a problem title.");
      return;
    }
    if (!newDescription.trim()) {
      toast.error("Please enter problem description.");
      return;
    }

    const res = addCodingQuestion(exam.id, {
      title: newTitle,
      difficulty: newDifficulty,
      description: newDescription,
      points: newPoints,
      language: "javascript",
      starterCode: {
        javascript: newJsStarter,
        python: newPyStarter,
      },
      testCases: testCasesInput,
    });

    if (res.success) {
      toast.success("Coding question added successfully!");
      setShowAddModal(false);
      setNewTitle("");
      setNewDescription("");
    } else {
      toast.error(res.error ?? "Failed to add coding question.");
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this coding question?")) {
      deleteCodingQuestion(exam.id, id);
      toast.success("Coding question removed.");
    }
  };

  const handleRunAdminTest = async (cq: CodingQuestion) => {
    setTestTestingState((prev) => ({ ...prev, [cq.id]: true }));
    try {
      const summary = await executeCode("javascript", cq.starterCode.javascript, cq.testCases);
      if (summary.allPassed) {
        toast.success(`All ${summary.totalCount} test cases passed for "${cq.title}"!`);
      } else {
        toast.warning(
          `Starter code passed ${summary.passedCount}/${summary.totalCount} test cases for "${cq.title}".`,
        );
      }
    } catch {
      toast.error("Error executing test runner.");
    } finally {
      setTestTestingState((prev) => ({ ...prev, [cq.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Coding Lab
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isFull ? "bg-destructive/15 text-destructive" : "bg-accent/15 text-accent"
                }`}
              >
                {currentCount} / {MAX_CODING_QUESTIONS} Challenges (Max Limit: 10)
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold mt-1">
              Programming &amp; Code Questions
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Load and configure real coding challenges with automated unit test verification.
              Maximum 10 questions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isFull}
              onClick={() => handleQuickLoad(5)}
            >
              <Plus className="size-4 mr-1.5" /> Load 5 Challenges
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isFull}
              onClick={() => handleQuickLoad(10)}
            >
              <Sparkles className="size-4 mr-1.5 text-accent" /> Load All 10 Challenges
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isFull}
              onClick={() => setShowAddModal(true)}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Plus className="size-4 mr-1.5" /> Add New Coding Challenge
            </Button>
          </div>
        </div>

        {/* Visual Capacity Bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1.5">
            <span>Coding Challenges Capacity</span>
            <span>
              {isFull ? "Maximum 10 Reached" : `${remainingSlots} slots remaining for this exam`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isFull ? "bg-destructive" : "bg-accent"
              }`}
              style={{ width: `${(currentCount / MAX_CODING_QUESTIONS) * 100}%` }}
            />
          </div>
        </div>
      </GlassCard>

      {/* Coding Challenge Cards */}
      <div className="space-y-4">
        {exam.codingQuestions.length === 0 ? (
          <GlassCard className="p-8 text-center text-muted-foreground">
            <Code2 className="size-8 mx-auto mb-2 opacity-50" />
            <p className="font-semibold">No coding questions added yet.</p>
            <p className="text-xs mt-1">
              Click "Load All 10 Challenges" to load standard programming problems.
            </p>
          </GlassCard>
        ) : (
          exam.codingQuestions.map((cq, idx) => (
            <GlassCard key={cq.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded bg-accent/15 text-accent font-bold text-xs">
                      #{idx + 1}
                    </span>
                    <h3 className="font-display text-base font-bold">{cq.title}</h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        cq.difficulty === "Easy"
                          ? "bg-success/15 text-success"
                          : cq.difficulty === "Medium"
                            ? "bg-warning/15 text-warning"
                            : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {cq.difficulty}
                    </span>
                    <span className="text-xs text-muted-foreground font-semibold">
                      {cq.points} Points
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">
                    {cq.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      Test cases:
                    </span>
                    {cq.testCases.map((tc, tcIdx) => (
                      <span
                        key={tcIdx}
                        className="rounded-md border border-glass-border bg-background/50 px-2 py-0.5 text-[10px] font-mono"
                      >
                        Input: {tc.input} ➔ {tc.expectedOutput}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testTestingState[cq.id]}
                    onClick={() => handleRunAdminTest(cq)}
                  >
                    <Play className="size-3.5 mr-1" />
                    {testTestingState[cq.id] ? "Testing…" : "Verify Starter"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(cq.id)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* Add Coding Question Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
          <GlassCard className="max-w-2xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-glass-border pb-3">
              <h3 className="font-display text-lg font-bold">
                Add Coding Question ({currentCount + 1}/10)
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                ✕
              </Button>
            </div>

            <form onSubmit={handleCreateCodingQuestion} className="space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold mb-1">Problem Title</label>
                  <Input
                    required
                    placeholder="e.g. Reverse Integer"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Difficulty</label>
                  <select
                    value={newDifficulty}
                    onChange={(e) => setNewDifficulty(e.target.value as "Easy" | "Medium" | "Hard")}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Problem Description</label>
                <Textarea
                  rows={4}
                  required
                  placeholder="Explain the problem, inputs, outputs, and constraints..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold mb-1">JavaScript Starter Template</label>
                  <Textarea
                    rows={5}
                    value={newJsStarter}
                    onChange={(e) => setNewJsStarter(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Python Starter Template</label>
                  <Textarea
                    rows={5}
                    value={newPyStarter}
                    onChange={(e) => setNewPyStarter(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Test Cases (Input and Expected Output)
                </label>
                <div className="space-y-2">
                  {testCasesInput.map((tc, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="Input (e.g. [1, 2], 3)"
                        value={tc.input}
                        onChange={(e) => {
                          const copy = [...testCasesInput];
                          copy[i]!.input = e.target.value;
                          setTestCasesInput(copy);
                        }}
                      />
                      <Input
                        placeholder="Expected Output (e.g. 5)"
                        value={tc.expectedOutput}
                        onChange={(e) => {
                          const copy = [...testCasesInput];
                          copy[i]!.expectedOutput = e.target.value;
                          setTestCasesInput(copy);
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setTestCasesInput([
                        ...testCasesInput,
                        {
                          input: "",
                          expectedOutput: "",
                          label: `Test ${testCasesInput.length + 1}`,
                          isHidden: false,
                        },
                      ])
                    }
                  >
                    + Add Test Case
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-glass-border">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="brand-surface">
                  Create Coding Challenge
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 4: Overview & System Analytics                                         */
/* -------------------------------------------------------------------------- */

function OverviewTab({
  usersCount,
  examsCount,
  sessionsCount,
  flaggedCount,
  currentExam,
}: {
  usersCount: number;
  examsCount: number;
  sessionsCount: number;
  flaggedCount: number;
  currentExam?: Exam | undefined;
}) {
  const stats = [
    { label: "Total Users", value: usersCount, hint: "Students & Faculty" },
    { label: "Configured Exams", value: examsCount, hint: "With active proctoring" },
    { label: "Completed Sessions", value: sessionsCount, hint: "Audit log records" },
    { label: "Flagged Sessions", value: flaggedCount, hint: "High / Medium risk" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <GlassCard key={s.label} className="p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{s.label}</div>
            <div className="mt-2 font-display text-3xl font-bold">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
          </GlassCard>
        ))}
      </div>

      {currentExam && (
        <GlassCard className="p-6">
          <h3 className="font-display text-lg font-bold">Active Assessment Configuration</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Overview of current exam parameters
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-xl border border-glass-border bg-background/40">
              <div className="text-xs text-muted-foreground uppercase font-bold">Time Limit</div>
              <div className="text-2xl font-bold font-display mt-1">
                {currentExam.durationMin} Minutes
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Automatic submission when timer hits 0:00
              </div>
            </div>

            <div className="p-4 rounded-xl border border-glass-border bg-background/40">
              <div className="text-xs text-muted-foreground uppercase font-bold">MCQs Loaded</div>
              <div className="text-2xl font-bold font-display mt-1">
                {currentExam.questions.length} / {MAX_MCQ_QUESTIONS}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {MAX_MCQ_QUESTIONS - currentExam.questions.length} free capacity slots
              </div>
            </div>

            <div className="p-4 rounded-xl border border-glass-border bg-background/40">
              <div className="text-xs text-muted-foreground uppercase font-bold">
                Coding Questions
              </div>
              <div className="text-2xl font-bold font-display mt-1">
                {currentExam.codingQuestions.length} / {MAX_CODING_QUESTIONS}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {MAX_CODING_QUESTIONS - currentExam.codingQuestions.length} free capacity slots
              </div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 5: Users & Proctoring Sessions                                         */
/* -------------------------------------------------------------------------- */

function UsersAndSessionsTab({ users, sessions }: { users: User[]; sessions: ExamSession[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold">Registered Users</h2>
          <span className="text-xs text-muted-foreground">{users.length} accounts</span>
        </div>
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-2xl border border-glass-border bg-background/40 p-3 text-sm"
            >
              <span>
                <span className="font-semibold">{u.name}</span>
                <span className="block text-xs text-muted-foreground">{u.email}</span>
              </span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                {u.role}
              </span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold">Recent Proctored Sessions</h2>
          <span className="text-xs text-muted-foreground">{sessions.length} sessions</span>
        </div>
        <ul className="space-y-2">
          {sessions.length === 0 && (
            <li className="text-sm text-muted-foreground">No sessions recorded.</li>
          )}
          {sessions.slice(0, 10).map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-glass-border bg-background/40 p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <span className="font-semibold block truncate">{s.studentName}</span>
                <span className="block text-xs text-muted-foreground truncate">{s.examTitle}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RiskBadge level={s.riskLevel} score={s.riskScore} size="sm" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadSessionPDF(s)}
                  className="h-7 px-2 text-[11px] border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold"
                  title="Download student PDF integrity & marks report"
                >
                  <Download className="size-3 mr-1" /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    try {
                      exportSingleSessionExcel(s);
                      toast.success(`Excel report downloaded for ${s.studentName}!`);
                    } catch (err: any) {
                      toast.error(err.message || "Failed to export Excel report.");
                    }
                  }}
                  className="h-7 px-2 text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white font-semibold"
                  title="Download individual student scorecard & answers in Excel (.xlsx)"
                >
                  <FileSpreadsheet className="size-3 mr-1 text-emerald-400" /> Excel
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 6: Admin Student Marks, Gradebook & Excel Manager                      */
/* -------------------------------------------------------------------------- */

function AdminMarksAndExcelTab({
  sessions,
  exams,
  currentExam,
  onRefresh,
}: {
  sessions: ExamSession[];
  exams: Exam[];
  currentExam?: Exam | undefined;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "passed" | "failed" | "flagged">("all");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportValidationSummary | null>(null);
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [inspectedSession, setInspectedSession] = useState<ExamSession | null>(null);

  // Filtered session records
  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const matchSearch =
        s.studentName.toLowerCase().includes(search.toLowerCase()) ||
        s.studentId.toLowerCase().includes(search.toLowerCase()) ||
        s.examTitle.toLowerCase().includes(search.toLowerCase());

      const matchExam = examFilter === "all" || s.examId === examFilter;

      const percentage = s.scoreSummary?.percentage ?? 0;
      let matchStatus = true;
      if (statusFilter === "passed") matchStatus = percentage >= 50;
      if (statusFilter === "failed") matchStatus = percentage < 50;
      if (statusFilter === "flagged") matchStatus = s.riskLevel !== "green";

      return matchSearch && matchExam && matchStatus;
    });
  }, [sessions, search, examFilter, statusFilter]);

  // Summary Metrics KPIs
  const kpis = useMemo(() => {
    const total = sessions.length;
    if (total === 0) {
      return { total: 0, avgScore: 0, passRate: 0, highestScore: 0, flaggedCount: 0 };
    }
    const scores = sessions.map((s) => s.scoreSummary?.percentage ?? 0);
    const sumScore = scores.reduce((a, b) => a + b, 0);
    const passedCount = scores.filter((score) => score >= 50).length;
    const flagged = sessions.filter((s) => s.riskLevel !== "green").length;

    return {
      total,
      avgScore: Math.round(sumScore / total),
      passRate: Math.round((passedCount / total) * 100),
      highestScore: Math.max(0, ...scores),
      flaggedCount: flagged,
    };
  }, [sessions]);

  // Export to Excel handler
  const handleExportExcel = () => {
    try {
      exportStudentMarksExcel(
        filtered.length > 0 ? filtered : sessions,
        examFilter !== "all" ? examFilter : undefined,
        "Admin_Student_Exam_Marks"
      );
      toast.success("Excel (.xlsx) student marks report downloaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to export Excel marks report.");
    }
  };

  // Download Excel Template handler
  const handleDownloadTemplate = () => {
    try {
      const targetExam = exams.find((e) => e.id === examFilter) || currentExam || exams[0];
      downloadMarksImportTemplate(targetExam);
      toast.success("Standardized Excel marks import template downloaded.");
    } catch (err: any) {
      toast.error("Failed to generate template.");
    }
  };

  // File Upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImport(true);
      const summary = await parseMarksExcelFile(file);
      setImportSummary(summary);
      setIsImportModalOpen(true);
      toast.info(`Successfully parsed ${summary.totalParsed} records from ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "Error reading Excel file. Please check formatting.");
    } finally {
      setIsProcessingImport(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Apply Imported Marks into Database
  const handleConfirmImport = () => {
    if (!importSummary || importSummary.rows.length === 0) return;

    try {
      const targetExam = examFilter !== "all" ? examFilter : undefined;
      const res = applyImportedMarksToDatabase(importSummary.rows, targetExam);
      toast.success(
        `Marks imported successfully! ${res.updatedCount} records updated, ${res.createdCount} new session marks added.`
      );
      setIsImportModalOpen(false);
      setImportSummary(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to commit imported marks to database.");
    }
  };

  return (
    <div className="space-y-6">
      {/* ---------------- KPI Summary Cards ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <GlassCard className="p-4 flex items-center justify-between border-glass-border">
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
              Total Graded Students
            </div>
            <div className="font-display text-2xl font-bold text-foreground mt-1">
              {kpis.total}
            </div>
          </div>
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <BookOpen className="size-5" />
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center justify-between border-glass-border">
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
              Class Average Score
            </div>
            <div className="font-display text-2xl font-bold text-primary mt-1">
              {kpis.avgScore}%
            </div>
          </div>
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Award className="size-5" />
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center justify-between border-glass-border">
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
              Passing Percentage
            </div>
            <div className="font-display text-2xl font-bold text-emerald-400 mt-1">
              {kpis.passRate}%
            </div>
          </div>
          <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="size-5" />
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center justify-between border-glass-border">
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
              Highest Marks
            </div>
            <div className="font-display text-2xl font-bold text-foreground mt-1">
              {kpis.highestScore}%
            </div>
          </div>
          <div className="size-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
            <Sparkles className="size-5" />
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center justify-between border-glass-border">
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
              Integrity Flags
            </div>
            <div className="font-display text-2xl font-bold text-amber-400 mt-1">
              {kpis.flaggedCount}
            </div>
          </div>
          <div className="size-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <AlertTriangle className="size-5" />
          </div>
        </GlassCard>
      </div>

      {/* ---------------- Action & Filter Bar ---------------- */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="size-4 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search candidate name, ID, or exam..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-64 rounded-xl border border-glass-border bg-slate-900/60 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Exam selector */}
            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="h-9 rounded-xl border border-glass-border bg-slate-900/60 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Exams ({exams.length})</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9 rounded-xl border border-glass-border bg-slate-900/60 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="passed">Passed (&gt;= 50%)</option>
              <option value="failed">Failed (&lt; 50%)</option>
              <option value="flagged">Integrity Flagged</option>
            </select>
          </div>

          {/* Excel Export & Import Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="text-xs h-9 border-glass-border hover:bg-slate-900/80"
              title="Download standardized template spreadsheet with expected column format"
            >
              <FileSpreadsheet className="size-3.5 mr-1.5 text-muted-foreground" />
              Download Template
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingImport}
              className="text-xs h-9 border-accent/40 bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground font-semibold transition-all"
            >
              <Upload className="size-3.5 mr-1.5" />
              {isProcessingImport ? "Parsing..." : "Import Marks (Excel/CSV)"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const targetSessions = filtered.length > 0 ? filtered : sessions;
                if (targetSessions.length === 0) {
                  toast.error("No student sessions available to generate batch PDF report.");
                  return;
                }
                downloadBatchPDF(targetSessions, "Admin Student Examination Marks & Forensic Audit Report");
                toast.success("Batch PDF report prepared for printing/download.");
              }}
              className="text-xs h-9 border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold transition-all"
              title="Generate a multi-student printable / save-as-PDF integrity and marks audit report"
            >
              <Download className="size-3.5 mr-1.5" />
              Batch Report (.pdf)
            </Button>

            <Button
              size="sm"
              onClick={handleExportExcel}
              className="brand-surface text-xs h-9 font-semibold shadow-md"
            >
              <FileSpreadsheet className="size-3.5 mr-1.5" />
              Export All Marks (.xlsx)
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* ---------------- Student Marks Table ---------------- */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-glass-border text-muted-foreground font-mono uppercase text-[10px]">
              <tr>
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Exam Title</th>
                <th className="px-4 py-3">MCQ Marks</th>
                <th className="px-4 py-3">Coding Marks</th>
                <th className="px-4 py-3 font-bold text-foreground">Total Marks (%)</th>
                <th className="px-4 py-3">Result Grade</th>
                <th className="px-4 py-3">Violations</th>
                <th className="px-4 py-3">AI Integrity</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    <p className="font-semibold text-sm">No student exam marks found.</p>
                    <p className="text-xs mt-1">Adjust your filters or import students marks via Excel.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const risk = computeRisk(s.metrics);
                  const score = s.scoreSummary || {
                    mcqScore: 0,
                    mcqTotal: 0,
                    codingScore: 0,
                    codingTotal: 0,
                    totalScore: 0,
                    maxScore: 0,
                    percentage: 0,
                  };
                  const isPassed = score.percentage >= 50;
                  const tabSwitches = s.metrics?.tabSwitches ?? 0;
                  const fullscreenExits =
                    s.metrics?.fullscreenExits ??
                    s.events?.filter(
                      (e) =>
                        (e.type as string) === "fullscreen_exit" ||
                        e.label.toLowerCase().includes("fullscreen")
                    ).length ??
                    0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-muted-foreground">
                        {s.studentId}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        {s.studentName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                        {s.examTitle}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span className="text-foreground font-semibold">{score.mcqScore}</span>
                        <span className="text-muted-foreground"> / {score.mcqTotal}</span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span className="text-foreground font-semibold">{score.codingScore}</span>
                        <span className="text-muted-foreground"> / {score.codingTotal}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-foreground">
                            {score.totalScore}
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            / {score.maxScore}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                              score.percentage >= 75
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : score.percentage >= 50
                                ? "bg-primary/15 text-primary border border-primary/30"
                                : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {score.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono border ${
                            isPassed
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          }`}
                        >
                          {isPassed ? "PASSED" : "FAILED"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5 font-mono text-[10px]">
                          <span
                            className={
                              tabSwitches > 0 ? "text-amber-400 font-semibold" : "text-muted-foreground"
                            }
                          >
                            Tabs: {tabSwitches}
                          </span>
                          <span
                            className={
                              fullscreenExits > 0 ? "text-rose-400 font-semibold" : "text-muted-foreground"
                            }
                          >
                            FS Exits: {fullscreenExits}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge level={risk.level} score={risk.score} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setInspectedSession(s)}
                          className="h-7 px-2.5 text-[11px] hover:bg-primary/10 hover:text-primary font-medium"
                          title="Inspect student's question-by-question answer sheet"
                        >
                          <BookOpen className="size-3 mr-1 text-primary" /> Answers &amp; Marks
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadSessionPDF(s)}
                          className="h-7 px-2 text-[11px] border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold"
                          title="Download official PDF report"
                        >
                          <Download className="size-3 mr-1" /> PDF
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            try {
                              exportSingleSessionExcel(s);
                              toast.success(`Excel report downloaded for ${s.studentName}!`);
                            } catch (err: any) {
                              toast.error(err.message || "Failed to download Excel report.");
                            }
                          }}
                          className="h-7 px-2 text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-600 hover:text-white font-semibold"
                          title="Download 3-sheet Excel report (Overview, Questions, Forensic Log)"
                        >
                          <FileSpreadsheet className="size-3 mr-1 text-emerald-400" /> Excel
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ---------------- EXCEL IMPORT PREVIEW MODAL ---------------- */}
      {isImportModalOpen && importSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in">
          <GlassCard className="max-w-4xl w-full p-6 space-y-5 border-accent/40 bg-slate-950 shadow-[0_0_60px_rgba(168,85,247,0.25)]">
            <div className="flex items-center justify-between border-b border-glass-border pb-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
                  <FileSpreadsheet className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    Admin Excel Grade Sheet Import
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Review and verify marks before writing to the database.
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsImportModalOpen(false)}
                className="size-8 p-0"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Import Stats Badge Bar */}
            <div className="grid gap-3 sm:grid-cols-3 text-xs font-mono">
              <div className="rounded-xl border border-glass-border bg-slate-900/60 p-3">
                <span className="text-muted-foreground">Total Rows Parsed:</span>
                <strong className="text-foreground ml-2 text-sm">{importSummary.totalParsed}</strong>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <span className="text-emerald-400">Existing Records Matched:</span>
                <strong className="text-emerald-400 ml-2 text-sm">{importSummary.matchedCount}</strong>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
                <span className="text-primary">New Student Records:</span>
                <strong className="text-primary ml-2 text-sm">{importSummary.newCount}</strong>
              </div>
            </div>

            {/* Parsed Rows Preview Table */}
            <div className="max-h-80 overflow-y-auto rounded-xl border border-glass-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 border-b border-glass-border text-muted-foreground font-mono uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">Candidate Name</th>
                    <th className="px-3 py-2">MCQ Score</th>
                    <th className="px-3 py-2">Coding Score</th>
                    <th className="px-3 py-2">Total Marks</th>
                    <th className="px-3 py-2">Percentage</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Match Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border bg-slate-950/60">
                  {importSummary.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono font-semibold text-foreground">
                        {row.studentId}
                      </td>
                      <td className="px-3 py-2 font-medium">{row.studentName}</td>
                      <td className="px-3 py-2 font-mono">
                        {row.mcqScore} / {row.mcqTotal}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {row.codingScore} / {row.codingTotal}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-foreground">
                        {row.totalScore} / {row.maxScore}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-primary">
                        {row.percentage}%
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        <span
                          className={`px-2 py-0.5 rounded ${
                            row.status === "PASSED"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {row.matchedExisting ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                            <Check className="size-3" /> Overwrites Existing
                          </span>
                        ) : (
                          <span className="text-primary font-semibold">Creates New Session</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-glass-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmImport}
                className="brand-surface font-semibold shadow-md"
              >
                <Check className="size-4 mr-1.5" />
                Commit &amp; Save {importSummary.rows.length} Records to Database
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ---------------- QUESTION-BY-QUESTION STUDENT ANSWERS INSPECTION MODAL ---------------- */}
      {inspectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in">
          <GlassCard className="max-w-3xl w-full p-6 space-y-5 border-primary/40 bg-slate-950 shadow-[0_0_60px_rgba(6,182,212,0.25)] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-glass-border pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
                  <BookOpen className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    Candidate Answer Sheet &amp; Scoring Rubric
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Candidate: <strong>{inspectedSession.studentName}</strong> ({inspectedSession.studentId}) · {inspectedSession.examTitle}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setInspectedSession(null)}
                className="size-8 p-0"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Score Summary Header */}
            {inspectedSession.scoreSummary && (
              <div className="grid gap-3 sm:grid-cols-3 text-xs shrink-0">
                <div className="rounded-xl border border-glass-border bg-slate-900/60 p-3">
                  <span className="text-muted-foreground">Total Score:</span>
                  <div className="font-display text-lg font-bold text-primary mt-0.5">
                    {inspectedSession.scoreSummary.totalScore} / {inspectedSession.scoreSummary.maxScore} (
                    {inspectedSession.scoreSummary.percentage}%)
                  </div>
                </div>
                <div className="rounded-xl border border-glass-border bg-slate-900/60 p-3">
                  <span className="text-muted-foreground">MCQ Performance:</span>
                  <div className="font-display text-lg font-bold text-foreground mt-0.5">
                    {inspectedSession.scoreSummary.mcqScore} / {inspectedSession.scoreSummary.mcqTotal} Correct
                  </div>
                </div>
                <div className="rounded-xl border border-glass-border bg-slate-900/60 p-3">
                  <span className="text-muted-foreground">Coding Challenges:</span>
                  <div className="font-display text-lg font-bold text-foreground mt-0.5">
                    {inspectedSession.scoreSummary.codingScore} / {inspectedSession.scoreSummary.codingTotal} Pts
                  </div>
                </div>
              </div>
            )}

            {/* Scrollable Questions list */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(() => {
                const exam = exams.find((e) => e.id === inspectedSession.examId) || exams[0];
                if (!exam || !exam.questions || exam.questions.length === 0) {
                  return (
                    <div className="py-8 text-center text-muted-foreground text-xs">
                      No question metadata found for this exam.
                    </div>
                  );
                }

                return exam.questions.map((q, idx) => {
                  const studentAns = inspectedSession.answers ? inspectedSession.answers[q.id] : undefined;
                  const isCorrect = studentAns === q.answer;

                  return (
                    <div
                      key={q.id}
                      className={`rounded-xl border p-3.5 text-xs transition-colors ${
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
                          <span className="font-semibold text-foreground">{q.text}</span>
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

                      <div className="mt-2.5 pl-6 space-y-1.5 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2 rounded-lg bg-slate-900/60 border border-glass-border">
                            <span className="text-muted-foreground block text-[10px] uppercase font-mono">
                              Student Selected Option:
                            </span>
                            <span
                              className={`font-semibold mt-0.5 block ${
                                isCorrect ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {studentAns !== undefined
                                ? `${studentAns + 1}. ${q.options[studentAns]}`
                                : "Not Answered"}
                            </span>
                          </div>

                          <div className="p-2 rounded-lg bg-slate-900/60 border border-glass-border">
                            <span className="text-muted-foreground block text-[10px] uppercase font-mono">
                              Official Correct Key:
                            </span>
                            <span className="text-emerald-400 font-semibold mt-0.5 block">
                              {q.answer + 1}. {q.options[q.answer]}
                            </span>
                          </div>
                        </div>

                        {q.explanation && (
                          <div className="text-[11px] text-muted-foreground italic pt-1">
                            Explanation: {q.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-glass-border shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadSessionPDF(inspectedSession)}
                  className="h-8 px-2.5 text-xs border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold"
                >
                  <Download className="size-3.5 mr-1.5" /> Download PDF Report
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    try {
                      exportSingleSessionExcel(inspectedSession);
                      toast.success(`Excel report downloaded for ${inspectedSession.studentName}!`);
                    } catch (err: any) {
                      toast.error(err.message || "Failed to download Excel report.");
                    }
                  }}
                  className="h-8 px-2.5 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-600 hover:text-white font-semibold"
                >
                  <FileSpreadsheet className="size-3.5 mr-1.5 text-emerald-400" /> Download Excel (.xlsx)
                </Button>
              </div>

              <Button
                size="sm"
                onClick={() => setInspectedSession(null)}
                className="brand-surface text-xs"
              >
                Close Answer Sheet
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
