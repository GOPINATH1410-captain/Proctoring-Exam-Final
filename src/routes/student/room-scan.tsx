import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, GlassCard } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { STUDENT_NAV } from "@/lib/nav";
import { loadDB } from "@/lib/proctor-store";
import {
  RealtimeProctorPipeline,
  initializeRealtimeAI,
  type VisionInferenceResult,
} from "@/lib/realtime-ai-engine";

export const Route = createFileRoute("/student/room-scan")({
  validateSearch: (search: Record<string, unknown>) => ({ exam: String(search["exam"] ?? "e1") }),
  head: () => ({
    meta: [
      { title: "Room verification — NextGen AI Proctor" },
      {
        name: "description",
        content:
          "Real-time 360° environment verification for phones, books, notes and multiple persons using YOLOv8 before the exam unlocks.",
      },
      { property: "og:title", content: "Room scan — NextGen AI Proctor" },
      {
        property: "og:description",
        content:
          "Real-time AI environment verification with YOLOv8 before your proctored exam starts.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["student"]}>
      <RoomScan />
    </RequireRole>
  ),
});

interface CheckItem {
  key: string;
  label: string;
  icon: typeof Smartphone;
  status: "pending" | "scanning" | "pass" | "fail";
  detail: string;
}

function RoomScan() {
  const { exam } = Route.useSearch();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineRef = useRef<RealtimeProctorPipeline>(new RealtimeProctorPipeline());
  const animFrameRef = useRef<number | null>(null);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [detectedProhibited, setDetectedProhibited] = useState<string[]>([]);
  const [scanSeconds, setScanSeconds] = useState(0);

  const [checks, setChecks] = useState<CheckItem[]>([
    {
      key: "phone",
      label: "No mobile phone in desk area",
      icon: Smartphone,
      status: "pending",
      detail: "Waiting for scan",
    },
    {
      key: "book",
      label: "No unauthorized books or notes",
      icon: BookOpen,
      status: "pending",
      detail: "Waiting for scan",
    },
    {
      key: "person",
      label: "Candidate alone in the room",
      icon: Users,
      status: "pending",
      detail: "Waiting for scan",
    },
    {
      key: "lighting",
      label: "Adequate lighting & face visible",
      icon: ScanLine,
      status: "pending",
      detail: "Waiting for scan",
    },
  ]);

  const examTitle = loadDB().exams.find((e) => e.id === exam)?.title ?? "Exam";

  /* ---------------- Initialize AI & Camera ---------------- */
  useEffect(() => {
    let stream: MediaStream | null = null;
    let mounted = true;

    initializeRealtimeAI((msg) => console.log(msg)).then((ok) => {
      if (mounted) setAiLoaded(ok);
    });

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => setError("Camera access is required to complete the room scan."));

    return () => {
      mounted = false;
      stream?.getTracks().forEach((t) => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  /* ---------------- Real-Time Scan Loop ---------------- */
  useEffect(() => {
    if (!running) return;

    let isScanning = true;
    let cleanSeconds = 0;
    const prohibitedSet = new Set<string>();

    const intervalId = window.setInterval(() => {
      setScanSeconds((s) => s + 1);
    }, 1000);

    const loop = async () => {
      if (!isScanning) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const res: VisionInferenceResult = await pipelineRef.current.processFrame(video);

        if (canvas) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          pipelineRef.current.renderOverlay(canvas, video, res, {
            showBoundingBoxes: true,
            showFaceMesh: true,
            showGazeRays: false,
            showHeadPose: true,
            showHandSkeleton: true,
          });
        }

        // Check for violations
        if (res.phoneDetected) {
          prohibitedSet.add(`Phone (${Math.round(res.phoneConfidence * 100)}%)`);
          setChecks((prev) =>
            prev.map((c) =>
              c.key === "phone"
                ? {
                    ...c,
                    status: "fail",
                    detail: `Detected with ${Math.round(res.phoneConfidence * 100)}% confidence`,
                  }
                : c,
            ),
          );
        }
        if (res.bookDetected) {
          prohibitedSet.add(`Book/Notes (${Math.round(res.bookConfidence * 100)}%)`);
          setChecks((prev) =>
            prev.map((c) =>
              c.key === "book"
                ? {
                    ...c,
                    status: "fail",
                    detail: `Detected with ${Math.round(res.bookConfidence * 100)}% confidence`,
                  }
                : c,
            ),
          );
        }
        if (res.multiplePersons) {
          prohibitedSet.add("Multiple Persons");
          setChecks((prev) =>
            prev.map((c) =>
              c.key === "person"
                ? { ...c, status: "fail", detail: `${res.facesCount} persons in camera frame` }
                : c,
            ),
          );
        }

        // If clean
        if (!res.phoneDetected && !res.bookDetected && !res.multiplePersons && res.faceDetected) {
          cleanSeconds += 0.05;
        }

        setDetectedProhibited(Array.from(prohibitedSet));

        // Update progress check statuses
        setChecks((prev) =>
          prev.map((c) => {
            if (c.status === "fail") return c;
            if (c.key === "phone" && !res.phoneDetected)
              return { ...c, status: "scanning", detail: "Clear so far" };
            if (c.key === "book" && !res.bookDetected)
              return { ...c, status: "scanning", detail: "Clear so far" };
            if (c.key === "person" && !res.multiplePersons)
              return { ...c, status: "scanning", detail: "Single person confirmed" };
            if (c.key === "lighting" && res.faceDetected)
              return { ...c, status: "scanning", detail: "Good illumination" };
            return c;
          }),
        );
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    // Run sweep for 6 seconds
    const timeoutId = window.setTimeout(() => {
      isScanning = false;
      setRunning(false);

      if (prohibitedSet.size === 0) {
        setChecks((prev) => prev.map((c) => ({ ...c, status: "pass", detail: "Verified clear" })));
        setDone(true);
        toast.success("Room verification passed — Environment is secure!");
      } else {
        toast.error("Prohibited items detected! Please clear your room and re-scan.");
      }
    }, 6500);

    return () => {
      isScanning = false;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [running]);

  const startScan = () => {
    setRunning(true);
    setDone(false);
    setScanSeconds(0);
    setDetectedProhibited([]);
    setChecks([
      {
        key: "phone",
        label: "No mobile phone in desk area",
        icon: Smartphone,
        status: "scanning",
        detail: "Scanning with YOLOv8…",
      },
      {
        key: "book",
        label: "No unauthorized books or notes",
        icon: BookOpen,
        status: "scanning",
        detail: "Scanning with YOLOv8…",
      },
      {
        key: "person",
        label: "Candidate alone in the room",
        icon: Users,
        status: "scanning",
        detail: "Verifying presence…",
      },
      {
        key: "lighting",
        label: "Adequate lighting & face visible",
        icon: ScanLine,
        status: "scanning",
        detail: "Verifying illumination…",
      },
    ]);
  };

  const hasFailures = checks.some((c) => c.status === "fail");

  return (
    <AppShell
      nav={STUDENT_NAV}
      title="Room verification (YOLOv8 AI)"
      subtitle={`${examTitle} — the exam unlocks only after real-time environment checks pass.`}
    >
      <div className="grid gap-6 lg:grid-cols-5">
        <GlassCard className="lg:col-span-3">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-glass-border bg-secondary/40 shadow-inner">
            <video ref={videoRef} muted playsInline className="size-full object-cover" />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 size-full object-cover"
            />

            {running && (
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-lg backdrop-blur-md">
                <Loader2 className="size-3.5 animate-spin" />
                <span>YOLOv8 &amp; MediaPipe Live Sweep ({6 - scanSeconds}s)</span>
              </div>
            )}

            {hasFailures && !running && (
              <div className="absolute bottom-4 inset-x-4 flex items-center gap-2 rounded-xl bg-destructive/90 p-3 text-xs font-semibold text-destructive-foreground backdrop-blur-md shadow-lg">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  Violations detected: {detectedProhibited.join(", ")}. Clear desk and re-scan.
                </span>
              </div>
            )}
          </div>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <p className="mt-4 text-sm text-muted-foreground">
            Slowly pan your camera 360° across your desk, workspace, and room. The real-time YOLOv8
            detector will actively identify prohibited items.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={startScan} disabled={running}>
              {running ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <ScanLine className="size-4 mr-2" />
              )}
              {running
                ? "Scanning with AI…"
                : hasFailures
                  ? "Re-run Room Scan"
                  : "Start AI Room Scan"}
            </Button>
            <Button
              variant="default"
              disabled={!done || running}
              onClick={() => navigate({ to: "/student/exam", search: { exam } })}
              className="brand-surface"
            >
              <ShieldCheck className="size-4 mr-2" /> Enter Exam
            </Button>
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">AI Verification Checklist</h2>
            {done && (
              <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                PASSED
              </span>
            )}
          </div>

          <ul className="mt-5 space-y-3">
            {checks.map((c) => (
              <li
                key={c.key}
                className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                  c.status === "pass"
                    ? "border-success/30 bg-success/5"
                    : c.status === "fail"
                      ? "border-destructive/40 bg-destructive/10"
                      : "border-glass-border bg-background/40"
                }`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                    c.status === "pass"
                      ? "bg-success/15 text-success"
                      : c.status === "fail"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-primary/10 text-primary"
                  }`}
                >
                  <c.icon className="size-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{c.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{c.detail}</div>
                </div>
                {c.status === "pending" && (
                  <span className="text-xs text-muted-foreground">Ready</span>
                )}
                {c.status === "scanning" && (
                  <Loader2 className="size-4 animate-spin text-primary" />
                )}
                {c.status === "pass" && <CheckCircle2 className="size-5 text-success" />}
                {c.status === "fail" && <XCircle className="size-5 text-destructive" />}
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-2xl border border-glass-border bg-secondary/40 p-4 text-xs text-muted-foreground space-y-1.5">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> Real YOLOv8 Object Detection
            </div>
            <div>
              The room scan runs real-time object classification on your camera feed. Any mobile
              phone, notes, or secondary individual will block exam access until removed.
            </div>
          </div>
        </GlassCard>
      </div>
    </AppShell>
  );
}
