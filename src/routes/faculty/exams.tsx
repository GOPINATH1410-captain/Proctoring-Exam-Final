/**
 * faculty/exams.tsx
 * ---------------------------------------------------------------------------
 * Faculty Exam Creation and Question Bank Management.
 * Supports:
 *  - Creating online examinations
 *  - Adding MCQ questions
 *  - Adding Programming / Coding challenges (with multi-language test cases)
 *  - Setting attendance duration limits and prohibited object lists
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Code2,
  FileCode,
  HelpCircle,
  Layers,
  Plus,
  Trash2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, GlassCard } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FACULTY_NAV } from "@/lib/nav";
import { apiClient } from "@/lib/api-client";
import { loadDB, updateDB, uid, type Exam } from "@/lib/proctor-store";

export const Route = createFileRoute("/faculty/exams")({
  head: () => ({
    meta: [
      { title: "Manage Examinations & Question Banks — NextGen AI Proctor" },
      {
        name: "description",
        content: "Create exams, author MCQs and coding challenges, set attendance duration, and assign candidates.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["faculty", "admin"]}>
      <FacultyExamsPage />
    </RequireRole>
  ),
});

function FacultyExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Exam Form State
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [instructions, setInstructions] = useState("");

  const sync = () => setExams(loadDB().exams);

  useEffect(() => {
    sync();
    window.addEventListener("proctor-db-change", sync);
    return () => window.removeEventListener("proctor-db-change", sync);
  }, []);

  const handleCreateExam = async () => {
    if (!title.trim() || !subject.trim()) {
      toast.error("Please enter exam title and subject.");
      return;
    }

    const newExam: Exam = {
      id: uid(),
      title,
      subject,
      durationMin: Number(durationMin) || 60,
      scheduledAt: new Date().toISOString(),
      instructions,
      questions: [
        {
          id: `mcq-${Date.now()}-1`,
          text: "What is the primary function of YOLOv8 decoupled head?",
          options: [
            "Separate classification from bounding box regression",
            "Downsample images",
            "Calculate optical flow",
            "Compute speech audio RMS",
          ],
          answer: 0,
          points: 2,
          category: "Computer Vision",
        },
      ],
      codingQuestions: [
        {
          id: `code-${Date.now()}-1`,
          title: "Reverse Array In-Place",
          difficulty: "Easy",
          description: "Given an array of integers, reverse its elements in-place and return the reversed array.",
          language: "javascript",
          points: 10,
          starterCode: {
            javascript: "function solution(arr) {\n  return arr.reverse();\n}",
            python: "def solution(arr):\n    return arr[::-1]",
          },
          testCases: [
            { input: "[1, 2, 3, 4]", expectedOutput: "[4, 3, 2, 1]", label: "Example 1", isHidden: false },
            { input: "[10, 20]", expectedOutput: "[20, 10]", label: "Example 2", isHidden: false },
          ],
        },
      ],
    };

    updateDB((db) => {
      db.exams.unshift(newExam);
    });

    try {
      await apiClient.createExam(newExam);
    } catch {
      // local store already updated
    }

    toast.success("Examination created successfully!");
    setShowCreateModal(false);
    setTitle("");
    setSubject("");
  };

  return (
    <AppShell
      nav={FACULTY_NAV}
      title="Examination &amp; Assessment Management"
      subtitle="Author question banks, configure duration limits, and launch AI-proctored exams"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display font-bold text-lg">Active Examinations ({exams.length})</h3>
          <p className="text-xs text-muted-foreground">Each exam supports both MCQ and multi-language Coding sections.</p>
        </div>

        <Button onClick={() => setShowCreateModal(true)} className="brand-surface flex items-center gap-1.5 text-xs font-bold">
          <Plus className="size-4" /> Create New Exam
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {exams.map((exam) => (
          <GlassCard key={exam.id} className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                  {exam.subject}
                </span>
                <h4 className="font-display font-bold text-base mt-2">{exam.title}</h4>
              </div>
              <span className="text-xs font-mono font-bold text-muted-foreground flex items-center gap-1 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-glass-border">
                <Clock className="size-3 text-amber-400" /> {exam.durationMin} mins
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-background/50 border border-glass-border flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <HelpCircle className="size-3.5 text-primary" /> MCQs:
                </span>
                <span className="font-bold text-foreground">{exam.questions?.length || 0} Questions</span>
              </div>

              <div className="p-3 rounded-xl bg-background/50 border border-glass-border flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Code2 className="size-3.5 text-accent" /> Coding:
                </span>
                <span className="font-bold text-foreground">{exam.codingQuestions?.length || 0} Challenges</span>
              </div>
            </div>

            {exam.instructions && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {exam.instructions}
              </p>
            )}

            <div className="pt-2 border-t border-glass-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Created {new Date(exam.scheduledAt).toLocaleDateString()}</span>
              <span className="text-emerald-400 font-semibold font-mono">AI Proctoring Enabled</span>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <GlassCard className="max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold text-base">Create New Proctored Exam</h4>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>✕</Button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Exam Title:
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. CS402: Deep Learning Final Exam"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Subject / Course:
                </label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Artificial Intelligence"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Duration (Minutes):
                </label>
                <Input
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  min={10}
                  max={240}
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Examination Instructions:
                </label>
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Rules, disallowed electronic devices, notes..."
                  rows={3}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-glass-border">
              <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateExam} className="brand-surface font-bold">
                Create &amp; Publish Exam
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </AppShell>
  );
}
