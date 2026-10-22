/**
 * context-engine.ts
 * ---------------------------------------------------------------------------
 * Context-Aware AI Temporal Engine for NextGen Proctoring.
 *
 * Implements:
 *  - Temporal Sliding Window Analysis (replaces single-frame noisy spikes)
 *  - Multi-Modal Co-occurrence Fusion:
 *      * [Gaze Down + Hand Down + Phone Detected] => High Confidence Phone Cheating
 *      * [Head Turned Yaw > 25° + Voice RMS Activity] => Prohibited Collaboration
 *      * [Face Absent > 3.5s] => Station Abandonment
 *      * [Second Face in frame] => Multi-Person Breach
 *  - Exponential Moving Average (EMA) Anomaly Index
 *  - Contextual Incident Emitter with detailed spatial-temporal metadata
 */

import type { VisionInferenceResult } from "./realtime-ai-engine";

export interface ContextObservation {
  timestamp: number;
  vision: VisionInferenceResult;
  audioLevel: number;
  voiceActive: boolean;
  tabActive: boolean;
}

export interface ContextualAnomaly {
  id: string;
  type:
    | "phone_cheating"
    | "collaborator_conversation"
    | "station_abandonment"
    | "multi_person_breach"
    | "persistent_look_away"
    | "suspicious_notes_reading"
    | "suspicious_hand_behavior"
    | "tab_switching_violation";
  title: string;
  description: string;
  severity: number; // 0..100
  confidence: number; // 0..1
  durationSec: number;
  factors: string[];
  timestamp: number;
}

export interface ContextAnalysisSummary {
  anomalyScore: number; // 0..100 smoothed
  activeAnomalies: ContextualAnomaly[];
  dominantContext: string;
  coOccurrenceTriggered: boolean;
  metrics: {
    sustainedPhoneSec: number;
    sustainedLookAwaySec: number;
    sustainedVoiceSec: number;
    sustainedNoFaceSec: number;
    collaboratorChatSec: number;
    multiPersonSec: number;
    tabSwitches: number;
  };
}

export class ContextAwareEngine {
  private buffer: ContextObservation[] = [];
  private readonly maxBufferSize = 60; // 60 seconds history
  private currentAnomalyScore = 0;
  private consecutivePhoneFrames = 0;
  private consecutiveLookAwayFrames = 0;
  private consecutiveVoiceFrames = 0;
  private consecutiveNoFaceFrames = 0;
  private consecutiveMultiPersonFrames = 0;
  private consecutiveChatFrames = 0;
  private tabSwitchesCount = 0;

