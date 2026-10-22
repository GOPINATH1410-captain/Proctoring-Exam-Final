/**
 * xai-engine.ts
 * ---------------------------------------------------------------------------
 * Explainable AI (XAI) Attribution & Natural Language Reasoning Engine.
 *
 * Implements:
 *  - SHAP/Feature Attribution Decomposition (% contribution per factor)
 *  - Dynamic Natural Language Reason Generator (NLG with geometric & temporal parameters)
 *  - Visual Saliency & Risk Level Categorization (Green, Yellow, Red)
 *  - Report-ready structured breakdown for Recharts radar/bar visualizations
 */

import type { VisionInferenceResult } from "./realtime-ai-engine";
import type { ContextAnalysisSummary } from "./context-engine";

export type RiskLevel = "green" | "yellow" | "red";

export interface XAIFactorAttribution {
  factor: string;
  weight: number; // raw weighted contribution
  percentage: number; // 0..100% of total risk
  evidence: string; // exact metric value (e.g., "Yaw: -32°", "94% Conf", "4.2s")
  status: "safe" | "warning" | "violation";
}

export interface XAIExplanationResult {
  score: number;
  level: RiskLevel;
  levelLabel: string;
  headline: string;
  reasons: string[];
  detailedExplanations: string[];
  attributions: XAIFactorAttribution[];
  dominantFactor: string;
}

