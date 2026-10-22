/**
 * types/proctor.ts
 * ---------------------------------------------------------------------------
 * Standardized Unified Proctoring Types matching all 14 backend AI monitoring features.
 */

export type ProctorEventType =
  // Feature 1
  | "REPEATED_LOOK_AWAY"
  | "GAZE_AWAY"
  | "GAZE_DOWN"
  | "GAZE_SIDE"
  | "GAZE_CENTER"
  | "HEAD_LEFT"
  | "HEAD_RIGHT"
  | "HEAD_DOWN"
  // Feature 2
  | "BOOK_NOTES_DETECTED"
  | "PROHIBITED_OBJECT_DETECTED"
  // Feature 3
  | "EXTERNAL_AI_USAGE"
  | "EXTENSION_POLICY_VIOLATION"
  // Feature 4
  | "EXTERNAL_WEBSITE_SEARCH"
  | "TAB_SWITCH"
  | "FULLSCREEN_EXIT"
  | "WINDOW_BLUR"
  // Feature 5
  | "SECOND_DEVICE_DETECTED"
  | "SECOND_MONITOR_CONNECTED"
  | "PHONE_DETECTED"
  // Feature 6
  | "UNAUTHORIZED_AUDIO_DEVICE"
  | "HAND_NEAR_EAR"
  // Feature 7
  | "LARGE_PASTE_OPERATION"
  | "COPY_ATTEMPT"
  | "PASTE_ATTEMPT"
  | "CUT_ATTEMPT"
  // Feature 8
  | "MULTIPLE_PEOPLE_DETECTED"
  | "MULTIPLE_PERSON"
  // Feature 9
  | "STUDENT_LEAVING_CAMERA_VIEW"
  | "STUDENT_RETURNED"
  // Feature 10
  | "FACE_MISSING"
  | "FACE_PRESENT"
  // Feature 11
  | "IDENTITY_VERIFIED"
  | "IDENTITY_MISMATCH"
  // Feature 12
  | "CAMERA_OBSCURED"
  | "VIDEO_INTERRUPTED"
  // Feature 13
  | "VOICE_ACTIVITY"
  | "REPEATED_VOICE_ACTIVITY"
  // Feature 14
  | "TECHNICAL_INTERRUPTION"
  | "NETWORK_DISCONNECTED"
  | "NETWORK_RECONNECTED"
  | "NETWORK_UNSTABLE"
  | "WEBSOCKET_DISCONNECTED"
  | "WEBSOCKET_RECONNECTED"
  // Composite & Baseline
  | "MOBILE_ASSISTED_SUSPICIOUS_PATTERN"
  | "BASELINE_ESTABLISHED"
  | "BEHAVIOUR_DEVIATION"
  | "BEHAVIOUR_CHAIN_DETECTED"
  | "SCREENSHOT_ATTEMPT";

export interface ProctorEvent {
  id: string;
  sessionId: string;
  studentId: string;
  examId: string;
  eventType: ProctorEventType;
  timestamp: string; // ISO 8601
  duration: number; // in seconds
  confidence: number; // 0.0 - 1.0
  riskContribution: number; // 0 - 100
  source: "MediaPipe" | "YOLOv8" | "Browser" | "WebAudio" | "ContextEngine" | "Biometrics" | "OpenCV Diagnostics";
  evidenceId?: string;
  evidencePath?: string;
  evidenceImage?: string; // base64
  relatedEventIds?: string[];
  metadata?: Record<string, any>;
}

export interface BehaviourChain {
  id: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  eventsInvolved: string[];
  eventOrder: string[];
  combinedRisk: number;
  evidenceReferences?: string[];
  description: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DualRiskScore {
  suspicionScore: number; // 0 - 100
  evidenceConfidence: number; // 0 - 100
  riskLevel: RiskLevel;
  dominantContext: string;
  differenceExplanation: string;
  contributingEvents: Array<{
    factor: string;
    contribution: number;
    confidence: number;
  }>;
}

export interface TechnicalMetrics {
  isOnline: boolean;
  technicalStatus?: "STABLE" | "UNSTABLE" | "OFFLINE";
  incidentCount?: number;
  totalOfflineSec?: number;
  reconnectCount?: number;
  isOffline: boolean;
  networkDisconnects: number;
  sessionInterruptions: number;
  totalOfflineSeconds: number;
  reconnectAttempts: number;
  heartbeatFailures: number;
  lastDisconnectReason: string | null;
  connectionHealth: "HEALTHY" | "DEGRADED" | "DISCONNECTED";
}

export interface DetectionFeatureItem {
  id: string;
  featureNumber: number;
  label: string;
  detected: boolean;
  status: "normal" | "warning" | "alert";
  statusText: string;
  tool: string;
  confidence?: number;
  count?: number;
  disclaimer?: string;
  metadata?: Record<string, any>;
  isConfirmedUnauthorized?: boolean;
  requiresFacultyVerification?: boolean;
}

export interface FourteenDetectionsStatus {
  repeatedLooking: DetectionFeatureItem;
  bookNotesDetection: DetectionFeatureItem;
  externalAiUsage: DetectionFeatureItem;
  externalWebsiteSearch: DetectionFeatureItem;
  secondMonitorDevice: DetectionFeatureItem;
  unauthorizedAudioDevice: DetectionFeatureItem;
  suspiciousInputActivity: DetectionFeatureItem;
  multiplePeople: DetectionFeatureItem;
  studentLeavingView: DetectionFeatureItem;
  faceMissing: DetectionFeatureItem;
  identityMismatch: DetectionFeatureItem;
  cameraBlockingTampering: DetectionFeatureItem;
  voiceVerbalAssistance: DetectionFeatureItem;
  networkInterruptions: DetectionFeatureItem;
}

export interface FacultyReview {
  sessionId: string;
  status: "Reviewed" | "No Concern" | "Needs Review" | "Suspicious";
  comment: string;
  reviewedBy: string;
  timestamp: string;
}

export interface EvidenceItem {
  id: string;
  sessionId: string;
  eventId: string;
  timestamp: string;
  type: string;
  confidence: number;
  duration: number;
  imageB64: string;
  hash: string;
  metadata?: Record<string, any>;
}
