/**
 * api-client.ts
 * ---------------------------------------------------------------------------
 * High-reliability REST & WebSocket API client for FastAPI proctoring backend.
 * Provides offline event and answer queueing so no telemetry is lost during
 * temporary network disconnections.
 */

import type { ProctorEvent, FacultyReview } from "./types/proctor";

const BACKEND_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000";

class ProctorApiClient {
  private offlineEventQueue: ProctorEvent[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.flushOfflineQueue());
    }
  }

  private async fetchJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${BACKEND_URL}${endpoint}`;
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API error ${res.status}: ${errText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      console.warn(`[API Client] Failed request to ${endpoint}:`, err);
      throw err;
    }
  }

  // ===================== Offline Queueing =====================

  public queueOfflineEvent(event: ProctorEvent) {
    this.offlineEventQueue.push(event);
    try {
      localStorage.setItem("proctor_offline_queue", JSON.stringify(this.offlineEventQueue));
    } catch {
      // ignore
    }
  }

  public async flushOfflineQueue() {
    if (!this.offlineEventQueue.length) {
      try {
        const stored = localStorage.getItem("proctor_offline_queue");
        if (stored) this.offlineEventQueue = JSON.parse(stored);
      } catch {
        // ignore
      }
    }
    if (!this.offlineEventQueue.length) return;

    console.log(`[API Client] Flushing ${this.offlineEventQueue.length} queued offline events...`);
    const remaining: ProctorEvent[] = [];
    for (const ev of this.offlineEventQueue) {
      try {
        await this.ingestEvent(ev);
      } catch {
        remaining.push(ev);
      }
    }
    this.offlineEventQueue = remaining;
    localStorage.setItem("proctor_offline_queue", JSON.stringify(remaining));
  }

  // ===================== Auth APIs =====================

  async login(data: { email: string; password: string }) {
    return this.fetchJson<{ success: boolean; token: string; user: any }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async register(data: { name: string; email: string; role?: string; password?: string }) {
    return this.fetchJson<{ success: boolean; user: any }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ===================== Exams APIs =====================

  async getExams() {
    return this.fetchJson<{ exams: any[] }>("/api/v1/exams");
  }

  async getExam(examId: string) {
    return this.fetchJson<{ exam: any }>(`/api/v1/exams/${examId}`);
  }

  async createExam(examData: any) {
    return this.fetchJson<{ success: boolean; exam: any }>("/api/v1/exams", {
      method: "POST",
      body: JSON.stringify(examData),
    });
  }

  // ===================== Sessions APIs =====================

  async getSessions(examId?: string) {
    const q = examId ? `?exam_id=${encodeURIComponent(examId)}` : "";
    return this.fetchJson<{ sessions: any[] }>(`/api/v1/sessions${q}`);
  }

  async getSession(sessionId: string) {
    return this.fetchJson<{ session: any }>(`/api/v1/sessions/${sessionId}`);
  }

  async createSession(data: any) {
    return this.fetchJson<{ session: any }>("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSession(sessionId: string, patch: any) {
    return this.fetchJson<{ success: boolean; session: any }>(`/api/v1/sessions/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  }

  async submitSession(sessionId: string, data: any) {
    return this.fetchJson<{ success: boolean; session: any }>(`/api/v1/sessions/${sessionId}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ===================== Unified Events =====================

  async ingestEvent(event: ProctorEvent) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.queueOfflineEvent(event);
      return { success: true, queued: true };
    }
    return this.fetchJson<{ success: boolean; event: ProctorEvent }>("/api/v1/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  async getSessionEvents(sessionId: string) {
    return this.fetchJson<{ events: ProctorEvent[] }>(`/api/v1/sessions/${sessionId}/events`);
  }

  async storeEvidence(evidence: {
    sessionId: string;
    eventId?: string;
    type: string;
    confidence?: number;
    duration?: number;
    imageB64: string;
    metadata?: Record<string, any>;
  }) {
    return this.fetchJson<{ success: boolean; evidenceId: string; evidence: any }>("/api/v1/evidence", {
      method: "POST",
      body: JSON.stringify(evidence),
    });
  }

  async getSessionEvidence(sessionId: string) {
    return this.fetchJson<{ success: boolean; evidence: any[] }>(`/api/v1/sessions/${sessionId}/evidence`);
  }

  // ===================== Computer Vision & Biometrics =====================

  async roomScan(imageBase64: string) {
    return this.fetchJson<{
      passed: boolean;
      prohibitedObjects: any[];
      allObjects: any[];
      faceDetected: boolean;
      facesCount: number;
      summary: string;
    }>("/api/v1/room_scan", {
      method: "POST",
      body: JSON.stringify({ image: imageBase64 }),
    });
  }

  async faceEnroll(payload: { image: string; studentId?: string } | string) {
    const body = typeof payload === "string" ? { image: payload } : payload;
    return this.fetchJson<{
      success: boolean;
      message: string;
      studentId?: string;
      embeddingDimensions?: number;
      headPose?: any;
      gaze?: any;
    }>("/api/v1/face_enroll", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async faceVerify(
    payload:
      | {
          image: string;
          studentId?: string | undefined;
          referenceImage?: string | undefined;
          threshold?: number | undefined;
        }
      | string,
  ) {
    const body = typeof payload === "string" ? { image: payload } : payload;
    return this.fetchJson<{
      verified: boolean;
      confidence: number;
      faceDetected: boolean;
      facesCount?: number;
      mismatchDetected?: boolean;
      status?: string;
      reason?: string;
      disclaimer?: string;
    }>("/api/v1/face_verify", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ===================== Docker Code Sandbox =====================

  async executeCode(payload: {
    language: string;
    code: string;
    testCases: Array<{ input: string; expectedOutput: string; isHidden?: boolean; label?: string }>;
    timeoutSec?: number;
  }) {
    return this.fetchJson<{
      passedCount: number;
      totalCount: number;
      allPassed: boolean;
      results: Array<{
        testIndex: number;
        label: string;
        input: string;
        expected: string;
        actual: string;
        passed: boolean;
        error?: string;
        executionTimeMs: number;
        isHidden?: boolean;
      }>;
      executionEngine: string;
    }>("/api/v1/execute_code", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // ===================== Explainable AI & GenAI =====================

  async explainSession(payload: {
    sessionId: string;
    events: any[];
    riskScore: number;
    evidenceSummary?: string[];
  }) {
    return this.fetchJson<{ explanation: string; sessionId: string }>("/api/v1/explain_session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getGeminiStatus() {
    return this.fetchJson<{
      status: string;
      hasKey: boolean;
      maskedKey?: string;
      message: string;
      testOutput?: string;
    }>("/api/v1/gemini/status");
  }

  // ===================== Faculty Review & Decision =====================

  async submitFacultyReview(review: FacultyReview) {
    return this.fetchJson<{ success: boolean; review: FacultyReview }>("/api/v1/faculty/review", {
      method: "POST",
      body: JSON.stringify(review),
    });
  }

  // ===================== Analytics Metrics =====================

  async getAnalyticsMetrics() {
    return this.fetchJson<any>("/api/v1/analytics/metrics");
  }

  // ===================== Report Download URLs =====================

  getPdfReportUrl(sessionId: string) {
    return `${BACKEND_URL}/api/v1/reports/pdf/${sessionId}`;
  }

  getCsvReportUrl(sessionId: string) {
    return `${BACKEND_URL}/api/v1/reports/csv/${sessionId}`;
  }

  // ===================== WebSocket URLs =====================

  getProctorWsUrl() {
    return `${WS_URL}/api/v1/ws/proctor`;
  }

  getFacultyWsUrl() {
    return `${WS_URL}/api/v1/ws/faculty`;
  }
}

export const apiClient = new ProctorApiClient();
