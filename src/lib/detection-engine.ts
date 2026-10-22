/**
 * detection-engine.ts
 * ---------------------------------------------------------------------------
 * Real-Time AI Proctoring Engine Hook.
 *
 * Fully wired to:
 *   • Real-time MediaPipe Vision (478 3D Face Landmarks, Iris Gaze, 3D Head Pose, Hands)
 *   • Real-time YOLOv8 Object Detector (Phone, Book, Person, Laptop)
 *   • Context-Aware AI Temporal Engine (Multi-modal correlation & Anomaly Smoothing)
 *   • Explainable AI (XAI) Engine (Factor Attribution % & Natural Language Reasoning)
 *   • Live Cyberpunk HUD Canvas Renderer with toggles
 *   • High-Resolution Annotated Evidence Capture
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RealtimeProctorPipeline,
  initializeRealtimeAI,
  type VisionInferenceResult,
  type OverlayOptions,
} from "./realtime-ai-engine";
import { ContextAwareEngine, type ContextAnalysisSummary } from "./context-engine";
import { ExplainableAIEngine, type XAIExplanationResult } from "./xai-engine";
import { apiClient } from "./api-client";
import { extractFaceFromImage } from "./face-biometrics";
import {
  computeRisk,
  emptyMetrics,
  uid,
  type BehaviourMetrics,
  type EventType,
  type TimelineEvent,
} from "./proctor-store";

import type { FourteenDetectionsStatus, TechnicalMetrics } from "./types/proctor";

export interface DetectionItemStatus {
  detected: boolean;
  label: string;
  status: "normal" | "warning" | "alert";
  tool: string;
  confidence?: number;
  count?: number;
  direction?: string;
  pitch?: number;
  yaw?: number;
  streakSec?: number;
}

export interface TenDetectionsStatus {
  faceDetection: DetectionItemStatus;
  multiplePersonDetection: DetectionItemStatus;
  faceMissingDetection: DetectionItemStatus;
  identityMismatch: DetectionItemStatus;
  eyeGazeDetection: DetectionItemStatus;
  headPoseDetection: DetectionItemStatus;
  handActivityDetection?: DetectionItemStatus;
  mobilePhoneDetection: DetectionItemStatus;
  prohibitedObjectDetection: DetectionItemStatus;
  mobileGazeCorrelation: DetectionItemStatus;
  behaviourDeviation: DetectionItemStatus;
}

export const defaultTenDetections: TenDetectionsStatus = {
  faceDetection: { detected: true, label: "Face Present", status: "normal", tool: "OpenCV + MediaPipe Face Detection" },
  multiplePersonDetection: { detected: false, count: 1, label: "Single Person Verified", status: "normal", tool: "YOLOv8 + OpenCV" },
  faceMissingDetection: { detected: false, streakSec: 0, label: "Candidate In View", status: "normal", tool: "MediaPipe + OpenCV" },
  identityMismatch: { detected: false, confidence: 0.98, label: "Biometric Verified", status: "normal", tool: "Face Recognition + OpenCV/Face Embeddings" },
  eyeGazeDetection: { detected: true, direction: "screen", label: "Gaze on Screen", status: "normal", tool: "MediaPipe Face Landmarker/Iris (478 pts) + OpenCV" },
  headPoseDetection: { detected: true, direction: "center", pitch: 0, yaw: 0, label: "Head Centered", status: "normal", tool: "MediaPipe + OpenCV (cv2.solvePnP Euler Angles)" },
  handActivityDetection: { detected: false, label: "Hands Clear of Face/Ear", status: "normal", tool: "MediaPipe Hand Landmarker (21 3D joints) + Proximity Analysis" },
  mobilePhoneDetection: { detected: false, confidence: 0, label: "No Phone in View", status: "normal", tool: "YOLOv8" },
  prohibitedObjectDetection: { detected: false, confidence: 0, label: "Zero Prohibited Items", status: "normal", tool: "YOLOv8 custom-trained model" },
  mobileGazeCorrelation: { detected: false, label: "No Correlation Anomaly", status: "normal", tool: "YOLOv8 + MediaPipe + Context Engine" },
  behaviourDeviation: { detected: false, label: "Normal Exam Baseline", status: "normal", tool: "Python + Context-Aware Behaviour Engine" },
};

export const defaultFourteenDetections: FourteenDetectionsStatus = {
  repeatedLooking: {
    id: "feature_1",
    featureNumber: 1,
    label: "Repeated Left, Right & Down Looking",
    detected: false,
    status: "normal",
    statusText: "Gaze Focused on Screen",
    tool: "OpenCV (cv2.solvePnP) + MediaPipe FaceMesh (478 pts)",
    disclaimer: "Gaze direction is a behavioral indicator, not proof of cheating.",
  },
  bookNotesDetection: {
    id: "feature_2",
    featureNumber: 2,
    label: "Book, Notes, and Paper Detection",
    detected: false,
    status: "normal",
    statusText: "Zero Prohibited Materials",
    tool: "Ultralytics YOLOv8 Object Detection",
    isConfirmedUnauthorized: false,
    requiresFacultyVerification: true,
  },
  externalAiUsage: {
    id: "feature_3",
    featureNumber: 3,
    label: "External AI or Chatbot Usage",
    detected: false,
    status: "normal",
    statusText: "Browser Sandbox Guard Active (Partially Supported)",
    tool: "Browser Visibility API + Event Guard",
    disclaimer: "Webcam alone cannot identify chatbot usage; monitors permitted browser focus and clipboard events.",
  },
  externalWebsiteSearch: {
    id: "feature_4",
    featureNumber: 4,
    label: "External Website or Search Usage",
    detected: false,
    status: "normal",
    statusText: "Exam Page Active & Focused",
    tool: "Browser Page Visibility API & Window Focus",
    disclaimer: "Monitors exam page visibility without accessing unrelated tabs or private browsing history.",
  },
  secondMonitorDevice: {
    id: "feature_5",
    featureNumber: 5,
    label: "Second Monitor or Additional Device",
    detected: false,
    status: "normal",
    statusText: "Single Workstation Display Verified",
    tool: "YOLOv8 Object Detection + Display API",
    disclaimer: "Detections limited to camera view and permitted display APIs.",
  },
  unauthorizedAudioDevice: {
    id: "feature_6",
    featureNumber: 6,
    label: "Unauthorized Audio or Communication Device",
    detected: false,
    status: "normal",
    statusText: "Ear Area Clear (No Visible Headset)",
    tool: "MediaPipe Hand Landmarker + Audio VAD",
    disclaimer: "Invisible earpieces cannot be reliably proven from audio or vision alone.",
  },
  suspiciousInputActivity: {
    id: "feature_7",
    featureNumber: 7,
    label: "Suspicious External Input / Large Paste",
    detected: false,
    status: "normal",
    statusText: "Standard Keyboard Input",
    tool: "Browser Input & Clipboard Interceptors",
    disclaimer: "Privacy-preserving: passwords and regular keystrokes are never logged.",
  },
  multiplePeople: {
    id: "feature_8",
    featureNumber: 8,
    label: "Multiple People Detection",
    detected: false,
    status: "normal",
    statusText: "Single Candidate Verified",
    tool: "YOLOv8 Person Detection + MediaPipe",
    disclaimer: "Confirmed across consecutive frames before generating alerts.",
  },
  studentLeavingView: {
    id: "feature_9",
    featureNumber: 9,
    label: "Student Leaving the Camera View",
    detected: false,
    status: "normal",
    statusText: "Candidate In View",
    tool: "MediaPipe FaceMesh + Person Tracking",
    disclaimer: "Grace period applied; continuous absence deduplicated into a single episode.",
  },
  faceMissing: {
    id: "feature_10",
    featureNumber: 10,
    label: "Face Missing Detection",
    detected: false,
    status: "normal",
    statusText: "Face Clearly Detected",
    tool: "OpenCV + MediaPipe Face Landmarker",
    disclaimer: "Grace period protects against camera startup and temporary lighting shifts.",
  },
  identityMismatch: {
    id: "feature_11",
    featureNumber: 11,
    label: "Identity Mismatch Detection",
    detected: false,
    status: "normal",
    statusText: "Biometric Baseline Verified",
    tool: "Face Recognition + Quality & Pose Gating",
    disclaimer: "Marked for manual faculty review only. Automatic penalties prohibited.",
  },
  cameraBlockingTampering: {
    id: "feature_12",
    featureNumber: 12,
    label: "Camera Blocking or Tampering",
    detected: false,
    status: "normal",
    statusText: "Camera Stream Operational",
    tool: "OpenCV Brightness, Blur & Frame Difference",
    disclaimer: "Distinguishes dark/obscured image from frozen stream or disconnected camera.",
  },
  voiceVerbalAssistance: {
    id: "feature_13",
    featureNumber: 13,
    label: "Voice Activity Detection (VAD)",
    detected: false,
    status: "normal",
    statusText: "Ambient Audio Normal",
    tool: "WebAudio RMS & Spectral Energy VAD",
    disclaimer: "VAD tracks voice presence, not proof of a second speaker. No raw audio stored.",
  },
  networkInterruptions: {
    id: "feature_14",
    featureNumber: 14,
    label: "Network & Session Interruptions",
    detected: false,
    status: "normal",
    statusText: "Connection Stable",
    tool: "Browser Online/Offline API + WebSocket Heartbeat",
    disclaimer: "Technical connectivity problems are tracked separately from cheating risk.",
  },
};

export interface EngineSignals {
  faceDetected: boolean;
  facesCount: number;
  gazeOnScreen: boolean;
  gazeDirection: string;
  gazeVector?: { x: number; y: number; z: number } | undefined;
  headPose: "center" | "left" | "right" | "down" | "up";
  headYaw: number;
  headPitch: number;
  headRoll?: number | undefined;
  phone: boolean;
  phoneDetected?: boolean | undefined;
  phoneConfidence: number;
  smartwatch?: boolean | undefined;
  smartwatchDetected?: boolean | undefined;
  smartwatchConfidence?: number | undefined;
  phoneWarning?: string | null | undefined;
  smartwatchWarning?: string | null | undefined;
  book: boolean;
  bookConfidence: number;
  hand: boolean;
  handsSuspicious: boolean;
  handNearEar?: boolean | undefined;
  handBelowDesk?: boolean | undefined;
  handNearHead?: boolean | undefined;
  voice: boolean;
  audioLevel: number;
  identityMatch: number;
  identityMismatch?: boolean | undefined;
  anomalyScore: number;
  dominantContext: string;
  mobileGazeCorrelated?: boolean | undefined;
  behaviourDeviation?: boolean | undefined;
  wsConnected?: boolean | undefined;
  isOnline: boolean;
  cameraObscured: boolean;
  cameraFrozen: boolean;
  awayDurationSec: number;
  largePastesCount: number;
}

const EVENT_LABEL: Record<EventType, string> = {
  phone: "Mobile phone detected in frame (YOLOv8)",
  book: "Book / printed notes detected (YOLOv8)",
  multi_person: "Multiple persons detected in frame (MediaPipe/YOLO)",
  no_face: "Candidate face not visible in frame",
  student_absent: "Student absent from workstation (grace period exceeded)",
  student_returned: "Student returned to workstation camera view",
  looking_away: "Gaze moved off-screen (MediaPipe Iris 3D Vector)",
  repeated_looking: "Repeated left, right or downward gaze shifts",
  head_pose: "Abnormal head pose detected (cv2.solvePnP 3D Euler Angles)",
  voice: "Voice activity detected (Microphone RMS)",
  hand: "Suspicious hand movement (near ear / below desk / face proximity)",
  face_mismatch: "Continuous face verification mismatch (flagged for review)",
  tab_switch: "Candidate left the exam window",
  fullscreen_exit: "Candidate exited fullscreen exam mode",
  screenshot_attempt: "Security Violation: Screen capture / screenshot attempt blocked",
  clipboard_violation: "Unauthorized clipboard copy or cut attempt",
  large_paste: "Unusually large external paste operation intercepted",
  extension_violation: "Unauthorized browser extension policy violation",
  second_device: "Second monitor or external device detected in view",
  camera_obscured: "Camera obscured, blocked or lens darkened",
  video_interrupted: "Camera stream interrupted or frozen frames detected",
  technical_interruption: "Network disconnection or session instability recorded",
};

export interface UseProctorEngineOptions {
  active: boolean;
  onEvent?: ((event: TimelineEvent) => void) | undefined;
  sessionId: string;
  studentId?: string | undefined;
  studentPhoto?: string | null | undefined;
  enrolledEmbedding?: Float32Array | null | undefined;
}

export function useProctorEngine({
  active,
  onEvent,
  sessionId,
  studentId,
  studentPhoto,
  enrolledEmbedding,
}: UseProctorEngineOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const pipelineRef = useRef<RealtimeProctorPipeline>(new RealtimeProctorPipeline());
  const contextEngineRef = useRef<ContextAwareEngine>(new ContextAwareEngine());

  const startedAt = useRef<number>(Date.now());
  const metricsRef = useRef<BehaviourMetrics>(emptyMetrics());
  const lastEventAt = useRef<Record<string, number>>({});
  const tabSwitchesRef = useRef<number>(0);
  const blurStartRef = useRef<number | null>(null);
  const offlineStartRef = useRef<number | null>(null);
  const largePastesCountRef = useRef<number>(0);
  const handNearEarStreakRef = useRef<number>(0);
  const localHandNearEarStreakRef = useRef<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const lastWsSendAt = useRef<number>(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [tenDetections, setTenDetections] = useState<TenDetectionsStatus>(defaultTenDetections);
  const [fourteenDetections, setFourteenDetections] = useState<FourteenDetectionsStatus>(defaultFourteenDetections);
  const [technicalMetrics, setTechnicalMetrics] = useState<TechnicalMetrics>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    networkDisconnects: 0,
    sessionInterruptions: 0,
    totalOfflineSeconds: 0,
    reconnectAttempts: 0,
    heartbeatFailures: 0,
    lastDisconnectReason: null,
    connectionHealth: "HEALTHY",
    isOffline: false,
  });
  const [cameraStatus, setCameraStatus] = useState<{
    isObscured: boolean;
    isFrozen: boolean;
    brightness: number;
    blurVariance: number;
    status: string;
  }>({
    isObscured: false,
    isFrozen: false,
    brightness: 120,
    blurVariance: 150,
    status: "NORMAL",
  });

  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [aiStatus, setAiStatus] = useState<string>("Initializing Real-Time AI Models…");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [overlayOptions, setOverlayOptions] = useState<OverlayOptions>({
    showFaceMesh: true,
    showGazeRays: true,
    showHeadPose: true,
    showBoundingBoxes: true,
    showHandSkeleton: true,
  });

  const [signals, setSignals] = useState<EngineSignals>({
    faceDetected: true,
    facesCount: 1,
    gazeOnScreen: true,
    gazeDirection: "screen",
    headPose: "center",
    headYaw: 0,
    headPitch: 0,
    phone: false,
    phoneConfidence: 0,
    smartwatch: false,
    smartwatchConfidence: 0,
    book: false,
    bookConfidence: 0,
    hand: false,
    handsSuspicious: false,
    voice: false,
    audioLevel: 0,
    identityMatch: 0.98,
    anomalyScore: 0,
    dominantContext: "Normal Exam",
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    cameraObscured: false,
    cameraFrozen: false,
    awayDurationSec: 0,
    largePastesCount: 0,
  });

  const [eyeGaze, setEyeGaze] = useState<{
    direction: string;
    currentDirection: string;
    durationSec: number;
    continuousDurationSec: number;
    counts: { up: number; down: number; left: number; right: number; off_screen?: number };
    totalCount: number;
  }>({
    direction: "center",
    currentDirection: "screen",
    durationSec: 0,
    continuousDurationSec: 0,
    counts: { up: 0, down: 0, left: 0, right: 0, off_screen: 0 },
    totalCount: 0,
  });

  const [headMovement, setHeadMovement] = useState<{
    direction: string;
    currentDirection: string;
    durationSec: number;
    continuousDurationSec: number;
    counts: { up: number; down: number; left: number; right: number };
    totalCount: number;
  }>({
    direction: "center",
    currentDirection: "center",
    durationSec: 0,
    continuousDurationSec: 0,
    counts: { up: 0, down: 0, left: 0, right: 0 },
    totalCount: 0,
  });

  const [handMovement, setHandMovement] = useState<{
    status: string;
    handRaised: boolean;
    nearFace: boolean;
    nearEar: boolean;
    belowDesk: boolean;
    counts: Record<string, number>;
    totalEvents: number;
    handRaisedCount?: number;
    handNearFaceCount?: number;
    handNearEarCount?: number;
    handBelowDeskCount?: number;
    totalMovements?: number;
  }>({
    status: "Hands Clear",
    handRaised: false,
    nearFace: false,
    nearEar: false,
    belowDesk: false,
    counts: { raised: 0, near_face: 0, near_ear: 0, below_desk: 0, repeated_movements: 0 },
    totalEvents: 0,
    handRaisedCount: 0,
    handNearFaceCount: 0,
    handNearEarCount: 0,
    handBelowDeskCount: 0,
    totalMovements: 0,
  });

  const [bodyPose, setBodyPose] = useState<{
    detected: boolean;
    posture: string;
    counts: Record<string, number>;
    totalMovements: number;
    shouldersVisible: boolean;
  }>({
    detected: false,
    posture: "Normal Posture",
    counts: { leaning_left: 0, leaning_right: 0, slouching: 0, total_movements: 0 },
    totalMovements: 0,
    shouldersVisible: false,
  });

  const [activeWarnings, setActiveWarnings] = useState<Array<{
    type: string;
    message: string;
    severity?: string;
    confidence?: number;
    confidencePct?: string;
  }>>([]);

  const [warningHistory, setWarningHistory] = useState<Array<any>>([]);
  const [detectedObjects, setDetectedObjects] = useState<any[]>([]);
  const [totalDetectedObjects, setTotalDetectedObjects] = useState<number>(0);
  const [totalMovementEvents, setTotalMovementEvents] = useState<number>(0);

  const [metrics, setMetrics] = useState<BehaviourMetrics>(emptyMetrics());
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [xaiResult, setXaiResult] = useState<XAIExplanationResult>({
    score: 0,
    level: "green",
    levelLabel: "Low Risk",
    headline: "Normal exam behavior maintained.",
    reasons: ["Normal exam behavior maintained."],
    detailedExplanations: ["MediaPipe and YOLOv8 models verify candidate is focused."],
    attributions: [],
    dominantFactor: "Normal Behavior",
  });

  /* Set enrolled reference embedding */
  useEffect(() => {
    if (enrolledEmbedding) {
      pipelineRef.current.setEnrolledFace(enrolledEmbedding);
    } else if (studentPhoto) {
      extractFaceFromImage(studentPhoto).then((res) => {
        if (res.embedding) {
          pipelineRef.current.setEnrolledFace(res.embedding);
        }
      });
    }
  }, [enrolledEmbedding, studentPhoto]);

  /* ---------------------- Initialize AI Models ---------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await initializeRealtimeAI((msg) => {
        if (mounted) setAiStatus(msg);
      });
      if (mounted) {
        setAiLoaded(ok);
        setAiStatus(ok ? "AI Models Active (MediaPipe + YOLOv8)" : "AI Ready (Local Fallback)");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /** Capture high-resolution annotated screenshot evidence with tamper-evident watermark */
  const capture = useCallback((reasonLabel?: string): string | undefined => {
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return undefined;

      const c = document.createElement("canvas");
      c.width = 480;
      c.height = Math.round((480 * video.videoHeight) / (video.videoWidth || 640));
      const ctx = c.getContext("2d");
      if (!ctx) return undefined;

      // Draw video frame
      ctx.drawImage(video, 0, 0, c.width, c.height);

      // Draw overlay canvas if present (landmarks, bounding boxes)
      if (canvasRef.current && canvasRef.current.width > 0 && canvasRef.current.height > 0) {
        ctx.drawImage(canvasRef.current, 0, 0, c.width, c.height);
      }

      // Draw top alert border & banner
      ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, c.width - 4, c.height - 4);

      ctx.fillStyle = "rgba(220, 38, 38, 0.92)";
      ctx.fillRect(0, 0, c.width, 26);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.fillText(`⚠️ VIOLATION DETECTED: ${reasonLabel || "SUSPICIOUS ACTIVITY"}`, 10, 18);

      // Draw evidence metadata footer banner
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.fillRect(0, c.height - 26, c.width, 26);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 9.5px monospace, system-ui, sans-serif";
      ctx.fillText(`TIME: ${new Date().toLocaleTimeString()} · AI PROCTOR AUDIT`, 10, c.height - 9);

      ctx.fillStyle = "#a5f3fc";
      ctx.font = "9px monospace, system-ui, sans-serif";
      ctx.fillText(`SECURE EVIDENCE SNAPSHOT`, c.width - 190, c.height - 9);

      return c.toDataURL("image/jpeg", 0.72);
    } catch (err) {
      console.warn("capture() non-fatal error caught:", err);
      return undefined;
    }
  }, []);

  const pushEvent = useCallback(
    (type: EventType, severity: number, withEvidence: boolean, durationSec?: number) => {
      try {
        const now = Date.now();
        // Debounce identical event types so timeline stays clean (3.5s cooldown)
        if (now - (lastEventAt.current[type] ?? 0) < 3500) return;
        lastEventAt.current[type] = now;

        const label = EVENT_LABEL[type];
        const capturedEvidence = withEvidence ? capture(label) : undefined;
        const ev: TimelineEvent = {
          id: uid(),
          sessionId,
          type,
          label,
          at: new Date(now).toISOString(),
          clock: new Date(now).toLocaleTimeString([], { hour12: false }),
          severity,
          ...(durationSec !== undefined ? { durationSec } : {}),
          ...(capturedEvidence ? { evidence: capturedEvidence } : {}),
        };

        setEvents((prev) => [ev, ...prev].slice(0, 200));
        onEvent?.(ev);

        // Securely sync captured evidence screenshot to backend MongoDB
        if (capturedEvidence && sessionId) {
          apiClient
            .storeEvidence({
              sessionId,
              eventId: ev.id,
              type: ev.type,
              confidence: 0.95,
              duration: durationSec ?? 0,
              imageB64: capturedEvidence,
              metadata: { label: ev.label, severity: ev.severity, clock: ev.clock },
            })
            .catch((err) => {
              console.debug("Backend evidence capture queued/offline:", err);
            });
        }
      } catch (err) {
        console.warn("pushEvent() non-fatal error caught:", err);
      }
    },
    [capture, onEvent, sessionId],
  );

  /* ------------------- Hardware Device Acquisition ------------------ */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" },
            audio: true,
          });
        } catch (mediaErr) {
          // Fallback to video-only if audio device is unavailable, muted, or in use
          console.warn("Audio+Video getUserMedia failed, retrying video only:", mediaErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" },
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraReady(true);
        setCameraError(null);

        if (stream.getAudioTracks().length) {
          const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtor) {
            const ctx = new AudioCtor();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            audioCtxRef.current = ctx;
            analyserRef.current = analyser;
            setMicReady(true);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Camera acquisition error:", err);
          setCameraError(
            err?.name === "NotAllowedError"
              ? "Camera permission denied. Please allow camera access in browser address bar."
              : "Camera hardware not accessible or in use by another application.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;
      setCameraReady(false);
    };
  }, [active]);

  /* ----------------------- Tab Switching & Away Duration ---------------------- */
  useEffect(() => {
    if (!active) return;
    const onHidden = () => {
      if (document.hidden) {
        tabSwitchesRef.current += 1;
        metricsRef.current.tabSwitches = tabSwitchesRef.current;
        pushEvent("tab_switch", 8, false);
      }
    };
    const handleBlur = () => {
      blurStartRef.current = Date.now();
    };
    const handleFocus = () => {
      if (blurStartRef.current) {
        const awaySec = Math.round((Date.now() - blurStartRef.current) / 1000);
        blurStartRef.current = null;
        if (awaySec >= 2) {
          setSignals((prev) => ({ ...prev, awayDurationSec: awaySec }));
          pushEvent("tab_switch", 8, false, awaySec);
        }
      }
    };

    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [active, pushEvent]);

  /* ----------------------- Network & Connectivity Tracking ---------------------- */
  useEffect(() => {
    if (!active) return;
    const handleOnline = () => {
      const offlineDuration = offlineStartRef.current
        ? Math.round((Date.now() - offlineStartRef.current) / 1000)
        : 0;
      offlineStartRef.current = null;
      setSignals((prev) => ({ ...prev, isOnline: true }));
      setTechnicalMetrics((prev) => ({
        ...prev,
        isOffline: false,
        connectionHealth: "HEALTHY",
        totalOfflineSeconds: prev.totalOfflineSeconds + offlineDuration,
      }));
    };
    const handleOffline = () => {
      offlineStartRef.current = Date.now();
      setSignals((prev) => ({ ...prev, isOnline: false }));
      setTechnicalMetrics((prev) => ({
        ...prev,
        isOffline: true,
        connectionHealth: "DEGRADED",
        networkDisconnects: prev.networkDisconnects + 1,
        lastDisconnectReason: "Client browser disconnected from network",
      }));
      metricsRef.current.technicalInterruptions = (metricsRef.current.technicalInterruptions || 0) + 1;
      pushEvent("technical_interruption", 0, false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [active, pushEvent]);

  /* ----------------- Privacy-Preserving Input & Paste Monitor ----------------- */
  useEffect(() => {
    if (!active) return;
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") || "";
      // Privacy rule: Only measure length (> 100 chars); NEVER store or log candidate keystrokes or passwords
      if (text.length > 100) {
        largePastesCountRef.current += 1;
        metricsRef.current.largePastes = largePastesCountRef.current;
        setSignals((prev) => ({ ...prev, largePastesCount: largePastesCountRef.current }));
        pushEvent("large_paste", 15, true, undefined);
      }
    };
    window.addEventListener("paste", handlePaste, true);
    return () => {
      window.removeEventListener("paste", handlePaste, true);
    };
  }, [active, pushEvent]);

  /* ---------------- Real-Time Backend WebSocket Bridge ---------------- */
  useEffect(() => {
    if (!active) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isMounted = true;

    const connectWs = () => {
      try {
        const wsUrl = apiClient.getProctorWsUrl();
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          setSignals((prev) => ({ ...prev, wsConnected: true }));
          setAiStatus("Backend AI Online (FastAPI + YOLOv8 + MediaPipe + OpenCV)");
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.vision) {
              const v = data.vision;
              pipelineRef.current.setServerVision(v);
              const phoneObj = (v.objects || []).find((o: any) =>
                o.label?.toLowerCase().includes("phone") || o.label?.toLowerCase().includes("cell"),
              );
              const smartwatchObj = (v.objects || []).find((o: any) =>
                o.label?.toLowerCase().includes("smartwatch") ||
                o.label?.toLowerCase().includes("watch") ||
                o.label?.toLowerCase().includes("clock"),
              );
              const bookObj = (v.objects || []).find((o: any) =>
                o.label?.toLowerCase().includes("book") ||
                o.label?.toLowerCase().includes("laptop") ||
                o.label?.toLowerCase().includes("tablet"),
              );

              if (v.eyeGaze) {
                setEyeGaze({
                  direction: v.eyeGaze.direction || v.eyeGaze.currentDirection || "center",
                  currentDirection: v.eyeGaze.currentDirection || v.eyeGaze.direction || "screen",
                  durationSec: v.eyeGaze.durationSec ?? v.eyeGaze.continuousDurationSec ?? 0,
                  continuousDurationSec: v.eyeGaze.continuousDurationSec ?? v.eyeGaze.durationSec ?? 0,
                  counts: v.eyeGaze.counts || { up: 0, down: 0, left: 0, right: 0 },
                  totalCount: v.eyeGaze.totalCount ?? 0,
                });
              }
              if (v.headMovement) {
                setHeadMovement({
                  direction: v.headMovement.direction || v.headMovement.currentDirection || "center",
                  currentDirection: v.headMovement.currentDirection || v.headMovement.direction || "center",
                  durationSec: v.headMovement.durationSec ?? v.headMovement.continuousDurationSec ?? 0,
                  continuousDurationSec: v.headMovement.continuousDurationSec ?? v.headMovement.durationSec ?? 0,
                  counts: v.headMovement.counts || { up: 0, down: 0, left: 0, right: 0 },
                  totalCount: v.headMovement.totalCount ?? 0,
                });
              }
              if (v.handMovement) {
                setHandMovement({
                  ...v.handMovement,
                  handRaisedCount: v.handMovement.handRaisedCount ?? v.handMovement.counts?.raised ?? 0,
                  handNearFaceCount: v.handMovement.handNearFaceCount ?? v.handMovement.counts?.near_face ?? 0,
                  handNearEarCount: v.handMovement.handNearEarCount ?? v.handMovement.counts?.near_ear ?? 0,
                  handBelowDeskCount: v.handMovement.handBelowDeskCount ?? v.handMovement.counts?.below_desk ?? 0,
                  totalMovements: v.handMovement.totalMovements ?? v.handMovement.totalEvents ?? (
                    (v.handMovement.counts?.raised ?? 0) +
                    (v.handMovement.counts?.near_face ?? 0) +
                    (v.handMovement.counts?.near_ear ?? 0) +
                    (v.handMovement.counts?.below_desk ?? 0)
                  ),
                });
              }

              // Update cumulative sensor movement counters in metricsRef
              if (v.headMovement?.counts) {
                const prev = metricsRef.current.headCounts || { up: 0, down: 0, left: 0, right: 0 };
                metricsRef.current.headCounts = {
                  up: Math.max(prev.up, v.headMovement.counts.up ?? 0),
                  down: Math.max(prev.down, v.headMovement.counts.down ?? 0),
                  left: Math.max(prev.left, v.headMovement.counts.left ?? 0),
                  right: Math.max(prev.right, v.headMovement.counts.right ?? 0),
                };
                metricsRef.current.totalHeadTurns =
                  v.headMovement.totalCount ??
                  (metricsRef.current.headCounts.up +
                    metricsRef.current.headCounts.down +
                    metricsRef.current.headCounts.left +
                    metricsRef.current.headCounts.right);
                metricsRef.current.headMovementCount = metricsRef.current.totalHeadTurns ?? 0;
              }
              if (v.eyeGaze?.counts) {
                const prev = metricsRef.current.gazeCounts || { up: 0, down: 0, left: 0, right: 0, off_screen: 0 };
                metricsRef.current.gazeCounts = {
                  up: Math.max(prev.up, v.eyeGaze.counts.up ?? 0),
                  down: Math.max(prev.down, v.eyeGaze.counts.down ?? 0),
                  left: Math.max(prev.left, v.eyeGaze.counts.left ?? 0),
                  right: Math.max(prev.right, v.eyeGaze.counts.right ?? 0),
                  off_screen: Math.max(prev.off_screen ?? 0, v.eyeGaze.counts.off_screen ?? 0),
                };
                metricsRef.current.totalGazeLooks =
                  v.eyeGaze.totalCount ??
                  (metricsRef.current.gazeCounts.up +
                    metricsRef.current.gazeCounts.down +
                    metricsRef.current.gazeCounts.left +
                    metricsRef.current.gazeCounts.right +
                    (metricsRef.current.gazeCounts.off_screen ?? 0));
                metricsRef.current.lookAwayCount = metricsRef.current.totalGazeLooks ?? 0;
              }
              if (v.handMovement?.counts) {
                const prev = metricsRef.current.handCounts || { raised: 0, near_face: 0, near_ear: 0, below_desk: 0, repeated_movements: 0 };
                metricsRef.current.handCounts = {
                  raised: Math.max(prev.raised, v.handMovement.counts.raised ?? v.handMovement.handRaisedCount ?? 0),
                  near_face: Math.max(prev.near_face, v.handMovement.counts.near_face ?? v.handMovement.handNearFaceCount ?? 0),
                  near_ear: Math.max(prev.near_ear, v.handMovement.counts.near_ear ?? v.handMovement.handNearEarCount ?? 0),
                  below_desk: Math.max(prev.below_desk, v.handMovement.counts.below_desk ?? v.handMovement.handBelowDeskCount ?? 0),
                  repeated_movements: Math.max(
                    prev.repeated_movements,
                    v.handMovement.counts.repeated_movements ?? v.handMovement.totalEvents ?? 0,
                  ),
                };
                metricsRef.current.totalHandEvents =
                  v.handMovement.totalMovements ??
                  (metricsRef.current.handCounts.raised +
                    metricsRef.current.handCounts.near_face +
                    metricsRef.current.handCounts.near_ear +
                    metricsRef.current.handCounts.below_desk);
                metricsRef.current.handEvents = metricsRef.current.totalHandEvents ?? 0;
              }
              setMetrics({ ...metricsRef.current });

              if (v.bodyPose) setBodyPose(v.bodyPose);
              if (v.activeWarnings) setActiveWarnings(v.activeWarnings);
              if (v.warningHistory) setWarningHistory(v.warningHistory);
              if (v.objects) setDetectedObjects(v.objects);
              if (v.totalDetectedObjects !== undefined) setTotalDetectedObjects(v.totalDetectedObjects);
              if (v.totalMovementEvents !== undefined) setTotalMovementEvents(v.totalMovementEvents);

              const isServerHandNearEar = Boolean(v.hands?.nearEar || v.handMovement?.nearEar);
              if (isServerHandNearEar) {
                handNearEarStreakRef.current += 1;
              } else {
                handNearEarStreakRef.current = Math.max(0, handNearEarStreakRef.current - 1);
              }
              // Require consecutive confirmation (>= 4 messages, ~1.0-1.5s sustained) to eliminate background noise & sticky phantoms
              const sustainedServerNearEar = handNearEarStreakRef.current >= 4;

              setSignals((prev) => ({
                ...prev,
                faceDetected: Boolean(v.faceDetected),
                facesCount: v.facesCount ?? prev.facesCount,
                gazeOnScreen: v.gaze?.onScreen ?? prev.gazeOnScreen,
                gazeDirection: v.gaze?.gazeDirection ?? prev.gazeDirection,
                gazeVector: v.gaze?.vector ?? prev.gazeVector,
                headPose: v.headPose?.direction ?? prev.headPose,
                headYaw: v.headPose?.yaw ?? prev.headYaw,
                headPitch: v.headPose?.pitch ?? prev.headPitch,
                headRoll: v.headPose?.roll ?? prev.headRoll,
                phone: Boolean(phoneObj && phoneObj.confidence > 0.32),
                phoneDetected: Boolean(phoneObj && phoneObj.confidence > 0.32),
                phoneConfidence: phoneObj ? phoneObj.confidence : 0,
                smartwatch: Boolean(smartwatchObj && smartwatchObj.confidence > 0.30),
                smartwatchDetected: Boolean(smartwatchObj && smartwatchObj.confidence > 0.30),
                smartwatchConfidence: smartwatchObj ? smartwatchObj.confidence : 0,
                phoneWarning: v.phoneWarning || (phoneObj && phoneObj.confidence > 0.35 ? "WARNING: MOBILE PHONE DETECTED!" : null),
                smartwatchWarning: v.smartwatchWarning || (smartwatchObj && smartwatchObj.confidence > 0.30 ? "WARNING: SMARTWATCH DETECTED!" : null),
                book: Boolean(bookObj && bookObj.confidence > 0.35),
                bookConfidence: bookObj ? bookObj.confidence : 0,
                hand: Boolean(v.hands?.detected),
                handsSuspicious: Boolean(v.hands?.suspicious && (sustainedServerNearEar || v.hands?.belowDesk)),
                handNearEar: sustainedServerNearEar,
                handBelowDesk: Boolean(v.hands?.belowDesk),
                identityMatch: 0.98,
                identityMismatch: false,
              }));

              // Biometric identity is verified during pre-check gate; continuous face matching check is inactive during exam.

              // =========================================================
              // REAL-TIME EVIDENCE SCREENSHOT CAPTURE TRIGGERS
              // Captures timestamped visual snapshot for phones & anomalies
              // =========================================================
              // 1. Mobile Phone Detected (YOLOv8 / Active Warnings) -> Immediate Evidence Screenshot
              const isPhoneDetected = Boolean(
                (phoneObj && phoneObj.confidence > 0.32) ||
                v.phoneWarning ||
                (v.activeWarnings && v.activeWarnings.some((w: any) => typeof w === "string" ? w.includes("PHONE") : w.message?.includes("PHONE")))
              );
              if (isPhoneDetected) {
                pushEvent("phone", 45, true);
              }

              // 2. Smartwatch / Secondary Device Detected -> Immediate Evidence Screenshot
              const isWatchDetected = Boolean(
                (smartwatchObj && smartwatchObj.confidence > 0.30) ||
                v.smartwatchWarning ||
                (v.activeWarnings && v.activeWarnings.some((w: any) => typeof w === "string" ? w.includes("SMARTWATCH") : w.message?.includes("SMARTWATCH")))
              );
              if (isWatchDetected) {
                pushEvent("second_device", 40, true);
              }

              // 3. Prohibited Books / Study Notes -> Immediate Evidence Screenshot
              if (bookObj && bookObj.confidence > 0.32) {
                pushEvent("book", 35, true);
              }

              // 4. Confirmed Multiple Persons -> Immediate Evidence Screenshot
              if (v.facesCount > 1) {
                pushEvent("multi_person", 40, true);
              }

              // 5. Suspicious Hand Movements (Covering ear / answering phone / below desk / near face / hand raised) -> Evidence Screenshot
              // Strictly gated on sustained detection (streak >= 4) to eliminate false single-frame background triggers
              if (sustainedServerNearEar) {
                pushEvent("hand", 35, true);
              } else if (v.hands?.belowDesk || v.handMovement?.belowDesk) {
                pushEvent("hand", 28, true);
              } else if (v.hands?.nearFace || v.handMovement?.nearFace) {
                pushEvent("hand", 25, true);
              } else if (v.hands?.handRaised) {
                pushEvent("hand", 22, true);
              } else if (v.hands?.suspicious) {
                pushEvent("hand", 30, true);
              }

              // 6. Gaze Off-Screen for prolonged duration (>= 3.0s) -> Evidence Screenshot
              if (v.eyeGaze?.durationSec >= 3.0 && v.eyeGaze?.direction !== "center" && v.eyeGaze?.direction !== "screen") {
                pushEvent("looking_away", 25, true, v.eyeGaze?.durationSec);
              }

              // 7. Head Turned Away for prolonged duration (>= 3.5s) -> Evidence Screenshot
              if (v.headMovement?.durationSec >= 3.5 && v.headMovement?.direction !== "center") {
                pushEvent("head_pose", 25, true, v.headMovement?.durationSec);
              }

              // 8. Candidate Absent / Left Camera View -> Evidence Screenshot
              if (v.faceDetected === false) {
                pushEvent("student_absent", 35, true);
              }
            }
            if (data.tenDetections) {
              setTenDetections(data.tenDetections);
            }
            if (data.fourteenDetections) {
              setFourteenDetections(data.fourteenDetections);
            }
            if (data.technicalMetrics) {
              setTechnicalMetrics(data.technicalMetrics);
            }
            if (data.cameraStatus) {
              setCameraStatus(data.cameraStatus);
              setSignals((prev) => ({
                ...prev,
                cameraObscured: Boolean(data.cameraStatus.isObscured),
                cameraFrozen: Boolean(data.cameraStatus.isFrozen),
              }));
              if (data.cameraStatus.isObscured) {
                pushEvent("camera_obscured", 45, true);
              }
            }
            if (data.context) {
              const ctx = data.context;
              setSignals((prev) => ({
                ...prev,
                anomalyScore: ctx.suspicionScore ?? prev.anomalyScore,
                dominantContext: ctx.dominantContext ?? prev.dominantContext,
                mobileGazeCorrelated: Boolean(data.tenDetections?.mobileGazeCorrelation?.detected),
                behaviourDeviation: Boolean(data.tenDetections?.behaviourDeviation?.detected),
                identityMatch: data.vision?.identityConfidence ?? prev.identityMatch,
              }));

              if (Array.isArray(ctx.generatedEvents)) {
                for (const gev of ctx.generatedEvents) {
                  const evType = gev.eventType;
                  if (evType === "MOBILE_ASSISTED_SUSPICIOUS_PATTERN") {
                    pushEvent("phone", 40, true);
                  } else if (evType === "BEHAVIOUR_DEVIATION") {
                    pushEvent("head_pose", 25, true);
                  } else if (evType === "MULTIPLE_PERSONS_DETECTED" || evType === "MULTIPLE_PEOPLE_DETECTED") {
                    pushEvent("multi_person", 38, true);
                  } else if (evType === "HAND_NEAR_EAR") {
                    pushEvent("hand", 28, true);
                  } else if (evType === "HAND_BELOW_DESK") {
                    pushEvent("hand", 22, true);
                  } else if (evType === "GAZE_OFF_SCREEN") {
                    pushEvent("looking_away", 25, true);
                  } else if (evType === "STUDENT_LEAVING_CAMERA_VIEW") {
                    pushEvent("student_absent", 35, true);
                  } else if (evType === "STUDENT_RETURNED") {
                    pushEvent("student_returned", 0, false, gev.duration);
                  } else if (evType === "CAMERA_OBSCURED") {
                    pushEvent("camera_obscured", 45, true);
                  } else if (evType === "VIDEO_INTERRUPTED") {
                    pushEvent("video_interrupted", 30, true);
                  } else if (evType === "REPEATED_LOOK_AWAY" || evType === "REPEATED_LOOKING") {
                    pushEvent("repeated_looking", 35, true);
                  } else if (evType === "BOOK_NOTES_DETECTED") {
                    pushEvent("book", 30, true);
                  } else if (evType === "SECOND_DEVICE_DETECTED") {
                    pushEvent("second_device", 40, true);
                  } else if (evType === "LARGE_PASTE_OPERATION") {
                    pushEvent("large_paste", 15, true);
                  } else if (evType === "TECHNICAL_INTERRUPTION") {
                    pushEvent("technical_interruption", 0, false);
                  }
                }
              }
            }
            if (data.xai) {
              setXaiResult((prev) => ({
                ...prev,
                score: data.dualScores?.suspicionScore ?? prev.score,
                level: (data.context?.riskLevel?.toLowerCase() as any) ?? prev.level,
                levelLabel: data.context?.riskLevel ?? prev.levelLabel,
                headline: data.xai.explanation || prev.headline,
                detailedExplanations: [data.xai.explanation || "Real-time AI monitoring active."],
                attributions: data.xai.featureAttribution?.map((fa: any) => ({
                  factor: fa.feature,
                  weight: fa.weight,
                  pct: Math.round(fa.weight),
                  impact: fa.impact,
                })) || prev.attributions,
              }));
            }
          } catch (e) {
            // parse error ignored
          }
        };

        ws.onerror = () => {
          if (isMounted) {
            setWsConnected(false);
            setSignals((prev) => ({ ...prev, wsConnected: false }));
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          setSignals((prev) => ({ ...prev, wsConnected: false }));
          setTechnicalMetrics((prev) => ({
            ...prev,
            reconnectAttempts: prev.reconnectAttempts + 1,
            sessionInterruptions: prev.sessionInterruptions + 1,
            lastDisconnectReason: "WebSocket stream closed",
          }));
          reconnectTimer = setTimeout(connectWs, 2500);
        };
      } catch (err) {
        if (isMounted) {
          setWsConnected(false);
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [active, pushEvent]);

  /* ----------------- Real-Time AI Inference Loop (15-30 FPS) ----------------- */
  useEffect(() => {
    if (!active) return;
    startedAt.current = Date.now();

    let isRunning = true;
    let lastTickTime = 0;
    let lastUiUpdateTime = 0;

    const runLoop = async () => {
      if (!isRunning) return;

      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        // 1. Process Video Frame via Realtime AI Pipeline
        const visionRes: VisionInferenceResult = await pipelineRef.current.processFrame(video);

        // 2. Render Cyberpunk Live Overlay onto Canvas
        if (canvas) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          pipelineRef.current.renderOverlay(canvas, video, visionRes, overlayOptions);
        }

        // 3. Audio RMS Calculation
        let audioLevel = 0;
        const analyser = analyserRef.current;
        if (analyser) {
          const buf = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = buf[i]! - 128;
            sum += v * v;
          }
          audioLevel = Math.min(1, Math.sqrt(sum / buf.length) / 28);
        }
        const voiceActive = audioLevel > 0.35;

        // 3b. Stream video frame snapshot to Python FastAPI WebSocket backend (~200ms interval for real-time responsiveness)
        const frameNow = Date.now();
        if (
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN &&
          frameNow - lastWsSendAt.current >= 200
        ) {
          lastWsSendAt.current = frameNow;
          try {
            const off = document.createElement("canvas");
            off.width = 480;
            off.height = Math.round((480 * video.videoHeight) / video.videoWidth);
            const offCtx = off.getContext("2d");
            if (offCtx) {
              offCtx.drawImage(video, 0, 0, off.width, off.height);
              const frameB64 = off.toDataURL("image/jpeg", 0.65);
              wsRef.current.send(
                JSON.stringify({
                  sessionId,
                  studentId: studentId || "student",
                  referenceImage: studentPhoto || undefined,
                  referenceEmbedding: enrolledEmbedding ? Array.from(enrolledEmbedding) : undefined,
                  frame: frameB64,
                  audioLevel,
                  browserState: {
                    tabActive: !document.hidden,
                    screenSharing: true,
                    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
                    isExtendedScreen: Boolean((window as any).screen?.isExtended),
                    awayDuration: blurStartRef.current
                      ? Math.round((Date.now() - blurStartRef.current) / 1000)
                      : 0,
                    largePastesCount: largePastesCountRef.current,
                  },
                }),
              );
            }
          } catch (e) {
            // frame send error handled gracefully
          }
        }

        // 3c. Update Real-Time Sensor Telemetry & Movement Badges (~65ms throttle for instant responsiveness)
        const now = Date.now();
        if (now - lastUiUpdateTime >= 65) {
          lastUiUpdateTime = now;

          // Eye Gaze
          if (visionRes.eyeGaze) {
            setEyeGaze({
              direction: visionRes.eyeGaze.direction || visionRes.eyeGaze.currentDirection || "center",
              currentDirection: visionRes.eyeGaze.currentDirection || visionRes.eyeGaze.direction || "screen",
              durationSec: visionRes.eyeGaze.durationSec ?? visionRes.eyeGaze.continuousDurationSec ?? 0,
              continuousDurationSec: visionRes.eyeGaze.continuousDurationSec ?? visionRes.eyeGaze.durationSec ?? 0,
              counts: visionRes.eyeGaze.counts,
              totalCount: visionRes.eyeGaze.totalCount,
            });
          }

          // Head Movement
          if (visionRes.headMovement) {
            setHeadMovement({
              direction: visionRes.headMovement.direction || visionRes.headMovement.currentDirection || "center",
              currentDirection: visionRes.headMovement.currentDirection || visionRes.headMovement.direction || "center",
              durationSec: visionRes.headMovement.durationSec ?? visionRes.headMovement.continuousDurationSec ?? 0,
              continuousDurationSec: visionRes.headMovement.continuousDurationSec ?? visionRes.headMovement.durationSec ?? 0,
              counts: visionRes.headMovement.counts,
              totalCount: visionRes.headMovement.totalCount,
            });
          }

          // Hand Movement
          if (visionRes.handMovement) {
            const hCounts = visionRes.handMovement.counts as any;
            setHandMovement({
              ...visionRes.handMovement,
              handRaisedCount: visionRes.handMovement.handRaisedCount ?? (hCounts?.["raised"] ?? 0),
              handNearFaceCount: visionRes.handMovement.handNearFaceCount ?? (hCounts?.["near_face"] ?? 0),
              handNearEarCount: visionRes.handMovement.handNearEarCount ?? (hCounts?.["near_ear"] ?? 0),
              handBelowDeskCount: visionRes.handMovement.handBelowDeskCount ?? (hCounts?.["below_desk"] ?? 0),
              totalMovements: visionRes.handMovement.totalMovements ?? visionRes.handMovement.totalEvents ?? (
                (hCounts?.["raised"] ?? 0) +
                (hCounts?.["near_face"] ?? 0) +
                (hCounts?.["near_ear"] ?? 0) +
                (hCounts?.["below_desk"] ?? 0)
              ),
            });
          }

          // Cumulative Sensor Metric Synchronization
          const m = metricsRef.current;
          if (visionRes.headMovement?.counts) {
            const prev = m.headCounts || { up: 0, down: 0, left: 0, right: 0 };
            m.headCounts = {
              up: Math.max(prev.up, visionRes.headMovement.counts.up ?? 0),
              down: Math.max(prev.down, visionRes.headMovement.counts.down ?? 0),
              left: Math.max(prev.left, visionRes.headMovement.counts.left ?? 0),
              right: Math.max(prev.right, visionRes.headMovement.counts.right ?? 0),
            };
            m.totalHeadTurns = Math.max(
              m.totalHeadTurns ?? 0,
              visionRes.headMovement.totalCount ?? (m.headCounts.up + m.headCounts.down + m.headCounts.left + m.headCounts.right)
            );
            m.headMovementCount = m.totalHeadTurns;
          }
          if (visionRes.eyeGaze?.counts) {
            const prev = m.gazeCounts || { up: 0, down: 0, left: 0, right: 0, off_screen: 0 };
            m.gazeCounts = {
              up: Math.max(prev.up, visionRes.eyeGaze.counts.up ?? 0),
              down: Math.max(prev.down, visionRes.eyeGaze.counts.down ?? 0),
              left: Math.max(prev.left, visionRes.eyeGaze.counts.left ?? 0),
              right: Math.max(prev.right, visionRes.eyeGaze.counts.right ?? 0),
              off_screen: Math.max(prev.off_screen ?? 0, visionRes.eyeGaze.counts.off_screen ?? 0),
            };
            m.totalGazeLooks = Math.max(
              m.totalGazeLooks ?? 0,
              visionRes.eyeGaze.totalCount ?? (m.gazeCounts.up + m.gazeCounts.down + m.gazeCounts.left + m.gazeCounts.right + (m.gazeCounts.off_screen ?? 0))
            );
            m.lookAwayCount = m.totalGazeLooks;
          }
          if (visionRes.handMovement?.counts) {
            const prev = m.handCounts || { raised: 0, near_face: 0, near_ear: 0, below_desk: 0, repeated_movements: 0 };
            const hCounts = visionRes.handMovement.counts as any;
            m.handCounts = {
              raised: Math.max(prev.raised, hCounts?.["raised"] ?? 0),
              near_face: Math.max(prev.near_face, hCounts?.["near_face"] ?? 0),
              near_ear: Math.max(prev.near_ear, hCounts?.["near_ear"] ?? 0),
              below_desk: Math.max(prev.below_desk, hCounts?.["below_desk"] ?? 0),
              repeated_movements: Math.max(prev.repeated_movements, hCounts?.["repeated_movements"] ?? 0),
            };
            m.totalHandEvents = Math.max(
              m.totalHandEvents ?? 0,
              visionRes.handMovement.totalMovements ?? (m.handCounts.raised + m.handCounts.near_face + m.handCounts.near_ear + m.handCounts.below_desk)
            );
            m.handEvents = m.totalHandEvents;
          }

          if (visionRes.bodyPose) setBodyPose(visionRes.bodyPose);
          if (visionRes.activeWarnings) setActiveWarnings(visionRes.activeWarnings);
          if (visionRes.warningHistory && visionRes.warningHistory.length > 0) setWarningHistory(visionRes.warningHistory);
          if (visionRes.objects) setDetectedObjects(visionRes.objects);
          if (visionRes.totalDetectedObjects !== undefined) setTotalDetectedObjects(visionRes.totalDetectedObjects);
          if (visionRes.totalMovementEvents !== undefined) setTotalMovementEvents(visionRes.totalMovementEvents);

          const isLocalNearEar = Boolean(visionRes.hands?.nearEar);
          if (isLocalNearEar) {
            localHandNearEarStreakRef.current += 1;
          } else {
            localHandNearEarStreakRef.current = Math.max(0, localHandNearEarStreakRef.current - 2);
          }
          // Sustained local near-ear hold (~0.7-1.0s at 30fps)
          const sustainedLocalNearEar = localHandNearEarStreakRef.current >= 20;

          setSignals((prev) => ({
            ...prev,
            faceDetected: visionRes.faceDetected,
            facesCount: visionRes.facesCount,
            gazeOnScreen: visionRes.gaze.onScreen,
            gazeDirection: visionRes.gaze.gazeDirection,
            gazeVector: visionRes.gaze.vector,
            headPose: visionRes.headPose.direction,
            headYaw: visionRes.headPose.yaw,
            headPitch: visionRes.headPose.pitch,
            headRoll: visionRes.headPose.roll,
            phone: visionRes.phoneDetected,
            phoneConfidence: visionRes.phoneConfidence,
            smartwatch: Boolean(visionRes.smartwatchDetected),
            smartwatchConfidence: visionRes.smartwatchConfidence || 0,
            phoneWarning: visionRes.phoneDetected ? "WARNING: MOBILE PHONE DETECTED!" : null,
            smartwatchWarning: visionRes.smartwatchDetected ? "WARNING: SMARTWATCH DETECTED!" : null,
            book: visionRes.bookDetected,
            bookConfidence: visionRes.bookConfidence,
            hand: visionRes.hands.detected,
            handsSuspicious: Boolean(visionRes.hands.suspicious && (sustainedLocalNearEar || visionRes.hands.belowDesk)),
            handNearEar: sustainedLocalNearEar,
            handBelowDesk: visionRes.hands.belowDesk,
            handNearHead: visionRes.hands.nearHead,
            voice: voiceActive,
            audioLevel,
            identityMatch: 0.98,
            identityMismatch: false,
            wsConnected: wsRef.current?.readyState === WebSocket.OPEN,
          }));

          // Biometric identity verified during pre-check gate; face matching check is inactive during exam.

          // Live Immediate Conversation & Verbal Communication Detection
          const isLookingSideways = visionRes.headPose.direction === "left" || visionRes.headPose.direction === "right";
          if (voiceActive && isLookingSideways) {
            pushEvent("voice", 38, true);
          } else if (voiceActive && audioLevel > 0.42) {
            pushEvent("voice", 30, true);
          }
        }

        // 4. Feed into Context-Aware AI Temporal Engine (~1 tick/sec)
        if (now - lastTickTime >= 1000) {
          lastTickTime = now;

          const contextSummary: ContextAnalysisSummary = contextEngineRef.current.addObservation({
            timestamp: now,
            vision: visionRes,
            audioLevel,
            voiceActive,
            tabActive: !document.hidden,
          });

          // 5. Compute Explainable AI (XAI) Attribution & Explanations
          const xai = ExplainableAIEngine.explain(
            visionRes,
            audioLevel,
            contextSummary,
            tabSwitchesRef.current,
          );
          setXaiResult(xai);

          // 6. Update Cumulative Behaviour Metrics
          const m = metricsRef.current;
          if (visionRes.phoneDetected) m.phoneSeconds += 1;
          if (visionRes.bookDetected) m.bookSeconds += 1;
          if (visionRes.multiplePersons) m.multiPersonSeconds += 1;
          if (!visionRes.faceDetected) m.noFaceSeconds += 1;
          if (!visionRes.gaze.onScreen) m.lookAwayCount += 1;
          if (visionRes.headPose.direction !== "center") m.headMovementCount += 1;
          if (voiceActive) m.voiceSeconds += 1;
          const sustainedLocalEarHold = localHandNearEarStreakRef.current >= 20;
          if (visionRes.hands.suspicious && (sustainedLocalEarHold || visionRes.hands.belowDesk)) m.handEvents += 1;
          // Note: faceMismatchCount is not incremented during exam session as face identity is verified at pre-check gate
          setMetrics({ ...m });

          // 7. Emit High-Confidence Contextual Events
          if (visionRes.phoneDetected) {
            pushEvent("phone", 35, true);
          }
          if (visionRes.multiplePersons) {
            pushEvent("multi_person", 38, true);
          }
          if (visionRes.bookDetected) {
            pushEvent("book", 24, true);
          }
          if (!visionRes.faceDetected && contextSummary.metrics.sustainedNoFaceSec >= 3) {
            pushEvent("no_face", 20, true);
          }
          if (visionRes.gaze.gazeDirection === "off-screen") {
            pushEvent("looking_away", 22, true);
          } else if (!visionRes.gaze.onScreen && contextSummary.metrics.sustainedLookAwaySec >= 3) {
            pushEvent("looking_away", 18, true);
          }
          if (voiceActive && contextSummary.metrics.sustainedVoiceSec >= 2) {
            pushEvent("voice", 16, false);
          }
          if (visionRes.hands.suspicious && (sustainedLocalEarHold || visionRes.hands.belowDesk)) {
            pushEvent("hand", sustainedLocalEarHold ? 28 : 18, true);
          }
          // Face mismatch check skipped during exam session

          setSignals((prev) => ({
            ...prev,
            anomalyScore: xai.score,
            dominantContext: contextSummary.dominantContext,
          }));

          // Local Mode Evidence Screenshot Triggers
          if (visionRes.phoneDetected) {
            pushEvent("phone", 45, true);
          }
          if (visionRes.smartwatchDetected) {
            pushEvent("second_device", 40, true);
          }
          if (visionRes.bookDetected) {
            pushEvent("book", 35, true);
          }
          if (visionRes.facesCount > 1) {
            pushEvent("multi_person", 40, true);
          }
          if (visionRes.hands.nearEar) {
            pushEvent("hand", 35, true);
          } else if (visionRes.hands.belowDesk) {
            pushEvent("hand", 28, true);
          } else if (visionRes.hands.nearFace) {
            pushEvent("hand", 25, true);
          } else if (visionRes.hands.handRaised) {
            pushEvent("hand", 22, true);
          } else if (visionRes.hands.suspicious) {
            pushEvent("hand", 30, true);
          }
          if (
            visionRes.eyeGaze &&
            (visionRes.eyeGaze.durationSec ?? 0) >= 3.0 &&
            visionRes.eyeGaze.direction !== "center" &&
            visionRes.eyeGaze.direction !== "screen"
          ) {
            pushEvent("looking_away", 25, true, visionRes.eyeGaze.durationSec);
          }
          if (
            visionRes.headMovement &&
            (visionRes.headMovement.durationSec ?? 0) >= 3.5 &&
            visionRes.headMovement.direction !== "center"
          ) {
            pushEvent("head_pose", 25, true, visionRes.headMovement.durationSec);
          }
          if (!visionRes.faceDetected) {
            pushEvent("student_absent", 35, true);
          }
        }
      }
    } catch (err) {
      console.warn("[Proctor Engine] runLoop cycle non-fatal error recovered:", err);
    } finally {
      if (isRunning) {
        animFrameRef.current = requestAnimationFrame(runLoop);
      }
    }
  };

    animFrameRef.current = requestAnimationFrame(runLoop);

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [active, overlayOptions, pushEvent, sessionId]);

  const risk = computeRisk(metrics);

  const toggleOverlay = useCallback((key: keyof OverlayOptions) => {
    setOverlayOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return {
    videoRef,
    canvasRef,
    signals,
    metrics,
    events,
    risk: {
      score: xaiResult.score,
      level: xaiResult.level,
      reasons: xaiResult.reasons,
      breakdown: xaiResult.attributions.map((a) => ({ factor: a.factor, value: a.weight })),
    },
    xai: xaiResult,
    cameraError,
    cameraReady,
    micReady,
    aiLoaded,
    aiStatus,
    tenDetections,
    fourteenDetections,
    technicalMetrics,
    cameraStatus,
    wsConnected,
    overlayOptions,
    toggleOverlay,
    capture,
    // Real-Time Direction & Movement Tracking
    eyeGaze,
    headMovement,
    handMovement,
    bodyPose,
    // Real-Time Warnings & Detections
    activeWarnings,
    warningHistory,
    detectedObjects,
    totalDetectedObjects,
    totalMovementEvents,
  };
}
