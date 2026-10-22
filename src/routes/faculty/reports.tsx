/**
 * faculty/reports.tsx
 * ---------------------------------------------------------------------------
 * Faculty Examination Reports, Student Academic Marks & Audit Records.
 * Supports:
 *  - Comprehensive Student Exam Marks and Question Answers Scorecard
 *  - One-Click Excel (.xlsx) Marks Export with complete score breakdowns
 *  - Excel Sheet (.xlsx / .csv) Marks & Answers Importer with Live Validation Preview
 *  - Excel Offline Grading Template Generator
 *  - Question-by-Question Student Answers Inspection Modal
 *  - Official ReportLab PDF downloads & forensic CSV log exports
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Upload,
  Sparkles,
  BookOpen,
  Award,
  RefreshCw,
  Layers,
  Maximize2,
  HelpCircle,
  Code2,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, GlassCard } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { RiskBadge } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import { FACULTY_NAV } from "@/lib/nav";
import { apiClient } from "@/lib/api-client";
import { computeRisk, loadDB, updateDB, type ExamSession, type Exam } from "@/lib/proctor-store";
import {
  exportStudentMarksExcel,
  exportSingleSessionExcel,
  downloadMarksImportTemplate,
  parseMarksExcelFile,
  applyImportedMarksToDatabase,
  type ImportValidationSummary,
} from "@/lib/excel-service";
import { downloadSessionPDF, downloadBatchPDF } from "@/lib/report";

export const Route = createFileRoute("/faculty/reports")({
  head: () => ({
    meta: [
      { title: "Student Exam Marks & Integrity Audit Reports — NextGen AI Proctor" },
      {
        name: "description",
        content:
          "Faculty gradebook, student exam marks reports, Excel marks export/import, question answer reviews, and AI integrity forensic records.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["faculty", "admin"]}>
      <FacultyReportsPage />
    </RequireRole>
  ),
});

function FacultyReportsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "passed" | "failed" | "flagged">("all");

  // Excel Import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportValidationSummary | null>(null);
  const [isProcessingImport, setIsProcessingImport] = useState(false);

  // Student Answers Review Modal
  const [inspectedSession, setInspectedSession] = useState<ExamSession | null>(null);

  const syncData = () => {
    const db = loadDB();
    setSessions(db.sessions);
    setExams(db.exams);
  };

  useEffect(() => {
    syncData();
    window.addEventListener("proctor-db-change", syncData);

    // Also attempt remote fetch if available
    apiClient
      .getSessions()
      .then((res) => {
        if (res.sessions && res.sessions.length > 0) {
          setSessions(res.sessions);
        }
      })
      .catch(() => {});

    return () => window.removeEventListener("proctor-db-change", syncData);
  }, []);

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
        "Faculty_Exam_Marks_Report"
      );
      toast.success("Excel (.xlsx) marks report generated and downloaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to export Excel report.");
    }
  };

  // Download Excel Template handler
  const handleDownloadTemplate = () => {
    try {
      const currentExam = exams.find((e) => e.id === examFilter) || exams[0];
      downloadMarksImportTemplate(currentExam);
      toast.success("Standardized Excel marks import template downloaded.");
    } catch (err: any) {
      toast.error("Failed to generate template.");
    }
  };

  // File Upload & Parse handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImport(true);
      const summary = await parseMarksExcelFile(file);
      setImportSummary(summary);
      setIsImportModalOpen(true);
      toast.info(`Parsed ${summary.totalParsed} student mark rows from ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "Error reading Excel file. Please check format.");
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
        `Successfully imported! ${res.updatedCount} existing student marks updated, ${res.createdCount} new session marks created.`
      );
      setIsImportModalOpen(false);
      setImportSummary(null);
      syncData();
    } catch (err: any) {
      toast.error(err.message || "Failed to commit imported marks to database.");
    }
  };

  return (
    <AppShell
      nav={FACULTY_NAV}
      title="Student Exam Marks &amp; Integrity Audit Reports"
      subtitle="View, grade, export, and import student examination marks in Excel with comprehensive question-level reviews"
    >
      {/* ---------------- KPI Summary Cards ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <GlassCard className="p-4 flex items-center justify-between border-glass-border">
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
              Total Candidates
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
              Class Average Marks
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
              Passing Rate
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

      {/* ---------------- Controls & Excel Action Bar ---------------- */}
      <GlassCard className="p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="size-4 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search student name, ID, or exam..."
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
            {/* Hidden file input for Excel upload */}
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
              title="Download empty Excel template with proper column headers"
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
              onClick={() => downloadBatchPDF(filtered.length > 0 ? filtered : sessions)}
              className="text-xs h-9 border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold transition-all"
              title="Download official PDF integrity and marks report for all candidates"
            >
              <FileText className="size-3.5 mr-1.5 text-primary" />
              Batch Report (.pdf)
            </Button>

            <Button
              size="sm"
              onClick={handleExportExcel}
              className="brand-surface text-xs h-9 font-semibold shadow-md"
              title="Export complete students marks, question breakdown, and audit scores in Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet className="size-3.5 mr-1.5" />
              Export All Marks (.xlsx)
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* ---------------- Student Marks & Session Table ---------------- */}
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
                <th className="px-4 py-3">Security Violations</th>
                <th className="px-4 py-3">AI Integrity</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    <p className="font-semibold text-sm">No student exam records match your search.</p>
                    <p className="text-xs mt-1">Try adjusting the exam or status filter above, or import student marks from Excel.</p>
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
                            Exit FS: {fullscreenExits}
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
                          className="h-7 px-2 text-[11px] hover:bg-primary/10 hover:text-primary font-medium"
                          title="Inspect student's question-by-question answer sheet"
                        >
                          <BookOpen className="size-3 mr-1 text-primary" /> Answers
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadSessionPDF(s)}
                          className="h-7 px-2 text-[11px] border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold"
                          title="Download official PDF academic integrity & marks report"
                        >
                          <Download className="size-3 mr-1" /> PDF
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            try {
                              exportSingleSessionExcel(s);
                              toast.success(`Excel report for ${s.studentName} downloaded!`);
                            } catch (err: any) {
                              toast.error(err.message || "Failed to export Excel report.");
                            }
                          }}
                          className="h-7 px-2 text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white font-semibold"
                          title="Download individual student scorecard & answers in Excel (.xlsx)"
                        >
                          <FileSpreadsheet className="size-3 mr-1 text-emerald-400" /> Excel
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate({ to: `/faculty/session/${s.id}` as any })}
                          className="h-7 px-2 text-[11px]"
                          title="View forensic timeline audit"
                        >
                          <Eye className="size-3 mr-1" /> Audit
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
                    Review &amp; Import Student Marks from Excel
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Verify matched student records before saving to the proctoring database.
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
            <div className="flex justify-end pt-3 border-t border-glass-border shrink-0">
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
    </AppShell>
  );
}
