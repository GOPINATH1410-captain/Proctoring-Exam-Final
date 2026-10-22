/**
 * proctor-store.ts
 * ---------------------------------------------------------------------------
 * Client-side domain layer for the NextGen AI Proctoring System.
 *
 * Persisted to localStorage so the whole product surface (student, faculty, admin)
 * is fully interactive end-to-end.
 *
 * Supports:
 *  - MCQ Questions (capped at maximum 50 per exam)
 *  - Programming / Coding Questions (capped at maximum 10 per exam)
 *  - Configurable Exam Attendance Timing Limit (duration in minutes)
 *  - Real-time AI Proctoring metrics & XAI evaluations
 */

import { generateDefaultStudentPhoto } from "./face-biometrics";

export type Role = "student" | "faculty" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // demo only
  role: Role;
  department?: string;
  photoUrl?: string; // Registered student reference face photo (Data URL or image path)
  faceEmbedding?: number[]; // 48-d normalized facial biometric embedding
  faceEnrolled: boolean;
  createdAt: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  answer: number;
  explanation?: string;
  points?: number;
  category?: string;
}

export interface TestCase {
  id?: string;
  input: string;
  expectedOutput: string;
  isHidden?: boolean;
  label?: string;
}

export interface CodingQuestion {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  description: string;
  starterCode: {
    javascript: string;
    python: string;
  };
  language: "javascript" | "python";
  testCases: TestCase[];
  points: number;
  constraints?: string[];
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  durationMin: number; // Timing limit in minutes set by admin
  scheduledAt: string;
  questions: Question[]; // Max 50 MCQs
  codingQuestions: CodingQuestion[]; // Max 10 Coding Questions
  instructions?: string;
}

export const MAX_MCQ_QUESTIONS = 50;
export const MAX_CODING_QUESTIONS = 10;

/** Detection categories emitted by the AI monitoring engine across all 14 features. */
export type EventType =
  | "phone"
  | "book"
  | "multi_person"
  | "no_face"
  | "student_absent"
  | "student_returned"
  | "looking_away"
  | "repeated_looking"
  | "head_pose"
  | "voice"
  | "hand"
  | "face_mismatch"
  | "tab_switch"
  | "fullscreen_exit"
  | "screenshot_attempt"
  | "clipboard_violation"
  | "large_paste"
  | "extension_violation"
  | "second_device"
  | "camera_obscured"
  | "video_interrupted"
  | "technical_interruption";

export interface TimelineEvent {
  id: string;
  sessionId: string;
  type: EventType;
  label: string;
  at: string; // ISO timestamp
  clock: string; // HH:MM:SS display
  severity: number; // 0-100 contribution weight
  durationSec?: number;
  evidence?: string;
  isTechnical?: boolean;
}

export interface CodeSubmission {
  code: string;
  language: string;
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  testResults?: Array<{
    testIndex: number;
    label?: string | undefined;
    input: string;
    expected: string;
    actual: string;
    passed: boolean;
    error?: string | undefined;
    isHidden?: boolean | undefined;
    executionTimeMs?: number | undefined;
  }>;
}

export interface ExamScoreSummary {
  mcqScore: number;
  mcqTotal: number;
  codingScore: number;
  codingTotal: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed?: boolean;
  mcqMax?: number;
  codingMax?: number;
}

export interface ExamSession {
  id: string;
  studentId: string;
  studentName: string;
  examId: string;
  examTitle: string;
  startedAt: string;
  endedAt?: string;
  status: "active" | "completed" | "terminated";
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
  answers: Record<string, number>;
  codeAnswers?: Record<string, CodeSubmission>;
  scoreSummary?: ExamScoreSummary;
  roomScanPassed: boolean;
  events: TimelineEvent[];
  metrics: BehaviourMetrics;
  registeredPhotoUrl?: string | undefined;
  precheckPhotoUrl?: string | undefined;
  precheckMatchSimilarity?: number | undefined;
  technicalMetrics?: {
    isOnline: boolean;
    technicalStatus: string;
    incidentCount: number;
    totalOfflineSec: number;
    reconnectCount: number;
  };
  evidenceReferences?: string[];
}

export type RiskLevel = "green" | "yellow" | "red";

export interface DirectionCounts {
  up: number;
  down: number;
  left: number;
  right: number;
  off_screen?: number;
}

export interface HandCounts {
  raised: number;
  near_face: number;
  near_ear: number;
  below_desk: number;
  repeated_movements: number;
}

/** Aggregated behaviour signals used by the risk engine. */
export interface BehaviourMetrics {
  phoneSeconds: number;
  bookSeconds: number;
  multiPersonSeconds: number;
  noFaceSeconds: number;
  totalAbsenceSeconds?: number;
  lookAwayCount: number;
  repeatedGlanceCount?: number;
  headMovementCount: number;
  voiceSeconds: number;
  handEvents: number;
  faceMismatchCount: number;
  tabSwitches: number;
  fullscreenExits?: number;
  largePastes?: number;
  cameraObscuredSeconds?: number;
  technicalInterruptions?: number;
  headCounts?: DirectionCounts;
  gazeCounts?: DirectionCounts;
  handCounts?: HandCounts;
  totalHeadTurns?: number;
  totalGazeLooks?: number;
  totalHandEvents?: number;
}

export const emptyMetrics = (): BehaviourMetrics => ({
  phoneSeconds: 0,
  bookSeconds: 0,
  multiPersonSeconds: 0,
  noFaceSeconds: 0,
  totalAbsenceSeconds: 0,
  lookAwayCount: 0,
  repeatedGlanceCount: 0,
  headMovementCount: 0,
  voiceSeconds: 0,
  handEvents: 0,
  faceMismatchCount: 0,
  tabSwitches: 0,
  fullscreenExits: 0,
  largePastes: 0,
  cameraObscuredSeconds: 0,
  technicalInterruptions: 0,
  headCounts: { up: 0, down: 0, left: 0, right: 0 },
  gazeCounts: { up: 0, down: 0, left: 0, right: 0, off_screen: 0 },
  handCounts: { raised: 0, near_face: 0, near_ear: 0, below_desk: 0, repeated_movements: 0 },
  totalHeadTurns: 0,
  totalGazeLooks: 0,
  totalHandEvents: 0,
});

/* -------------------------------------------------------------------------- */
/* Behaviour Analysis + Explainable AI engine                                 */
/* -------------------------------------------------------------------------- */

const WEIGHTS = {
  phone: 2.2,
  book: 1.2,
  multiPerson: 2.6,
  noFace: 1.1,
  totalAbsence: 1.4,
  lookAway: 2.0,
  repeatedGlance: 3.0,
  headMove: 1.2,
  voice: 1.4,
  hand: 1.5,
  faceMismatch: 8,
  tabSwitch: 6,
  fullscreenExit: 6,
  largePaste: 8,
  cameraObscured: 6,
  // Note: technicalInterruptions weight is 0.0 — isolated from cheating score
  technicalInterruption: 0.0,
};

export type RiskCategory = "LOW" | "MEDIUM" | "HIGH";

export interface RiskResult {
  score: number;
  level: RiskLevel;
  category: RiskCategory;
  verdict: string;
  recommendation: string;
  reasons: string[];
  breakdown: { factor: string; value: number }[];
}

