"""
schemas.py
---------------------------------------------------------------------------
Comprehensive Pydantic Schemas for NextGen AI Online Proctoring System.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class ProctorEvent(BaseModel):
    id: Optional[str] = None
    sessionId: str
    studentId: Optional[str] = "student"
    examId: Optional[str] = "exam"
    eventType: str
    timestamp: str
    duration: float = 0.0
    confidence: float = 1.0
    riskContribution: float = 0.0
    source: str = "Client"
    evidenceId: Optional[str] = None
    evidencePath: Optional[str] = None
    relatedEventIds: Optional[List[str]] = []
    metadata: Optional[Dict[str, Any]] = {}

class BehaviourChain(BaseModel):
    id: str
    sessionId: str
    startTime: str
    endTime: str
    eventsInvolved: List[str]
    eventOrder: List[str]
    combinedRisk: float
    evidenceReferences: List[str] = []
    description: str

class DualRiskResult(BaseModel):
    suspicionScore: float
    evidenceConfidence: float
    riskLevel: str # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    contributingEvents: List[Dict[str, Any]] = []
    explanation: str
    reasons: List[str] = []
    dominantContext: str = "Normal Exam"
    differenceExplanation: Optional[str] = None

class CodeTestCase(BaseModel):
    input: str
    expectedOutput: str
    isHidden: bool = False
    label: Optional[str] = None

class CodeExecutionRequest(BaseModel):
    language: str # c, cpp, java, python, javascript
    code: str
    testCases: List[CodeTestCase] = []
    timeoutSec: float = 4.0

class CodeExecutionTestResult(BaseModel):
    testIndex: int
    label: str
    input: str
    expected: str
    actual: str
    passed: bool
    error: Optional[str] = None
    executionTimeMs: int
    isHidden: bool = False

class CodeExecutionResponse(BaseModel):
    passedCount: int
    totalCount: int
    allPassed: bool
    results: List[CodeExecutionTestResult]
    compilationError: Optional[str] = None
    executionEngine: str = "Docker Sandbox"

class QuestionSchema(BaseModel):
    id: str
    text: str
    options: List[str]
    answer: int
    explanation: Optional[str] = None
    points: int = 2
    category: Optional[str] = "General"

class CodingQuestionSchema(BaseModel):
    id: str
    title: str
    difficulty: str
    description: str
    points: int = 10
    supportedLanguages: List[str] = ["javascript", "python", "c", "cpp", "java"]
    starterCode: Dict[str, str] = {}
    testCases: List[CodeTestCase] = []

class ExamCreateSchema(BaseModel):
    title: str
    subject: str
    durationMin: int = 60
    instructions: Optional[str] = ""
    prohibitedObjects: List[str] = ["cell phone", "book", "laptop", "tablet"]
    riskThresholds: Dict[str, int] = {"low": 30, "medium": 65, "critical": 85}
    questions: List[QuestionSchema] = []
    codingQuestions: List[CodingQuestionSchema] = []

class FacultyReviewSchema(BaseModel):
    sessionId: str
    status: str # "Reviewed" | "No Concern" | "Needs Review" | "Suspicious"
    comment: str
    reviewedBy: str
    timestamp: Optional[str] = None

class ExplainSessionRequest(BaseModel):
    sessionId: str
    events: List[Dict[str, Any]] = []
    timestamps: List[str] = []
    durations: List[float] = []
    confidence: List[float] = []
    riskScore: float = 0.0
    evidenceSummary: List[str] = []

class EvidenceItemSchema(BaseModel):
    id: str
    sessionId: str
    eventId: str
    timestamp: str
    type: str
    confidence: float = 1.0
    duration: float = 0.0
    imageB64: Optional[str] = None
    hash: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = {}

class TechnicalMetricsSchema(BaseModel):
    isOnline: bool = True
    technicalStatus: str = "STABLE"
    incidentCount: int = 0
    totalOfflineSec: float = 0.0
    reconnectCount: int = 0

