/**
 * proctor-events.ts
 * ---------------------------------------------------------------------------
 * Unified Event Normalization Data Contracts for the NextGen AI Proctoring System.
 *
 * Every detection from computer vision (YOLOv8, MediaPipe), browser monitoring,
 * and audio processing is normalized to this standardized event format before
 * entering the Context-Aware Behaviour & Risk Engine.
 */

export type NormalizedEventType =
  // Computer Vision - Face & Presence
  | "FACE_PRESENT"
  | "FACE_MISSING"
  | "MULTIPLE_PERSON"
  | "IDENTITY_VERIFIED"
  | "IDENTITY_MISMATCH"
  // Computer Vision - Prohibited Items
  | "PHONE_DETECTED"
  | "PROHIBITED_OBJECT_DETECTED"
  // Computer Vision - Gaze & Attention
  | "GAZE_CENTER"
  | "GAZE_AWAY"
  | "GAZE_DOWN"
  | "GAZE_SIDE"
  // Computer Vision - Head Pose
  | "HEAD_LEFT"
  | "HEAD_RIGHT"
  | "HEAD_DOWN"
  // Multimodal Context Patterns
  | "MOBILE_ASSISTED_SUSPICIOUS_PATTERN"
  | "BEHAVIOUR_CHAIN_DETECTED"
  | "BEHAVIOUR_DEVIATION"
  // Audio
  | "VOICE_ACTIVITY"
  | "REPEATED_VOICE_ACTIVITY"
  // Browser & Environment Security
  | "TAB_SWITCH"
  | "COPY_ATTEMPT"
  | "PASTE_ATTEMPT"
  | "CUT_ATTEMPT"
  | "SCREEN_SHARE_STARTED"
  | "SCREEN_SHARE_STOPPED"
  | "FULLSCREEN_EXIT"
  | "EXTENSION_POLICY_VIOLATION"
  // Network
  | "NETWORK_DISCONNECTED"
  | "NETWORK_RECONNECTED"
  | "NETWORK_UNSTABLE";

export interface ProctorEvent {
  id: string;
  sessionId: string;
  studentId: string;
  examId: string;
  eventType: NormalizedEventType;
  label: string;
  timestamp: string; // ISO 8601
  clock: string; // HH:MM:SS
  durationSec: number;
  confidence: number; // 0.0 - 1.0 (Raw sensory detection confidence)
  riskContribution: number; // 0 - 100 (Contribution to contextual risk)
  source: "YOLOv8" | "MediaPipe" | "WebAudio" | "Browser" | "ContextEngine" | "IdentityVerifier";
  metadata?: Record<string, unknown>;
  evidenceBase64?: string;
  evidencePath?: string;
  relatedEventIds?: string[];
}

export interface BehaviourChain {
  id: string;
  sessionId: string;
  title: string;
  patternType: "MOBILE_ASSISTED" | "EXTERNAL_COLLABORATION" | "CONTENT_LOOKUP" | "ABSENCE_PATTERN";
  events: ProctorEvent[];
  startTime: string;
  endTime: string;
  durationSec: number;
  chainRiskScore: number;
  explanation: string;
}

export interface ContextualEvaluationResult {
  suspicionScore: number; // 0 - 100%
  evidenceConfidence: number; // 0 - 100%
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dominantPattern: string;
  explanation: string;
  behaviourChains: BehaviourChain[];
  contributingFactors: Array<{
    name: string;
    riskScore: number;
    sensorConfidence: number;
    eventCount: number;
    description: string;
  }>;
}

export interface FacultyDecision {
  status: "PENDING" | "REVIEWED" | "NO_CONCERN" | "NEEDS_REVIEW" | "SUSPICIOUS";
  reviewedAt?: string;
  reviewerName?: string;
  comments?: string;
  actionTaken?: string;
}

export const EVENT_LABELS: Record<NormalizedEventType, string> = {
  FACE_PRESENT: "Candidate Face In Frame",
  FACE_MISSING: "Face Missing From Webcam",
  MULTIPLE_PERSON: "Multiple Individuals Detected",
  IDENTITY_VERIFIED: "Biometric Identity Confirmed",
  IDENTITY_MISMATCH: "Facial Identity Mismatch",
  PHONE_DETECTED: "Mobile Phone Detected",
  PROHIBITED_OBJECT_DETECTED: "Prohibited Reference Material Detected",
  GAZE_CENTER: "Gaze Focused On Screen",
  GAZE_AWAY: "Gaze Directed Off-Screen",
  GAZE_DOWN: "Gaze Directed Downward",
  GAZE_SIDE: "Gaze Directed Sideways",
  HEAD_LEFT: "Head Turned Left",
  HEAD_RIGHT: "Head Turned Right",
  HEAD_DOWN: "Head Angled Downward",
  MOBILE_ASSISTED_SUSPICIOUS_PATTERN: "Mobile-Assisted Suspicious Pattern (Phone + Gaze/Head Down)",
  BEHAVIOUR_CHAIN_DETECTED: "Temporal Behaviour Chain Detected",
  BEHAVIOUR_DEVIATION: "Significant Behavioural Baseline Deviation",
  VOICE_ACTIVITY: "Voice Activity Detected",
  REPEATED_VOICE_ACTIVITY: "Repeated Ongoing Voice Activity",
  TAB_SWITCH: "Browser Window / Tab Left Exam Focus",
  COPY_ATTEMPT: "Unauthorized Copy Action Intercepted",
  PASTE_ATTEMPT: "Unauthorized Paste Action Intercepted",
  CUT_ATTEMPT: "Unauthorized Cut Action Intercepted",
  SCREEN_SHARE_STARTED: "Screen Sharing Active",
  SCREEN_SHARE_STOPPED: "Screen Sharing Stream Interrupted",
  FULLSCREEN_EXIT: "Exam Fullscreen Mode Exited",
  EXTENSION_POLICY_VIOLATION: "Browser Extension Policy Violation",
  NETWORK_DISCONNECTED: "Network Connection Lost",
  NETWORK_RECONNECTED: "Network Connection Restored",
  NETWORK_UNSTABLE: "Network High Latency / Unstable",
};