export function computeRisk(m: BehaviourMetrics): RiskResult {
  const parts: { factor: string; value: number; reason: string }[] = [
    {
      factor: "Phone usage",
      value: m.phoneSeconds * WEIGHTS.phone,
      reason: `Phone detected for ${Math.round(m.phoneSeconds)} seconds`,
    },
    {
      factor: "Book / notes",
      value: m.bookSeconds * WEIGHTS.book,
      reason: `Book or notes visible for ${Math.round(m.bookSeconds)} seconds`,
    },
    {
      factor: "Multiple persons",
      value: m.multiPersonSeconds * WEIGHTS.multiPerson,
      reason: `Second person in frame for ${Math.round(m.multiPersonSeconds)} seconds`,
    },
    {
      factor: "Face absent",
      value: m.noFaceSeconds * WEIGHTS.noFace,
      reason: `Face missing from frame for ${Math.round(m.noFaceSeconds)} seconds`,
    },
    {
      factor: "Gaze away",
      value: m.lookAwayCount * WEIGHTS.lookAway,
      reason: `Looking away ${m.lookAwayCount} times`,
    },
    {
      factor: "Head movement",
      value: m.headMovementCount * WEIGHTS.headMove,
      reason: `Abnormal head pose ${m.headMovementCount} times`,
    },
    {
      factor: "Voice activity",
      value: m.voiceSeconds * WEIGHTS.voice,
      reason: `Voice detected for ${Math.round(m.voiceSeconds)} seconds`,
    },
    {
      factor: "Hand behaviour",
      value: m.handEvents * WEIGHTS.hand,
      reason: `Suspicious hand movement ${m.handEvents} times`,
    },
    {
      factor: "Identity mismatch",
      value: 0,
      reason: "Candidate identity verified at pre-check gate (continuous face matching inactive during exam)",
    },
    {
      factor: "Tab switching",
      value: m.tabSwitches * WEIGHTS.tabSwitch,
      reason: `Left the exam window ${m.tabSwitches} times`,
    },
    {
      factor: "Fullscreen exit",
      value: (m.fullscreenExits || 0) * WEIGHTS.fullscreenExit,
      reason: `Exited locked fullscreen ${m.fullscreenExits || 0} times`,
    },
    {
      factor: "Repeated gaze shift",
      value: (m.repeatedGlanceCount || 0) * WEIGHTS.repeatedGlance,
      reason: `Repeated left, right or downward gaze shifts ${m.repeatedGlanceCount || 0} times`,
    },
    {
      factor: "Candidate absence",
      value: (m.totalAbsenceSeconds || 0) * WEIGHTS.totalAbsence,
      reason: `Left workstation / camera view for ${Math.round(m.totalAbsenceSeconds || 0)}s`,
    },
    {
      factor: "External large paste",
      value: (m.largePastes || 0) * WEIGHTS.largePaste,
      reason: `Unusually large external paste operation intercepted ${m.largePastes || 0} times`,
    },
    {
      factor: "Camera obstruction",
      value: (m.cameraObscuredSeconds || 0) * WEIGHTS.cameraObscured,
      reason: `Camera obscured or frozen for ${Math.round(m.cameraObscuredSeconds || 0)}s`,
    },
  ];

  const raw = parts.reduce((sum, p) => sum + p.value, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const level: RiskLevel = score >= 65 ? "red" : score >= 30 ? "yellow" : "green";
  const category: RiskCategory = score >= 65 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";


  const verdict =
    category === "HIGH"
      ? "HIGH RISK — Suspicious Cheating Activity Detected"
      : category === "MEDIUM"
        ? "MEDIUM RISK — Warning / Minor Anomaly Detected"
        : "LOW RISK — Academic Integrity Verified";

  const recommendation =
    category === "HIGH"
      ? "Flagged for manual faculty audit and integrity review committee."
      : category === "MEDIUM"
        ? "Recommended for spotlight review on flagged timeline segments."
        : "Passed automatic integrity checks. Approved for scoring.";

  const reasons = parts
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((p) => p.reason);

  return {
    score,
    level,
    category,
    verdict,
    recommendation,
    reasons: reasons.length > 0 ? reasons : ["Normal exam behavior maintained."],
    breakdown: parts
      .filter((p) => p.value > 0)
      .map((p) => ({ factor: p.factor, value: Math.round(p.value) })),
  };
}

export const riskLabel: Record<RiskLevel, string> = {
  green: "LOW",
  yellow: "MEDIUM",
  red: "HIGH",
};

/* -------------------------------------------------------------------------- */
/* Curated 50 MCQ Questions Bank                                              */
/* -------------------------------------------------------------------------- */

export const PRESET_MCQ_BANK: Question[] = [
  {
    id: "mcq-1",
    text: "Which architectural category does YOLOv8 belong to in computer vision?",
    options: [
      "Two-stage object detector",
      "Single-shot anchor-free detector",
      "Recurrent neural network",
      "Markov random field",
    ],
    answer: 1,
    explanation:
      "YOLOv8 utilizes an anchor-free single-shot detection architecture with decoupled heads for bounding box and classification.",
    points: 2,
    category: "Computer Vision",
  },
  {
    id: "mcq-2",
    text: "How many 3D facial landmarks does the MediaPipe FaceMesh model predict in real time?",
    options: ["68 landmarks", "128 landmarks", "468 / 478 landmarks", "1024 landmarks"],
    answer: 2,
    explanation:
      "MediaPipe FaceMesh predicts 468 standard landmarks, extended to 478 landmarks when including iris keypoints.",
    points: 2,
    category: "Computer Vision",
  },
  {
    id: "mcq-3",
    text: "Which evaluation metric is most appropriate for assessing severely imbalanced anomaly/cheating datasets?",
    options: [
      "Accuracy",
      "F1 Score / Precision-Recall AUC",
      "Mean Squared Error",
      "Adjusted R-squared",
    ],
    answer: 1,
    explanation:
      "In cheating detection where violations are rare, Accuracy is misleading. F1 Score and PR-AUC properly reflect false positives and false negatives.",
    points: 2,
    category: "Machine Learning",
  },
  {
    id: "mcq-4",
    text: "Estimating 3D head pose from 2D facial landmarks commonly solves which geometric computer vision problem?",
    options: [
      "Perspective-n-Point (PnP)",
      "Dijkstra Shortest Path",
      "Travelling Salesperson Problem",
      "Maximum Bipartite Matching",
    ],
    answer: 0,
    explanation:
      "PnP (Perspective-n-Point) maps 3D canonical facial model points to observed 2D image coordinates to estimate rotation and translation vectors.",
    points: 2,
    category: "Computer Vision",
  },
  {
    id: "mcq-5",
    text: "In Explainable AI (XAI), what do SHAP (SHapley Additive exPlanations) values calculate?",
    options: [
      "Server network latency",
      "Marginal feature contribution to an individual prediction",
      "Batch training loss curve",
      "Gradient clipping magnitude",
    ],
    answer: 1,
    explanation:
      "Grounded in cooperative game theory, SHAP values compute the fair marginal contribution of each input signal to the final risk score.",
    points: 2,
    category: "Explainable AI",
  },
  {
    id: "mcq-6",
    text: "What does the Global Interpreter Lock (GIL) in CPython prevent?",
    options: [
      "Multiple processes running concurrently",
      "Simultaneous native thread execution of Python bytecodes",
      "Asynchronous I/O loops",
      "Garbage collection execution",
    ],
    answer: 1,
    explanation:
      "The GIL is a mutex that prevents multiple native OS threads from executing Python bytecodes at the same time in CPython.",
    points: 2,
    category: "Python",
  },
  {
    id: "mcq-7",
    text: "What is the worst-case time complexity of QuickSort when choosing the leftmost element on a sorted array without randomization?",
    options: ["O(log n)", "O(n)", "O(n log n)", "O(n²)"],
    answer: 3,
    explanation:
      "Without randomization, picking an extreme pivot on an already sorted array partitions elements into size 1 and n-1, causing O(n²) operations.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-8",
    text: "Which neural network activation function mitigates the vanishing gradient problem in deep networks?",
    options: ["Sigmoid", "Tanh", "ReLU (Rectified Linear Unit)", "Step function"],
    answer: 2,
    explanation:
      "ReLU has a constant gradient of 1 for positive inputs, avoiding gradient saturation experienced by Sigmoid and Tanh.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-9",
    text: "Which data structure provides average O(1) time complexity for lookup, insertion, and deletion?",
    options: ["Balanced Binary Search Tree", "Hash Table", "Doubly Linked List", "Binary Heap"],
    answer: 1,
    explanation:
      "Hash Tables map keys through hash functions to buckets, achieving O(1) expected time.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-10",
    text: "In CNN architectures, what is the primary role of a Max Pooling layer?",
    options: [
      "Increase channel depth",
      "Downsample spatial dimensions while maintaining feature invariance",
      "Perform non-linear classification",
      "Calculate matrix inversion",
    ],
    answer: 1,
    explanation:
      "Max pooling reduces height and width spatial dimensions, reducing parameters and computation while providing spatial translation invariance.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-11",
    text: "What is the time complexity of searching for an element in a balanced Binary Search Tree (AVL / Red-Black Tree)?",
    options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
    answer: 1,
    explanation:
      "Balanced trees maintain a height of O(log n), ensuring searches terminate in logarithmic time.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-12",
    text: "Which loss function is standard for multi-class classification tasks using softmax outputs?",
    options: [
      "Mean Squared Error",
      "Categorical Cross-Entropy",
      "Binary Cross-Entropy",
      "Hinge Loss",
    ],
    answer: 1,
    explanation:
      "Categorical Cross-Entropy measures divergence between true one-hot probability distributions and softmax predictions.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-13",
    text: "In Python, which built-in function returns an iterator yielding pairs of index and element?",
    options: ["zip()", "enumerate()", "map()", "filter()"],
    answer: 1,
    explanation: "enumerate(iterable, start=0) yields (index, value) tuples consecutively.",
    points: 2,
    category: "Python",
  },
  {
    id: "mcq-14",
    text: "In eye gaze tracking, what is the 'Gaze Ratio' computed from iris center landmarks?",
    options: [
      "Distance between pupils in millimeters",
      "Horizontal/vertical iris landmark position relative to eye corners",
      "Blink duration in milliseconds",
      "Monitor brightness level",
    ],
    answer: 1,
    explanation:
      "The horizontal gaze ratio measures the distance of the iris center relative to inner and outer eye corners to detect on-screen vs off-screen looks.",
    points: 2,
    category: "Computer Vision",
  },
  {
    id: "mcq-15",
    text: "Which data structure implements LIFO (Last-In-First-Out) order?",
    options: ["Queue", "Stack", "Priority Queue", "Deque"],
    answer: 1,
    explanation: "A Stack enforces Last-In-First-Out order via push and pop operations.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-16",
    text: "What regularization technique randomly deactivates neurons during neural network training?",
    options: ["Batch Normalization", "Dropout", "Early Stopping", "Gradient Clipping"],
    answer: 1,
    explanation:
      "Dropout randomly sets a fraction of input units to 0 at each update in training to prevent co-adaptation of features.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-17",
    text: "In graph theory, which algorithm computes the shortest path between a single source node and all other nodes with non-negative edge weights?",
    options: [
      "Prim's Algorithm",
      "Dijkstra's Algorithm",
      "Kruskal's Algorithm",
      "Floyd-Warshall Algorithm",
    ],
    answer: 1,
    explanation:
      "Dijkstra's algorithm uses a priority queue to find single-source shortest paths in O((V + E) log V) time.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-18",
    text: "What is an event-driven mechanism in JavaScript browsers for detecting when a student leaves the exam window?",
    options: ["onresize", "visibilitychange / blur", "onscroll", "oncontextmenu"],
    answer: 1,
    explanation:
      "document.addEventListener('visibilitychange') and window.addEventListener('blur') capture tab switching and minimizing events.",
    points: 2,
    category: "Web Development",
  },
  {
    id: "mcq-19",
    text: "Which optimizer combines momentum with adaptive learning rates per parameter?",
    options: ["SGD", "Adam (Adaptive Moment Estimation)", "Adagrad", "RMSprop"],
    answer: 1,
    explanation:
      "Adam calculates adaptive learning rates by tracking first (mean) and second (uncentered variance) moments of gradients.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-20",
    text: "In Python, which keyword transforms a normal function into a generator?",
    options: ["return", "yield", "async", "await"],
    answer: 1,
    explanation:
      "Using 'yield' produces a generator object that pauses execution and resumes upon next() calls.",
    points: 2,
    category: "Python",
  },
  {
    id: "mcq-21",
    text: "What is the primary difference between a process and a thread in modern operating systems?",
    options: [
      "Threads have separate virtual memory spaces",
      "Threads within the same process share memory and address space",
      "Processes cannot communicate",
      "Threads cannot execute concurrently",
    ],
    answer: 1,
    explanation:
      "Processes have isolated address spaces; threads of the same process share code, data, and open file descriptors.",
    points: 2,
    category: "Computer Systems",
  },
  {
    id: "mcq-22",
    text: "Which attention mechanism formulation is used in the Transformer architecture?",
    options: [
      "Additive Attention",
      "Scaled Dot-Product Attention: softmax(QK^T / sqrt(d_k)) * V",
      "Euclidean Distance Attention",
      "Recurrent Attention",
    ],
    answer: 1,
    explanation:
      "Vaswani et al. formulated Scaled Dot-Product Attention using Query (Q), Key (K), and Value (V) matrices scaled by sqrt(d_k).",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-23",
    text: "What is the amortized time complexity of appending an element to a dynamic array (Python list)?",
    options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
    answer: 0,
    explanation:
      "Dynamic arrays double their capacity upon filling, leading to an amortized cost of O(1) per append.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-24",
    text: "What technique detects unauthorized physical objects (e.g. mobile phones) in a webcam stream?",
    options: [
      "Fourier Transform",
      "Convolutional Object Detection (YOLO / SSD)",
      "Linear Regression",
      "Huffman Coding",
    ],
    answer: 1,
    explanation:
      "Real-time object detectors like YOLO classify bounding boxes around prohibited items in 20-30ms.",
    points: 2,
    category: "Computer Vision",
  },
  {
    id: "mcq-25",
    text: "In web applications, which protocol enables full-duplex, bidirectional communication over a single TCP connection?",
    options: ["HTTP/1.0", "WebSocket (ws://, wss://)", "FTP", "DNS"],
    answer: 1,
    explanation:
      "WebSocket maintains an open persistent connection allowing real-time bidirectional streaming of video frames and telemetry.",
    points: 2,
    category: "Web Development",
  },
  {
    id: "mcq-26",
    text: "What is the term for a model learning noise and detail in training data to the extent that it negatively impacts performance on new data?",
    options: ["Underfitting", "Overfitting", "Bias", "Distillation"],
    answer: 1,
    explanation:
      "Overfitting occurs when high model capacity causes the network to memorize training anomalies rather than generalizing.",
    points: 2,
    category: "Machine Learning",
  },
  {
    id: "mcq-27",
    text: "What is the space complexity of Depth-First Search (DFS) on a tree of depth D?",
    options: ["O(1)", "O(D)", "O(2^D)", "O(D!)"],
    answer: 1,
    explanation:
      "DFS stores only the path from root to current node on the recursion stack, requiring O(D) memory.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-28",
    text: "Which OpenCV function transforms an image from BGR color space to Grayscale?",
    options: [
      "cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)",
      "cv2.resize(img)",
      "cv2.threshold(img)",
      "cv2.filter2D(img)",
    ],
    answer: 0,
    explanation:
      "cv2.cvtColor converts between color representations including BGR, RGB, GRAY, and HSV.",
    points: 2,
    category: "Computer Vision",
  },
  {
    id: "mcq-29",
    text: "What does ACID stand for in relational database transaction management?",
    options: [
      "Atomicity, Consistency, Isolation, Durability",
      "Accuracy, Complexity, Integrity, Dependency",
      "Authentication, Cryptography, Identity, Delegation",
      "Automated, Concurrent, Indexed, Distributed",
    ],
    answer: 0,
    explanation: "ACID guarantees that database transactions are processed reliably.",
    points: 2,
    category: "Database",
  },
  {
    id: "mcq-30",
    text: "In audio anomaly detection, what is RMS (Root Mean Square) energy primarily used to measure?",
    options: [
      "Pitch frequency",
      "Signal amplitude / loudness level",
      "Phoneme classification",
      "Language syntax",
    ],
    answer: 1,
    explanation:
      "RMS calculates the power or volume of an audio waveform to detect speaking and background noise.",
    points: 2,
    category: "Machine Learning",
  },
  {
    id: "mcq-31",
    text: "Which design pattern restricts a class to a single instantiation while providing global access?",
    options: ["Factory Pattern", "Singleton Pattern", "Observer Pattern", "Strategy Pattern"],
    answer: 1,
    explanation:
      "The Singleton Pattern ensures only one instance of a class exists across an application lifecycle.",
    points: 2,
    category: "Software Engineering",
  },
  {
    id: "mcq-32",
    text: "In Git, which command stages changes in the working directory for a commit?",
    options: ["git push", "git add", "git branch", "git checkout"],
    answer: 1,
    explanation: "git add stages modified and newly created files to the Git index.",
    points: 2,
    category: "DevOps & Tools",
  },
  {
    id: "mcq-33",
    text: "What is the primary benefit of transfer learning in deep neural networks?",
    options: [
      "Eliminates test sets",
      "Leverages features learned on massive datasets to train on smaller target datasets faster",
      "Guarantees 100% precision",
      "Replaces linear algebra with heuristics",
    ],
    answer: 1,
    explanation:
      "Pretrained weights from large datasets (e.g. ImageNet, COCO) transfer feature representations, drastically reducing training time and required data.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-34",
    text: "What is the time complexity of Breadth-First Search (BFS) on a graph with V vertices and E edges?",
    options: ["O(V * E)", "O(V + E)", "O(V²)", "O(E²)"],
    answer: 1,
    explanation:
      "BFS visits each vertex once and traverses each adjacent edge once using an adjacency list.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-35",
    text: "In Python, which decorator is used to define an immutable class method that accesses class state instead of instance state?",
    options: ["@staticmethod", "@classmethod", "@property", "@functools.lru_cache"],
    answer: 1,
    explanation:
      "@classmethod passes the class (cls) as its first argument rather than the instance (self).",
    points: 2,
    category: "Python",
  },
  {
    id: "mcq-36",
    text: "Which HTTP status code signifies that the client is not authenticated to access a resource?",
    options: ["200 OK", "401 Unauthorized", "404 Not Found", "500 Internal Server Error"],
    answer: 1,
    explanation:
      "HTTP 401 Unauthorized indicates the request requires user authentication credentials.",
    points: 2,
    category: "Web Development",
  },
  {
    id: "mcq-37",
    text: "What is the primary mathematical operation in a standard 2D convolution layer?",
    options: [
      "Discrete element-wise multiplication and summation with a sliding kernel",
      "Matrix determinant calculation",
      "Eigenvalue decomposition",
      "Fast Fourier phase shift",
    ],
    answer: 0,
    explanation:
      "2D convolution slides a filter kernel across the image multiplying receptive field inputs and summing them with a bias.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-38",
    text: "What is the space complexity of an in-place array reversal algorithm?",
    options: ["O(1)", "O(n)", "O(n log n)", "O(n²)"],
    answer: 0,
    explanation:
      "In-place reversal swaps symmetric elements using two pointers without allocating extra arrays, taking O(1) auxiliary space.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-39",
    text: "In biometric verification, what does the False Acceptance Rate (FAR) quantify?",
    options: [
      "Percentage of authorized users rejected",
      "Percentage of unauthorized impostors erroneously accepted as authentic",
      "Camera frame drop rate",
      "Face landmark jitter rate",
    ],
    answer: 1,
    explanation:
      "FAR measures how often an impostor is incorrectly accepted by the security verification system.",
    points: 2,
    category: "Computer Vision",
  },
  {
    id: "mcq-40",
    text: "Which Python data structure stores unique, unordered elements and provides fast membership testing?",
    options: ["list", "tuple", "set", "dict_values"],
    answer: 2,
    explanation:
      "A Python set is implemented as a hash table, ensuring uniqueness and average O(1) membership checks.",
    points: 2,
    category: "Python",
  },
  {
    id: "mcq-41",
    text: "What is the primary objective of Batch Normalization in deep learning models?",
    options: [
      "Normalize layer inputs to stabilize and accelerate gradient training",
      "Compress weights to 8-bit integers",
      "Delete dead ReLU neurons",
      "Encode categorical labels",
    ],
    answer: 0,
    explanation:
      "Batch Normalization normalizes activations across a mini-batch to zero mean and unit variance, smoothing the optimization landscape.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-42",
    text: "Which data structure is typically used to implement LRU (Least Recently Used) cache with O(1) operations?",
    options: [
      "Array and Stack",
      "Hash Map + Doubly Linked List",
      "Min Heap and Binary Tree",
      "Queue and Graph",
    ],
    answer: 1,
    explanation:
      "The Hash Map gives O(1) node lookup, while the Doubly Linked List enables O(1) node removal and insertion at head/tail.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-43",
    text: "In modern frontend development, what is React's Virtual DOM primarily designed to optimize?",
    options: [
      "Network packet size",
      "Minimizing expensive direct manipulations of the real browser DOM via reconciliation",
      "Browser CSS engine execution",
      "Database query indexing",
    ],
    answer: 1,
    explanation:
      "Virtual DOM computes a minimal diff of UI changes in memory before batch updating the actual browser DOM.",
    points: 2,
    category: "Web Development",
  },
  {
    id: "mcq-44",
    text: "Which algorithm finds the Minimum Spanning Tree of a connected weighted graph by greedily adding shortest edges?",
    options: ["Kruskal's Algorithm", "Floyd-Warshall", "Bellman-Ford", "Tarjan's SCC"],
    answer: 0,
    explanation:
      "Kruskal's algorithm sorts all edges by weight and adds edges that do not form cycles using Union-Find.",
    points: 2,
    category: "Data Structures & Algorithms",
  },
  {
    id: "mcq-45",
    text: "In web security, what does CSRF stand for?",
    options: [
      "Cross-Site Request Forgery",
      "Centralized Secure Routing Framework",
      "Client-Side Responsive Font",
      "Cryptographic Symmetric RSA Format",
    ],
    answer: 0,
    explanation:
      "Cross-Site Request Forgery tricks an authenticated user into executing unwanted actions on a trusted web application.",
    points: 2,
    category: "Cybersecurity",
  },
  {
    id: "mcq-46",
    text: "What is an epoch in deep learning training?",
    options: [
      "One forward pass of a single sample",
      "One complete pass through the entire training dataset",
      "One gradient descent parameter step",
      "One validation evaluation",
    ],
    answer: 1,
    explanation: "An epoch denotes a complete training cycle through all batches in the dataset.",
    points: 2,
    category: "Deep Learning",
  },
  {
    id: "mcq-47",
    text: "Which Python library provides high-performance N-dimensional array processing and vectorization?",
    options: ["Django", "NumPy", "Flask", "BeautifulSoup"],
    answer: 1,
    explanation:
      "NumPy provides C-optimized contiguous memory ndarrays and vectorized mathematical operations.",
    points: 2,
    category: "Python",
  },
  {
    id: "mcq-48",
    text: "In distributed systems, what does the CAP theorem state is impossible to guarantee simultaneously in presence of network partition?",
    options: [
      "Consistency and Availability",
      "Compression and Authentication",
      "Caching and Privacy",
      "Cost and Bandwidth",
    ],
    answer: 0,
    explanation:
      "Under network partition (P), a distributed data store must trade off either Consistency (C) or Availability (A).",
    points: 2,
    category: "Computer Systems",
  },
  {
    id: "mcq-49",
    text: "Which cryptographic algorithm is an asymmetric public-key cryptosystem widely used for secure data transmission?",
    options: ["AES-256", "RSA", "DES", "MD5"],
    answer: 1,
    explanation:
      "RSA uses a public key for encryption and a private key for decryption based on the factoring of large prime numbers.",
    points: 2,
    category: "Cybersecurity",
  },
  {
    id: "mcq-50",
    text: "In AI proctoring, what is the purpose of temporal aggregation windows for cheating events?",
    options: [
      "Delete database records after 24 hours",
      "Filter out momentary sensor blinks/glitches while flagging persistent suspicious behavior",
      "Slow down the user's browser",
      "Force low video resolution",
    ],
    answer: 1,
    explanation:
      "Temporal smoothing aggregates continuous seconds of violation (e.g. phone visible for >3s) to prevent false alerts from momentary motion artifacts.",
    points: 2,
    category: "Explainable AI",
  },
];

/* -------------------------------------------------------------------------- */
/* Curated 10 Programming / Coding Questions Bank                              */
/* -------------------------------------------------------------------------- */

export const PRESET_CODING_BANK: CodingQuestion[] = [
  {
    id: "code-1",
    title: "Two Sum",
    difficulty: "Easy",
    description:
      "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice. Return the indices as an array `[i, j]`.",
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "Exactly one valid answer exists.",
    ],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(nums, target) {
  // Write your code here
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const diff = target - nums[i];
    if (map.has(diff)) {
      return [map.get(diff), i];
    }
    map.set(nums[i], i);
  }
  return [];
}`,
      python: `def solution(nums, target):
    # Write your code here
    seen = {}
    for i, n in enumerate(nums):
        diff = target - n
        if diff in seen:
            return [seen[diff], i]
        seen[n] = i
    return []`,
    },
    testCases: [
      { input: "[2, 7, 11, 15], 9", expectedOutput: "[0, 1]", label: "Example 1", isHidden: false },
      { input: "[3, 2, 4], 6", expectedOutput: "[1, 2]", label: "Example 2", isHidden: false },
      { input: "[3, 3], 6", expectedOutput: "[0, 1]", label: "Hidden Test", isHidden: true },
    ],
  },
  {
    id: "code-2",
    title: "Valid Palindrome",
    difficulty: "Easy",
    description:
      "A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Alphanumeric characters include letters and numbers.\n\nGiven a string `s`, return `true` if it is a palindrome, or `false` otherwise.",
    constraints: ["1 <= s.length <= 2 * 10^5", "s consists only of printable ASCII characters."],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(s) {
  // Write your code here
  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === clean.split('').reverse().join('');
}`,
      python: `def solution(s):
    # Write your code here
    clean = ''.join(c.lower() for c in s if c.isalnum())
    return clean == clean[::-1]`,
    },
    testCases: [
      {
        input: '"A man, a plan, a canal: Panama"',
        expectedOutput: "true",
        label: "Classic Palindrome",
        isHidden: false,
      },
      { input: '"race a car"', expectedOutput: "false", label: "Non-palindrome", isHidden: false },
      { input: '" "', expectedOutput: "true", label: "Empty / space string", isHidden: true },
    ],
  },
  {
    id: "code-3",
    title: "Reverse String",
    difficulty: "Easy",
    description:
      "Write a function that reverses a given string `s` and returns the reversed string.\n\nExample:\nInput: 'hello'\nOutput: 'olleh'",
    constraints: ["1 <= s.length <= 10^5", "s consists of printable ASCII characters."],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(s) {
  // Write your code here
  return s.split('').reverse().join('');
}`,
      python: `def solution(s):
    # Write your code here
    return s[::-1]`,
    },
    testCases: [
      { input: '"hello"', expectedOutput: '"olleh"', label: "Sample 1", isHidden: false },
      { input: '"proctoring"', expectedOutput: '"gnirotcorp"', label: "Sample 2", isHidden: false },
      { input: '"a"', expectedOutput: '"a"', label: "Single character", isHidden: true },
    ],
  },
  {
    id: "code-4",
    title: "Fibonacci Number",
    difficulty: "Easy",
    description:
      "The Fibonacci numbers, commonly denoted `F(n)` form a sequence, called the Fibonacci sequence, such that each number is the sum of the two preceding ones, starting from `0` and `1`. That is:\n`F(0) = 0, F(1) = 1`\n`F(n) = F(n - 1) + F(n - 2)`, for `n > 1`.\n\nGiven `n`, calculate `F(n)`.",
    constraints: ["0 <= n <= 30"],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(n) {
  // Write your code here
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const c = a + b;
    a = b;
    b = c;
  }
  return b;
}`,
      python: `def solution(n):
    # Write your code here
    if n <= 0:
        return 0
    if n == 1:
        return 1
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b`,
    },
    testCases: [
      { input: "2", expectedOutput: "1", label: "F(2)", isHidden: false },
      { input: "3", expectedOutput: "2", label: "F(3)", isHidden: false },
      { input: "6", expectedOutput: "8", label: "F(6)", isHidden: false },
      { input: "10", expectedOutput: "55", label: "F(10)", isHidden: true },
    ],
  },
  {
    id: "code-5",
    title: "Valid Parentheses",
    difficulty: "Medium",
    description:
      "Given a string `s` containing just the characters `'('`, `')'`, `'{'`, `'}'`, `'['` and `']'`, determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.",
    constraints: ["1 <= s.length <= 10^4", "s consists of parentheses only '()[]{}'."],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(s) {
  // Write your code here
  const stack = [];
  const map = { ')': '(', '}': '{', ']': '[' };
  for (const char of s) {
    if (char === '(' || char === '{' || char === '[') {
      stack.push(char);
    } else {
      if (stack.pop() !== map[char]) return false;
    }
  }
  return stack.length === 0;
}`,
      python: `def solution(s):
    # Write your code here
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    for char in s:
        if char in '({[':
            stack.append(char)
        else:
            if not stack or stack.pop() != pairs.get(char):
                return False
    return len(stack) == 0`,
    },
    testCases: [
      { input: '"()"', expectedOutput: "true", label: "Simple parens", isHidden: false },
      { input: '"()[]{}"', expectedOutput: "true", label: "Mixed valid", isHidden: false },
      { input: '"(]"', expectedOutput: "false", label: "Mismatch", isHidden: false },
      { input: '"([)]"', expectedOutput: "false", label: "Interleaved invalid", isHidden: true },
    ],
  },
  {
    id: "code-6",
    title: "FizzBuzz Generator",
    difficulty: "Easy",
    description:
      "Given an integer `n`, return a string array `answer` (1-indexed) where:\n- `answer[i] == 'FizzBuzz'` if `i` is divisible by `3` and `5`.\n- `answer[i] == 'Fizz'` if `i` is divisible by `3`.\n- `answer[i] == 'Buzz'` if `i` is divisible by `5`.\n- `answer[i] == String(i)` if none of the above conditions are true.",
    constraints: ["1 <= n <= 10^4"],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(n) {
  // Write your code here
  const res = [];
  for (let i = 1; i <= n; i++) {
    if (i % 15 === 0) res.push("FizzBuzz");
    else if (i % 3 === 0) res.push("Fizz");
    else if (i % 5 === 0) res.push("Buzz");
    else res.push(String(i));
  }
  return res;
}`,
      python: `def solution(n):
    # Write your code here
    res = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            res.append("FizzBuzz")
        elif i % 3 == 0:
            res.append("Fizz")
        elif i % 5 == 0:
            res.append("Buzz")
        else:
            res.append(str(i))
    return res`,
    },
    testCases: [
      { input: "3", expectedOutput: '["1", "2", "Fizz"]', label: "n = 3", isHidden: false },
      {
        input: "5",
        expectedOutput: '["1", "2", "Fizz", "4", "Buzz"]',
        label: "n = 5",
        isHidden: false,
      },
      {
        input: "15",
        expectedOutput:
          '["1","2","Fizz","4","Buzz","Fizz","7","8","Fizz","Buzz","11","Fizz","13","14","FizzBuzz"]',
        label: "n = 15",
        isHidden: true,
      },
    ],
  },
  {
    id: "code-7",
    title: "Maximum Subarray (Kadane's Algorithm)",
    difficulty: "Medium",
    description:
      "Given an integer array `nums`, find the subarray with the largest sum, and return its sum.\n\nA subarray is a contiguous non-empty sequence of elements within an array.",
    constraints: ["1 <= nums.length <= 10^5", "-10^4 <= nums[i] <= 10^4"],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(nums) {
  // Write your code here
  let currentSum = nums[0];
  let maxSum = nums[0];
  for (let i = 1; i < nums.length; i++) {
    currentSum = Math.max(nums[i], currentSum + nums[i]);
    maxSum = Math.max(maxSum, currentSum);
  }
  return maxSum;
}`,
      python: `def solution(nums):
    # Write your code here
    current_sum = nums[0]
    max_sum = nums[0]
    for n in nums[1:]:
        current_sum = max(n, current_sum + n)
        max_sum = max(max_sum, current_sum)
    return max_sum`,
    },
    testCases: [
      {
        input: "[-2, 1, -3, 4, -1, 2, 1, -5, 4]",
        expectedOutput: "6",
        label: "Example 1",
        isHidden: false,
      },
      { input: "[1]", expectedOutput: "1", label: "Single element", isHidden: false },
      {
        input: "[5, 4, -1, 7, 8]",
        expectedOutput: "23",
        label: "All positive with drop",
        isHidden: false,
      },
      {
        input: "[-1, -2, -3]",
        expectedOutput: "-1",
        label: "All negative numbers",
        isHidden: true,
      },
    ],
  },
  {
    id: "code-8",
    title: "Binary Search",
    difficulty: "Easy",
    description:
      "Given an array of integers `nums` which is sorted in ascending order, and an integer `target`, write a function to search `target` in `nums`. If `target` exists, then return its index. Otherwise, return `-1`.\n\nYou must write an algorithm with `O(log n)` runtime complexity.",
    constraints: [
      "1 <= nums.length <= 10^4",
      "-10^4 < nums[i], target < 10^4",
      "All integers in nums are unique and sorted in ascending order.",
    ],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(nums, target) {
  // Write your code here
  let left = 0, right = nums.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}`,
      python: `def solution(nums, target):
    # Write your code here
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,
    },
    testCases: [
      {
        input: "[-1, 0, 3, 5, 9, 12], 9",
        expectedOutput: "4",
        label: "Element Present",
        isHidden: false,
      },
      {
        input: "[-1, 0, 3, 5, 9, 12], 2",
        expectedOutput: "-1",
        label: "Element Missing",
        isHidden: false,
      },
      { input: "[5], 5", expectedOutput: "0", label: "Single Match", isHidden: true },
    ],
  },
  {
    id: "code-9",
    title: "Valid Anagram",
    difficulty: "Easy",
    description:
      "Given two strings `s` and `t`, return `true` if `t` is an anagram of `s`, and `false` otherwise.\n\nAn Anagram is a word or phrase formed by rearranging the letters of a different word or phrase, typically using all the original letters exactly once.",
    constraints: [
      "1 <= s.length, t.length <= 5 * 10^4",
      "s and t consist of lowercase English letters.",
    ],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(s, t) {
  // Write your code here
  if (s.length !== t.length) return false;
  return s.split('').sort().join('') === t.split('').sort().join('');
}`,
      python: `def solution(s, t):
    # Write your code here
    if len(s) != len(t):
        return False
    return sorted(s) == sorted(t)`,
    },
    testCases: [
      {
        input: '"anagram", "nagaram"',
        expectedOutput: "true",
        label: "Valid anagram",
        isHidden: false,
      },
      { input: '"rat", "car"', expectedOutput: "false", label: "Invalid anagram", isHidden: false },
      {
        input: '"listen", "silent"',
        expectedOutput: "true",
        label: "Classic words",
        isHidden: true,
      },
    ],
  },
  {
    id: "code-10",
    title: "Array Chunking",
    difficulty: "Medium",
    description:
      "Given an array `arr` and a chunk size `size`, return a chunked array. A chunked array contains the original elements in `arr`, but consists of subarrays each of length `size`. The length of the last subarray may be less than `size` if `arr.length` is not evenly divisible by `size`.",
    constraints: ["1 <= arr.length <= 10^5", "1 <= size <= arr.length"],
    points: 10,
    language: "javascript",
    starterCode: {
      javascript: `function solution(arr, size) {
  // Write your code here
  const chunked = [];
  for (let i = 0; i < arr.length; i += size) {
    chunked.push(arr.slice(i, i + size));
  }
  return chunked;
}`,
      python: `def solution(arr, size):
    # Write your code here
    res = []
    for i in range(0, len(arr), size):
        res.append(arr[i:i + size])
    return res`,
    },
    testCases: [
      {
        input: "[1, 2, 3, 4, 5], 2",
        expectedOutput: "[[1, 2], [3, 4], [5]]",
        label: "Size 2 uneven",
        isHidden: false,
      },
      {
        input: "[1, 9, 6, 3, 2], 3",
        expectedOutput: "[[1, 9, 6], [3, 2]]",
        label: "Size 3 uneven",
        isHidden: false,
      },
      {
        input: "[8, 5, 3, 2, 6], 5",
        expectedOutput: "[[8, 5, 3, 2, 6]]",
        label: "Equal size",
        isHidden: true,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

const KEY = "nextgen-proctor-db-v1";

export interface DB {
  users: User[];
  exams: Exam[];
  sessions: ExamSession[];
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function seed(): DB {
  const now = Date.now();
  const day = 86_400_000;
  return {
    users: [
      {
        id: "u-student",
        name: "Aarav Sharma",
        email: "student@demo.com",
        password: "student123",
        role: "student",
        department: "Computer Science",
        photoUrl: generateDefaultStudentPhoto("Aarav Sharma"),
        faceEnrolled: true,
        createdAt: new Date(now - 30 * day).toISOString(),
      },
      {
        id: "u-faculty",
        name: "Dr. Meera Iyer",
        email: "faculty@demo.com",
        password: "faculty123",
        role: "faculty",
        department: "Computer Science",
        photoUrl: generateDefaultStudentPhoto("Dr. Meera Iyer"),
        faceEnrolled: true,
        createdAt: new Date(now - 120 * day).toISOString(),
      },
      {
        id: "u-admin",
        name: "System Administrator",
        email: "admin@demo.com",
        password: "admin123",
        role: "admin",
        photoUrl: generateDefaultStudentPhoto("System Admin"),
        faceEnrolled: true,
        createdAt: new Date(now - 200 * day).toISOString(),
      },
      {
        id: "u-s2",
        name: "Nikhil Verma",
        email: "nikhil@demo.com",
        password: "student123",
        role: "student",
        department: "Information Technology",
        photoUrl: generateDefaultStudentPhoto("Nikhil Verma"),
        faceEnrolled: true,
        createdAt: new Date(now - 20 * day).toISOString(),
      },
      {
        id: "u-s3",
        name: "Ishita Rao",
        email: "ishita@demo.com",
        password: "student123",
        role: "student",
        department: "Electronics",
        photoUrl: generateDefaultStudentPhoto("Ishita Rao"),
        faceEnrolled: false,
        createdAt: new Date(now - 10 * day).toISOString(),
      },
    ],
    exams: [
      {
        id: "e1",
        title: "AI & Full-Stack Engineering — Midterm Exam",
        subject: "Artificial Intelligence & Software Systems",
        durationMin: 45, // Set in Admin
        scheduledAt: new Date(now + 2 * 3_600_000).toISOString(),
        questions: PRESET_MCQ_BANK.slice(0, 15),
        codingQuestions: PRESET_CODING_BANK.slice(0, 4),
        instructions:
          "Exam monitored live by YOLOv8 vision and MediaPipe tracking. Do not switch tabs.",
      },
      {
        id: "e2",
        title: "Computer Vision & Deep Learning Assessment",
        subject: "Computer Vision",
        durationMin: 30, // Set in Admin
        scheduledAt: new Date(now + day).toISOString(),
        questions: PRESET_MCQ_BANK.slice(0, 10),
        codingQuestions: PRESET_CODING_BANK.slice(0, 2),
        instructions:
          "Face must remain within frame at all times. Phones and books are strictly prohibited.",
      },
      {
        id: "e3",
        title: "Data Structures, Algorithms & Problem Solving",
        subject: "Core Computer Science",
        durationMin: 60, // Set in Admin
        scheduledAt: new Date(now + 3 * day).toISOString(),
        questions: PRESET_MCQ_BANK.slice(10, 30),
        codingQuestions: PRESET_CODING_BANK.slice(0, 6),
        instructions: "Complete MCQs and coding challenges before the countdown timer expires.",
      },
    ],
    sessions: [demoSession(now)],
  };
}

/** One completed historical session so reports/dashboards are never empty. */
function demoSession(now: number): ExamSession {
  const metrics: BehaviourMetrics = {
    ...emptyMetrics(),
    phoneSeconds: 18,
    lookAwayCount: 12,
    voiceSeconds: 9,
    handEvents: 3,
    headMovementCount: 6,
  };
  const risk = computeRisk(metrics);
  const base = now - 3 * 86_400_000;
  const mk = (min: number, type: EventType, label: string, severity: number): TimelineEvent => ({
    id: uid(),
    sessionId: "sess-demo",
    type,
    label,
    at: new Date(base + min * 60_000).toISOString(),
    clock: new Date(base + min * 60_000).toLocaleTimeString([], { hour12: false }),
    severity,
  });
  return {
    id: "sess-demo",
    studentId: "u-student",
    studentName: "Aarav Sharma",
    examId: "e2",
    examTitle: "Computer Vision & Deep Learning Assessment",
    startedAt: new Date(base).toISOString(),
    endedAt: new Date(base + 30 * 60_000).toISOString(),
    status: "completed",
    riskScore: risk.score,
    riskLevel: risk.level,
    reasons: risk.reasons,
    answers: { "mcq-1": 1, "mcq-2": 2, "mcq-3": 1, "mcq-4": 0 },
    codeAnswers: {
      "code-1": {
        code: PRESET_CODING_BANK[0]!.starterCode.javascript,
        language: "javascript",
        passedCount: 3,
        totalCount: 3,
        allPassed: true,
      },
    },
    scoreSummary: {
      mcqScore: 4,
      mcqTotal: 4,
      codingScore: 3,
      codingTotal: 3,
      totalScore: 7,
      maxScore: 7,
      percentage: 100,
    },
    roomScanPassed: true,
    metrics,
    events: [
      mk(5, "phone", "Mobile phone detected in frame", 22),
      mk(15, "looking_away", "Gaze off-screen for 4s", 12),
      mk(25, "voice", "Voice activity detected", 14),
      mk(40, "multi_person", "Second person entered frame", 26),
    ],
  };
}

export function loadDB(): DB {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const fresh = seed();
      window.localStorage.setItem(KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as DB;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.exams) || parsed.exams.length === 0) {
      const fresh = seed();
      window.localStorage.setItem(KEY, JSON.stringify(fresh));
      return fresh;
    }
    if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
      parsed.users = seed().users;
    }
    if (!Array.isArray(parsed.sessions)) {
      parsed.sessions = [];
    }

    // Migrate and validate each exam
    let migrated = false;
    for (const ex of parsed.exams) {
      if (!Array.isArray(ex.codingQuestions) || ex.codingQuestions.length === 0) {
        ex.codingQuestions = PRESET_CODING_BANK.slice(0, 3);
        migrated = true;
      }
      if (!Array.isArray(ex.questions) || ex.questions.length === 0) {
        ex.questions = PRESET_MCQ_BANK.slice(0, 15);
        migrated = true;
      }
      if (!ex.durationMin || ex.durationMin <= 0) {
        ex.durationMin = 45;
        migrated = true;
      }
    }

    // Clean up historical face mismatch events from exam sessions (identity is verified at pre-check gate)
    for (const session of parsed.sessions) {
      if (session.metrics?.faceMismatchCount) {
        session.metrics.faceMismatchCount = 0;
        migrated = true;
      }
      if (session.events && session.events.some((e: any) => e.type === "face_mismatch" || e.label?.toLowerCase().includes("face mismatch") || e.label?.toLowerCase().includes("identity mismatch"))) {
        session.events = session.events.filter((e: any) => e.type !== "face_mismatch" && !e.label?.toLowerCase().includes("face mismatch") && !e.label?.toLowerCase().includes("identity mismatch"));
        const recalculated = computeRisk(session.metrics);
        session.riskScore = recalculated.score;
        session.riskLevel = recalculated.level;
        migrated = true;
      }
    }
    if (migrated) {
      window.localStorage.setItem(KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    const fresh = seed();
    try {
      window.localStorage.setItem(KEY, JSON.stringify(fresh));
    } catch {}
    return fresh;
  }
}

export function saveDB(db: DB) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch (err) {
    console.warn("localStorage quota exceeded, pruning old session evidence images:", err);
    const trimmed = {
      ...db,
      sessions: db.sessions.map((s, idx) => {
        if (idx > 4) {
          return {
            ...s,
            events: s.events.map((e) => ({ ...e, evidence: undefined })),
          };
        }
        return s;
      }),
    };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch {}
  }
  window.dispatchEvent(new CustomEvent("proctor-db-change"));
}

export function updateDB(mutate: (db: DB) => void): DB {
  const db = loadDB();
  mutate(db);
  saveDB(db);
  return db;
}

export function resetDB() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  saveDB(seed());
}

/* -------------------------------------------------------------------------- */
/* Admin Helper Methods                                                       */
/* -------------------------------------------------------------------------- */

export function updateExamTiming(examId: string, durationMin: number): boolean {
  if (durationMin < 1 || durationMin > 360) return false;
  updateDB((db) => {
    const exam = db.exams.find((e) => e.id === examId);
    if (exam) exam.durationMin = durationMin;
  });
  return true;
}

export function loadPresetMCQs(
  examId: string,
  count: number = 50,
): { countLoaded: number; total: number } {
  const targetCount = Math.min(count, MAX_MCQ_QUESTIONS);
  let total = 0;
  let loaded = 0;
  updateDB((db) => {
    const exam = db.exams.find((e) => e.id === examId);
    if (!exam) return;
    // Take from presets up to remaining capacity
    const existingIds = new Set(exam.questions.map((q) => q.id));
    const candidates = PRESET_MCQ_BANK.filter((q) => !existingIds.has(q.id));
    const capacity = MAX_MCQ_QUESTIONS - exam.questions.length;
    const toAdd = candidates.slice(0, Math.min(capacity, targetCount));
    exam.questions.push(...toAdd);
    loaded = toAdd.length;
    total = exam.questions.length;
  });
  return { countLoaded: loaded, total };
}

export function loadPresetCodingQuestions(
  examId: string,
  count: number = 10,
): { countLoaded: number; total: number } {
  const targetCount = Math.min(count, MAX_CODING_QUESTIONS);
  let total = 0;
  let loaded = 0;
  updateDB((db) => {
    const exam = db.exams.find((e) => e.id === examId);
    if (!exam) return;
    const existingIds = new Set(exam.codingQuestions.map((q) => q.id));
    const candidates = PRESET_CODING_BANK.filter((q) => !existingIds.has(q.id));
    const capacity = MAX_CODING_QUESTIONS - exam.codingQuestions.length;
    const toAdd = candidates.slice(0, Math.min(capacity, targetCount));
    exam.codingQuestions.push(...toAdd);
    loaded = toAdd.length;
    total = exam.codingQuestions.length;
  });
  return { countLoaded: loaded, total };
}

export function addMCQQuestion(
  examId: string,
  question: Omit<Question, "id">,
): { success: boolean; error?: string; question?: Question } {
  let res: { success: boolean; error?: string; question?: Question } = { success: false };
  updateDB((db) => {
    const exam = db.exams.find((e) => e.id === examId);
    if (!exam) {
      res = { success: false, error: "Exam not found." };
      return;
    }
    if (exam.questions.length >= MAX_MCQ_QUESTIONS) {
      res = {
        success: false,
        error: `Maximum limit of ${MAX_MCQ_QUESTIONS} MCQ questions reached for this exam.`,
      };
      return;
    }
    const newQ: Question = {
      ...question,
      id: `mcq-${uid()}`,
    };
    exam.questions.push(newQ);
    res = { success: true, question: newQ };
  });
  return res;
}

export function deleteMCQQuestion(examId: string, questionId: string): boolean {
  let ok = false;
  updateDB((db) => {
    const exam = db.exams.find((e) => e.id === examId);
    if (exam) {
      const idx = exam.questions.findIndex((q) => q.id === questionId);
      if (idx !== -1) {
        exam.questions.splice(idx, 1);
        ok = true;
      }
    }
  });
  return ok;
}

export function addCodingQuestion(
  examId: string,
  question: Omit<CodingQuestion, "id">,
): { success: boolean; error?: string; question?: CodingQuestion } {
  let res: { success: boolean; error?: string; question?: CodingQuestion } = { success: false };
  updateDB((db) => {
    const exam = db.exams.find((e) => e.id === examId);
    if (!exam) {
      res = { success: false, error: "Exam not found." };
      return;
    }
    if (exam.codingQuestions.length >= MAX_CODING_QUESTIONS) {
      res = {
        success: false,
        error: `Maximum limit of ${MAX_CODING_QUESTIONS} coding questions reached for this exam.`,
      };
      return;
    }
    const newQ: CodingQuestion = {
      ...question,
      id: `code-${uid()}`,
    };
    exam.codingQuestions.push(newQ);
    res = { success: true, question: newQ };
  });
  return res;
}

export function deleteCodingQuestion(examId: string, questionId: string): boolean {
  let ok = false;
  updateDB((db) => {
    const exam = db.exams.find((e) => e.id === examId);
    if (exam) {
      const idx = exam.codingQuestions.findIndex((q) => q.id === questionId);
      if (idx !== -1) {
        exam.codingQuestions.splice(idx, 1);
        ok = true;
      }
    }
  });
  return ok;
}

export function updateExamMetadata(
  examId: string,
  data: Partial<Pick<Exam, "title" | "subject" | "durationMin" | "scheduledAt" | "instructions">>,
): boolean {
  let ok = false;
  updateDB((db) => {
    const exam = db.exams.find((e) => e.id === examId);
    if (exam) {
      Object.assign(exam, data);
      ok = true;
    }
  });
  return ok;
}