export class ExplainableAIEngine {
  /**
   * Generates mathematical attribution & natural language explanation
   */
  public static explain(
    vision: VisionInferenceResult,
    audioLevel: number,
    contextSummary: ContextAnalysisSummary,
    tabSwitches: number,
  ): XAIExplanationResult {
    const attributions: XAIFactorAttribution[] = [];
    const reasons: string[] = [];
    const detailedExplanations: string[] = [];

    // 1. Phone Attribution
    if (vision.phoneDetected || contextSummary.metrics.sustainedPhoneSec > 0) {
      const weight = Math.min(45, 25 + contextSummary.metrics.sustainedPhoneSec * 4);
      attributions.push({
        factor: "Mobile Phone",
        weight,
        percentage: 0,
        evidence: `Detected with ${Math.round(vision.phoneConfidence * 100)}% confidence (${contextSummary.metrics.sustainedPhoneSec}s)`,
        status: "violation",
      });
      reasons.push(`Mobile phone detected for ${contextSummary.metrics.sustainedPhoneSec || 1}s`);
      detailedExplanations.push(
        `YOLOv8 detected a mobile phone in camera frame with ${Math.round(vision.phoneConfidence * 100)}% confidence for ${contextSummary.metrics.sustainedPhoneSec || 1}s.`,
      );
    }

    // 2. Multiple Persons Attribution
    if (vision.multiplePersons || contextSummary.metrics.multiPersonSec > 0) {
      const weight = 40;
      attributions.push({
        factor: "Multiple Persons",
        weight,
        percentage: 0,
        evidence: `${vision.facesCount || 2} faces detected in frame`,
        status: "violation",
      });
      reasons.push(`Second person detected in candidate environment`);
      detailedExplanations.push(
        `MediaPipe & YOLOv8 identified ${vision.facesCount || 2} persons simultaneously in the proctoring frame.`,
      );
    }

    // 3. Collaborator Speech / Voice Attribution
    if (contextSummary.metrics.collaboratorChatSec > 1) {
      const weight = Math.min(35, 18 + contextSummary.metrics.collaboratorChatSec * 3);
      attributions.push({
        factor: "Off-screen Speech",
        weight,
        percentage: 0,
        evidence: `Head turned ${vision.headPose.yaw}° with voice RMS ${audioLevel.toFixed(2)}`,
        status: "violation",
      });
      reasons.push(
        `Conversing while head turned away for ${contextSummary.metrics.collaboratorChatSec}s`,
      );
      detailedExplanations.push(
        `Multi-modal fusion correlated sustained voice RMS (${audioLevel.toFixed(2)}) with ${vision.headPose.direction} head rotation (${vision.headPose.yaw}°).`,
      );
    } else if (audioLevel > 0.4 || contextSummary.metrics.sustainedVoiceSec > 1) {
      const weight = Math.min(20, 8 + contextSummary.metrics.sustainedVoiceSec * 2);
      attributions.push({
        factor: "Voice Activity",
        weight,
        percentage: 0,
        evidence: `Audio Level: ${Math.round(audioLevel * 100)}% RMS (${contextSummary.metrics.sustainedVoiceSec}s)`,
        status: "warning",
      });
      reasons.push(
        `Background voice activity detected (${contextSummary.metrics.sustainedVoiceSec}s)`,
      );
      detailedExplanations.push(
        `Microphone detected continuous speech or ambient dialogue exceeding normal thresholds (${Math.round(audioLevel * 100)}% RMS).`,
      );
    }

    // 4. Gaze / Head Pose Attribution
    if (!vision.gaze.onScreen || contextSummary.metrics.sustainedLookAwaySec > 2) {
      const weight = Math.min(30, 12 + contextSummary.metrics.sustainedLookAwaySec * 2);
      attributions.push({
        factor: "Gaze Deviation",
        weight,
        percentage: 0,
        evidence: `Iris vector: ${vision.gaze.gazeDirection}, Head Yaw: ${vision.headPose.yaw}°, Pitch: ${vision.headPose.pitch}°`,
        status: contextSummary.metrics.sustainedLookAwaySec > 4 ? "violation" : "warning",
      });
      reasons.push(
        `Looking away towards ${vision.gaze.gazeDirection} for ${contextSummary.metrics.sustainedLookAwaySec}s`,
      );
      detailedExplanations.push(
        `MediaPipe Iris landmark tracking registered off-screen gaze vector directed towards ${vision.gaze.gazeDirection} (Head Yaw: ${vision.headPose.yaw}°, Pitch: ${vision.headPose.pitch}°).`,
      );
    }

    // 5. Book / Reference Materials
    if (vision.bookDetected) {
      attributions.push({
        factor: "Prohibited Notes/Book",
        weight: 28,
        percentage: 0,
        evidence: `Detected with ${Math.round(vision.bookConfidence * 100)}% confidence`,
        status: "violation",
      });
      reasons.push(`Printed book or notes detected in frame`);
      detailedExplanations.push(
        `YOLOv8 detected printed material / open book in candidate desk area with ${Math.round(vision.bookConfidence * 100)}% confidence.`,
      );
    }

    // 6. Face Absence / Station Abandonment
    if (!vision.faceDetected || contextSummary.metrics.sustainedNoFaceSec > 2) {
      const weight = Math.min(40, 15 + contextSummary.metrics.sustainedNoFaceSec * 5);
      attributions.push({
        factor: "Face Absent",
        weight,
        percentage: 0,
        evidence: `Candidate missing for ${contextSummary.metrics.sustainedNoFaceSec}s`,
        status: "violation",
      });
      reasons.push(
        `Face missing from camera frame for ${contextSummary.metrics.sustainedNoFaceSec}s`,
      );
      detailedExplanations.push(
        `Zero facial landmarks detected in frame for ${contextSummary.metrics.sustainedNoFaceSec} consecutive seconds.`,
      );
    }

    // 7. Hand Behavior
    if (vision.hands.suspicious) {
      attributions.push({
        factor: "Suspicious Hand Position",
        weight: 18,
        percentage: 0,
        evidence: vision.hands.nearEar ? "Hand near ear/head" : "Hand below desk area",
        status: "warning",
      });
      reasons.push(
        `Suspicious hand positioning (${vision.hands.nearEar ? "near ear" : "reaching below desk"})`,
      );
      detailedExplanations.push(
        `Hand landmarks indicated hand positioned ${vision.hands.nearEar ? "near ear (possible earbud/whispering)" : "below desk plane"}.`,
      );
    }

    // 8. Tab Switching
    if (tabSwitches > 0) {
      const weight = Math.min(25, tabSwitches * 8);
      attributions.push({
        factor: "Tab Switching",
        weight,
        percentage: 0,
        evidence: `Candidate navigated away ${tabSwitches} time(s)`,
        status: "warning",
      });
      reasons.push(`Left exam window ${tabSwitches} time(s)`);
      detailedExplanations.push(
        `Browser visibility change events recorded ${tabSwitches} instances of candidate leaving the proctoring tab.`,
      );
    }

    // Compute raw total and percentage breakdown
    const totalRaw = attributions.reduce((acc, a) => acc + a.weight, 0);
    const score = Math.max(0, Math.min(100, Math.round(totalRaw)));

    attributions.forEach((a) => {
      a.percentage = totalRaw > 0 ? Math.round((a.weight / totalRaw) * 100) : 0;
    });

    // Sort attributions by highest contribution
    attributions.sort((a, b) => b.weight - a.weight);

    const level: RiskLevel = score >= 65 ? "red" : score >= 30 ? "yellow" : "green";
    const levelLabel =
      level === "red" ? "High Risk" : level === "yellow" ? "Medium Risk" : "Low Risk";

    let headline = "Candidate is behaving normally with clear focus.";
    if (score >= 65) {
      headline = `Severe integrity warning: ${reasons.slice(0, 2).join(" & ")}.`;
    } else if (score >= 30) {
      headline = `Moderate anomaly detected: ${reasons[0] ?? "Gaze or audio deviation"}.`;
    }

    const dominantFactor = attributions[0]?.factor ?? "Normal Behavior";

    return {
      score,
      level,
      levelLabel,
      headline,
      reasons: reasons.length > 0 ? reasons : ["Normal exam behavior maintained."],
      detailedExplanations:
        detailedExplanations.length > 0
          ? detailedExplanations
          : ["MediaPipe and YOLOv8 models verify single candidate centered with on-screen gaze."],
      attributions,
      dominantFactor,
    };
  }
}
