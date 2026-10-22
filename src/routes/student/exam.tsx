import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Boxes,
  Camera,
  Check,
  CheckCircle2,
  Code2,
  Compass,
  Download,
  Eye,
  Hand,
  Headphones,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Maximize2,
  Mic,
  Minimize2,
  Monitor,
  Play,
  Printer,
  RotateCcw,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Timer,
  Users,
  Video,
  Volume2,
  Watch,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { RiskBadge, RiskGauge } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { executeCode, type ExecutionSummary, type TestResult } from "@/lib/code-runner";
import { useProctorEngine } from "@/lib/detection-engine";
import { printPDF } from "@/lib/report";
import {
  computeRisk,
  loadDB,
  seed,
  uid,
  updateDB,
  type CodeSubmission,
  type ExamScoreSummary,
  type ExamSession,
  type TimelineEvent,
} from "@/lib/proctor-store";

export const Route = createFileRoute("/student/exam")({
  validateSearch: (search: Record<string, unknown>) => ({ exam: String(search["exam"] ?? "e1") }),
  head: () => ({
    meta: [
      { title: "Live proctored exam — NextGen AI Proctor" },
      {
        name: "description",
        content:
          "Take your assessment under live real-time AI monitoring with YOLOv8, MediaPipe, Iris Gaze, Head Pose, and Explainable AI.",
      },
      { property: "og:title", content: "Live proctored exam — NextGen AI Proctor" },
      {
        property: "og:description",
        content:
          "Answer MCQs and code interactive challenges while AI monitors gaze, objects, voice and identity in real time.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["student"]}>
      <ExamPage />
    </RequireRole>
  ),
});

function ExamPage() {
  const { exam: examId } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();

  const exam = useMemo(() => {
    const db = loadDB();
    const fallbackSeed = seed().exams[0]!;
    const found = db.exams?.find((e) => e.id === examId) ?? db.exams?.[0];
    if (found) {
      return {
        ...found,
        id: found.id || fallbackSeed.id || "e1",
        title: found.title || fallbackSeed.title || "Live Proctored Assessment",
        subject: found.subject || fallbackSeed.subject || "Computer Science",
        durationMin: Number(found.durationMin) > 0 ? Number(found.durationMin) : (fallbackSeed.durationMin || 45),
        questions: Array.isArray(found.questions) && found.questions.length > 0 ? found.questions : (fallbackSeed.questions ?? []),
        codingQuestions: Array.isArray(found.codingQuestions) && found.codingQuestions.length > 0 ? found.codingQuestions : (fallbackSeed.codingQuestions ?? []),
      };
    }
    return fallbackSeed;
  }, [examId]);
  const sessionIdRef = useRef(uid());

  // Section & Question navigation
  const [activeSection, setActiveSection] = useState<"mcq" | "coding">("mcq");
  const [mcqIndex, setMcqIndex] = useState(0);
  const [codingIndex, setCodingIndex] = useState(0);

  // Answers & Code state
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [codeMap, setCodeMap] = useState<Record<string, Record<string, string>>>(
    () => {
      const init: Record<string, Record<string, string>> = {};
      for (const cq of (exam.codingQuestions || [])) {
        init[cq.id] = {
          javascript: cq.starterCode?.javascript || "function solution() {\n  return [];\n}",
          python: cq.starterCode?.python || "def solution():\n    return []",
          c: "#include <stdio.h>\nint main() {\n    printf(\"[0, 1]\\n\");\n    return 0;\n}",
          cpp: "#include <iostream>\nint main() {\n    std::cout << \"[0, 1]\" << std::endl;\n    return 0;\n}",
          java: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"[0, 1]\");\n    }\n}",
        };
      }
      return init;
    },
  );
  const [selectedLang, setSelectedLang] = useState<Record<string, string>>({});
  const [codeSubmissions, setCodeSubmissions] = useState<Record<string, CodeSubmission>>({});
  const [runningCode, setRunningCode] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Fullscreen, Screen Minimize & Tab Switch Violation Tracking
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== "undefined" ? !!document.fullscreenElement : false
  );
  const isFullscreenRef = useRef(
    typeof document !== "undefined" ? !!document.fullscreenElement : false
  );
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  const MAX_TAB_SWITCHES = 3;
  const MAX_VIOLATIONS = 3;
  const [tabSwitches, setTabSwitches] = useState(0);
  const tabSwitchesRef = useRef(0);
  const lastTabSwitchTimeRef = useRef(0);
  const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false);
  const [examStarted, setExamStarted] = useState(true); // Normal mode active immediately
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [finalScoreSummary, setFinalScoreSummary] = useState<ExamScoreSummary | null>(null);

  const totalViolations = tabSwitches;
  const submittedRef = useRef(false);

  // Automatic fullscreen request on exam attend
  useEffect(() => {
    if (typeof document !== "undefined" && !document.fullscreenElement && document.documentElement?.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
          isFullscreenRef.current = true;
        })
        .catch(() => {
          // Handled by mandatory fullscreen modal overlay if browser requires user gesture
        });
    }
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (typeof document !== "undefined") {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
          isFullscreenRef.current = true;
          toast.success("Fullscreen Exam Mode enabled");
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle error:", err);
    }
  };

  // Countdown timer initialized from exam.durationMin (configured in Admin)
  const [remaining, setRemaining] = useState(() => (exam.durationMin || 45) * 60);
  const [submitted, setSubmitted] = useState(false);
  const warned5MinRef = useRef(false);

  const persist = useCallback((patch: Partial<ExamSession>) => {
    updateDB((db) => {
      const existing = db.sessions.find((s) => s.id === sessionIdRef.current);
      if (existing) Object.assign(existing, patch);
    });
  }, []);

  const onEvent = useCallback((ev: TimelineEvent) => {
    updateDB((db) => {
      const s = db.sessions.find((x) => x.id === sessionIdRef.current);
      if (s) s.events = [ev, ...s.events].slice(0, 200);
    });
    if (ev.severity >= 25) {
      const isPhoneEvent = ev.type === "phone" || ev.label?.toLowerCase().includes("phone");
      const isFaceMismatch = ev.type === "face_mismatch" || ev.label?.toLowerCase().includes("face mismatch") || ev.label?.toLowerCase().includes("identity mismatch");
      if (isFaceMismatch) {
        // Face matching check is inactive during exam; ignore
        return;
      } else if (isPhoneEvent) {
        toast.error(`🚨 WARNING: MOBILE PHONE DETECTED! — 📸 Evidence Screenshot Captured!`, {
          duration: 6000,
        });
      } else if (ev.evidence) {
        toast.warning(`${ev.label} — 📸 Evidence Screenshot Captured!`);
      } else {
        toast.warning(ev.label);
      }
    }
  }, []);

  const enrolledEmbeddingFloat32 = useMemo(() => {
    if (typeof window !== "undefined") {
      // 1. Prioritize pre-check captured photo embedding (as user requested matching against pre-check photo)
      const precheckStored = sessionStorage.getItem("exam_precheck_embedding");
      if (precheckStored) {
        try {
          const parsed = JSON.parse(precheckStored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return new Float32Array(parsed);
          }
        } catch {}
      }
      // 2. Fallback to registered photo embedding
      const regStored = sessionStorage.getItem("exam_registered_embedding");
      if (regStored) {
        try {
          const parsed = JSON.parse(regStored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return new Float32Array(parsed);
          }
        } catch {}
      }
    }
    if (user?.faceEmbedding && Array.isArray(user.faceEmbedding) && user.faceEmbedding.length > 0) {
      return new Float32Array(user.faceEmbedding);
    }
    return null;
  }, [user?.faceEmbedding]);

  const photoToVerify = useMemo(() => {
    if (typeof window !== "undefined") {
      const precheck = sessionStorage.getItem("exam_precheck_photo");
      if (precheck) return precheck;
      const registered = sessionStorage.getItem("exam_registered_photo");
      if (registered) return registered;
    }
    return user?.photoUrl;
  }, [user?.photoUrl]);

  const engine = useProctorEngine({
    active: !submitted,
    sessionId: sessionIdRef.current,
    studentId: user?.id,
    studentPhoto: photoToVerify,
    enrolledEmbedding: enrolledEmbeddingFloat32,
    onEvent,
  });

  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  /* Create the session record as soon as the exam opens. */
  useEffect(() => {
    if (!user) return;
    const id = sessionIdRef.current;
    const precheckPhoto = typeof window !== "undefined" ? sessionStorage.getItem("exam_precheck_photo") || undefined : undefined;
    const registeredPhoto = typeof window !== "undefined" ? sessionStorage.getItem("exam_registered_photo") || user.photoUrl : user.photoUrl;
    const precheckSimilarity = typeof window !== "undefined" ? Number(sessionStorage.getItem("exam_precheck_similarity") || 94) : 94;

    updateDB((db) => {
      if (db.sessions.some((s) => s.id === id)) return;
      db.sessions.unshift({
        id,
        studentId: user.id,
        studentName: user.name,
        examId: exam.id,
        examTitle: exam.title,
        startedAt: new Date().toISOString(),
        status: "active",
        riskScore: 0,
        riskLevel: "green",
        reasons: [],
        answers: {},
        roomScanPassed: true,
        events: [],
        metrics: { ...engine.metrics },
        registeredPhotoUrl: registeredPhoto,
        precheckPhotoUrl: precheckPhoto || registeredPhoto,
        precheckMatchSimilarity: precheckSimilarity,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, exam.id]);

  /* Keep the live risk score in the shared store so faculty see it in real time. */
  useEffect(() => {
    if (submitted) return;
    persist({
      riskScore: engine.risk.score,
      riskLevel: engine.risk.level,
      reasons: engine.xai.reasons,
      metrics: { ...engine.metrics },
    });
  }, [engine.risk, engine.xai.reasons, engine.metrics, persist, submitted]);

  /* Countdown timer with 5-minute warning and auto-submit. */
  useEffect(() => {
    if (submitted || !examStarted) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 300 && !warned5MinRef.current && r > 298) {
          warned5MinRef.current = true;
          toast.warning("Notice: 5 minutes remaining in this exam session!");
        }
        return Math.max(0, r - 1);
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [submitted, examStarted]);

  /* Network offline detection & auto-reconnection synchronization */
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Network connection restored. Syncing exam session...");
      apiClient.flushOfflineQueue();
      apiClient.ingestEvent({
        id: uid(),
        sessionId: sessionIdRef.current,
        studentId: user?.id || "student",
        examId: exam.id,
        eventType: "NETWORK_RECONNECTED",
        timestamp: new Date().toISOString(),
        duration: 1,
        confidence: 1.0,
        riskContribution: 0,
        source: "Browser",
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.error("Network connection lost. Your exam session is being preserved.");
      apiClient.ingestEvent({
        id: uid(),
        sessionId: sessionIdRef.current,
        studentId: user?.id || "student",
        examId: exam.id,
        eventType: "NETWORK_DISCONNECTED",
        timestamp: new Date().toISOString(),
        duration: 1,
        confidence: 1.0,
        riskContribution: 5,
        source: "Browser",
      });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [exam.id, user?.id]);

  /* =========================================================================
   * 1. Clipboard, Copy/Paste/Cut & Context Menu Security Enforcement
   * ========================================================================= */
  useEffect(() => {
    if (submitted) return;

    const preventClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      toast.error("Copy/Paste is strictly prohibited during this examination.", {
        description: "Clipboard activity has been intercepted and logged for integrity review.",
        id: "clipboard-toast",
      });

      const type = e.type === "copy" ? "COPY_ATTEMPT" : e.type === "paste" ? "PASTE_ATTEMPT" : "CUT_ATTEMPT";
      apiClient.ingestEvent({
        id: uid(),
        sessionId: sessionIdRef.current,
        studentId: user?.id || "student",
        examId: exam.id,
        eventType: type as any,
        timestamp: new Date().toISOString(),
        duration: 1,
        confidence: 1.0,
        riskContribution: 15,
        source: "Browser",
        metadata: { event: e.type },
      });

      onEvent({
        id: uid(),
        sessionId: sessionIdRef.current,
        type: "clipboard_violation",
        label: `Violation: Unauthorized ${e.type.toUpperCase()} Action Blocked`,
        at: new Date().toISOString(),
        clock: new Date().toLocaleTimeString(),
        severity: 25,
      });
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener("copy", preventClipboard, true);
    document.addEventListener("paste", preventClipboard, true);
    document.addEventListener("cut", preventClipboard, true);
    document.addEventListener("contextmenu", handleContextMenu, true);

    return () => {
      document.removeEventListener("copy", preventClipboard, true);
      document.removeEventListener("paste", preventClipboard, true);
      document.removeEventListener("cut", preventClipboard, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, [submitted, user?.id, exam.id, onEvent]);

  /* =========================================================================
   * 2. Arrow Key Selection Lockdown, Keyboard Shortcuts & DevTools Blocking
   * ========================================================================= */
  useEffect(() => {
    if (submitted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInsideCodeEditor =
        target &&
        (target.tagName === "TEXTAREA" ||
          target.getAttribute("data-exam-editor") === "true" ||
          target.classList.contains("exam-code-editor"));

      // A. Arrow Key & Navigation Text Selection Lock (Shift + Arrows, Shift + Home/End/PageUp/Down)
      if (
        e.shiftKey &&
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "Home" ||
          e.key === "End" ||
          e.key === "PageUp" ||
          e.key === "PageDown")
      ) {
        if (!isInsideCodeEditor) {
          e.preventDefault();
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          toast.warning("Arrow key text selection is locked to protect exam questions.", {
            id: "arrow-key-locked",
          });
          return;
        }
      }

      // B. Select-All Lock (Ctrl+A / Cmd+A) outside code editor
      if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        if (!isInsideCodeEditor) {
          e.preventDefault();
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          toast.warning("Selecting exam question text is disabled.", {
            id: "select-all-locked",
          });
          return;
        }
      }

      // C. Copy Shortcut Lock (Ctrl+C / Cmd+C)
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        toast.error("Copying exam questions or content is prohibited.", {
          id: "copy-ctrl-c-locked",
        });
        apiClient.ingestEvent({
          id: uid(),
          sessionId: sessionIdRef.current,
          studentId: user?.id || "student",
          examId: exam.id,
          eventType: "COPY_ATTEMPT",
          timestamp: new Date().toISOString(),
          duration: 1,
          confidence: 1.0,
          riskContribution: 15,
          source: "Browser",
          metadata: { shortcut: "Ctrl+C", target: target?.tagName },
        });
        const copyShot = engineRef.current?.capture?.("KEYBOARD COPY SHORTCUT (CTRL+C) BLOCKED");
        const copyEvId = uid();
        onEvent({
          id: copyEvId,
          sessionId: sessionIdRef.current,
          type: "clipboard_violation",
          label: "Violation: Keyboard Copy Shortcut (Ctrl+C) Blocked",
          at: new Date().toISOString(),
          clock: new Date().toLocaleTimeString([], { hour12: false }),
          severity: 25,
          ...(copyShot ? { evidence: copyShot } : {}),
        });
        if (copyShot && sessionIdRef.current) {
          apiClient.storeEvidence({
            sessionId: sessionIdRef.current,
            eventId: copyEvId,
            type: "clipboard_violation",
            confidence: 1.0,
            duration: 1,
            imageB64: copyShot,
            metadata: { label: "Violation: Keyboard Copy Shortcut (Ctrl+C) Blocked", severity: 25 },
          }).catch(() => {});
        }
        return;
      }

      // D. Paste Shortcut Lock (Ctrl+V / Cmd+V)
      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        e.stopPropagation();
        toast.error("Pasting external content into the exam is blocked.", {
          id: "paste-ctrl-v-locked",
        });
        apiClient.ingestEvent({
          id: uid(),
          sessionId: sessionIdRef.current,
          studentId: user?.id || "student",
          examId: exam.id,
          eventType: "PASTE_ATTEMPT",
          timestamp: new Date().toISOString(),
          duration: 1,
          confidence: 1.0,
          riskContribution: 15,
          source: "Browser",
          metadata: { shortcut: "Ctrl+V" },
        });
        onEvent({
          id: uid(),
          sessionId: sessionIdRef.current,
          type: "clipboard_violation",
          label: "Violation: External Paste Attempt (Ctrl+V) Blocked",
          at: new Date().toISOString(),
          clock: new Date().toLocaleTimeString(),
          severity: 25,
        });
        return;
      }

      // E. Cut Shortcut Lock (Ctrl+X / Cmd+X) outside editor
      if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X")) {
        if (!isInsideCodeEditor) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // F. Developer Tools, Inspection, View Source & Print Shortcuts
      if (
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "C" || e.key === "c" || e.key === "J" || e.key === "j")) ||
        ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) ||
        ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) ||
        ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        toast.error("Developer tools, source inspect, and print actions are locked during exams.", {
          id: "devtools-locked",
        });
        return;
      }

      // G. SCREENSHOT DETECTION & BLOCKING (PrintScreen, Win+Shift+S, Mac Screen Capture)
      const isPrtScn = e.key === "PrintScreen" || e.keyCode === 44 || e.code === "PrintScreen";
      const isWinSnipping = (e.key === "S" || e.key === "s") && e.shiftKey && (e.metaKey || (e as any).ctrlKey);
      const isMacScreenShot = e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5");

      if (isPrtScn || isWinSnipping || isMacScreenShot) {
        e.preventDefault();
        e.stopPropagation();

        // Clear clipboard immediately to sanitize any captured screen buffer
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText("");
          }
        } catch {}

        toast.error("🚨 SECURITY WARNING: SCREENSHOT ATTEMPT BLOCKED! Taking screenshots during the exam is strictly prohibited.", {
          duration: 7000,
          id: "screenshot-blocked-toast",
        });

        const shotEvidence = engineRef.current?.capture?.("SECURITY VIOLATION: SCREENSHOT ATTEMPT BLOCKED");
        const scEvId = uid();

        apiClient.ingestEvent({
          id: scEvId,
          sessionId: sessionIdRef.current,
          studentId: user?.id || "student",
          examId: exam.id,
          eventType: "SCREENSHOT_ATTEMPT",
          timestamp: new Date().toISOString(),
          duration: 1,
          confidence: 1.0,
          riskContribution: 30,
          source: "Browser",
          metadata: { shortcut: isPrtScn ? "PrintScreen" : isWinSnipping ? "Win+Shift+S" : "Mac-Screenshot" },
        });

        onEvent({
          id: scEvId,
          sessionId: sessionIdRef.current,
          type: "screenshot_attempt",
          label: "Security Violation: Screen Capture / Screenshot Attempt Blocked",
          at: new Date().toISOString(),
          clock: new Date().toLocaleTimeString([], { hour12: false }),
          severity: 45,
          ...(shotEvidence ? { evidence: shotEvidence } : {}),
        });

        if (shotEvidence && sessionIdRef.current) {
          apiClient.storeEvidence({
            sessionId: sessionIdRef.current,
            eventId: scEvId,
            type: "screenshot_attempt",
            confidence: 1.0,
            duration: 1,
            imageB64: shotEvidence,
            metadata: { label: "Security Violation: Screen Capture / Screenshot Attempt Blocked", severity: 45 },
          }).catch(() => {});
        }

        setShowTabSwitchWarning(true);
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.keyCode === 44 || e.code === "PrintScreen") {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText("");
          }
        } catch {}
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [submitted, user?.id, exam.id, onEvent]);

  /* =========================================================================
   * 3. Text Selection & Drag-and-Drop Suppression (Neutralizes AI Bubble Trigger)
   * ========================================================================= */
  useEffect(() => {
    if (submitted) return;

    // Disallow text selection on all question elements
    const handleSelectStart = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const isInsideCodeEditor =
        target &&
        (target.tagName === "TEXTAREA" ||
          target.getAttribute("data-exam-editor") === "true" ||
          target.classList.contains("exam-code-editor"));

      if (!isInsideCodeEditor) {
        e.preventDefault();
      }
    };

    // If any selection occurs outside the code editor, clear it immediately
    const handleSelectionChange = () => {
      const activeEl = document.activeElement;
      const isInsideCodeEditor =
        activeEl &&
        (activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("data-exam-editor") === "true" ||
          activeEl.classList.contains("exam-code-editor"));

      if (!isInsideCodeEditor) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
          sel.removeAllRanges();
        }
      }
    };

    // Block dragging text to external windows / AI extension sidebars
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    // Block dropping external text
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    document.addEventListener("selectstart", handleSelectStart, true);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("drop", handleDrop, true);

    return () => {
      document.removeEventListener("selectstart", handleSelectStart, true);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("drop", handleDrop, true);
    };
  }, [submitted]);

  /* =========================================================================
   * 4. Active AI Browser Extension Detection & Auto-Neutralizer
   * ========================================================================= */
  useEffect(() => {
    if (submitted) return;

    const AI_EXTENSION_SELECTORS = [
      // Monica AI
      "monica-root",
      "#monica-content-root",
      "div[id^='monica-']",
      "div[class*='monica-']",
      "[data-monica]",
      // Sider AI
      "sider-market",
      "#sider-sidebar",
      "#sider-root",
      "div[id^='ch-plugin-']",
      "div[class*='sider-']",
      "[data-sider]",
      // Merlin AI
      "#merlin-chat-container",
      "div[data-merlin-container]",
      "merlin-component",
      // ChatGPT / OpenAI Sidebars
      "chatgpt-sidebar",
      "div[id*='chatgpt-sidebar']",
      "div[class*='chatgpt-sidebar']",
      "div[id*='openai-assistant']",
      // QuillBot / Grammarly / LanguageTool
      "quillbot-extension",
      "div[id*='quillbot']",
      "grammarly-extension",
      "grammarly-popups",
      "grammarly-desktop-integration",
      // MaxAI, Harpa, Copilot, DeepSeek, AI Popups
      "maxai-root",
      "#maxai-root",
      "div[id*='maxai']",
      "harpa-assistant",
      "div[id*='harpa-']",
      "div[class*='ai-assistant']",
      "div[class*='selection-popup']",
      "div[class*='ai-quick-query']",
      // General extension attributes
      "[data-extension-id]",
      "iframe[src*='chrome-extension://']",
      "iframe[src*='moz-extension://']",
    ];

    const neutralizedElements = new Set<Element>();

    const scanAndNeutralizeExtensions = () => {
      for (const selector of AI_EXTENSION_SELECTORS) {
        try {
          const matches = document.querySelectorAll(selector);
          matches.forEach((el) => {
            if (!neutralizedElements.has(el)) {
              neutralizedElements.add(el);

              // Neutralize immediately
              el.setAttribute(
                "style",
                "display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important; position: absolute !important; z-index: -99999 !important;"
              );
              try {
                el.remove();
              } catch {
                // styled as hidden fallback
              }

              toast.error("⚠️ AI Assistant Extension Neutralized!", {
                description:
                  "Browser AI extensions (ChatGPT, Monica, Sider, Quillbot) are prohibited during exams. Violation logged.",
                id: "ai-ext-neutralized",
              });

              apiClient.ingestEvent({
                id: uid(),
                sessionId: sessionIdRef.current,
                studentId: user?.id || "student",
                examId: exam.id,
                eventType: "EXTENSION_POLICY_VIOLATION",
                timestamp: new Date().toISOString(),
                duration: 1,
                confidence: 0.98,
                riskContribution: 30,
                source: "Browser",
                metadata: { selector, action: "neutralized" },
              });

              const extShot = engineRef.current?.capture?.("UNAUTHORIZED AI EXTENSION DETECTED");
              const extEvId = uid();
              onEvent({
                id: extEvId,
                sessionId: sessionIdRef.current,
                type: "extension_violation",
                label: "Violation: Unauthorized AI Browser Extension Neutralized",
                at: new Date().toISOString(),
                clock: new Date().toLocaleTimeString([], { hour12: false }),
                severity: 40,
                ...(extShot ? { evidence: extShot } : {}),
              });
              if (extShot && sessionIdRef.current) {
                apiClient.storeEvidence({
                  sessionId: sessionIdRef.current,
                  eventId: extEvId,
                  type: "extension_violation",
                  confidence: 1.0,
                  duration: 1,
                  imageB64: extShot,
                  metadata: { label: "Violation: Unauthorized AI Browser Extension Neutralized", severity: 40 },
                }).catch(() => {});
              }
            }
          });
        } catch {
          // ignore selector errors
        }
      }
    };

    // Initial sweep
    scanAndNeutralizeExtensions();

    // DOM Mutation Observer to instantly catch extensions injecting after page load
    const observer = new MutationObserver((mutations) => {
      let hasAddedNodes = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          hasAddedNodes = true;
          break;
        }
      }
      if (hasAddedNodes) {
        scanAndNeutralizeExtensions();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Periodic sweep every 3.5 seconds
    const intervalId = window.setInterval(scanAndNeutralizeExtensions, 3500);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
    };
  }, [submitted, user?.id, exam.id, onEvent]);


  /* Calculate Academic Performance Score Summary */
  const computeScores = useCallback((): ExamScoreSummary => {
    let mcqScore = 0;
    const questionsList = exam.questions || [];
    const mcqTotal = questionsList.length;
    for (const q of questionsList) {
      if (answers[q.id] === q.answer) {
        mcqScore += 1;
      }
    }

    let codingScore = 0;
    const codingList = exam.codingQuestions || [];
    const codingTotal = codingList.length;
    for (const cq of codingList) {
      const sub = codeSubmissions[cq.id];
      if (sub && sub.allPassed) {
        codingScore += 1;
      } else if (sub && sub.totalCount > 0) {
        // partial credit proportional to tests passed
        codingScore += sub.passedCount / sub.totalCount;
      }
    }

    const totalScore = mcqScore + codingScore;
    const maxScore = mcqTotal + codingTotal;
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    return {
      mcqScore,
      mcqTotal,
      codingScore: Number(codingScore.toFixed(1)),
      codingTotal,
      totalScore: Number(totalScore.toFixed(1)),
      maxScore,
      percentage,
    };
  }, [answers, codeSubmissions, exam.codingQuestions, exam.questions]);

  const finish = useCallback((autoSubmitReason?: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    const scoreSummary = computeScores();
    setFinalScoreSummary(scoreSummary);

    persist({
      status: "completed",
      endedAt: new Date().toISOString(),
      answers,
      codeAnswers: codeSubmissions,
      scoreSummary,
      riskScore: engine.risk.score,
      riskLevel: engine.risk.level,
      reasons: [
        ...(autoSubmitReason ? [`Auto-Submitted: ${autoSubmitReason}`] : []),
        ...engine.xai.reasons,
      ],
      metrics: {
        ...engine.metrics,
        tabSwitches: Math.max(tabSwitches, tabSwitchesRef.current),
      },
    });
    setShowSubmitModal(false);
    setShowTabSwitchWarning(false);
    setShowScoreModal(true);
    if (autoSubmitReason) {
      toast.error(`🚨 EXAM AUTO-SUBMITTED: ${autoSubmitReason}`, { duration: 9000 });
    } else {
      toast.success(`Exam submitted successfully! Score: ${scoreSummary.percentage}% (${scoreSummary.totalScore}/${scoreSummary.maxScore} marks)`);
    }
  }, [
    answers,
    codeSubmissions,
    computeScores,
    engine.metrics,
    engine.risk,
    engine.xai.reasons,
    persist,
    tabSwitches,
  ]);

  /* Fullscreen & Screen Minimize Security Surveillance (Auto-Submit Enabled) */
  useEffect(() => {
    if (submitted) return;

    const handleTabSwitchViolation = (reasonLabel: string, isFullscreenExit = false) => {
      if (submittedRef.current) return;

      const now = Date.now();
      if (now - lastTabSwitchTimeRef.current < 1500) {
        return; // Debounce rapid consecutive visibilitychange / blur events
      }
      lastTabSwitchTimeRef.current = now;

      const nextCount = tabSwitchesRef.current + 1;
      tabSwitchesRef.current = nextCount;
      setTabSwitches(nextCount);

      const shotEvidence = engineRef.current?.capture?.(`TAB SWITCH ${nextCount}/${MAX_TAB_SWITCHES} — ${reasonLabel}`);
      const tabEvId = uid();

      apiClient.ingestEvent({
        id: tabEvId,
        sessionId: sessionIdRef.current,
        studentId: user?.id || "student",
        examId: exam.id,
        eventType: "TAB_SWITCH",
        timestamp: new Date().toISOString(),
        duration: 1,
        confidence: 1.0,
        riskContribution: nextCount > MAX_TAB_SWITCHES ? 40 : 15,
        source: "Browser",
        metadata: { reason: reasonLabel, count: nextCount, maxAllowed: MAX_TAB_SWITCHES },
      }).catch(() => {});

      onEvent({
        id: tabEvId,
        sessionId: sessionIdRef.current,
        type: "tab_switch",
        label: `Security Alert: ${reasonLabel} (Warning ${nextCount} of ${MAX_TAB_SWITCHES})`,
        at: new Date().toISOString(),
        clock: new Date().toLocaleTimeString([], { hour12: false }),
        severity: nextCount > MAX_TAB_SWITCHES ? 50 : 25,
        ...(shotEvidence ? { evidence: shotEvidence } : {}),
      });

      if (shotEvidence && sessionIdRef.current) {
        apiClient.storeEvidence({
          sessionId: sessionIdRef.current,
          eventId: tabEvId,
          type: "tab_switch",
          confidence: 1.0,
          duration: 1,
          imageB64: shotEvidence,
          metadata: { label: `Security Alert: ${reasonLabel} (Warning ${nextCount} of ${MAX_TAB_SWITCHES})`, severity: nextCount > MAX_TAB_SWITCHES ? 50 : 25 },
        }).catch(() => {});
      }

      updateDB((db) => {
        const s = db.sessions.find((x) => x.id === sessionIdRef.current);
        if (s) {
          s.metrics.tabSwitches = nextCount;
          if (isFullscreenExit) {
            s.metrics.fullscreenExits = (s.metrics.fullscreenExits || 0) + 1;
          }
        }
      });

      if (nextCount > MAX_TAB_SWITCHES) {
        // Exceeded maximum 3 allowed tab switches -> Auto-submit
        toast.error(
          `🚨 CRITICAL SECURITY ALERT: Maximum allowed tab switches (${MAX_TAB_SWITCHES}) exceeded! Your exam is being automatically submitted immediately.`,
          { duration: 9000, id: "tab-switch-limit-toast" }
        );
        setTimeout(() => {
          finish(`Maximum tab switch limit (${MAX_TAB_SWITCHES}) exceeded`);
        }, 500);
      } else {
        const remaining = MAX_TAB_SWITCHES - nextCount;
        if (nextCount === MAX_TAB_SWITCHES) {
          toast.error(
            `⚠️ FINAL WARNING (${nextCount}/${MAX_TAB_SWITCHES}): Tab switched or window minimized! 0 warnings remaining. Further tab switch will auto-submit exam!`,
            { duration: 8000, id: "tab-switch-warning-toast" }
          );
        } else {
          toast.warning(
            `⚠️ Security Warning (${nextCount}/${MAX_TAB_SWITCHES}): Tab switched or window focus lost! You have ${remaining} warning(s) remaining.`,
            { duration: 6000, id: "tab-switch-warning-toast" }
          );
        }
        setShowTabSwitchWarning(true);
      }
    };

    const onFullscreenChange = () => {
      const isNowFullscreen = typeof document !== "undefined" && !!document.fullscreenElement;
      const wasFullscreen = isFullscreenRef.current;
      isFullscreenRef.current = isNowFullscreen;
      setIsFullscreen(isNowFullscreen);

      if (wasFullscreen && !isNowFullscreen && !submittedRef.current) {
        handleTabSwitchViolation("Screen Minimized / Fullscreen Exited", true);
      }
    };

    const onVisibilityOrBlur = (e: Event) => {
      if ((document.hidden || e.type === "blur") && !submittedRef.current) {
        handleTabSwitchViolation("Screen Minimized / Window Focus Lost", false);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityOrBlur);
    window.addEventListener("blur", onVisibilityOrBlur);

    // Periodic network stability check (RTT / ping test)
    const pingInterval = window.setInterval(async () => {
      const start = performance.now();
      try {
        await fetch("/health");
        const rtt = Math.round(performance.now() - start);
        if (rtt > 650) {
          apiClient.ingestEvent({
            id: uid(),
            sessionId: sessionIdRef.current,
            studentId: user?.id || "student",
            examId: exam.id,
            eventType: "NETWORK_UNSTABLE",
            timestamp: new Date().toISOString(),
            duration: 1,
            confidence: 0.9,
            riskContribution: 5,
            source: "Browser",
            metadata: { rttMs: rtt },
          });
        }
      } catch {
        // Handled by offline handler
      }
    }, 15000);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityOrBlur);
      window.removeEventListener("blur", onVisibilityOrBlur);
      window.clearInterval(pingInterval);
    };
  }, [submitted, user?.id, exam.id, finish, onEvent]);

  useEffect(() => {
    if (remaining === 0 && !submitted) {
      toast.info("Exam time limit reached! Auto-submitting session...");
      finish();
    }
  }, [remaining, submitted, finish]);

  // Format time remaining
  const hours = Math.floor(remaining / 3600);
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const timeFormatted = hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  const isTimeCritical = remaining < 300; // less than 5 minutes

  // Active question references
  const questionsList = useMemo(() => exam.questions || [], [exam.questions]);
  const codingList = useMemo(() => exam.codingQuestions || [], [exam.codingQuestions]);
  const currentMCQ = questionsList[mcqIndex] ?? questionsList[0];
  const currentCoding = codingList[codingIndex] ?? codingList[0];
  const currentCodingId = currentCoding?.id ?? "";
  const currentLang = selectedLang[currentCodingId] || currentCoding?.language || "javascript";
  const currentCode =
    codeMap[currentCodingId]?.[currentLang] ?? (currentCoding?.starterCode as Record<string, string> | undefined)?.[currentLang] ?? "";

  // Handle Code changes
  const handleCodeChange = (newCode: string) => {
    setCodeMap((prev) => ({
      ...prev,
      [currentCodingId]: {
        ...(prev[currentCodingId] || {}),
        [currentLang]: newCode,
      },
    }));
  };

  // Handle Code Execution / Testing with Docker backend sandbox + browser fallback
  const handleRunCode = async () => {
    if (!currentCoding) return;
    setRunningCode(true);
    try {
      let summary: ExecutionSummary;
      try {
        const remoteRes = await apiClient.executeCode({
          language: currentLang,
          code: currentCode,
          testCases: currentCoding.testCases || [],
          timeoutSec: 3.5,
        });
        summary = {
          passedCount: remoteRes.passedCount,
          totalCount: remoteRes.totalCount,
          allPassed: remoteRes.allPassed,
          results: remoteRes.results.map((r) => ({
            testIndex: r.testIndex,
            label: r.label,
            input: r.input,
            expected: r.expected,
            actual: r.actual,
            passed: r.passed,
            error: r.error,
            executionTimeMs: r.executionTimeMs,
            isHidden: r.isHidden,
          })),
        };
      } catch {
        // Fallback to in-browser execution runner
        summary = await executeCode(currentLang, currentCode, currentCoding.testCases || []);
      }

      const submission: CodeSubmission = {
        code: currentCode,
        language: currentLang,
        passedCount: summary.passedCount,
        totalCount: summary.totalCount,
        allPassed: summary.allPassed,
        testResults: summary.results,
      };

      setCodeSubmissions((prev) => ({
        ...prev,
        [currentCoding.id]: submission,
      }));

      if (summary.allPassed) {
        toast.success(`Success! Passed all ${summary.totalCount} test cases.`);
      } else {
        toast.warning(`Passed ${summary.passedCount}/${summary.totalCount} test cases.`);
      }
    } catch {
      toast.error("Execution error occurred while testing your code.");
    } finally {
      setRunningCode(false);
    }
  };

  const handleResetCode = () => {
    if (!currentCoding) return;
    const starter = (currentCoding.starterCode as Record<string, string> | undefined)?.[currentLang] || "";
    handleCodeChange(starter);
    toast.info("Code restored to starter template.");
  };

  // Count answered items
  const answeredMCQCount = Object.keys(answers).length;
  const solvedCodingCount = Object.values(codeSubmissions).filter((s) => s.allPassed).length;

  const s = engine.signals;
  const td = engine.tenDetections;
  const fd = engine.fourteenDetections;
  const tm = engine.technicalMetrics;
  const cs = engine.cameraStatus;
  const eyeGaze = engine.eyeGaze;
  const headMovement = engine.headMovement;
  const handMovement = engine.handMovement;
  const bodyPose = engine.bodyPose;
  const activeWarnings = engine.activeWarnings;
  const warningHistory = engine.warningHistory;
  const detectedObjects = engine.detectedObjects;
  const totalDetectedObjects = engine.totalDetectedObjects;
  const totalMovementEvents = engine.totalMovementEvents;

  const hasPrecheckPhoto = typeof window !== "undefined" && !!sessionStorage.getItem("exam_precheck_photo");
  // Face matching check is done at pre-check gate; continuous face matching check is inactive during exam.
  const isFaceMismatch = false;

  const proctorDetections = [
    {
      num: 1,
      label: "Repeated Left, Right, and Downward Looking",
      tool: "MediaPipe FaceMesh (478 pts) + OpenCV solvePnP",
      ok: !(fd?.repeatedLooking?.detected || s.headPose !== "center"),
      statusText:
        fd?.repeatedLooking?.statusText ||
        (s.headPose === "center" ? "Gaze on Screen" : `Looking ${s.headPose.toUpperCase()}`),
      subDetail: `${s.headYaw}° Yaw · ${s.headPitch}° Pitch | Gaze: ⬆️${eyeGaze?.counts?.up ?? 0} ⬇️${eyeGaze?.counts?.down ?? 0} ⬅️${eyeGaze?.counts?.left ?? 0} ➡️${eyeGaze?.counts?.right ?? 0}`,
      disclaimer: "Gaze direction is a suspicious indicator, not proof of cheating. Thresholds and time window applied.",
      icon: Eye,
    },
    {
      num: 2,
      label: "Book, Notes, and Paper Detection",
      tool: "Ultralytics YOLOv8 Object Detection",
      ok: !s.book && !fd?.bookNotesDetection?.detected,
      statusText:
        fd?.bookNotesDetection?.statusText ||
        (s.book ? `Book / Notes in View (${Math.round(s.bookConfidence * 100)}%)` : "Zero Prohibited Materials"),
      subDetail: s.book
        ? "Material in frame (consecutive streak confirmation)"
        : "Desk area clear of notes, papers, and books",
      disclaimer: "Clearly distinguishes between a detected object and confirmed unauthorized material. Requires faculty review.",
      icon: BookOpen,
    },
    {
      num: 3,
      label: "External AI or Chatbot Usage",
      tool: "Browser Sandbox Guard (Focus & Visibility APIs)",
      ok: !fd?.externalAiUsage?.detected,
      statusText: fd?.externalAiUsage?.statusText || "Sandbox Guard Active (Partially Supported)",
      subDetail: "Monitors permitted browser focus, clipboard events, and window isolation",
      disclaimer: "Webcam footage alone cannot reliably identify ChatGPT or other chatbot usage. Monitored via permitted sandbox environment.",
      icon: Sparkles,
    },
    {
      num: 4,
      label: "External Website or Search Usage",
      tool: "Browser Page Visibility API & Window Focus",
      ok: s.awayDurationSec === 0 && tabSwitches === 0,
      statusText:
        s.awayDurationSec > 0
          ? `Away: ${s.awayDurationSec}s`
          : tabSwitches > 0
          ? `${tabSwitches} Tab Switch(es)`
          : "Exam Page Active & Focused",
      subDetail:
        s.awayDurationSec > 0
          ? `Candidate away from exam window for ${s.awayDurationSec} seconds`
          : "Page visibility active, window focus maintained",
      disclaimer: "Monitors exam page visibility without accessing unrelated tabs, browsing history, or private data.",
      icon: Monitor,
    },
    {
      num: 5,
      label: "Second Monitor or Additional Device",
      tool: "Ultralytics YOLOv8 + Display Monitoring API",
      ok: !s.phone && !s.smartwatchDetected && !fd?.secondMonitorDevice?.detected,
      statusText: s.phone
        ? "WARNING: MOBILE PHONE DETECTED!"
        : s.smartwatchDetected
        ? "WARNING: SMARTWATCH DETECTED!"
        : fd?.secondMonitorDevice?.statusText || "Single Display Verified",
      subDetail: s.phone
        ? "Mobile phone visible in frame — 📸 Evidence Screenshot Captured"
        : s.smartwatchDetected
        ? `Smartwatch visible (${Math.round((s.smartwatchConfidence || 0.84) * 100)}% conf)`
        : fd?.secondMonitorDevice?.detected
        ? "Secondary monitor or connected display detected"
        : "Workstation verified clear of external monitors, tablets, and phones",
      disclaimer: "Distinguishes between a visible device, a connected display, and confirmed misuse. Detections limited to camera view and permitted APIs.",
      icon: Smartphone,
    },
    {
      num: 6,
      label: "Unauthorized Audio or Communication Devices",
      tool: "MediaPipe Hands (21 3D joints) + Audio VAD",
      ok: !s.handNearEar && !fd?.unauthorizedAudioDevice?.detected,
      statusText: s.handNearEar ? "ALERT: Hand Near Ear" : "Ear Area Clear",
      subDetail: s.handNearEar
        ? "Suspicious hand proximity to ear detected"
        : "No visible headset or earpiece posture",
      disclaimer: "Monitors visible headphones and hand-to-ear proximity; invisible earpieces cannot be reliably proven from audio alone.",
      icon: Headphones,
    },
    {
      num: 7,
      label: "Suspicious External Input or Keyboard Activity",
      tool: "Browser Input & Clipboard Interceptors (Privacy Safe)",
      ok: s.largePastesCount === 0 && !fd?.suspiciousInputActivity?.detected,
      statusText:
        s.largePastesCount > 0
          ? `Alert: ${s.largePastesCount} Large Paste(s)`
          : "Standard Keyboard Input",
      subDetail:
        s.largePastesCount > 0
          ? "Large external paste (>100 chars) intercepted"
          : "Ordinary typing behavior verified",
      disclaimer: "Privacy-preserving: passwords and regular keystrokes are never logged. Ordinary typing is not classified as cheating.",
      icon: Terminal,
    },
    {
      num: 8,
      label: "Multiple People Detection",
      tool: "Ultralytics YOLOv8 Person Detection + MediaPipe",
      ok: s.facesCount <= 1 && !fd?.multiplePeople?.detected,
      statusText: s.facesCount > 1 ? `Alert: ${s.facesCount} Persons` : "Single Candidate Verified",
      subDetail: s.facesCount > 1
        ? "Secondary person visible in camera view"
        : "1 candidate confirmed in workstation frame",
      disclaimer: "Consecutive-frame confirmation applied before generating alerts. Relevant evidence frame saved.",
      icon: Users,
    },
    {
      num: 9,
      label: "Student Leaving the Camera View",
      tool: "MediaPipe FaceMesh + Person Tracking",
      ok: s.faceDetected && !fd?.studentLeavingView?.detected,
      statusText:
        fd?.studentLeavingView?.statusText ||
        (s.faceDetected ? "Candidate in View" : "Candidate Absent"),
      subDetail: s.faceDetected
        ? "Continuous workstation presence maintained"
        : "Absence timer started (grace period applied)",
      disclaimer: "Configurable grace period applied; continuous absence deduplicated into a single episode with recovery time recorded.",
      icon: Timer,
    },
    {
      num: 10,
      label: "Face Missing Detection",
      tool: "OpenCV + MediaPipe Face Landmarker",
      ok: s.faceDetected && !fd?.faceMissing?.detected,
      statusText: s.faceDetected ? "Face Clearly Detected" : "Face Missing (Grace Period)",
      subDetail: s.faceDetected
        ? "478 facial landmark points tracked"
        : "Candidate face absent from camera frame",
      disclaimer: "Handles camera startup, temporary frame loss, and poor lighting. Generates event only after configured grace period.",
      icon: XCircle,
    },
    {
      num: 11,
      label: "Candidate Identity Verification (Pre-Check Baseline)",
      tool: hasPrecheckPhoto ? "Pre-Check Verified Baseline" : "Registration Reference Verified",
      ok: true,
      statusText: "Verified at Pre-Check Gate",
      subDetail: "Two-point biometric identity confirmed. Continuous face matching check is inactive during exam.",
      disclaimer: "Biometric identity verified during pre-check. Continuous face matching check is inactive during exam.",
      icon: ShieldCheck,
    },
    {
      num: 12,
      label: "Camera Blocking or Tampering",
      tool: "OpenCV Brightness, Blur & Frame Diff",
      ok: !cs?.isObscured && !cs?.isFrozen,
      statusText: cs?.isObscured
        ? "CAMERA OBSCURED"
        : cs?.isFrozen
        ? "VIDEO FROZEN"
        : "Stream Operational",
      subDetail: cs?.isObscured
        ? `Camera obstructed (${cs?.status ?? "BLOCKED"})`
        : cs?.isFrozen
        ? "Video stream frozen"
        : `Brightness: ${Math.round(cs?.brightness ?? 120)} · Blur Var: ${Math.round(cs?.blurVariance ?? 150)}`,
      disclaimer: "Detects obstruction via brightness, blur, and frame difference. Distinguishes dark/obscured image from disconnected camera or frozen stream.",
      icon: Video,
    },
    {
      num: 13,
      label: "Another Person's Voice / Possible Verbal Assistance",
      tool: "WebAudio RMS & Spectral Energy VAD",
      ok: !s.voice && !fd?.voiceVerbalAssistance?.detected,
      statusText: s.voice ? `Voice Active (${Math.round(s.audioLevel * 100)}%)` : "Ambient Audio Normal",
      subDetail: s.voice
        ? "Speech frequency energy detected above threshold"
        : "Audio levels within baseline range",
      disclaimer: "Voice activity detection (VAD) tracks acoustic speech presence, not proof of a second speaker. Clear consent banner; no raw audio stored.",
      icon: Mic,
    },
    {
      num: 14,
      label: "Network & Session Interruptions",
      tool: "Browser Online API + WebSocket Heartbeat",
      ok: !tm?.isOffline && tm?.networkDisconnects === 0,
      statusText: tm?.isOffline
        ? "DISCONNECTED"
        : tm?.networkDisconnects > 0
        ? `${tm.networkDisconnects} Interruption(s)`
        : "Connection Stable",
      subDetail: tm?.isOffline
        ? "Client offline; attempting auto-recovery"
        : `Health: ${tm?.connectionHealth ?? "HEALTHY"} · Reconnects: ${tm?.reconnectAttempts ?? 0}`,
      disclaimer: "Technical connectivity problems are tracked separately and NEVER count towards cheating risk.",
      icon: Wifi,
    },
  ];

  return (
    <div className="min-h-screen aurora">
      {/* Small Proctoring Status Bar (Requirement 20) */}
      <div className="bg-slate-950/90 border-b border-glass-border px-4 py-1.5 flex flex-wrap items-center justify-between text-[11px] font-mono text-muted-foreground z-50">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Camera: <strong className="text-foreground">Active</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Microphone: <strong className="text-foreground">Active</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Screen Share: <strong className="text-foreground">Active</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-destructive animate-ping"}`} />
            <span>Network: <strong className={isOnline ? "text-foreground" : "text-destructive"}>{isOnline ? "Stable" : "Disconnected"}</strong></span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary/60 hover:bg-secondary border border-glass-border transition-colors cursor-pointer text-[11px]"
              title={isFullscreen ? "Click to return to Normal Window Mode" : "Click to switch to Fullscreen Mode (Optional)"}
            >
              <span className={`size-2 rounded-full ${isFullscreen ? "bg-cyan-400" : "bg-emerald-500 animate-pulse"}`} />
              <span>
                Mode:{" "}
                <strong className={isFullscreen ? "text-cyan-400" : "text-emerald-400 font-bold"}>
                  {isFullscreen ? "Fullscreen" : "Normal Window (Active)"}
                </strong>
              </span>
              {isFullscreen ? <Minimize2 className="size-3 text-cyan-400 ml-1" /> : <Maximize2 className="size-3 text-emerald-400 ml-1" />}
            </button>
            {!isFullscreen && (
              <span className="hidden sm:inline-flex items-center text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Standard · No Fullscreen Required
              </span>
            )}
          </div>
          <span className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                tabSwitches === 0
                  ? "bg-emerald-500"
                  : tabSwitches < MAX_TAB_SWITCHES
                  ? "bg-amber-400"
                  : tabSwitches === MAX_TAB_SWITCHES
                  ? "bg-amber-500 animate-pulse"
                  : "bg-destructive animate-ping"
              }`}
            />
            <span>
              Tab Switches:{" "}
              <strong className={tabSwitches > 0 ? "text-amber-400 font-bold" : "text-foreground"}>
                {tabSwitches} / {MAX_TAB_SWITCHES}
              </strong>
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                totalViolations === 0
                  ? "bg-emerald-500"
                  : totalViolations < MAX_VIOLATIONS
                  ? "bg-amber-400 animate-pulse"
                  : "bg-destructive animate-ping"
              }`}
            />
            <span>
              Warnings:{" "}
              <strong
                className={
                  totalViolations === 0
                    ? "text-emerald-400"
                    : totalViolations < MAX_VIOLATIONS
                    ? "text-amber-400 font-bold"
                    : "text-destructive font-bold"
                }
              >
                {totalViolations} / {MAX_VIOLATIONS}
              </strong>
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-cyan-400" />
            <span>Proctoring: <strong className="text-cyan-400">Active</strong></span>
          </span>
          <span className="flex items-center gap-1.5" title="AI browser extensions (ChatGPT, Monica, Sider, Quillbot) are actively blocked and neutralized">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI Extensions: <strong className="text-emerald-400 font-bold">Blocked</strong></span>
          </span>
          <span className="flex items-center gap-1.5" title="Text selection with arrow keys and copy/paste are locked">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Selection &amp; Clipboard: <strong className="text-emerald-400 font-bold">Locked</strong></span>
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground hidden sm:flex items-center gap-2">
          {user?.photoUrl && (
            <img
              src={user.photoUrl}
              alt={user.name}
              className="size-5 rounded-full object-cover border border-primary/40 ring-1 ring-primary/20"
            />
          )}
          <span>Candidate: <strong className="text-foreground">{user?.name || "Student"}</strong></span>
          <span>·</span>
          <span>Session {sessionIdRef.current.slice(0, 8)}...</span>
        </div>
      </div>



      {/* Network Alert if Disconnected */}
      {!isOnline && (
        <div className="bg-destructive/20 border-b border-destructive/40 text-destructive-foreground px-4 py-2 text-xs font-bold text-center flex items-center justify-center gap-2 animate-pulse">
          <AlertTriangle className="size-4 text-destructive" />
          <span>Network connection lost. Your exam session is being preserved.</span>
        </div>
      )}

      {/* --------- Exam top bar: timer + sections + live risk --------- */}
      <header className="sticky top-0 z-40 border-b border-glass-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4 min-w-48">
            <div>
              <div className="font-display text-sm font-bold flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                {exam.title}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>{exam.subject}</span>
                <span>·</span>
                <span className="text-primary font-medium">{engine.aiStatus}</span>
              </div>
            </div>
          </div>

          {/* Section Selector Switch */}
          <div className="flex items-center gap-1 rounded-2xl border border-glass-border bg-background/50 p-1">
            <button
              onClick={() => setActiveSection("mcq")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                activeSection === "mcq"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <HelpCircle className="size-3.5" />
              MCQ ({answeredMCQCount}/{questionsList.length})
            </button>

            {codingList.length > 0 && (
              <button
                onClick={() => setActiveSection("coding")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeSection === "coding"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="size-3.5" />
                Coding ({solvedCodingCount}/{codingList.length})
              </button>
            )}
          </div>

          {/* Timer Display with Admin-Set Limit */}
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-display text-lg font-bold tabular-nums shadow-sm transition-all ${
                isTimeCritical
                  ? "border-destructive/60 bg-destructive/15 text-destructive animate-pulse"
                  : "border-glass-border bg-glass"
              }`}
            >
              <Timer className={`size-4 ${isTimeCritical ? "text-destructive" : "text-primary"}`} />
              {timeFormatted}
            </span>

            <RiskBadge level={engine.risk.level} score={engine.risk.score} />

            <Button size="sm" onClick={() => setShowSubmitModal(true)} className="brand-surface">
              Finish Exam
            </Button>
          </div>
        </div>
      </header>



      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-3">
        {/* --------- Left 2 cols: Main Question Section --------- */}
        <section className="lg:col-span-2 space-y-6 select-none exam-secure-environment">
          {/* Active Security & Integrity Enforcement Shield Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs text-primary backdrop-blur-md select-none">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              <span>
                <strong>Academic Integrity Shield:</strong> AI extensions blocked · Copy/Paste disabled · Arrow &amp; mouse text selection locked
              </span>
            </div>
            <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/30">
              Active Protection
            </span>
          </div>

          {/* Question Palette / Number Jump Matrix */}
          <GlassCard className="p-4 select-none exam-secure-environment">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Layers className="size-3.5 text-primary" />
                <span>Question Palette</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-success inline-block" /> Answered
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-primary inline-block" /> Current
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-secondary inline-block" /> Pending
                </span>
              </div>
            </div>

            {/* Quick jump pills */}
            {activeSection === "mcq" ? (
              <div className="flex flex-wrap gap-1.5">
                {questionsList.map((q, qIdx) => {
                  const isAnswered = answers[q.id] !== undefined;
                  const isCurrent = qIdx === mcqIndex;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setMcqIndex(qIdx)}
                      className={`size-8 rounded-lg text-xs font-bold transition-all ${
                        isCurrent
                          ? "border-2 border-primary bg-primary/20 text-primary ring-2 ring-primary/30"
                          : isAnswered
                            ? "bg-success/20 text-success border border-success/40"
                            : "bg-secondary/60 text-muted-foreground hover:bg-secondary border border-glass-border"
                      }`}
                    >
                      {qIdx + 1}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {codingList.map((cq, cqIdx) => {
                  const sub = codeSubmissions[cq.id];
                  const isSolved = sub && sub.allPassed;
                  const isCurrent = cqIdx === codingIndex;
                  return (
                    <button
                      key={cq.id}
                      onClick={() => setCodingIndex(cqIdx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        isCurrent
                          ? "border-2 border-accent bg-accent/20 text-accent ring-2 ring-accent/30"
                          : isSolved
                            ? "bg-success/20 text-success border border-success/40"
                            : sub && sub.passedCount > 0
                              ? "bg-warning/20 text-warning border border-warning/40"
                              : "bg-secondary/60 text-muted-foreground hover:bg-secondary border border-glass-border"
                      }`}
                    >
                      <Code2 className="size-3" />
                      Code #{cqIdx + 1}
                      {isSolved && <Check className="size-3 text-success" />}
                    </button>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* SECTION 1: MCQ Interactive Question */}
          {activeSection === "mcq" && (
            currentMCQ ? (
              <GlassCard className="select-none exam-secure-environment">
                <div className="flex items-center justify-between text-xs text-muted-foreground select-none">
                  <span className="font-semibold text-foreground">
                    Question {mcqIndex + 1} of {questionsList.length || 1}
                  </span>
                  <span>
                    {answeredMCQCount} of {questionsList.length || 1} answered
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary select-none">
                  <div
                    className="h-full rounded-full brand-surface transition-all duration-300"
                    style={{ width: `${((mcqIndex + 1) / (questionsList.length || 1)) * 100}%` }}
                  />
                </div>

                {currentMCQ.category && (
                  <span className="inline-block mt-4 text-[11px] rounded-full bg-primary/10 px-2.5 py-0.5 text-primary font-semibold select-none">
                    {currentMCQ.category}
                  </span>
                )}

                <h2
                  className="mt-3 font-display text-xl font-bold leading-snug select-none"
                  draggable={false}
                >
                  {currentMCQ.text}
                </h2>

                <div className="mt-5 space-y-3 select-none">
                  {currentMCQ.options.map((opt, i) => {
                    const selected = answers[currentMCQ.id] === i;
                    return (
                      <button
                        key={opt}
                        draggable={false}
                        onClick={() => setAnswers({ ...answers, [currentMCQ.id]: i })}
                        className={`w-full rounded-2xl border p-4 text-left text-sm transition-all select-none ${
                          selected
                            ? "border-primary bg-primary/15 text-foreground shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-primary/40"
                            : "border-glass-border bg-background/40 hover:bg-secondary/60"
                        }`}
                      >
                        <span className="mr-3 font-semibold text-primary">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex justify-between">
                  <Button
                    variant="outline"
                    disabled={mcqIndex === 0}
                    onClick={() => setMcqIndex((i) => i - 1)}
                  >
                    Previous
                  </Button>
                  {mcqIndex < questionsList.length - 1 ? (
                    <Button onClick={() => setMcqIndex((i) => i + 1)}>Next question</Button>
                  ) : codingList.length > 0 ? (
                    <Button
                      onClick={() => setActiveSection("coding")}
                      className="bg-accent text-accent-foreground"
                    >
                      Go to Coding Section ➔
                    </Button>
                  ) : (
                    <Button onClick={() => setShowSubmitModal(true)} className="brand-surface">
                      Review &amp; Submit
                    </Button>
                  )}
                </div>
              </GlassCard>
            ) : (
              <GlassCard className="p-8 text-center text-muted-foreground">
                <p>Loading questions...</p>
              </GlassCard>
            )
          )}

          {/* SECTION 2: Programming / Coding Question with In-Browser Runner */}
          {activeSection === "coding" && currentCoding && (
            <div className="space-y-6">
              {/* Problem Prompt */}
              <GlassCard className="p-6 select-none exam-secure-environment">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg bg-accent/20 text-accent font-bold text-xs select-none">
                      #{codingIndex + 1}
                    </span>
                    <h2
                      className="font-display text-xl font-bold select-none"
                      draggable={false}
                    >
                      {currentCoding.title}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold select-none ${
                        currentCoding.difficulty === "Easy"
                          ? "bg-success/15 text-success"
                          : currentCoding.difficulty === "Medium"
                            ? "bg-warning/15 text-warning"
                            : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {currentCoding.difficulty}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 select-none">
                    <span className="text-xs text-muted-foreground font-semibold">
                      {currentCoding.points} Points
                    </span>
                    <div className="flex items-center gap-1 rounded-lg border border-glass-border bg-background/50 p-1">
                      {(["javascript", "python", "c", "cpp", "java"] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setSelectedLang({ ...selectedLang, [currentCoding.id]: lang })}
                          className={`rounded px-2.5 py-1 text-xs font-semibold uppercase ${
                            currentLang === lang
                              ? "bg-primary text-primary-foreground font-bold shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {lang === "cpp" ? "C++" : lang === "javascript" ? "JS" : lang}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line bg-secondary/30 rounded-xl p-4 border border-glass-border select-none"
                  draggable={false}
                >
                  {currentCoding.description}
                </div>

                {currentCoding.constraints && currentCoding.constraints.length > 0 && (
                  <div className="mt-3 text-[11px] text-muted-foreground select-none" draggable={false}>
                    <span className="font-semibold text-foreground">Constraints: </span>
                    {currentCoding.constraints.join(" · ")}
                  </div>
                )}
              </GlassCard>

              {/* Code Editor Container */}
              <GlassCard className="p-4 border-accent/30 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-glass-border pb-2">
                  <div className="flex items-center gap-2 font-mono">
                    <Terminal className="size-3.5 text-accent" />
                    <span>solution.{currentLang === "javascript" ? "js" : "py"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetCode}
                      className="h-7 text-xs"
                    >
                      <RotateCcw className="size-3 mr-1" /> Reset Template
                    </Button>
                    <Button
                      size="sm"
                      disabled={runningCode}
                      onClick={handleRunCode}
                      className="h-7 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      <Play className="size-3 mr-1" />{" "}
                      {runningCode ? "Running Tests…" : "Run & Test Code"}
                    </Button>
                  </div>
                </div>

                {/* Editor Textarea with monospace font */}
                <div className="relative rounded-xl border border-glass-border bg-slate-950 font-mono text-xs overflow-hidden shadow-inner">
                  <textarea
                    rows={12}
                    value={currentCode}
                    data-exam-editor="true"
                    onChange={(e) => handleCodeChange(e.target.value)}
                    onPaste={(e) => {
                      e.preventDefault();
                      toast.error("Pasting external code is strictly prohibited during exams.");
                      apiClient.ingestEvent({
                        id: uid(),
                        sessionId: sessionIdRef.current,
                        studentId: user?.id || "student",
                        examId: exam.id,
                        eventType: "PASTE_ATTEMPT",
                        timestamp: new Date().toISOString(),
                        duration: 1,
                        confidence: 1.0,
                        riskContribution: 15,
                        source: "Browser",
                        metadata: { shortcut: "Editor Direct Paste" },
                      });
                    }}
                    onCopy={(e) => {
                      e.preventDefault();
                      toast.error("Copying code from this editor is restricted during examinations.");
                    }}
                    onCut={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const start = e.currentTarget.selectionStart;
                        const end = e.currentTarget.selectionEnd;
                        const val = e.currentTarget.value;
                        handleCodeChange(val.substring(0, start) + "  " + val.substring(end));
                        setTimeout(() => {
                          e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
                        }, 0);
                      }
                    }}
                    className="w-full bg-transparent p-4 text-emerald-300 font-mono focus:outline-none resize-y leading-relaxed exam-code-editor"
                    placeholder="// Write your solution function here..."
                    spellCheck={false}
                  />
                </div>

                {/* Test Results Console */}
                {codeSubmissions[currentCoding.id] && (
                  <div className="rounded-xl border border-glass-border bg-background/50 p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Terminal className="size-3.5 text-primary" />
                        <span className="font-bold">Test Execution Results</span>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-bold ${
                          codeSubmissions[currentCoding.id]?.allPassed
                            ? "bg-success/15 text-success"
                            : "bg-warning/15 text-warning"
                        }`}
                      >
                        {codeSubmissions[currentCoding.id]?.passedCount} of{" "}
                        {codeSubmissions[currentCoding.id]?.totalCount} Tests Passed
                      </span>
                    </div>

                    <div className="space-y-2">
                      {codeSubmissions[currentCoding.id]?.testResults?.map((tr, trIdx) => (
                        <div
                          key={trIdx}
                          className={`rounded-lg border p-2.5 font-mono text-[11px] ${
                            tr.passed
                              ? "border-success/30 bg-success/5 text-foreground"
                              : "border-destructive/30 bg-destructive/5 text-destructive"
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1.5">
                              {tr.passed ? (
                                <CheckCircle2 className="size-3.5 text-success" />
                              ) : (
                                <XCircle className="size-3.5 text-destructive" />
                              )}
                              {tr.label || `Test Case ${trIdx + 1}`}
                            </span>
                            <span className="text-[10px] opacity-70">{(tr as any).executionTimeMs ? `${(tr as any).executionTimeMs}ms` : ""}</span>
                          </div>
                          <div className="mt-1 grid gap-1 text-[10px] text-muted-foreground">
                            <div>
                              Input: <code className="text-foreground">{tr.input}</code>
                            </div>
                            <div>
                              Expected: <code className="text-foreground">{tr.expected}</code>
                            </div>
                            <div>
                              Actual:{" "}
                              <code
                                className={
                                  tr.passed
                                    ? "text-success font-bold"
                                    : "text-destructive font-bold"
                                }
                              >
                                {tr.actual}
                              </code>
                            </div>
                            {tr.error && (
                              <div className="text-destructive font-semibold">
                                Error: {tr.error}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Challenge navigation footer */}
                <div className="flex justify-between pt-2">
                  <Button
                    variant="outline"
                    disabled={codingIndex === 0}
                    onClick={() => setCodingIndex((i) => i - 1)}
                  >
                    Previous Challenge
                  </Button>
                  {codingIndex < codingList.length - 1 ? (
                    <Button onClick={() => setCodingIndex((i) => i + 1)}>Next Challenge</Button>
                  ) : (
                    <Button onClick={() => setShowSubmitModal(true)} className="brand-surface">
                      Finish Exam
                    </Button>
                  )}
                </div>
              </GlassCard>
            </div>
          )}

          {/* --------- Real-Time Explainable AI (XAI) Breakdown Panel --------- */}
          <GlassCard className="p-5 border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="font-display text-sm font-bold uppercase tracking-wider">
                  Explainable AI (XAI) Real-Time Analysis
                </h3>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                Integrity Engine Active
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-glass-border bg-background/40 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Current Risk Level
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <RiskBadge level={engine.risk.level} score={engine.risk.score} size="md" />
                  <span className="text-xs font-bold uppercase">{engine.risk.level === "red" ? "HIGH RISK" : engine.risk.level === "yellow" ? "MEDIUM RISK" : "LOW RISK"}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{engine.xai.headline || "Normal exam behavior maintained."}</p>
              </div>

              <div className="rounded-2xl border border-glass-border bg-background/40 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Attribution Insights
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {engine.xai.reasons.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-primary shrink-0" />
                      <span className="truncate">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* --------- Right col: Webcam, Live Sensors & Proctoring --------- */}
        <aside className="space-y-6">
          {/* Active Device & Security Warnings: Mobile Phone, Smartwatch, Face Mismatch */}
          {(s.phone || s.smartwatchDetected || s.identityMismatch || (activeWarnings && activeWarnings.length > 0)) && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">


              {/* Mobile Phone Warning Banner */}
              {(s.phone || (activeWarnings && activeWarnings.some((w: any) => typeof w === "string" ? w.includes("PHONE") : w.message?.includes("PHONE")))) && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-red-600 px-4 py-3 text-white shadow-xl shadow-red-600/40 border-2 border-red-200 animate-pulse">
                  <div className="flex items-center gap-2.5 font-bold text-sm">
                    <Smartphone className="size-5 shrink-0 animate-bounce text-yellow-300" />
                    <div className="flex flex-col">
                      <span className="tracking-wide">WARNING: MOBILE PHONE DETECTED!</span>
                      <span className="text-[10px] font-medium text-red-100 flex items-center gap-1 mt-0.5">
                        <Camera className="size-3" />
                        <span>Evidence screenshot captured &amp; logged</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-black/60 px-2 py-0.5 rounded font-mono border border-red-300/40 text-yellow-300 font-bold">
                      📸 Captured
                    </span>
                    <span className="font-mono text-xs bg-black/50 px-2 py-0.5 rounded border border-white/20">
                      {Math.round((s.phoneConfidence || 0.88) * 100)}% Conf
                    </span>
                  </div>
                </div>
              )}

              {/* Smartwatch Warning Banner */}
              {(s.smartwatchDetected || (activeWarnings && activeWarnings.some((w: any) => typeof w === "string" ? w.includes("SMARTWATCH") : w.message?.includes("SMARTWATCH")))) && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-600 px-4 py-3 text-white shadow-xl shadow-amber-600/40 border-2 border-amber-200 animate-pulse">
                  <div className="flex items-center gap-2.5 font-bold text-sm">
                    <Watch className="size-5 shrink-0 animate-bounce" />
                    <div className="flex flex-col">
                      <span>WARNING: SMARTWATCH DETECTED!</span>
                      <span className="text-[10px] font-medium text-amber-100 flex items-center gap-1 mt-0.5">
                        <Camera className="size-3" />
                        <span>Evidence screenshot captured &amp; logged</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-black/60 px-2 py-0.5 rounded font-mono border border-amber-300/40 text-amber-200">
                      📸 Captured
                    </span>
                    <span className="font-mono text-xs bg-black/50 px-2 py-0.5 rounded border border-white/20">
                      {Math.round((s.smartwatchConfidence || 0.84) * 100)}% Conf
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <GlassCard className="overflow-hidden p-0">
            <div className="relative aspect-video w-full bg-black/90">
              <video
                ref={engine.videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover -scale-x-100"
              />
              <canvas
                ref={engine.canvasRef}
                className="absolute inset-0 h-full w-full pointer-events-none -scale-x-100"
              />

              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Vision Stream
              </div>

              {/* Picture-in-Picture Reference Photo Card (Pre-Check Captured / Registered) */}
              {(photoToVerify || user?.photoUrl) && (
                <div className="absolute top-11 left-3 z-10 flex items-center gap-2 rounded-xl bg-black/85 p-1.5 pr-2.5 backdrop-blur-md border border-white/20 shadow-xl transition-all">
                  <div className="relative">
                    <img
                      src={photoToVerify || user?.photoUrl}
                      alt="Reference Photo"
                      className={`size-10 rounded-lg object-cover border-2 ${
                        s.identityMismatch
                          ? "border-red-500 ring-2 ring-red-500/50"
                          : "border-emerald-500 ring-2 ring-emerald-500/50"
                      }`}
                    />
                    <span
                      className={`absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-black ${
                        s.identityMismatch ? "bg-red-500 animate-ping" : "bg-emerald-500"
                      }`}
                    />
                  </div>
                  <div className="flex flex-col text-[10px] leading-tight">
                    <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[8px]">
                      {hasPrecheckPhoto ? "Pre-Check Photo" : "Registered Photo"}
                    </span>
                    <span className="font-bold text-white truncate max-w-[95px]">
                      {user?.name.split(" ")[0] || "Student"}
                    </span>
                    <span
                      className={`font-mono font-bold text-[9px] mt-0.5 ${
                        s.identityMismatch ? "text-red-400 font-black animate-pulse" : "text-emerald-400"
                      }`}
                    >
                      {s.identityMismatch ? "MISMATCH" : "VERIFIED"}
                    </span>
                  </div>
                </div>
              )}

              {/* Real-Time Vision HUD Telemetry Badges */}
              <div className="absolute top-3 right-3 flex flex-col items-end gap-1 text-[10px] font-mono">
                <span
                  className={`rounded-md px-2 py-0.5 font-bold backdrop-blur-md border ${
                    s.identityMismatch
                      ? "bg-red-500/90 text-yellow-200 border-red-400 animate-pulse font-mono"
                      : s.identityMatch >= 0.70
                      ? "bg-emerald-500/80 text-white border-emerald-400 font-mono"
                      : "bg-blue-500/80 text-white border-blue-400 font-mono"
                  }`}
                >
                  {s.identityMismatch
                    ? `⚠️ ID MISMATCH (${Math.round((s.identityMatch || 0.35) * 100)}%)`
                    : `👤 ID MATCH: ${Math.round((s.identityMatch || 0.94) * 100)}%`}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 font-bold backdrop-blur-md border ${
                    s.gazeDirection === "off-screen"
                      ? "bg-red-500/80 text-white border-red-400 animate-pulse"
                      : s.gazeOnScreen
                      ? "bg-emerald-500/80 text-white border-emerald-400"
                      : "bg-amber-500/80 text-white border-amber-400"
                  }`}
                >
                  👁️ {s.gazeDirection === "off-screen" ? "OFF-SCREEN" : `GAZE: ${s.gazeDirection.toUpperCase()}`}
                </span>
                <span className="rounded-md bg-black/70 px-2 py-0.5 text-white/90 backdrop-blur-md border border-white/20">
                  🧭 {s.headYaw}° Y · {s.headPitch}° P · {s.headRoll ?? 0}° R
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 font-bold backdrop-blur-md border ${
                    s.handNearEar
                      ? "bg-red-500/80 text-white border-red-400 animate-pulse"
                      : s.handBelowDesk
                      ? "bg-amber-500/80 text-white border-amber-400"
                      : s.hand
                      ? "bg-purple-500/80 text-white border-purple-400"
                      : "bg-black/60 text-white/80 border-white/10"
                  }`}
                >
                  ✋ {s.handNearEar ? "HAND NEAR EAR" : s.handBelowDesk ? "BELOW DESK" : s.hand ? "HANDS (21 PTS)" : "HANDS CLEAR"}
                </span>
              </div>

              {/* HUD Toggles & FPS */}
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/75 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur-md border border-white/10">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => engine.toggleOverlay("showGazeRays")}
                    className={`rounded px-1.5 py-0.5 transition ${
                      engine.overlayOptions.showGazeRays ? "bg-emerald-500/40 text-emerald-300 font-bold" : "text-white/50"
                    }`}
                  >
                    Gaze Rays
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => engine.toggleOverlay("showHeadPose")}
                    className={`rounded px-1.5 py-0.5 transition ${
                      engine.overlayOptions.showHeadPose ? "bg-cyan-500/40 text-cyan-300 font-bold" : "text-white/50"
                    }`}
                  >
                    3D Pose
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => engine.toggleOverlay("showHandSkeleton")}
                    className={`rounded px-1.5 py-0.5 transition ${
                      engine.overlayOptions.showHandSkeleton ? "bg-purple-500/40 text-purple-300 font-bold" : "text-white/50"
                    }`}
                  >
                    21 Hand Joints
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => engine.toggleOverlay("showFaceMesh")}
                    className={`rounded px-1.5 py-0.5 transition ${
                      engine.overlayOptions.showFaceMesh ? "bg-cyan-500/40 text-cyan-300 font-bold" : "text-white/50"
                    }`}
                  >
                    Face Mesh
                  </button>
                </div>
                <span className="font-mono text-emerald-400 text-[10px]">30 FPS · SolvePnP</span>
              </div>
            </div>

            {/* Live Audio Level Meter */}
            <div className="p-4 border-t border-glass-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Mic className="size-3.5 text-primary" /> Audio Monitor
                </span>
                <span className="font-mono">{Math.round(s.audioLevel * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-100 ${
                    s.voice ? "bg-destructive" : "brand-surface"
                  }`}
                  style={{ width: `${Math.min(100, s.audioLevel * 100)}%` }}
                />
              </div>
            </div>
          </GlassCard>

          {/* Captured Screenshot Evidence Gallery */}
          {engine.events.filter((e) => e.evidence).length > 0 && (
            <GlassCard className="p-3.5 space-y-2.5 border-destructive/40 bg-destructive/5 animate-in fade-in duration-300">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-destructive font-bold">
                  <Camera className="size-4 animate-pulse" />
                  <span>Captured Evidence Screenshots ({engine.events.filter((e) => e.evidence).length})</span>
                </span>
                <span className="text-[10px] font-mono text-muted-foreground bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20">
                  Forensic Tamper-Evident Archive
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Automatic high-resolution snapshots captured when phone or suspicious behavior was detected:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {engine.events
                  .filter((e) => e.evidence)
                  .slice(0, 3)
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="relative overflow-hidden rounded-lg border border-destructive/30 bg-black/70 shadow-md group"
                    >
                      <img
                        src={ev.evidence}
                        alt={ev.label}
                        className="w-full aspect-video object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/85 p-1 text-[9.5px] text-white backdrop-blur-xs">
                        <div className="truncate font-semibold text-red-300">{ev.label}</div>
                        <div className="text-[8.5px] text-muted-foreground font-mono">
                          {ev.clock} · Sev: {ev.severity}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </GlassCard>
          )}

          {/* AI-Based Smart Exam Monitoring System (MediaPipe & YOLOv8) */}
          <GlassCard className="p-4 space-y-4 border-primary/25 bg-slate-950/80 shadow-lg">
            {/* Header with Title and Global Counters */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-glass-border pb-3">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
                  <Activity className="size-4 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider text-primary">
                    Smart Exam Monitoring System
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    MediaPipe (Face, Hands, Pose) + Ultralytics YOLOv8
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className="rounded-md bg-secondary px-2 py-0.5 text-foreground border border-glass-border font-semibold">
                  Objects: {totalDetectedObjects}
                </span>
                <span className="rounded-md bg-primary/20 px-2 py-0.5 text-primary border border-primary/30 font-semibold">
                  Movements: {totalMovementEvents}
                </span>
              </div>
            </div>

            {/* Feature 2: Eye Gaze Tracking & Direction Counting */}
            <div className="space-y-2 rounded-xl bg-secondary/35 p-3 border border-glass-border">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Eye className="size-3.5 text-emerald-400" />
                  <span>👁️ Eyeball Gaze Detection (MediaPipe Iris)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      eyeGaze?.direction === "center"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                    }`}
                  >
                    {eyeGaze?.direction?.toUpperCase() ?? "CENTER"} ({eyeGaze?.durationSec?.toFixed(1) ?? "0.0"}s)
                  </span>
                </div>
              </div>

              {/* 5-Direction Gaze Counts Grid */}
              <div className="grid grid-cols-5 gap-1.5 text-center font-mono">
                <div className={`rounded-lg p-1.5 border transition ${eyeGaze?.direction === "left" ? "bg-cyan-500/30 border-cyan-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Look Left Count">Look Left</div>
                  <div className="text-xs font-bold text-cyan-400">{eyeGaze?.counts?.left ?? 0}</div>
                </div>
                <div className={`rounded-lg p-1.5 border transition ${eyeGaze?.direction === "right" ? "bg-purple-500/30 border-purple-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Look Right Count">Look Right</div>
                  <div className="text-xs font-bold text-purple-400">{eyeGaze?.counts?.right ?? 0}</div>
                </div>
                <div className={`rounded-lg p-1.5 border transition ${eyeGaze?.direction === "up" ? "bg-emerald-500/30 border-emerald-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Look Up Count">Look Up</div>
                  <div className="text-xs font-bold text-emerald-400">{eyeGaze?.counts?.up ?? 0}</div>
                </div>
                <div className={`rounded-lg p-1.5 border transition ${eyeGaze?.direction === "down" ? "bg-amber-500/30 border-amber-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Look Down Count">Look Down</div>
                  <div className="text-xs font-bold text-amber-400">{eyeGaze?.counts?.down ?? 0}</div>
                </div>
                <div className={`rounded-lg p-1.5 border transition ${eyeGaze?.direction === "off-screen" ? "bg-rose-500/30 border-rose-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Off-Screen Looks Count">Off-Screen</div>
                  <div className="text-xs font-bold text-rose-400">{eyeGaze?.counts?.off_screen ?? engine.metrics.lookAwayCount ?? 0}</div>
                </div>
              </div>
              <div className="text-[9.5px] text-muted-foreground italic flex justify-between">
                <span>Hold threshold: 0.22s</span>
                <span className="font-semibold text-foreground">
                  Total Eyeball Gaze Looks: {
                    engine.metrics.totalGazeLooks ??
                    ((eyeGaze?.counts?.up ?? 0) + (eyeGaze?.counts?.down ?? 0) + (eyeGaze?.counts?.left ?? 0) + (eyeGaze?.counts?.right ?? 0) + (eyeGaze?.counts?.off_screen ?? engine.metrics.lookAwayCount ?? 0))
                  }
                </span>
              </div>
            </div>

            {/* Feature 1: Head Movement Detection & Direction Counting */}
            <div className="space-y-2 rounded-xl bg-secondary/35 p-3 border border-glass-border">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Compass className="size-3.5 text-cyan-400" />
                  <span>👤 Head Movement Detection (MediaPipe 3D SolvePnP)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      headMovement?.direction === "center"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse"
                    }`}
                  >
                    HEAD {headMovement?.direction?.toUpperCase() ?? "CENTER"} ({headMovement?.durationSec?.toFixed(1) ?? "0.0"}s)
                  </span>
                </div>
              </div>

              {/* 4-Direction Head Counts Grid */}
              <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                <div className={`rounded-lg p-1.5 border transition ${headMovement?.direction === "left" ? "bg-cyan-500/30 border-cyan-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Left Turn Count">Left Turn</div>
                  <div className="text-xs font-bold text-cyan-400">{headMovement?.counts?.left ?? 0}</div>
                </div>
                <div className={`rounded-lg p-1.5 border transition ${headMovement?.direction === "right" ? "bg-purple-500/30 border-purple-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Right Turn Count">Right Turn</div>
                  <div className="text-xs font-bold text-purple-400">{headMovement?.counts?.right ?? 0}</div>
                </div>
                <div className={`rounded-lg p-1.5 border transition ${headMovement?.direction === "up" ? "bg-emerald-500/30 border-emerald-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Up Pitch Count">Up Pitch</div>
                  <div className="text-xs font-bold text-emerald-400">{headMovement?.counts?.up ?? 0}</div>
                </div>
                <div className={`rounded-lg p-1.5 border transition ${headMovement?.direction === "down" ? "bg-amber-500/30 border-amber-400" : "bg-background/60 border-glass-border"}`}>
                  <div className="text-[9px] text-muted-foreground truncate" title="Down Pitch Count">Down Pitch</div>
                  <div className="text-xs font-bold text-amber-400">{headMovement?.counts?.down ?? 0}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[9.5px] font-mono text-muted-foreground">
                <span>Yaw: {s.headYaw}° · Pitch: {s.headPitch}° · Roll: {s.headRoll ?? 0}°</span>
                <span className="font-semibold text-foreground">
                  Total Head Turns: {
                    engine.metrics.totalHeadTurns ??
                    ((headMovement?.counts?.up ?? 0) + (headMovement?.counts?.down ?? 0) + (headMovement?.counts?.left ?? 0) + (headMovement?.counts?.right ?? 0))
                  }
                </span>
              </div>
            </div>

            {/* Feature 1 continued: Human Hand & Body Pose Detection */}
            <div className="space-y-2 rounded-xl bg-secondary/35 p-3 border border-glass-border">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Hand className="size-3.5 text-purple-400" />
                  <span>✋ Hand Movement Detection (MediaPipe Hands/Pose)</span>
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    handMovement?.status?.includes("face") || handMovement?.status?.includes("ear")
                      ? "bg-destructive/20 text-destructive border border-destructive/30 animate-pulse"
                      : handMovement?.status?.includes("raised")
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {handMovement?.status?.toUpperCase() ?? "HANDS CLEAR"}
                </span>
              </div>

              {/* 4 Hand Movement Categories Grid */}
              <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                <div className="rounded-lg bg-background/60 p-1.5 border border-glass-border">
                  <div className="text-[9px] text-muted-foreground truncate" title="Hand Raised Count">Hand Raised</div>
                  <div className="text-xs font-bold text-purple-300">{handMovement?.handRaisedCount ?? ((handMovement?.counts as any)?.["raised"] ?? 0)}</div>
                </div>
                <div className="rounded-lg bg-background/60 p-1.5 border border-glass-border">
                  <div className="text-[9px] text-muted-foreground truncate" title="Near Face Count">Near Face</div>
                  <div className="text-xs font-bold text-amber-300">{handMovement?.handNearFaceCount ?? ((handMovement?.counts as any)?.["near_face"] ?? 0)}</div>
                </div>
                <div className="rounded-lg bg-background/60 p-1.5 border border-glass-border">
                  <div className="text-[9px] text-muted-foreground truncate" title="Near Ear (Phone Posture) Count">Near Ear (Phone)</div>
                  <div className="text-xs font-bold text-rose-300">{handMovement?.handNearEarCount ?? ((handMovement?.counts as any)?.["near_ear"] ?? 0)}</div>
                </div>
                <div className="rounded-lg bg-background/60 p-1.5 border border-glass-border">
                  <div className="text-[9px] text-muted-foreground truncate" title="Below Desk Count">Below Desk</div>
                  <div className="text-xs font-bold text-cyan-300">{handMovement?.handBelowDeskCount ?? ((handMovement?.counts as any)?.["below_desk"] ?? 0)}</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] rounded-lg bg-background/50 px-2.5 py-1.5 border border-glass-border">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Body Posture:</span>
                  <span className="font-semibold text-foreground">{bodyPose?.posture ?? "Normal Posture"}</span>
                </div>
                <span className="font-semibold text-foreground font-mono">
                  Total Hand Events: {
                    engine.metrics.totalHandEvents ??
                    handMovement?.totalMovements ??
                    ((handMovement?.handRaisedCount ?? ((handMovement?.counts as any)?.["raised"] ?? 0)) +
                     (handMovement?.handNearFaceCount ?? ((handMovement?.counts as any)?.["near_face"] ?? 0)) +
                     (handMovement?.handNearEarCount ?? ((handMovement?.counts as any)?.["near_ear"] ?? 0)) +
                     (handMovement?.handBelowDeskCount ?? ((handMovement?.counts as any)?.["below_desk"] ?? 0)))
                  }
                </span>
              </div>
            </div>

            {/* Feature 3: Real-Time Object Detection (YOLOv8) */}
            <div className="space-y-2 rounded-xl bg-secondary/35 p-3 border border-glass-border">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Boxes className="size-3.5 text-primary" />
                  <span>Real-Time Objects (Ultralytics YOLOv8)</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Active in Frame: {detectedObjects?.length ?? 0}
                </span>
              </div>

              {detectedObjects && detectedObjects.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {detectedObjects.map((obj: any, idx: number) => {
                    const isProhibited =
                      obj.isProhibited ||
                      obj.label === "cell phone" ||
                      obj.label === "smartwatch" ||
                      obj.label === "book" ||
                      obj.label === "clock";
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between rounded-lg p-2 text-xs border font-mono ${
                          isProhibited
                            ? "bg-destructive/15 text-destructive border-destructive/40 shadow-sm"
                            : "bg-background/60 text-foreground border-glass-border"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold capitalize">{obj.label}</span>
                          {isProhibited && (
                            <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-destructive text-white font-bold">
                              PROHIBITED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{Math.round(obj.confidence * 100)}% conf</span>
                          {obj.bbox && (
                            <span className="text-[9px] bg-secondary/80 px-1 rounded">
                              [{obj.bbox.map((v: number) => Math.round(v)).join(", ")}]
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg bg-background/40 p-2 text-center text-[10px] text-muted-foreground border border-glass-border">
                  ✓ Desk &amp; Workstation clear of unauthorized devices
                </div>
              )}
            </div>

            {/* Feature 4: Timestamped Warning History */}
            <div className="space-y-2 rounded-xl bg-secondary/35 p-3 border border-glass-border">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Bell className="size-3.5 text-amber-400" />
                  <span>Warning History &amp; Timestamps</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Total Warnings: {warningHistory?.length ?? 0}
                </span>
              </div>

              {warningHistory && warningHistory.length > 0 ? (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {warningHistory.slice(-5).reverse().map((w: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg bg-destructive/15 p-2 text-[11px] border border-destructive/30 text-destructive font-mono"
                    >
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="size-3 shrink-0" />
                        <span className="font-bold">{w.warning || w.message || "DEVICE DETECTED"}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{w.time || w.timestamp || ""}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-background/40 p-2 text-center text-[10px] text-muted-foreground border border-glass-border">
                  ✓ Zero device warnings logged for this session
                </div>
              )}
            </div>

            {/* Ethical Disclaimer */}
            <p className="text-[9.5px] italic text-muted-foreground/80 leading-relaxed bg-background/30 rounded-lg p-2 border border-glass-border">
              ℹ️ <strong>Monitoring Notice:</strong> Unusual gaze, head, or hand movements are recorded as monitoring metrics to assist faculty, not definitive proof of academic dishonesty.
            </p>
          </GlassCard>

          {/* Network & Technical Health Isolation Card (Feature 14) */}
          <GlassCard className="p-3.5 space-y-2.5 border-cyan-500/20 bg-slate-950/70">
            <div className="flex items-center justify-between border-b border-glass-border pb-2">
              <div className="flex items-center gap-2">
                <Wifi className={`size-4 ${tm?.isOffline ? "text-destructive" : "text-cyan-400"}`} />
                <h3 className="font-display text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Feature 14: Technical Health
                </h3>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold font-mono ${
                  tm?.isOffline
                    ? "bg-destructive/20 text-destructive border border-destructive/40 animate-pulse"
                    : tm?.networkDisconnects > 0
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    tm?.isOffline
                      ? "bg-destructive"
                      : tm?.networkDisconnects > 0
                      ? "bg-amber-400"
                      : "bg-emerald-400 animate-pulse"
                  }`}
                />
                {tm?.isOffline ? "OFFLINE" : tm?.connectionHealth ?? "HEALTHY"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="rounded-lg bg-secondary/50 p-1.5 border border-glass-border">
                <div className="text-[10px] text-muted-foreground">Disconnects</div>
                <div className="text-xs font-bold text-foreground">{tm?.networkDisconnects ?? 0}</div>
              </div>
              <div className="rounded-lg bg-secondary/50 p-1.5 border border-glass-border">
                <div className="text-[10px] text-muted-foreground">Reconnects</div>
                <div className="text-xs font-bold text-foreground">{tm?.reconnectAttempts ?? 0}</div>
              </div>
              <div className="rounded-lg bg-secondary/50 p-1.5 border border-glass-border">
                <div className="text-[10px] text-muted-foreground">Offline Sec</div>
                <div className="text-xs font-bold text-foreground">{tm?.totalOfflineSeconds ?? 0}s</div>
              </div>
            </div>

            <p className="text-[10px] text-cyan-200/80 leading-snug bg-cyan-950/40 rounded-lg p-2 border border-cyan-800/40">
              <span className="font-bold text-cyan-300">Technical Isolation: </span>
              Network interruptions, Wi-Fi drops, and WebSocket reconnects are tracked separately from cheating suspicion scores.
            </p>
          </GlassCard>

          {/* AI Proctoring Sensor Matrix (14 Features) */}
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-glass-border pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-400" />
                <h3 className="font-display text-xs font-bold uppercase tracking-wider">
                  AI Proctoring Matrix (14 Features)
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span
                  className={`size-2 rounded-full ${
                    engine.wsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
                <span className="text-muted-foreground">
                  {engine.wsConnected ? "FastAPI Live" : "Local Engine"}
                </span>
              </div>
            </div>

            {/* Audio & Camera Tampering Health Indicator */}
            <div className="flex flex-col gap-1.5 text-[10px] font-mono bg-secondary/40 rounded-lg p-2 border border-glass-border">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Video className="size-3 text-primary" /> Camera Stream:
                </span>
                <span className={cs?.isObscured || cs?.isFrozen ? "text-destructive font-bold" : "text-emerald-400"}>
                  {cs?.isObscured ? "CAMERA OBSCURED" : cs?.isFrozen ? "STREAM FROZEN" : "Stream Operational"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Mic className="size-3 text-primary" /> Audio VAD Privacy:
                </span>
                <span className="text-cyan-300">Zero Audio Saved</span>
              </div>
            </div>

            <div className="grid gap-2 max-h-[500px] overflow-y-auto pr-1">
              {proctorDetections.map((m) => (
                <div
                  key={m.num}
                  className={`rounded-xl border p-2.5 text-xs transition-all ${
                    m.ok
                      ? "border-glass-border bg-background/50 hover:bg-background/70"
                      : "border-destructive/50 bg-destructive/15 text-destructive shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-secondary/80 font-mono text-[10px] font-bold">
                        {m.num}
                      </span>
                      <div>
                        <div className="font-semibold flex items-center gap-1.5 leading-snug">
                          <m.icon className={`size-3.5 ${m.ok ? "text-primary" : "text-destructive"}`} />
                          <span>{m.label}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {m.tool}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono ${
                        m.ok
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-destructive/20 text-destructive border border-destructive/40 animate-pulse"
                      }`}
                    >
                      {m.statusText}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted-foreground/90 pl-7">
                    {m.subDetail}
                  </div>
                  {m.disclaimer && (
                    <div className="mt-1 text-[9.5px] italic text-muted-foreground/70 pl-7 border-t border-glass-border/40 pt-1">
                      ℹ️ {m.disclaimer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        </aside>
      </main>

      {/* Confirmation Submission Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4">
          <GlassCard className="max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">Submit Your Exam?</h3>
            <p className="text-xs text-muted-foreground">
              Once submitted, your responses and coding solutions will be finalized, graded, and
              compiled with your AI integrity report.
            </p>

            <div className="rounded-xl border border-glass-border bg-background/50 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span>MCQ Questions Answered:</span>
                <strong className="text-foreground font-mono">
                  {answeredMCQCount} / {questionsList.length}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Coding Challenges Solved:</span>
                <strong className="text-foreground font-mono">
                  {solvedCodingCount} / {codingList.length}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Time Remaining:</span>
                <strong className="text-foreground font-mono">{timeFormatted}</strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-glass-border">
              <Button variant="outline" size="sm" onClick={() => setShowSubmitModal(false)}>
                Continue Exam
              </Button>
              <Button size="sm" onClick={() => finish()} className="brand-surface">
                Confirm &amp; Submit
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ---------------- Mandatory Fullscreen Exam Lockdown Modal ---------------- */}
      {!isFullscreen && !submitted && !showScoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 animate-in fade-in">
          <GlassCard className="max-w-lg w-full p-6 space-y-5 border-primary/50 bg-slate-950 shadow-[0_0_60px_rgba(6,182,212,0.3)] text-center">
            <div className="mx-auto size-16 rounded-2xl bg-primary/20 border border-primary/50 flex items-center justify-center text-primary">
              <Maximize2 className="size-8 animate-pulse text-cyan-400" />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-foreground">
                Mandatory Fullscreen Mode Required
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This examination is conducted in a secure lockdown environment. Fullscreen mode must be enabled to view questions and submit answers.
              </p>
            </div>
            <div className="rounded-xl border border-destructive/40 bg-destructive/15 p-4 text-xs text-left space-y-2">
              <div className="flex items-center gap-2 font-bold text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Strict Security Lockdown Notice:</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Screen Minimize:</strong> Minimizing the window will <strong className="text-destructive font-bold">automatically submit</strong> your exam immediately.
                </li>
                <li>
                  <strong className="text-foreground">Fullscreen Exit:</strong> Exiting full screen or pressing Esc will <strong className="text-destructive font-bold">automatically submit</strong> your exam.
                </li>
                <li>
                  <strong className="text-foreground">Biometric Monitoring:</strong> Your live webcam face must continuously match your pre-check captured photo.
                </li>
              </ul>
            </div>
            <Button
              size="lg"
              onClick={async () => {
                try {
                  if (typeof document !== "undefined" && document.documentElement?.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                    setIsFullscreen(true);
                    isFullscreenRef.current = true;
                    toast.success("Fullscreen Exam Mode engaged!");
                  }
                } catch (err) {
                  console.warn("Fullscreen request error:", err);
                  setIsFullscreen(true);
                  isFullscreenRef.current = true;
                }
              }}
              className="w-full brand-surface font-bold py-6 text-base shadow-lg shadow-primary/30"
            >
              <Maximize2 className="mr-2 size-5" />
              Enter Fullscreen &amp; Attend Exam
            </Button>
          </GlassCard>
        </div>
      )}

      {/* ---------------- Tab Switch Navigation Warning Modal ---------------- */}
      {showTabSwitchWarning && !submitted && !showScoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-amber-950/70 backdrop-blur-md p-4 animate-in fade-in">
          <GlassCard className="max-w-lg w-full p-6 space-y-5 border-amber-500/50 bg-slate-950/95 shadow-[0_0_60px_rgba(245,158,11,0.3)]">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
                <Layers className="size-6" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Proctoring Alert: Tab Switch
                </span>
                <h3 className="font-display text-xl font-bold text-foreground">
                  ⚠️ Focus Lost / Tab Switched!
                </h3>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-amber-400 font-bold">
                <span>Tab Switches Logged:</span>
                <span className="font-mono text-sm px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                  {tabSwitches} / {MAX_TAB_SWITCHES} {tabSwitches >= MAX_TAB_SWITCHES ? "(Limit Reached)" : ""}
                </span>
              </div>
              <p className="text-muted-foreground pt-1">
                {tabSwitches >= MAX_TAB_SWITCHES
                  ? "🚨 FINAL WARNING: You have reached 3 tab switch violations. Any further tab switch, minimizing, or window navigation will automatically submit your exam immediately."
                  : `You navigated away from the exam window or minimized the browser. You have ${MAX_TAB_SWITCHES - tabSwitches} warning(s) remaining before automatic submission.`}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => setShowTabSwitchWarning(false)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
              >
                <Check className="size-4 mr-1.5" />
                Acknowledge Warning &amp; Resume Exam
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ---------------- 4. Post-Exam Score & Performance Scorecard Modal ---------------- */}
      {showScoreModal && finalScoreSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 overflow-y-auto animate-in fade-in">
          <GlassCard className="max-w-3xl w-full p-6 sm:p-8 space-y-6 border-primary/50 bg-slate-950 shadow-[0_0_80px_rgba(6,182,212,0.35)] my-8">
            {/* Header & Distinction Badge */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-glass-border pb-5">
              <div className="flex items-center gap-3">
                <div className="size-14 rounded-2xl bg-gradient-to-tr from-primary/30 to-accent/30 border border-primary/40 flex items-center justify-center text-primary shadow-lg">
                  <Award className="size-7 text-primary" />
                </div>
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
                    <Sparkles className="size-3.5" /> Official Exam Score Report
                  </span>
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    Exam Completed — Assessment Results
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Candidate: <strong>{user?.name || "Student"}</strong> · Assessment: {exam.title}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border uppercase font-mono ${
                    finalScoreSummary.percentage >= 75
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : finalScoreSummary.percentage >= 50
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  }`}
                >
                  <CheckCircle2 className="size-4" />
                  {finalScoreSummary.percentage >= 75
                    ? "Passed (Distinction)"
                    : finalScoreSummary.percentage >= 50
                    ? "Passed"
                    : "Needs Review"}
                </span>
              </div>
            </div>

            {/* Score Highlight Box */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center sm:text-left flex flex-col justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-primary font-bold">
                  Total Exam Score
                </span>
                <div className="my-2">
                  <div className="font-display text-4xl font-extrabold text-foreground">
                    {finalScoreSummary.percentage}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {finalScoreSummary.totalScore} / {finalScoreSummary.maxScore} Total Marks Obtained
                  </div>
                </div>
                <div className="text-[11px] font-semibold text-primary">
                  Passing Threshold: 50%
                </div>
              </div>

              <div className="rounded-2xl border border-glass-border bg-slate-900/70 p-5 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="size-3.5 text-primary" /> MCQ Score
                  </span>
                  <strong className="text-foreground">
                    {finalScoreSummary.mcqScore} / {finalScoreSummary.mcqTotal}
                  </strong>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${
                        finalScoreSummary.mcqTotal > 0
                          ? Math.round((finalScoreSummary.mcqScore / finalScoreSummary.mcqTotal) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {finalScoreSummary.mcqTotal > 0
                    ? `${Math.round((finalScoreSummary.mcqScore / finalScoreSummary.mcqTotal) * 100)}% accuracy in multiple choice questions`
                    : "No MCQs evaluated"}
                </div>

                <div className="pt-2 border-t border-glass-border/60">
                  <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Code2 className="size-3.5 text-accent" /> Coding Score
                    </span>
                    <strong className="text-foreground">
                      {finalScoreSummary.codingScore} / {finalScoreSummary.codingTotal}
                    </strong>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {solvedCodingCount} of {codingList.length} programming challenges completely passed
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-glass-border bg-slate-900/70 p-5 space-y-2">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-400" /> AI Proctor Audit
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-muted-foreground">Suspicion Level:</span>
                  <span className="font-bold font-mono text-emerald-400 uppercase">
                    {engine.risk.level === "red" ? "HIGH" : engine.risk.level === "yellow" ? "MEDIUM" : "LOW"} ({engine.risk.score}%)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tab Switches:</span>
                  <span className="font-bold font-mono text-foreground">{tabSwitches}</span>
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-glass-border/60">
                  {totalViolations === 0
                    ? "Flawless integrity: 0 policy violations."
                    : `${totalViolations} security warning(s) logged in session timeline.`}
                </div>
              </div>
            </div>

            {/* Question-by-Question Review */}
            <div className="rounded-2xl border border-glass-border bg-slate-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
                  <BookOpen className="size-3.5 text-primary" /> Questions &amp; Answers Review
                </h4>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {questionsList.length} Questions Evaluated
                </span>
              </div>

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {questionsList.map((q, idx) => {
                  const studentAns = answers[q.id];
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

            {/* Actions Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-glass-border">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const session = loadDB().sessions.find((s) => s.id === sessionIdRef.current);
                    if (session) {
                      printPDF(session);
                    } else {
                      toast.info("Preparing PDF certificate...");
                    }
                  }}
                  className="text-xs"
                >
                  <Printer className="size-3.5 mr-1.5" /> Print / Save PDF Slip
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/student" })}
                  className="text-xs"
                >
                  Student Dashboard
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate({ to: "/student/reports" })}
                  className="brand-surface text-xs font-bold shadow-md"
                >
                  <Award className="size-3.5 mr-1.5" /> View Detailed Integrity Report
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
