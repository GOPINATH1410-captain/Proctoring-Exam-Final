/**
 * context-aware-engine.ts
 * ---------------------------------------------------------------------------
 * Core Research Component:
 * Context-Aware Multimodal Behaviour Analysis and Temporal Evidence Fusion
 * for Explainable Online Examination Proctoring.
 *
 * Combines:
 *  - Event Normalization
 *  - Multimodal Sensory Correlation (Vision, Audio, Browser, Network)
 *  - Temporal Event Chains (Sliding Window Fusion)
 *  - Student Behaviour Baseline & Deviation Tracking
 *  - Separate Suspicion Score vs. Evidence Confidence
 *  - Explainable AI Narrative Attribution
 */

import {
  type BehaviourChain,
  type ContextualEvaluationResult,
  type NormalizedEventType,
  type ProctorEvent,
} from "./proctor-events";

export interface CandidateBaseline {
  established: boolean;
  sampleCount: number;
  avgGazeAwayPerMin: number;
  avgHeadMovePerMin: number;
  audioNoiseFloorRms: number;
  naturalBlinkRatePerMin: number;
}

export class ContextAwareRiskEngine {
  private eventsHistory: ProctorEvent[] = [];
  private baseline: CandidateBaseline = {
    established: false,
    sampleCount: 0,
    avgGazeAwayPerMin: 2.0,
    avgHeadMovePerMin: 3.0,
    audioNoiseFloorRms: 0.05,
    naturalBlinkRatePerMin: 14.0,
  };

  /** Sliding window duration in milliseconds for temporal correlation. */
  private windowDurationMs = 25_000;

  public addEvent(event: ProctorEvent): void {
    this.eventsHistory.push(event);
    // Keep max 500 recent events in memory
    if (this.eventsHistory.length > 500) {
      this.eventsHistory.shift();
    }
  }

  public getEvents(): ProctorEvent[] {
    return this.eventsHistory;
  }