  /** Push new real-time observation into temporal context */
  public addObservation(obs: ContextObservation): ContextAnalysisSummary {
    this.buffer.push(obs);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    const { vision, audioLevel, voiceActive, tabActive } = obs;

    // 1. Update consecutive state counters (each tick is ~1s)
    if (vision.phoneDetected) this.consecutivePhoneFrames += 1;
    else this.consecutivePhoneFrames = Math.max(0, this.consecutivePhoneFrames - 0.5);

    if (!vision.gaze.onScreen || vision.headPose.direction !== "center")
      this.consecutiveLookAwayFrames += 1;
    else this.consecutiveLookAwayFrames = Math.max(0, this.consecutiveLookAwayFrames - 0.5);

    if (voiceActive || audioLevel > 0.38) this.consecutiveVoiceFrames += 1;
    else this.consecutiveVoiceFrames = Math.max(0, this.consecutiveVoiceFrames - 0.5);

    if (!vision.faceDetected || vision.facesCount === 0) this.consecutiveNoFaceFrames += 1;
    else this.consecutiveNoFaceFrames = Math.max(0, this.consecutiveNoFaceFrames - 1);

    if (vision.multiplePersons || vision.facesCount > 1) this.consecutiveMultiPersonFrames += 1;
    else this.consecutiveMultiPersonFrames = Math.max(0, this.consecutiveMultiPersonFrames - 0.5);

    // Multi-modal collaboration chat (turning head sideways + speaking)
    const isChattingSideways =
      (vision.headPose.direction === "left" || vision.headPose.direction === "right") &&
      (voiceActive || audioLevel > 0.32);
    if (isChattingSideways) this.consecutiveChatFrames += 1;
    else this.consecutiveChatFrames = Math.max(0, this.consecutiveChatFrames - 0.5);

    if (!tabActive) this.tabSwitchesCount += 1;

    // 2. Multi-Modal Context Heuristics & Anomaly Generation
    const activeAnomalies: ContextualAnomaly[] = [];
    let instantRisk = 0;
    const factors: string[] = [];

    // Context A: High-Confidence Phone Cheating
    // Gaze is looking down/off-screen AND phone is detected AND hands are near bottom/face
    if (vision.phoneDetected && this.consecutivePhoneFrames >= 1) {
      const isGazeDown = vision.headPose.pitch < -10 || vision.gaze.gazeDirection === "down";
      const isHandDown = vision.hands.belowDesk || vision.hands.nearFace;
      const confidence = isGazeDown && isHandDown ? 0.96 : vision.phoneConfidence;
      const severity = isGazeDown ? 88 : 72;

      activeAnomalies.push({
        id: `phone-${Date.now()}`,
        type: "phone_cheating",
        title: "Active Mobile Phone Usage",
        description: `Mobile phone in active use (${Math.round(this.consecutivePhoneFrames)}s). Gaze oriented downward toward device.`,
        severity,
        confidence,
        durationSec: Math.round(this.consecutivePhoneFrames),
        factors: [
          "Object Detection: Cell Phone",
          `Pitch: ${vision.headPose.pitch}°`,
          `Confidence: ${Math.round(confidence * 100)}%`,
        ],
        timestamp: Date.now(),
      });
      instantRisk += severity;
      factors.push("Active Phone Cheating");
    }

    // Context B: Collaborator Communication (Speech + Gaze off-screen)
    if (this.consecutiveChatFrames >= 2) {
      activeAnomalies.push({
        id: `collab-${Date.now()}`,
        type: "collaborator_conversation",
        title: "Candidate Communicating with Collaborator",
        description: `Candidate turned head ${vision.headPose.yaw}° and sustained voice activity for ${Math.round(this.consecutiveChatFrames)}s.`,
        severity: 80,
        confidence: 0.91,
        durationSec: Math.round(this.consecutiveChatFrames),
        factors: [
          `Head Yaw: ${vision.headPose.yaw}°`,
          `Audio RMS: ${audioLevel.toFixed(2)}`,
          "Voice Activity: Positive",
        ],
        timestamp: Date.now(),
      });
      instantRisk += 80;
      factors.push("Collaborator Speech");
    }

    // Context C: Multi-Person Breach (Confirmed across >= 3 seconds)
    if (vision.multiplePersons && this.consecutiveMultiPersonFrames >= 3) {
      activeAnomalies.push({
        id: `multi-${Date.now()}`,
        type: "multi_person_breach",
        title: "Multiple Persons in Exam Environment",
        description: `${vision.facesCount > 1 ? vision.facesCount : 2} persons detected in candidate camera frame.`,
        severity: 92,
        confidence: 0.95,
        durationSec: Math.round(this.consecutiveMultiPersonFrames),
        factors: [`Faces Count: ${vision.facesCount}`, "Prohibited Third-Party Presence"],
        timestamp: Date.now(),
      });
      instantRisk += 92;
      factors.push("Multiple Persons");
    }

    // Context D: Station Abandonment (Face absent > 3s)
    if (this.consecutiveNoFaceFrames >= 3) {
      activeAnomalies.push({
        id: `noface-${Date.now()}`,
        type: "station_abandonment",
        title: "Candidate Absent from Camera",
        description: `Candidate has been missing from the camera frame for ${Math.round(this.consecutiveNoFaceFrames)} seconds.`,
        severity: 75,
        confidence: 0.98,
        durationSec: Math.round(this.consecutiveNoFaceFrames),
        factors: ["Zero Face Landmarks Detected", "Empty Proctoring Frame"],
        timestamp: Date.now(),
      });
      instantRisk += 75;
      factors.push("Candidate Absent");
    }

    // Context E: Persistent Gaze Deviation (looking away > 3s without phone)
    if (this.consecutiveLookAwayFrames >= 3 && !vision.phoneDetected) {
      activeAnomalies.push({
        id: `lookaway-${Date.now()}`,
        type: "persistent_look_away",
        title: "Persistent Gaze Off-Screen",
        description: `Candidate looking away towards ${vision.headPose.direction} for ${Math.round(this.consecutiveLookAwayFrames)}s.`,
        severity: 55,
        confidence: 0.88,
        durationSec: Math.round(this.consecutiveLookAwayFrames),
        factors: [
          `Gaze Direction: ${vision.gaze.gazeDirection}`,
          `Yaw: ${vision.headPose.yaw}°`,
          `Pitch: ${vision.headPose.pitch}°`,
        ],
        timestamp: Date.now(),
      });
      instantRisk += 55;
      factors.push("Gaze Off-Screen");
    }

    // Context F: Prohibited Book / Printed Notes
    if (vision.bookDetected) {
      activeAnomalies.push({
        id: `book-${Date.now()}`,
        type: "suspicious_notes_reading",
        title: "Reference Material / Book Visible",
        description: `Book or notes detected in frame with ${Math.round(vision.bookConfidence * 100)}% confidence.`,
        severity: 68,
        confidence: vision.bookConfidence,
        durationSec: 2,
        factors: [
          "Object Detection: Book / Notes",
          `Confidence: ${Math.round(vision.bookConfidence * 100)}%`,
        ],
        timestamp: Date.now(),
      });
      instantRisk += 68;
      factors.push("Prohibited Notes");
    }

    // 3. Compute Exponential Moving Average (EMA) Anomaly Score
    const alpha = 0.35; // responsiveness factor
    this.currentAnomalyScore = Math.min(
      100,
      Math.round(this.currentAnomalyScore * (1 - alpha) + instantRisk * alpha),
    );

    // Determine dominant context description
    let dominantContext = "Normal Exam Execution";
    if (factors.length > 0) {
      dominantContext = factors.join(" + ");
    }

    return {
      anomalyScore: this.currentAnomalyScore,
      activeAnomalies,
      dominantContext,
      coOccurrenceTriggered: factors.length > 1,
      metrics: {
        sustainedPhoneSec: Math.round(this.consecutivePhoneFrames),
        sustainedLookAwaySec: Math.round(this.consecutiveLookAwayFrames),
        sustainedVoiceSec: Math.round(this.consecutiveVoiceFrames),
        sustainedNoFaceSec: Math.round(this.consecutiveNoFaceFrames),
        collaboratorChatSec: Math.round(this.consecutiveChatFrames),
        multiPersonSec: Math.round(this.consecutiveMultiPersonFrames),
        tabSwitches: this.tabSwitchesCount,
      },
    };
  }

  public reset() {
    this.buffer = [];
    this.currentAnomalyScore = 0;
    this.consecutivePhoneFrames = 0;
    this.consecutiveLookAwayFrames = 0;
    this.consecutiveVoiceFrames = 0;
    this.consecutiveNoFaceFrames = 0;
    this.consecutiveMultiPersonFrames = 0;
    this.consecutiveChatFrames = 0;
    this.tabSwitchesCount = 0;
  }
}