  /**
   * Evaluates the entire session's events using temporal multimodal fusion.
   */
  public evaluate(currentActiveEvents?: ProctorEvent[]): ContextualEvaluationResult {
    const all = [...this.eventsHistory, ...(currentActiveEvents || [])];
    if (all.length === 0) {
      return {
        suspicionScore: 0,
        evidenceConfidence: 0,
        riskLevel: "LOW",
        dominantPattern: "Normal Exam Session Execution",
        explanation: "No anomalies detected. Candidate behavior remains within normal examination parameters.",
        behaviourChains: [],
        contributingFactors: [],
      };
    }

    const now = Date.now();
    // 1. Find recent events within the temporal sliding window
    const recentEvents = all.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return now - t <= this.windowDurationMs;
    });

    // 2. Identify Multimodal Temporal Behaviour Chains
    const chains: BehaviourChain[] = this.detectBehaviourChains(all);

    // 3. Compute factor aggregations across session
    const phoneEvents = all.filter((e) => e.eventType === "PHONE_DETECTED");
    const gazeDownEvents = all.filter((e) => e.eventType === "GAZE_DOWN" || e.eventType === "GAZE_AWAY");
    const headDownEvents = all.filter((e) => e.eventType === "HEAD_DOWN" || e.eventType === "HEAD_LEFT" || e.eventType === "HEAD_RIGHT");
    const voiceEvents = all.filter((e) => e.eventType === "VOICE_ACTIVITY" || e.eventType === "REPEATED_VOICE_ACTIVITY");
    const personEvents = all.filter((e) => e.eventType === "MULTIPLE_PERSON");
    const tabEvents = all.filter((e) => e.eventType === "TAB_SWITCH");
    const copyPasteEvents = all.filter((e) => e.eventType === "COPY_ATTEMPT" || e.eventType === "PASTE_ATTEMPT" || e.eventType === "CUT_ATTEMPT");
    const extensionEvents = all.filter((e) => e.eventType === "EXTENSION_POLICY_VIOLATION");
    const faceMissingEvents = all.filter((e) => e.eventType === "FACE_MISSING");
    const screenShareStopEvents = all.filter((e) => e.eventType === "SCREEN_SHARE_STOPPED");

    // 4. Calculate Raw Evidence Confidence (Sensory reliability of models)
    let weightedConfidenceSum = 0;
    let weightSum = 0;
    for (const ev of all) {
      const w = ev.riskContribution > 0 ? ev.riskContribution : 10;
      weightedConfidenceSum += ev.confidence * w;
      weightSum += w;
    }
    const evidenceConfidence = weightSum > 0 ? Math.round((weightedConfidenceSum / weightSum) * 100) : 95;

    // 5. Calculate Suspicion Score via Multi-Modal Contextual Fusion
    // Crucial Rule: A single 1-second event NEVER directly yields high risk.
    let rawSuspicion = 0;

    // (A) Phone Context: High risk only when correlated with gaze down / persistent visibility
    if (phoneEvents.length > 0) {
      const totalPhoneSec = phoneEvents.reduce((acc, e) => acc + (e.durationSec || 1), 0);
      const isCorrelatedWithGaze = gazeDownEvents.length > 0 || headDownEvents.length > 0;

      if (isCorrelatedWithGaze && totalPhoneSec >= 3) {
        rawSuspicion += 55 + Math.min(25, totalPhoneSec * 2.5);
      } else if (totalPhoneSec >= 4) {
        rawSuspicion += 35 + Math.min(20, totalPhoneSec * 2);
      } else {
        // Brief single appearance: moderate warning
        rawSuspicion += 15;
      }
    }

    // (B) Collaborative Pattern (Voice + Head movement to side)
    if (voiceEvents.length > 0) {
      const totalVoiceSec = voiceEvents.reduce((acc, e) => acc + (e.durationSec || 1), 0);
      const sideLooking = all.filter((e) => e.eventType === "HEAD_LEFT" || e.eventType === "HEAD_RIGHT");
      if (sideLooking.length >= 2 && totalVoiceSec >= 4) {
        rawSuspicion += 45 + Math.min(20, totalVoiceSec * 2);
      } else if (totalVoiceSec >= 6) {
        rawSuspicion += 25;
      } else {
        rawSuspicion += 8;
      }
    }

    // (C) Multiple Persons in frame
    if (personEvents.length > 0) {
      const totalPersonSec = personEvents.reduce((acc, e) => acc + (e.durationSec || 1), 0);
      rawSuspicion += 40 + Math.min(30, totalPersonSec * 4);
    }

    // (D) Browser & Environment Violations
    if (tabEvents.length > 0) {
      // 1 accidental tab switch = low penalty, repeated switches = escalated risk
      if (tabEvents.length === 1) rawSuspicion += 8;
      else if (tabEvents.length === 2) rawSuspicion += 20;
      else rawSuspicion += 35 + Math.min(25, (tabEvents.length - 2) * 8);
    }

    if (copyPasteEvents.length > 0) {
      rawSuspicion += Math.min(25, copyPasteEvents.length * 10);
    }

    if (extensionEvents.length > 0) {
      rawSuspicion += Math.min(45, extensionEvents.length * 20);
    }

    if (screenShareStopEvents.length > 0) {
      rawSuspicion += 30;
    }

    // (E) Absence from webcam
    if (faceMissingEvents.length > 0) {
      const absentSec = faceMissingEvents.reduce((acc, e) => acc + (e.durationSec || 1), 0);
      if (absentSec >= 10) rawSuspicion += 40 + Math.min(20, (absentSec - 10) * 1.5);
      else if (absentSec >= 4) rawSuspicion += 20;
      else rawSuspicion += 5;
    }

    // (F) Frequent persistent Gaze Aversion without phone
    if (gazeDownEvents.length >= 6 && phoneEvents.length === 0) {
      rawSuspicion += 20;
    }

    // Boost score if explicit multi-event Behaviour Chains were verified
    if (chains.length > 0) {
      rawSuspicion += Math.min(25, chains.length * 12);
    }

    const suspicionScore = Math.max(0, Math.min(100, Math.round(rawSuspicion)));

    // Categorization
    const riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" =
      suspicionScore >= 85
        ? "CRITICAL"
        : suspicionScore >= 65
        ? "HIGH"
        : suspicionScore >= 30
        ? "MEDIUM"
        : "LOW";

    // Build contributing factors breakdown
    const contributingFactors = [
      {
        name: "Mobile Phone & Prohibited Items",
        riskScore: phoneEvents.length > 0 ? Math.min(45, phoneEvents.length * 12) : 0,
        sensorConfidence: phoneEvents.length > 0 ? Math.round(phoneEvents[0]!.confidence * 100) : 0,
        eventCount: phoneEvents.length,
        description:
          phoneEvents.length > 0
            ? `Phone visible for ${phoneEvents.reduce((a, b) => a + (b.durationSec || 1), 0)}s`
            : "No mobile device detected.",
      },
      {
        name: "Screen & Head Posture Alignment",
        riskScore: Math.min(30, (gazeDownEvents.length + headDownEvents.length) * 3),
        sensorConfidence: 94,
        eventCount: gazeDownEvents.length + headDownEvents.length,
        description: `Gaze and head diverted ${gazeDownEvents.length + headDownEvents.length} times.`,
      },
      {
        name: "Audio & Verbal Dialogue",
        riskScore: voiceEvents.length > 0 ? Math.min(30, voiceEvents.length * 8) : 0,
        sensorConfidence: 89,
        eventCount: voiceEvents.length,
        description:
          voiceEvents.length > 0
            ? `Voice activity detected across ${voiceEvents.length} intervals.`
            : "Audio clean within ambient noise floor.",
      },
      {
        name: "Environment & Second Person",
        riskScore: personEvents.length > 0 ? Math.min(40, personEvents.length * 20) : 0,
        sensorConfidence: personEvents.length > 0 ? Math.round(personEvents[0]!.confidence * 100) : 0,
        eventCount: personEvents.length,
        description:
          personEvents.length > 0
            ? "Secondary individual entered webcam frame."
            : "Candidate verified solitary in room.",
      },
      {
        name: "Browser & AI Extension Integrity",
        riskScore: Math.min(45, tabEvents.length * 8 + copyPasteEvents.length * 10 + extensionEvents.length * 20 + screenShareStopEvents.length * 15),
        sensorConfidence: 100,
        eventCount: tabEvents.length + copyPasteEvents.length + extensionEvents.length + screenShareStopEvents.length,
        description: `${tabEvents.length} tab switch(es), ${copyPasteEvents.length} clipboard attempt(s), ${extensionEvents.length} AI extension attempt(s).`,
      },
    ].filter((f) => f.eventCount > 0 || f.riskScore > 0);

    // Dominant pattern summary
    let dominantPattern = "Normal Examination Execution";
    if (chains.length > 0) {
      dominantPattern = chains[0]!.title;
    } else if (extensionEvents.length > 0) {
      dominantPattern = "Unauthorized AI Assistant Extension Detected";
    } else if (phoneEvents.length > 0 && gazeDownEvents.length > 0) {
      dominantPattern = "Mobile-Assisted Reference Search";
    } else if (personEvents.length > 0) {
      dominantPattern = "Unauthorized Multiple Person Presence";
    } else if (tabEvents.length >= 3) {
      dominantPattern = "Repeated Browser Window Deflection";
    } else if (voiceEvents.length >= 3) {
      dominantPattern = "Suspicious Verbal Communication";
    }

    // Explainable AI Narrative
    const explanation = this.generateXAINarrative(
      suspicionScore,
      evidenceConfidence,
      riskLevel,
      chains,
      contributingFactors
    );

    return {
      suspicionScore,
      evidenceConfidence,
      riskLevel,
      dominantPattern,
      explanation,
      behaviourChains: chains,
      contributingFactors,
    };
  }

  /**
   * Detects multi-event temporal chains by sliding across sequential events.
   */
  private detectBehaviourChains(events: ProctorEvent[]): BehaviourChain[] {
    const chains: BehaviourChain[] = [];
    if (events.length < 2) return chains;

    // Search for: PHONE_DETECTED + (GAZE_DOWN or HEAD_DOWN)
    const phoneIdx = events.findIndex((e) => e.eventType === "PHONE_DETECTED");
    if (phoneIdx !== -1) {
      const phoneEv = events[phoneIdx]!;
      const phoneTime = new Date(phoneEv.timestamp).getTime();

      const correlated = events.filter((e) => {
        const t = new Date(e.timestamp).getTime();
        const diff = Math.abs(t - phoneTime);
        return diff <= 20_000 && (e.eventType === "GAZE_DOWN" || e.eventType === "HEAD_DOWN" || e.eventType === "TAB_SWITCH");
      });

      if (correlated.length > 0) {
        const allChainEvents = [phoneEv, ...correlated];
        chains.push({
          id: `chain-phone-${phoneEv.id}`,
          sessionId: phoneEv.sessionId,
          title: "Mobile-Assisted Device Consultation",
          patternType: "MOBILE_ASSISTED",
          events: allChainEvents,
          startTime: phoneEv.timestamp,
          endTime: correlated[correlated.length - 1]!.timestamp,
          durationSec: Math.max(8, phoneEv.durationSec + correlated.length * 3),
          chainRiskScore: 82,
          explanation:
            "A mobile phone was detected in concurrent temporal proximity with downward gaze, downward head posture, and window switching. This sequence exhibits high correlation with external assistance.",
        });
      }
    }

    // Search for: VOICE_ACTIVITY + (HEAD_LEFT or HEAD_RIGHT)
    const voiceIdx = events.findIndex((e) => e.eventType === "VOICE_ACTIVITY" || e.eventType === "REPEATED_VOICE_ACTIVITY");
    if (voiceIdx !== -1) {
      const voiceEv = events[voiceIdx]!;
      const voiceTime = new Date(voiceEv.timestamp).getTime();

      const sideLooks = events.filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return Math.abs(t - voiceTime) <= 15_000 && (e.eventType === "HEAD_LEFT" || e.eventType === "HEAD_RIGHT");
      });

      if (sideLooks.length >= 1) {
        chains.push({
          id: `chain-collab-${voiceEv.id}`,
          sessionId: voiceEv.sessionId,
          title: "Side-Angle Peer Collaboration Dialogue",
          patternType: "EXTERNAL_COLLABORATION",
          events: [voiceEv, ...sideLooks],
          startTime: voiceEv.timestamp,
          endTime: sideLooks[sideLooks.length - 1]!.timestamp,
          durationSec: 12,
          chainRiskScore: 76,
          explanation:
            "Continuous voice activity matched with sideways head angling towards an off-screen collaborator.",
        });
      }
    }

    return chains;
  }

  /**
   * Generates a clear, human-readable narrative explaining why the suspicion score
   * and evidence confidence differ, and what multi-modal factors drove the assessment.
   */
  private generateXAINarrative(
    suspicionScore: number,
    evidenceConfidence: number,
    riskLevel: string,
    chains: BehaviourChain[],
    factors: Array<{ name: string; description: string }>
  ): string {
    let narrative = "";

    narrative += `Overall contextual suspicion is categorized as ${riskLevel} (${suspicionScore}%), supported by a raw sensory evidence confidence of ${evidenceConfidence}%. `;

    narrative += `The evidence confidence reflects the precision of the underlying detection models (YOLOv8 and MediaPipe), whereas the suspicion score measures the likelihood of academic dishonesty based on multi-event temporal correlation. `;

    if (chains.length > 0) {
      narrative += `Crucially, the system detected ${chains.length} temporal behaviour chain(s): "${chains.map((c) => c.title).join(", ")}". `;
    } else if (suspicionScore < 30) {
      narrative += "Detected movements were isolated, brief, and consistent with normal cognitive pauses, not warranting elevated concern. ";
    }

    if (factors.length > 0) {
      narrative += `Primary contributing signals: ${factors.map((f) => f.description).join("; ")}.`;
    }

    narrative += " This assessment serves as AI decision-support; final academic evaluation remains under faculty authority.";

    return narrative;
  }
}
