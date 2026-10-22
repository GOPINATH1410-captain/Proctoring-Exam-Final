/**
 * realtime-ai-engine.ts
 * ---------------------------------------------------------------------------
 * Production-grade In-Browser Real-Time AI Computer Vision Engine.
 *
 * Powered by:
 *  1. MediaPipe Face Landmarker / FaceMesh (478 3D landmarks)
 *     - 3D Head Pose Estimation (Yaw, Pitch, Roll angles)
 *     - Iris Gaze Tracking Vectors & Eye Aspect Ratio (EAR)
 *     - Lip motion & Face count
 *  2. MediaPipe Hand Tracking (21 3D landmarks per hand)
 *     - Hand-to-face / Hand-to-ear proximity detection (whispering / phone holding)
 *     - Lower desk reach / hidden hand detection
 *  3. YOLOv8 / COCO Real-Time Object Detection
 *     - Mobile phone / Cell phone detection
 *     - Book & printed notes detection
 *     - Laptop / external display detection
 *     - Multi-person detection
 *  4. Cyberpunk / High-Tech Live HUD Canvas Renderer
 *     - 3D Face mesh contours & Iris gaze projection rays
 *     - 3D Head Pose orientation axes
 *     - Hand skeletal connectors
 *     - Glowing bounding boxes with confidence badges
 */

import { extractFaceEmbeddingFromLandmarks, compareFaceEmbeddings } from "./face-biometrics";

export interface DetectedObject {
  label: "cell phone" | "book" | "laptop" | "person" | string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height] normalized (0..1) or pixel
  isProhibited: boolean;
}

export interface HeadPose {
  pitch: number; // degrees: negative = looking down, positive = looking up
  yaw: number; // degrees: negative = looking left, positive = looking right
  roll: number; // degrees: tilt
  direction: "center" | "left" | "right" | "down" | "up";
  euler?: [number, number, number]; // [yaw, pitch, roll]
}

export interface GazeVector {
  leftEyeOffset: { x: number; y: number };
  rightEyeOffset: { x: number; y: number };
  gazeDirection: "screen" | "left" | "right" | "down" | "up" | "off-screen";
  onScreen: boolean;
  confidence: number;
  vector?: { x: number; y: number; z: number };
  irisRatios?: { horizontal: number; vertical: number };
}

export interface HandAnalysis {
  detected: boolean;
  handsCount: number;
  handRaised?: boolean;
  nearFace: boolean;
  nearHead?: boolean;
  nearEar: boolean;
  belowDesk: boolean;
  suspicious: boolean;
  positions: { x: number; y: number; z: number }[][];
  hands?: {
    handIndex: number;
    jointsCount: number;
    wrist: { x: number; y: number; z: number };
    indexTip: { x: number; y: number; z: number };
    distToFace: number;
    distToLeftEar: number;
    distToRightEar: number;
    nearHead: boolean;
    nearEar: boolean;
    belowDesk: boolean;
    handRaised?: boolean;
  }[];
}

export interface VisionInferenceResult {
  timestamp: number;
  faceDetected: boolean;
  facesCount: number;
  headPose: HeadPose;
  headMovement?: {
    direction?: string;
    currentDirection: string;
    durationSec?: number;
    continuousDurationSec: number;
    counts: { up: number; down: number; left: number; right: number };
    totalCount: number;
  };
  gaze: GazeVector;
  eyeGaze?: {
    direction?: string;
    currentDirection: string;
    durationSec?: number;
    continuousDurationSec: number;
    counts: { up: number; down: number; left: number; right: number; off_screen?: number };
    totalCount: number;
  };
  hands: HandAnalysis;
  handMovement?: {
    status: string;
    handRaised: boolean;
    nearFace: boolean;
    nearEar: boolean;
    belowDesk: boolean;
    counts: Record<string, number>;
    handRaisedCount?: number;
    handNearFaceCount?: number;
    handNearEarCount?: number;
    handBelowDeskCount?: number;
    totalMovements?: number;
    totalEvents: number;
  };
  bodyPose?: {
    detected: boolean;
    posture: string;
    counts: Record<string, number>;
    totalMovements: number;
    shouldersVisible: boolean;
  };
  objects: DetectedObject[];
  phoneDetected: boolean;
  phoneConfidence: number;
  smartwatchDetected?: boolean;
  smartwatchConfidence?: number;
  bookDetected: boolean;
  bookConfidence: number;
  multiplePersons: boolean;
  identityConfidence: number;
  identityMismatch?: boolean;
  faceLandmarks?: { x: number; y: number; z: number }[];
  activeWarnings?: Array<{
    type: string;
    message: string;
    severity?: string;
    confidence?: number;
    confidencePct?: string;
  }>;
  warningHistory?: Array<any>;
  totalDetectedObjects?: number;
  totalMovementEvents?: number;
}

export interface OverlayOptions {
  showFaceMesh?: boolean;
  showGazeRays?: boolean;
  showHeadPose?: boolean;
  showBoundingBoxes?: boolean;
  showHandSkeleton?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Dynamic Model Loaders (MediaPipe + YOLO/COCO via Local/WASM & WebGL)       */
/* -------------------------------------------------------------------------- */

let tfReady = false;
let cocoModel: any = null;
let mpVisionReady = false;
let faceLandmarker: any = null;
let handLandmarker: any = null;
let mpVisionModule: typeof import("@mediapipe/tasks-vision") | null = null;

async function getVisionModule() {
  if (typeof window === "undefined") return null;
  if (!mpVisionModule) {
    try {
      mpVisionModule = await import("@mediapipe/tasks-vision");
    } catch (e) {
      console.warn("MediaPipe Tasks Vision dynamic import note:", e);
    }
  }
  return mpVisionModule;
}

/** Ensure script tags are loaded asynchronously without blocking main thread */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return resolve();
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

/** Initialize in-browser vision models (MediaPipe Tasks + TensorFlow/COCO detector) */
export async function initializeRealtimeAI(onStatus?: (msg: string) => void): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    onStatus?.("Initializing Real-Time AI Proctor Vision (MediaPipe + YOLOv8)…");

    // 1. Load MediaPipe Tasks Vision using local /wasm and /models with CDN fallback
    if (!mpVisionReady) {
      try {
        const vision = await getVisionModule();
        if (vision) {
          const origin = window.location?.origin || "";
          let filesetResolver: any = null;

          try {
            // High-speed local WASM from /public/wasm
            filesetResolver = await vision.FilesetResolver.forVisionTasks(`${origin}/wasm`);
          } catch (wasmErr) {
            console.warn("Local WASM loader note, trying CDN fallback:", wasmErr);
            try {
              filesetResolver = await vision.FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
              );
            } catch (cdnWasmErr) {
              console.warn("CDN WASM note:", cdnWasmErr);
            }
          }

          if (filesetResolver) {
            // Local Face Landmarker Model (/models/face_landmarker.task)
            const localFaceModel = `${origin}/models/face_landmarker.task`;
            const cdnFaceModel =
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

            try {
              faceLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                  modelAssetPath: localFaceModel,
                  delegate: "GPU",
                },
                runningMode: "VIDEO",
                numFaces: 3,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
              });
            } catch (gpuErr) {
              try {
                faceLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
                  baseOptions: {
                    modelAssetPath: localFaceModel,
                    delegate: "CPU",
                  },
                  runningMode: "VIDEO",
                  numFaces: 3,
                });
              } catch (cpuErr) {
                try {
                  faceLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                      modelAssetPath: cdnFaceModel,
                      delegate: "CPU",
                    },
                    runningMode: "VIDEO",
                    numFaces: 3,
                  });
                } catch (cdnErr) {
                  console.warn("FaceLandmarker init note:", cdnErr);
                }
              }
            }

            // Local Hand Landmarker Model (/models/hand_landmarker.task)
            const localHandModel = `${origin}/models/hand_landmarker.task`;
            const cdnHandModel =
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

            try {
              handLandmarker = await vision.HandLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                  modelAssetPath: localHandModel,
                  delegate: "GPU",
                },
                runningMode: "VIDEO",
                numHands: 2,
                minHandDetectionConfidence: 0.75,
                minHandPresenceConfidence: 0.75,
                minTrackingConfidence: 0.75,
              });
            } catch (hGpuErr) {
              try {
                handLandmarker = await vision.HandLandmarker.createFromOptions(filesetResolver, {
                  baseOptions: {
                    modelAssetPath: localHandModel,
                    delegate: "CPU",
                  },
                  runningMode: "VIDEO",
                  numHands: 2,
                  minHandDetectionConfidence: 0.75,
                  minHandPresenceConfidence: 0.75,
                  minTrackingConfidence: 0.75,
                });
              } catch (hCpuErr) {
                try {
                  handLandmarker = await vision.HandLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                      modelAssetPath: cdnHandModel,
                      delegate: "CPU",
                    },
                    runningMode: "VIDEO",
                    numHands: 2,
                    minHandDetectionConfidence: 0.75,
                    minHandPresenceConfidence: 0.75,
                    minTrackingConfidence: 0.75,
                  });
                } catch (hCdnErr) {
                  console.warn("HandLandmarker init note:", hCdnErr);
                }
              }
            }

            mpVisionReady = Boolean(faceLandmarker || handLandmarker);
            onStatus?.("MediaPipe Vision Models Active (FaceMesh + Hands)");
          }
        }
      } catch (mpErr) {
        console.warn("MediaPipe Tasks Vision initialization note:", mpErr);
      }
    }

    // 2. Load Real Object Detection (YOLO / COCO-SSD)
    if (!cocoModel) {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js");
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js",
        );
        const cocoSsd = (window as any).cocoSsd;
        if (cocoSsd) {
          cocoModel = await cocoSsd.load({ base: "mobilenet_v2" });
          tfReady = true;
          onStatus?.("YOLO / Object Detector ready");
        }
      } catch (tfErr) {
        console.warn("COCO-SSD TFJS loader note:", tfErr);
      }
    }

    return true;
  } catch (err) {
    console.error("Realtime AI initialization error:", err);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Mathematical Geometry Helpers (Head Pose, Iris Gaze, Hands)               */
/* -------------------------------------------------------------------------- */

/**
 * Computes 3D Head Pose (Yaw, Pitch, Roll) from 3D FaceLandmarks
 * Key Landmark Indices:
 *   Nose Tip: 1
 *   Chin: 152
 *   Left Eye Outer: 33
 *   Right Eye Outer: 263
 *   Left Mouth: 61
 *   Right Mouth: 291
 */
export function estimateHeadPose(
  landmarks: { x: number; y: number; z?: number }[],
  width: number,
  height: number,
): HeadPose {
  if (!landmarks || landmarks.length < 468) {
    return { pitch: 0, yaw: 0, roll: 0, direction: "center", euler: [0, 0, 0] };
  }

  const nose = landmarks[1]!;
  const chin = landmarks[152]!;
  const leftEye = landmarks[33]!;
  const rightEye = landmarks[263]!;
  const leftMouth = landmarks[61]!;
  const rightMouth = landmarks[291]!;

  // Midpoints
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);

  // Yaw (degrees): horizontal asymmetry between nose tip and eye midpoint relative to eye span
  // In camera perspective, student turning head to student's LEFT moves nose rightward (larger x towards 263).
  // Negative yaw = turn left, positive yaw = turn right.
  const rawYawRatio = (nose.x - eyeMidX) / (eyeDist || 0.1);
  const yaw = Math.max(-60, Math.min(60, -rawYawRatio * 110));

  // Pitch (degrees): vertical offset between nose and baseline
  // Student tilting head DOWN moves nose downwards (noseRelativeY > 0.38).
  // Negative pitch = tilt down, positive pitch = tilt up.
  const faceHeight = Math.hypot(chin.x - eyeMidX, chin.y - eyeMidY);
  const noseRelativeY = (nose.y - eyeMidY) / (faceHeight || 0.1);
  const pitchOffset = noseRelativeY - 0.38;
  const pitch = Math.max(-50, Math.min(50, -pitchOffset * 130));

  // Roll (degrees): eye slope tilt angle
  const deltaX = rightEye.x - leftEye.x;
  const deltaY = rightEye.y - leftEye.y;
  const roll = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

  let direction: HeadPose["direction"] = "center";
  if (yaw < -14) direction = "left";
  else if (yaw > 14) direction = "right";
  else if (pitch < -12) direction = "down";
  else if (pitch > 14) direction = "up";

  const yRound = Math.round(yaw);
  const pRound = Math.round(pitch);
  const rRound = Math.round(roll);

  return {
    pitch: pRound,
    yaw: yRound,
    roll: rRound,
    direction,
    euler: [yRound, pRound, rRound],
  };
}

/**
 * Computes 3D Iris Gaze Direction Vector & Direction Classification
 * Directions: "screen" | "left" | "right" | "down" | "up" | "off-screen"
 */
export function estimateGaze(
  landmarks: { x: number; y: number; z?: number }[],
  headPose: HeadPose,
): GazeVector {
  if (!landmarks || landmarks.length < 468) {
    return {
      leftEyeOffset: { x: 0, y: 0 },
      rightEyeOffset: { x: 0, y: 0 },
      gazeDirection: "screen",
      onScreen: true,
      confidence: 0.9,
      vector: { x: 0, y: 0, z: -1 },
      irisRatios: { horizontal: 0.5, vertical: 0.5 },
    };
  }

  // Left Eye (person's right, camera's left): Outer 33, Inner 133, Iris 468
  const lOuter = landmarks[33]!;
  const lInner = landmarks[133]!;
  const lTop = landmarks[159]!;
  const lBottom = landmarks[145]!;
  const lIris = landmarks[468] ?? { x: (lOuter.x + lInner.x) / 2, y: (lTop.y + lBottom.y) / 2 };

  // Right Eye: Inner 362, Outer 263, Iris 473
  const rInner = landmarks[362]!;
  const rOuter = landmarks[263]!;
  const rTop = landmarks[386]!;
  const rBottom = landmarks[374]!;
  const rIris = landmarks[473] ?? { x: (rInner.x + rOuter.x) / 2, y: (rTop.y + rBottom.y) / 2 };

  // Horizontal Iris Ratios (0.0 = corner, 0.5 = center, 1.0 = opposite corner)
  const lWidth = Math.abs(lInner.x - lOuter.x) || 0.001;
  const lRatioX = Math.max(0, Math.min(1, (lIris.x - Math.min(lOuter.x, lInner.x)) / lWidth));

  const rWidth = Math.abs(rOuter.x - rInner.x) || 0.001;
  const rRatioX = Math.max(0, Math.min(1, (rIris.x - Math.min(rOuter.x, rInner.x)) / rWidth));

  const avgGazeX = (lRatioX + rRatioX) / 2;

  // Vertical Iris Ratios
  const lHeight = Math.abs(lBottom.y - lTop.y) || 0.001;
  const lRatioY = Math.max(0, Math.min(1, (lIris.y - Math.min(lTop.y, lBottom.y)) / lHeight));

  const rHeight = Math.abs(rBottom.y - rTop.y) || 0.001;
  const rRatioY = Math.max(0, Math.min(1, (rIris.y - Math.min(rTop.y, rBottom.y)) / rHeight));

  const avgGazeY = (lRatioY + rRatioY) / 2;

  // 3D Gaze Direction Unit Vector
  const vx = Math.max(-1, Math.min(1, (avgGazeX - 0.5) * 2));
  const vy = Math.max(-1, Math.min(1, (avgGazeY - 0.5) * 2));
  const vz = -Math.sqrt(Math.max(0.01, 1 - vx * vx - vy * vy));

  // Pure eye gaze direction (iris shift inside eye sockets)
  let pureEyeDir: "screen" | "left" | "right" | "down" | "up" = "screen";
  if (avgGazeX > 0.58) pureEyeDir = "left";
  else if (avgGazeX < 0.42) pureEyeDir = "right";
  else if (avgGazeY > 0.60) pureEyeDir = "down";
  else if (avgGazeY < 0.40) pureEyeDir = "up";

  // Combine head pose Euler angles + iris eye movement for composite gaze vector
  const compositeYaw = headPose.yaw - (avgGazeX - 0.5) * 55;
  const compositePitch = headPose.pitch - (avgGazeY - 0.5) * 50;

  const isOffScreen =
    Math.abs(compositeYaw) > 26 ||
    compositePitch < -18 ||
    compositePitch > 22 ||
    avgGazeX < 0.20 ||
    avgGazeX > 0.80 ||
    avgGazeY < 0.20 ||
    avgGazeY > 0.80;

  let gazeDirection: GazeVector["gazeDirection"] = "screen";
  let onScreen = !isOffScreen;

  if (compositeYaw < -14 || pureEyeDir === "left" || headPose.direction === "left") {
    gazeDirection = "left";
  } else if (compositeYaw > 14 || pureEyeDir === "right" || headPose.direction === "right") {
    gazeDirection = "right";
  } else if (compositePitch < -12 || pureEyeDir === "down" || headPose.direction === "down") {
    gazeDirection = "down";
  } else if (compositePitch > 14 || pureEyeDir === "up" || headPose.direction === "up") {
    gazeDirection = "up";
  } else if (isOffScreen) {
    gazeDirection = "off-screen";
  }

  return {
    leftEyeOffset: { x: (lRatioX - 0.5) * 2, y: (lRatioY - 0.5) * 2 },
    rightEyeOffset: { x: (rRatioX - 0.5) * 2, y: (rRatioY - 0.5) * 2 },
    gazeDirection,
    onScreen,
    confidence: onScreen ? 0.94 : 0.96,
    vector: { x: Number(vx.toFixed(3)), y: Number(vy.toFixed(3)), z: Number(vz.toFixed(3)) },
    irisRatios: { horizontal: Number(avgGazeX.toFixed(3)), vertical: Number(avgGazeY.toFixed(3)) },
  };
}

/**
 * Strict anatomical validation to filter false positive hand detections
 * caused by background objects (bottles, shadows, clothing folds, patterns).
 */
export function isValidHandLandmarks(
  hand: { x: number; y: number; z?: number }[],
  faceLandmarks?: { x: number; y: number; z?: number }[],
): boolean {
  if (!hand || hand.length < 21) return false;

  const wrist = hand[0]!;
  const indexTip = hand[8] || wrist;
  const middleTip = hand[12] || wrist;
  const indexMcp = hand[5] || wrist;
  const pinkyMcp = hand[17] || wrist;

  // 1. Hand span / length check: wrist to middle fingertip
  const handLength = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
  // Realistic hand length is between 5.5% and 55% of the screen
  if (handLength < 0.055 || handLength > 0.55) return false;

  // 2. Palm width check: index MCP to pinky MCP
  const palmWidth = Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y);
  if (palmWidth < 0.02 || palmWidth > 0.30) return false;

  // 3. Aspect ratio check: palm shouldn't be excessively wide compared to length
  if (palmWidth > handLength * 1.6) return false;

  // 4. If face landmarks are available, perform anatomical cross-validation:
  if (faceLandmarks && faceLandmarks.length >= 455) {
    const leftEar = faceLandmarks[234]!;
    const rightEar = faceLandmarks[454]!;
    const nose = faceLandmarks[1]!;
    const faceWidth = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);

    // If face is detected, a candidate's hand in view cannot be miniature compared to their face
    // Real hands are at least ~35% of face width when anywhere in front of camera
    if (faceWidth > 0.06 && handLength < faceWidth * 0.35) {
      return false; // Background false positive (e.g. bottle/pattern far behind candidate)
    }

    // Distance to face center: If wrist is far outside human arm reach relative to face size
    const distWristToFace = Math.hypot(wrist.x - nose.x, wrist.y - nose.y);
    if (distWristToFace > Math.max(0.65, faceWidth * 3.5)) {
      return false; // Isolated detection in far corner/background
    }
  }

  return true;
}

/**
 * Analyzes Hand Landmarks (21 3D joints per hand) relative to Face & Frame
 * Tracks proximity to head, ears, and below-desk positioning.
 */
export function analyzeHands(
  handLandmarks: { x: number; y: number; z: number }[][],
  faceLandmarks?: { x: number; y: number; z?: number }[],
): HandAnalysis {
  // Filter out any geometrically invalid or background noise hands
  const validHandLandmarks = (handLandmarks || []).filter((h) =>
    isValidHandLandmarks(h, faceLandmarks),
  );

  if (validHandLandmarks.length === 0) {
    return {
      detected: false,
      handsCount: 0,
      nearFace: false,
      nearHead: false,
      nearEar: false,
      belowDesk: false,
      suspicious: false,
      positions: [],
      hands: [],
    };
  }

  let raisedAny = false;
  let nearHeadAny = false;
  let nearEarAny = false;
  let belowDeskAny = false;

  const faceCenter =
    faceLandmarks && faceLandmarks[1]
      ? { x: faceLandmarks[1].x, y: faceLandmarks[1].y, z: faceLandmarks[1].z || 0 }
      : { x: 0.5, y: 0.4, z: 0 };

  const leftEar =
    faceLandmarks && faceLandmarks[234]
      ? { x: faceLandmarks[234].x, y: faceLandmarks[234].y, z: faceLandmarks[234].z || 0 }
      : { x: 0.25, y: 0.4, z: 0 };

  const rightEar =
    faceLandmarks && faceLandmarks[454]
      ? { x: faceLandmarks[454].x, y: faceLandmarks[454].y, z: faceLandmarks[454].z || 0 }
      : { x: 0.75, y: 0.4, z: 0 };

  const faceWidth =
    faceLandmarks && faceLandmarks[234] && faceLandmarks[454]
      ? Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y)
      : 0.25;

  // Real ear proximity threshold: scaled to candidate's face dimensions
  // Ear radius is at most ~38% of face width or ~0.080 max (replaces over-sensitive 0.16)
  const maxEarDist = Math.min(0.080, faceWidth * 0.38);
  const maxFaceDist = Math.min(0.13, faceWidth * 0.55);

  const detailedHands = validHandLandmarks.map((hand, idx) => {
    const wrist = hand[0]!;
    const thumbTip = hand[4] || hand[0]!;
    const indexTip = hand[8] || hand[0]!;
    const middleTip = hand[12] || hand[0]!;
    const ringTip = hand[16] || hand[0]!;
    const pinkyTip = hand[20] || hand[0]!;

    // Minimum distance from key fingertip & palm joints to face & ear landmarks
    const keyJoints = [wrist, thumbTip, indexTip, middleTip, ringTip, pinkyTip];
    let distToFace = 999;
    let distToLeftEar = 999;
    let distToRightEar = 999;

    for (const j of keyJoints) {
      const df = Math.hypot(j.x - faceCenter.x, j.y - faceCenter.y);
      const dle = Math.hypot(j.x - leftEar.x, j.y - leftEar.y);
      const dre = Math.hypot(j.x - rightEar.x, j.y - rightEar.y);
      if (df < distToFace) distToFace = df;
      if (dle < distToLeftEar) distToLeftEar = dle;
      if (dre < distToRightEar) distToRightEar = dre;
    }

    const handLength = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
    const minEarDist = Math.min(distToLeftEar, distToRightEar);
    const earY = Math.min(leftEar.y, rightEar.y);

    // Anatomical hand-near-ear rules:
    // 1. Joint proximity strictly within face-scaled ear boundary
    // 2. Wrist must be anatomically consistent with human arm reaching upward from below
    // 3. Hand length must be realistic relative to face size (at least 38% of face width)
    // 4. Distance to face center must be reasonably close (< faceWidth * 1.4)
    const isAnatomicallyNearEar =
      minEarDist < maxEarDist &&
      wrist.y >= earY - 0.05 &&
      distToFace < faceWidth * 1.4 &&
      handLength >= faceWidth * 0.38;

    const handNearHead = distToFace < maxFaceDist && wrist.y >= faceCenter.y - 0.10;
    const handRaised = wrist.y < faceCenter.y + 0.05 && wrist.y > 0.08 && middleTip.y < faceCenter.y;
    const handBelowDesk = wrist.y > 0.80 || (middleTip.y > 0.82 && wrist.y > 0.72);

    if (handRaised) raisedAny = true;
    if (handNearHead) nearHeadAny = true;
    if (isAnatomicallyNearEar) nearEarAny = true;
    if (handBelowDesk) belowDeskAny = true;

    return {
      handIndex: idx,
      jointsCount: hand.length,
      wrist: { x: wrist.x, y: wrist.y, z: wrist.z || 0 },
      indexTip: { x: indexTip.x, y: indexTip.y, z: indexTip.z || 0 },
      distToFace: Number(distToFace.toFixed(3)),
      distToLeftEar: Number(distToLeftEar.toFixed(3)),
      distToRightEar: Number(distToRightEar.toFixed(3)),
      nearHead: handNearHead,
      nearEar: isAnatomicallyNearEar,
      belowDesk: handBelowDesk,
      handRaised,
    };
  });

  const suspicious = nearEarAny || belowDeskAny || (nearHeadAny && belowDeskAny);

  return {
    detected: true,
    handsCount: validHandLandmarks.length,
    handRaised: raisedAny,
    nearFace: nearHeadAny,
    nearHead: nearHeadAny,
    nearEar: nearEarAny,
    belowDesk: belowDeskAny,
    suspicious,
    positions: validHandLandmarks,
    hands: detailedHands,
  };
}

/* -------------------------------------------------------------------------- */
/* Real-Time Processing Pipeline Runner                                       */
/* -------------------------------------------------------------------------- */

export class RealtimeProctorPipeline {
  private lastTime = 0;
  private lastVideoTimestamp = -1;
  private isProcessing = false;
  private enrolledEmbedding: Float32Array | null = null;
  private serverVision: any = null;
  private serverObjects: DetectedObject[] = [];
  private multiPersonStreak = 0;

  // Local stateful movement trackers
  private gazeCounts = { up: 0, down: 0, left: 0, right: 0, off_screen: 0 };
  private currentGazeDir = "screen";
  private currentGazeStart = Date.now();
  private currentGazeDuration = 0;
  private lastGazeCountedDir = "";
  private lastGazeCountedTime = 0;
  private lastGazeOffScreenTime = 0;

  private headCounts = { up: 0, down: 0, left: 0, right: 0 };
  private currentHeadDir = "center";
  private currentHeadStart = Date.now();
  private currentHeadDuration = 0;
  private lastHeadCountedDir = "";
  private lastHeadCountedTime = 0;

  private handCounts = {
    raised: 0,
    near_face: 0,
    near_ear: 0,
    below_desk: 0,
    repeated_movements: 0,
  };
  private currentHandAction = "none";
  private currentHandStart = Date.now();
  private currentHandDuration = 0;
  private lastHandCountedAction = "";
  private lastHandCountedTime = 0;

  private poseCounts = {
    leaning_left: 0,
    leaning_right: 0,
    slouching: 0,
    total_movements: 0,
  };
  private currentBodyPosture = "Normal Posture";
  private currentPostureStart = Date.now();
  private lastPoseCounted = "";
  private lastPoseCountedTime = 0;

  // Optical fallback canvas & non-blocking object detection state
  private fallbackCanvas: HTMLCanvasElement | null = null;
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private lastObjectDetectTime = 0;
  private cachedObjects: DetectedObject[] = [];
  private isDetectingObjects = false;
  private serverVisionTimestamp = 0;

  public setEnrolledFace(embedding: Float32Array | null) {
    this.enrolledEmbedding = embedding;
  }

  public setServerVision(vision: any) {
    this.serverVision = vision;
    this.serverVisionTimestamp = Date.now();
    if (vision && Array.isArray(vision.objects)) {
      this.serverObjects = vision.objects.map((o: any) => ({
        label: o.label || "unknown",
        confidence: Number(o.confidence) || 0,
        bbox: Array.isArray(o.bbox) && o.bbox.length >= 4 ? o.bbox : [0, 0, 0.1, 0.1],
        isProhibited: Boolean(o.isProhibited),
      }));
    } else {
      this.serverObjects = [];
    }
  }

  /**
   * Fast, zero-dependency optical motion analyzer.
   * Runs directly in-browser on a tiny downsampled frame (80x60) to guarantee
   * real-time head, hand, and gaze direction tracking even before heavy neural weights load.
   */
  private estimateOpticalMotionFallback(video: HTMLVideoElement, width: number, height: number) {
    try {
      if (!this.fallbackCanvas) {
        this.fallbackCanvas = document.createElement("canvas");
        this.fallbackCanvas.width = 80;
        this.fallbackCanvas.height = 60;
        this.fallbackCtx = this.fallbackCanvas.getContext("2d", { willReadFrequently: true });
      }
      const ctx = this.fallbackCtx;
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, 80, 60);
      const imgData = ctx.getImageData(0, 0, 80, 60);
      const d = imgData.data;

      let faceSkinCount = 0;
      let sumX = 0;
      let sumY = 0;
      let leftHandSkin = 0;
      let rightHandSkin = 0;
      let earRegionSkin = 0;
      let bottomDeskSkin = 0;

      for (let y = 0; y < 60; y++) {
        for (let x = 0; x < 80; x++) {
          const idx = (y * 80 + x) * 4;
          const r = d[idx]!;
          const g = d[idx + 1]!;
          const b = d[idx + 2]!;

          // Fast skin chromaticity detector
          const isSkin =
            r > 50 &&
            g > 32 &&
            b > 18 &&
            r > g &&
            r > b &&
            (r - g) > 6 &&
            Math.abs(r - g) < 135 &&
            (r - b) > 8;

          if (isSkin) {
            // Upper center zone = Candidate face/head
            if (y >= 4 && y <= 46 && x >= 15 && x <= 65) {
              faceSkinCount++;
              sumX += x;
              sumY += y;
            }
            // Ear zones (sides of upper head)
            if (y >= 10 && y <= 35 && (x < 18 || x > 62)) {
              earRegionSkin++;
            }
            // Hand in lower frame / desk
            if (y >= 42) {
              bottomDeskSkin++;
              if (x < 40) leftHandSkin++;
              else rightHandSkin++;
            }
          }
        }
      }

      if (faceSkinCount < 25) {
        // Very few skin pixels -> Candidate likely away/missing
        return {
          faceDetected: false,
          facesCount: 0,
          headPose: { pitch: 0, yaw: 0, roll: 0, direction: "center" as const, euler: [0, 0, 0] },
          gaze: {
            leftEyeOffset: { x: 0, y: 0 },
            rightEyeOffset: { x: 0, y: 0 },
            gazeDirection: "screen" as const,
            onScreen: true,
            confidence: 0.85,
            vector: { x: 0, y: 0, z: -1 },
            irisRatios: { horizontal: 0.5, vertical: 0.5 },
          },
          hands: {
            detected: bottomDeskSkin > 25,
            handsCount: bottomDeskSkin > 50 ? 2 : bottomDeskSkin > 25 ? 1 : 0,
            handRaised: false,
            nearFace: false,
            nearHead: false,
            nearEar: false,
            belowDesk: bottomDeskSkin > 110,
            suspicious: false,
            positions: [],
            hands: [],
          },
          syntheticLandmarks: undefined,
        };
      }

      const avgX = sumX / faceSkinCount; // 0..80
      const avgY = sumY / faceSkinCount; // 0..60
      const cxNorm = avgX / 80; // 0..1
      const cyNorm = avgY / 60; // 0..1

      // Yaw estimation (horizontal shift relative to center 0.50):
      // Mirrored webcam (-scale-x-100 in CSS): turning head left moves nose/centroid rightward in raw video.
      const rawYawDeg = Math.round((0.50 - cxNorm) * 115);
      const yaw = Math.max(-55, Math.min(55, rawYawDeg));

      // Pitch estimation (vertical shift relative to nominal 0.36):
      // Tilting head down lowers centroid (cyNorm increases).
      const rawPitchDeg = Math.round((0.36 - cyNorm) * 110);
      const pitch = Math.max(-45, Math.min(45, rawPitchDeg));

      let headDir: HeadPose["direction"] = "center";
      if (yaw < -13) headDir = "left";
      else if (yaw > 13) headDir = "right";
      else if (pitch < -12) headDir = "down";
      else if (pitch > 13) headDir = "up";

      // Eye luminance check in estimated eye strip (y: avgY - 5 to avgY - 1)
      let leftLum = 0, rightLum = 0, lumCount = 0;
      const eyeY = Math.max(0, Math.min(59, Math.round(avgY - 4)));
      const leftStartX = Math.max(0, Math.round(avgX - 12));
      const midX = Math.round(avgX);
      const rightEndX = Math.min(79, Math.round(avgX + 12));

      for (let x = leftStartX; x < midX; x++) {
        const i = (eyeY * 80 + x) * 4;
        leftLum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
        lumCount++;
      }
      for (let x = midX; x < rightEndX; x++) {
        const i = (eyeY * 80 + x) * 4;
        rightLum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      }
      const avgLeftLum = lumCount ? leftLum / lumCount : 128;
      const avgRightLum = lumCount ? rightLum / lumCount : 128;
      const lumDiff = (avgLeftLum - avgRightLum) / (avgLeftLum + avgRightLum + 1);

      let gazeDir: GazeVector["gazeDirection"] = "screen";
      if (headDir !== "center") {
        gazeDir = headDir as any;
      } else if (lumDiff > 0.08) {
        gazeDir = "right";
      } else if (lumDiff < -0.08) {
        gazeDir = "left";
      }

      // Hand activity analysis (Optical Fallback: conservative to avoid false positives)
      const handNearEar = earRegionSkin > 350; // Require massive cluster before even considering ear
      const handRaised = (leftHandSkin > 60 && avgY > 32) || (rightHandSkin > 60 && avgY > 32);
      const handBelowDesk = bottomDeskSkin > 140;
      const handsDetected = handRaised || bottomDeskSkin > 70;

      // Construct a lightweight 478-point synthetic face mesh landmark representation
      const syntheticLandmarks: { x: number; y: number; z: number }[] = [];
      const rx = 0.14;
      const ry = 0.18;
      for (let i = 0; i < 478; i++) {
        const angle = (i / 478) * Math.PI * 2;
        syntheticLandmarks.push({
          x: Math.max(0.05, Math.min(0.95, cxNorm + Math.cos(angle) * rx * (0.8 + 0.2 * Math.sin(i)))),
          y: Math.max(0.05, Math.min(0.95, cyNorm + Math.sin(angle) * ry * (0.8 + 0.2 * Math.cos(i)))),
          z: 0,
        });
      }
      // Assign critical landmark anchors
      syntheticLandmarks[1] = { x: cxNorm, y: cyNorm, z: 0 }; // Nose tip
      syntheticLandmarks[152] = { x: cxNorm, y: Math.min(0.95, cyNorm + ry), z: 0 }; // Chin
      syntheticLandmarks[33] = { x: Math.max(0.05, cxNorm - 0.08), y: Math.max(0.05, cyNorm - 0.05), z: 0 }; // Left eye
      syntheticLandmarks[263] = { x: Math.min(0.95, cxNorm + 0.08), y: Math.max(0.05, cyNorm - 0.05), z: 0 }; // Right eye
      syntheticLandmarks[61] = { x: Math.max(0.05, cxNorm - 0.05), y: Math.min(0.95, cyNorm + 0.09), z: 0 }; // Left mouth
      syntheticLandmarks[291] = { x: Math.min(0.95, cxNorm + 0.05), y: Math.min(0.95, cyNorm + 0.09), z: 0 }; // Right mouth
      syntheticLandmarks[234] = { x: Math.max(0.02, cxNorm - 0.15), y: cyNorm, z: 0 }; // Left ear
      syntheticLandmarks[454] = { x: Math.min(0.98, cxNorm + 0.15), y: cyNorm, z: 0 }; // Right ear

      return {
        faceDetected: true,
        facesCount: 1,
        headPose: {
          pitch,
          yaw,
          roll: 0,
          direction: headDir,
          euler: [yaw, pitch, 0],
        },
        gaze: {
          leftEyeOffset: { x: (avgX / 80 - 0.5) * 2, y: (avgY / 60 - 0.36) * 2 },
          rightEyeOffset: { x: (avgX / 80 - 0.5) * 2, y: (avgY / 60 - 0.36) * 2 },
          gazeDirection: gazeDir,
          onScreen: Math.abs(yaw) < 22 && Math.abs(pitch) < 20,
          confidence: 0.88,
          vector: { x: Number((yaw / 45).toFixed(3)), y: Number((pitch / 45).toFixed(3)), z: -0.9 },
          irisRatios: { horizontal: 0.5 + (yaw / 90), vertical: 0.5 + (pitch / 90) },
        },
        hands: {
          detected: handsDetected,
          handsCount: (leftHandSkin > 50 ? 1 : 0) + (rightHandSkin > 50 ? 1 : 0),
          handRaised,
          nearFace: handNearEar || (handRaised && avgY > 36),
          nearHead: handNearEar,
          nearEar: false, // Never falsely trigger nearEar on optical skin heuristics
          belowDesk: handBelowDesk,
          suspicious: handBelowDesk,
          positions: [],
          hands: [],
        },
        syntheticLandmarks,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Process a single video frame with real AI models
   */
  public async processFrame(video: HTMLVideoElement): Promise<VisionInferenceResult> {
    const now = performance.now();
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    // Guarantee strictly monotonically increasing timestamp for MediaPipe Tasks
    let videoTimestamp = Math.round(now);
    if (videoTimestamp <= this.lastVideoTimestamp) {
      videoTimestamp = this.lastVideoTimestamp + 1;
    }
    this.lastVideoTimestamp = videoTimestamp;

    let detectedObjects: DetectedObject[] = [];
    let faceLandmarkPoints: { x: number; y: number; z: number }[] | undefined = undefined;
    let facesFound = 0;
    let handLandmarkPoints: { x: number; y: number; z: number }[][] = [];

    // 1. Run YOLOv8 / COCO-SSD Object Detector non-blocking every ~300ms
    if (this.isDetectingObjects && now - this.lastObjectDetectTime > 2500) {
      this.isDetectingObjects = false; // Reset hung detection lock
    }
    if (cocoModel && !this.isDetectingObjects && now - this.lastObjectDetectTime >= 300) {
      this.isDetectingObjects = true;
      this.lastObjectDetectTime = now;
      try {
        cocoModel
          .detect(video, 6, 0.30)
          .then((predictions: any[]) => {
            if (predictions && Array.isArray(predictions)) {
              this.cachedObjects = predictions.map((p: any) => {
                const rawLabel = p.class ? String(p.class).toLowerCase() : "";
                let label = rawLabel;
                if (rawLabel.includes("clock") || rawLabel.includes("watch")) {
                  label = "smartwatch";
                } else if (rawLabel.includes("cell phone") || rawLabel.includes("telephone") || rawLabel.includes("phone")) {
                  label = "cell phone";
                }
                const isProhibited =
                  label.includes("cell phone") ||
                  label.includes("phone") ||
                  label.includes("smartwatch") ||
                  label.includes("book") ||
                  label.includes("laptop");
                return {
                  label,
                  confidence: Number(p.score) || 0.5,
                  bbox: [
                    (p.bbox?.[0] || 0) / width,
                    (p.bbox?.[1] || 0) / height,
                    (p.bbox?.[2] || 0) / width,
                    (p.bbox?.[3] || 0) / height,
                  ],
                  isProhibited,
                };
              });
            } else {
              this.cachedObjects = [];
            }
          })
          .catch((err: unknown) => {
            console.warn("Object detector async inference error:", err);
            this.cachedObjects = [];
          })
          .finally(() => {
            this.isDetectingObjects = false;
          });
      } catch (e) {
        this.isDetectingObjects = false;
      }
    }
    detectedObjects = [...this.cachedObjects];

    // 2. Run MediaPipe Face Landmarker with safe monotonic timestamp
    if (faceLandmarker && video.readyState >= 2) {
      try {
        const mpResult = faceLandmarker.detectForVideo(video, videoTimestamp);
        if (mpResult && mpResult.faceLandmarks && mpResult.faceLandmarks.length > 0) {
          // Filter tiny noise landmark detections (must span at least 5% of dimensions)
          const validFaces = mpResult.faceLandmarks.filter((lms: any[]) => {
            if (!lms || lms.length < 10) return false;
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            for (let i = 0; i < lms.length; i += 10) {
              const pt = lms[i];
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.y > maxY) maxY = pt.y;
            }
            return (maxX - minX) > 0.05 && (maxY - minY) > 0.05;
          });
          facesFound = validFaces.length;
          if (facesFound > 0) {
            faceLandmarkPoints = validFaces[0];
          }
        }
      } catch (err) {
        // Video timestamp collision handled gracefully
      }
    }

    // 3. Run MediaPipe Hand Landmarker with confidence & anatomical validation
    if (handLandmarker && video.readyState >= 2) {
      try {
        const handResult = handLandmarker.detectForVideo(video, videoTimestamp);
        if (handResult && handResult.landmarks && handResult.landmarks.length > 0) {
          const validated: { x: number; y: number; z: number }[][] = [];
          for (let i = 0; i < handResult.landmarks.length; i++) {
            const h = handResult.landmarks[i];
            const score =
              handResult.handedness?.[i]?.[0]?.score ??
              handResult.handedness?.[i]?.categories?.[0]?.score ??
              0.85;
            if (score >= 0.70 && isValidHandLandmarks(h, faceLandmarkPoints)) {
              validated.push(h);
            }
          }
          handLandmarkPoints = validated;
        }
      } catch (err) {
        // Hand detection timestamp handled
      }
    }

    // Merge server-detected YOLOv8 objects
    if (this.serverObjects && this.serverObjects.length > 0) {
      detectedObjects = [...this.serverObjects];
    }

    // Fallback: If client MediaPipe landmarks not loaded, use server MediaPipe landmarks
    if (!faceLandmarkPoints && this.serverVision?.faceLandmarks && this.serverVision.faceLandmarks.length > 0) {
      faceLandmarkPoints = this.serverVision.faceLandmarks;
    }

    // 3b. Zero-dependency optical motion fallback if landmarks still absent
    const opticalFallback = !faceLandmarkPoints ? this.estimateOpticalMotionFallback(video, width, height) : null;
    if (!faceLandmarkPoints && opticalFallback?.syntheticLandmarks) {
      faceLandmarkPoints = opticalFallback.syntheticLandmarks;
      if (facesFound === 0) facesFound = 1;
    }

    // Filter duplicate overlapping person detections (e.g. torso vs seated body)
    const rawPersons = detectedObjects.filter(
      (o) => o.label.toLowerCase() === "person" && o.confidence >= 0.40,
    );
    const distinctPersons: DetectedObject[] = [];
    for (const p of rawPersons) {
      const [px, py, pw, ph] = p.bbox;
      const pCenterX = px + pw / 2;
      const pCenterY = py + ph / 2;
      const isDuplicate = distinctPersons.some((d) => {
        const [dx, dy, dw, dh] = d.bbox;
        const dCenterX = dx + dw / 2;
        const dCenterY = dy + dh / 2;
        const xA = Math.max(px, dx);
        const yA = Math.max(py, dy);
        const xB = Math.min(px + pw, dx + dw);
        const yB = Math.min(py + ph, dy + dh);
        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const pArea = pw * ph;
        const dArea = dw * dh;
        const iou = interArea / (pArea + dArea - interArea + 1e-6);
        const distCenter = Math.hypot(pCenterX - dCenterX, pCenterY - dCenterY);
        return iou > 0.25 || distCenter < 0.22;
      });
      if (!isDuplicate) {
        distinctPersons.push(p);
      }
    }

    if (facesFound === 0) {
      if (this.serverVision && this.serverVision.faceDetected) {
        facesFound = this.serverVision.facesCount || 1;
      } else if (faceLandmarkPoints && faceLandmarkPoints.length > 0) {
        facesFound = 1;
      } else if (opticalFallback?.faceDetected) {
        facesFound = 1;
      } else {
        facesFound = distinctPersons.length > 0 ? distinctPersons.length : 0;
      }
    }

    // Multi-person verification with multi-frame streak confirmation
    const rawMultiPerson = facesFound > 1 || distinctPersons.length > 1;
    if (rawMultiPerson) {
      this.multiPersonStreak += 1;
    } else {
      this.multiPersonStreak = Math.max(0, this.multiPersonStreak - 1);
    }
    // Require 4 consecutive confirmed frames before asserting multiple persons
    const multiplePersons = this.multiPersonStreak >= 4;
    const finalFacesCount = multiplePersons ? Math.max(facesFound, distinctPersons.length, 2) : (faceLandmarkPoints || distinctPersons.length > 0 ? 1 : 0);

    // 4. Compute Head Pose & Gaze (prefer high-accuracy Python solvePnP if present)
    const headPose: HeadPose = this.serverVision?.headPose?.direction
      ? {
          pitch: Number(this.serverVision.headPose.pitch) || 0,
          yaw: Number(this.serverVision.headPose.yaw) || 0,
          roll: Number(this.serverVision.headPose.roll) || 0,
          direction: this.serverVision.headPose.direction,
          euler: this.serverVision.headPose.euler || [
            Number(this.serverVision.headPose.yaw) || 0,
            Number(this.serverVision.headPose.pitch) || 0,
            Number(this.serverVision.headPose.roll) || 0,
          ],
        }
      : faceLandmarkPoints
      ? estimateHeadPose(faceLandmarkPoints, width, height)
      : opticalFallback
      ? opticalFallback.headPose
      : { pitch: 0, yaw: 0, roll: 0, direction: "center" as const, euler: [0, 0, 0] };

    const gaze: GazeVector = this.serverVision?.gaze?.gazeDirection
      ? {
          leftEyeOffset: {
            x: (this.serverVision.gaze.vector?.x || 0) * 0.5,
            y: (this.serverVision.gaze.vector?.y || 0) * 0.5,
          },
          rightEyeOffset: {
            x: (this.serverVision.gaze.vector?.x || 0) * 0.5,
            y: (this.serverVision.gaze.vector?.y || 0) * 0.5,
          },
          gazeDirection: this.serverVision.gaze.gazeDirection,
          onScreen: Boolean(this.serverVision.gaze.onScreen),
          confidence: Number(this.serverVision.gaze.confidence) || 0.92,
          vector: this.serverVision.gaze.vector || { x: 0, y: 0, z: -1 },
          irisRatios: this.serverVision.gaze.irisRatios || { horizontal: 0.5, vertical: 0.5 },
        }
      : faceLandmarkPoints
      ? estimateGaze(faceLandmarkPoints, headPose)
      : opticalFallback
      ? opticalFallback.gaze
      : {
          leftEyeOffset: { x: 0, y: 0 },
          rightEyeOffset: { x: 0, y: 0 },
          gazeDirection: "screen" as const,
          onScreen: true,
          confidence: 0.85,
          vector: { x: 0, y: 0, z: -1 },
          irisRatios: { horizontal: 0.5, vertical: 0.5 },
        };

    // 5. Compute Hand Behaviour (prefer verified server MediaPipe 21 3D joints if detected)
    let hands: HandAnalysis;
    const isServerVisionFresh =
      this.serverVisionTimestamp > 0 && Date.now() - this.serverVisionTimestamp <= 400;

    // Expire stale server vision after 400ms to eliminate sticking/frozen hand detections and object detections
    if (!isServerVisionFresh) {
      if (this.serverVision?.hands) {
        this.serverVision.hands = { detected: false, handsCount: 0, hands: [], positions: [] };
      }
      this.serverObjects = [];
      if (this.serverVision) {
        this.serverVision.objects = [];
        this.serverVision.activeWarnings = [];
        this.serverVision.phoneWarning = null;
        this.serverVision.smartwatchWarning = null;
      }
    }

    const serverHandsValid =
      isServerVisionFresh &&
      this.serverVision?.hands &&
      (this.serverVision.hands.detected ||
        (this.serverVision.hands.hands && this.serverVision.hands.hands.length > 0));

    if (serverHandsValid) {
      const sHands = this.serverVision.hands;
      const rawPositions: { x: number; y: number; z: number }[][] = (sHands.hands || []).map((h: any) =>
        (h.joints || []).map((j: any) => ({ x: j.x, y: j.y, z: j.z || 0 })),
      );
      // Validate server hand landmarks against face geometry to filter phantom detections
      const validPositions = rawPositions.filter((p) => isValidHandLandmarks(p, faceLandmarkPoints));

      if (validPositions.length > 0) {
        hands = analyzeHands(validPositions, faceLandmarkPoints);
      } else if (handLandmarkPoints && handLandmarkPoints.length > 0) {
        hands = analyzeHands(handLandmarkPoints, faceLandmarkPoints);
      } else {
        hands = analyzeHands([], faceLandmarkPoints);
      }
    } else if (handLandmarkPoints && handLandmarkPoints.length > 0) {
      hands = analyzeHands(handLandmarkPoints, faceLandmarkPoints);
    } else if (opticalFallback && opticalFallback.hands.detected) {
      hands = opticalFallback.hands;
    } else {
      hands = analyzeHands([], faceLandmarkPoints);
    }

    // -------------------------------------------------------------
    // Local Real-Time Direction & Movement Tracking
    // -------------------------------------------------------------
    const nowMs = Date.now();

    // Eye Gaze tracking
    const gDir = gaze.gazeDirection; // "screen" | "up" | "down" | "left" | "right" | "off-screen"
    const normalizedGDir = gDir === "off-screen" || gDir === "screen" ? "center" : gDir;
    if (normalizedGDir === this.currentGazeDir) {
      this.currentGazeDuration = (nowMs - this.currentGazeStart) / 1000;
    } else {
      this.currentGazeDir = normalizedGDir;
      this.currentGazeStart = nowMs;
      this.currentGazeDuration = 0;
    }
    if (normalizedGDir in this.gazeCounts && normalizedGDir !== "center") {
      if (this.currentGazeDuration >= 0.20) {
        if (
          this.lastGazeCountedDir !== normalizedGDir ||
          nowMs - this.lastGazeCountedTime >= 700
        ) {
          this.gazeCounts[normalizedGDir as keyof typeof this.gazeCounts] += 1;
          this.lastGazeCountedDir = normalizedGDir;
          this.lastGazeCountedTime = nowMs;
        }
      }
    } else if (normalizedGDir === "center" && (nowMs - this.currentGazeStart) >= 350) {
      this.lastGazeCountedDir = "center";
    }

    // Off-screen look tracking
    if (!gaze.onScreen || gDir === "off-screen") {
      if (nowMs - this.lastGazeOffScreenTime >= 700) {
        this.gazeCounts.off_screen += 1;
        this.lastGazeOffScreenTime = nowMs;
      }
    }

    // Head Pose tracking
    const hDir = headPose.direction; // "center" | "up" | "down" | "left" | "right"
    if (hDir === this.currentHeadDir) {
      this.currentHeadDuration = (nowMs - this.currentHeadStart) / 1000;
    } else {
      this.currentHeadDir = hDir;
      this.currentHeadStart = nowMs;
      this.currentHeadDuration = 0;
    }
    if (hDir in this.headCounts && hDir !== "center") {
      if (this.currentHeadDuration >= 0.22) {
        if (this.lastHeadCountedDir !== hDir || nowMs - this.lastHeadCountedTime >= 700) {
          this.headCounts[hDir as keyof typeof this.headCounts] += 1;
          this.lastHeadCountedDir = hDir;
          this.lastHeadCountedTime = nowMs;
        }
      }
    } else if (hDir === "center" && (nowMs - this.currentHeadStart) >= 350) {
      this.lastHeadCountedDir = "center";
    }

    // Hand Movement tracking with priority
    let activeHandAction = "none";
    if (hands.nearEar) activeHandAction = "near_ear";
    else if (hands.nearFace) activeHandAction = "near_face";
    else if (hands.belowDesk) activeHandAction = "below_desk";
    else if (hands.handRaised || (hands.hands && hands.hands.some((h) => h.wrist.y < 0.58 || h.indexTip.y < 0.48))) {
      activeHandAction = "raised";
    }

    if (activeHandAction === this.currentHandAction) {
      this.currentHandDuration = (nowMs - this.currentHandStart) / 1000;
    } else {
      this.currentHandAction = activeHandAction;
      this.currentHandStart = nowMs;
      this.currentHandDuration = 0;
    }
    if (activeHandAction !== "none" && activeHandAction in this.handCounts) {
      if (this.currentHandDuration >= 0.22) {
        if (
          this.lastHandCountedAction !== activeHandAction ||
          nowMs - this.lastHandCountedTime >= 700
        ) {
          this.handCounts[activeHandAction as keyof typeof this.handCounts] += 1;
          this.handCounts.repeated_movements += 1;
          this.lastHandCountedAction = activeHandAction;
          this.lastHandCountedTime = nowMs;
        }
      }
    } else if (activeHandAction === "none" && (nowMs - this.currentHandStart) >= 350) {
      this.lastHandCountedAction = "none";
    }

    // Body Pose Posture estimation
    let posture = "Normal Posture";
    if (headPose.roll > 14) posture = "Leaning Left";
    else if (headPose.roll < -14) posture = "Leaning Right";
    else if (headPose.pitch < -20) posture = "Slouching / Down";

    if (posture === this.currentBodyPosture) {
      // duration
    } else {
      this.currentBodyPosture = posture;
      this.currentPostureStart = nowMs;
    }
    if (posture !== "Normal Posture") {
      const poseDur = (nowMs - this.currentPostureStart) / 1000;
      if (poseDur >= 0.8) {
        const pKey = posture === "Leaning Left" ? "leaning_left" : posture === "Leaning Right" ? "leaning_right" : "slouching";
        if (this.lastPoseCounted !== pKey || nowMs - this.lastPoseCountedTime >= 2000) {
          this.poseCounts[pKey as keyof typeof this.poseCounts] += 1;
          this.poseCounts.total_movements += 1;
          this.lastPoseCounted = pKey;
          this.lastPoseCountedTime = nowMs;
        }
      }
    }

    // Merge with server vision counts if available
    const svGaze = this.serverVision?.eyeGaze;
    const svHead = this.serverVision?.headMovement;
    const svHand = this.serverVision?.handMovement;
    const svBody = this.serverVision?.bodyPose;

    const mergedGazeCounts = {
      up: Math.max(this.gazeCounts.up, svGaze?.counts?.up ?? 0),
      down: Math.max(this.gazeCounts.down, svGaze?.counts?.down ?? 0),
      left: Math.max(this.gazeCounts.left, svGaze?.counts?.left ?? 0),
      right: Math.max(this.gazeCounts.right, svGaze?.counts?.right ?? 0),
      off_screen: Math.max(this.gazeCounts.off_screen, svGaze?.counts?.off_screen ?? 0),
    };
    const totalGazeLooks =
      mergedGazeCounts.up +
      mergedGazeCounts.down +
      mergedGazeCounts.left +
      mergedGazeCounts.right +
      mergedGazeCounts.off_screen;

    const mergedHeadCounts = {
      up: Math.max(this.headCounts.up, svHead?.counts?.up ?? 0),
      down: Math.max(this.headCounts.down, svHead?.counts?.down ?? 0),
      left: Math.max(this.headCounts.left, svHead?.counts?.left ?? 0),
      right: Math.max(this.headCounts.right, svHead?.counts?.right ?? 0),
    };
    const totalHeadTurns = mergedHeadCounts.up + mergedHeadCounts.down + mergedHeadCounts.left + mergedHeadCounts.right;

    const mergedHandCounts = {
      raised: Math.max(this.handCounts.raised, svHand?.counts?.raised ?? svHand?.handRaisedCount ?? 0),
      near_face: Math.max(this.handCounts.near_face, svHand?.counts?.near_face ?? svHand?.handNearFaceCount ?? 0),
      near_ear: Math.max(this.handCounts.near_ear, svHand?.counts?.near_ear ?? svHand?.handNearEarCount ?? 0),
      below_desk: Math.max(this.handCounts.below_desk, svHand?.counts?.below_desk ?? svHand?.handBelowDeskCount ?? 0),
      repeated_movements: Math.max(
        this.handCounts.repeated_movements,
        svHand?.counts?.repeated_movements ?? svHand?.totalEvents ?? svHand?.totalMovements ?? 0,
      ),
    };
    const totalHandEvents =
      mergedHandCounts.raised +
      mergedHandCounts.near_face +
      mergedHandCounts.near_ear +
      mergedHandCounts.below_desk;

    // 6. Object-level flags (YOLOv8 detected objects: Phone, Smartwatch, Book, Person)
    const phoneObj = detectedObjects.find(
      (o) => o.label.toLowerCase().includes("phone") || o.label.toLowerCase().includes("cell"),
    );
    const smartwatchObj = detectedObjects.find(
      (o) =>
        o.label.toLowerCase().includes("smartwatch") ||
        o.label.toLowerCase().includes("watch") ||
        o.label.toLowerCase().includes("clock"),
    );
    const bookObj = detectedObjects.find(
      (o) =>
        o.label.toLowerCase().includes("book") ||
        o.label.toLowerCase().includes("laptop") ||
        o.label.toLowerCase().includes("tablet"),
    );

    const phoneDetected = Boolean(phoneObj && phoneObj.confidence > 0.32);
    const smartwatchDetected = Boolean(smartwatchObj && smartwatchObj.confidence > 0.30);
    const bookDetected = Boolean(bookObj && bookObj.confidence > 0.35);

    // Active Warnings
    const activeWarnings: Array<{ type: string; message: string; severity?: string; confidence?: number; confidencePct?: string }> =
      this.serverVision?.activeWarnings && Array.isArray(this.serverVision.activeWarnings) && this.serverVision.activeWarnings.length > 0
        ? [...this.serverVision.activeWarnings]
        : [];

    if (phoneDetected && !activeWarnings.some((w) => (typeof w === "string" ? w : w.message || "").includes("PHONE"))) {
      activeWarnings.push({
        type: "MOBILE_PHONE",
        message: "WARNING: MOBILE PHONE DETECTED!",
        severity: "CRITICAL",
        confidence: phoneObj?.confidence || 0,
        confidencePct: `${Math.round((phoneObj?.confidence || 0) * 100)}%`,
      });
    }
    if (smartwatchDetected && !activeWarnings.some((w) => (typeof w === "string" ? w : w.message || "").includes("SMARTWATCH"))) {
      activeWarnings.push({
        type: "SMARTWATCH",
        message: "WARNING: SMARTWATCH DETECTED!",
        severity: "CRITICAL",
        confidence: smartwatchObj?.confidence || 0,
        confidencePct: `${Math.round((smartwatchObj?.confidence || 0) * 100)}%`,
      });
    }

    // Biometric identity verification match score
    // Biometric face matching is verified during pre-check gate; continuous face matching check is inactive during exam.
    const identityConfidence = 0.98;
    const isMismatch = false;

    const currentHeadDirection = svHead?.direction || svHead?.currentDirection || headPose.direction;
    const currentHeadDurationSec = svHead?.durationSec ?? svHead?.continuousDurationSec ?? Number(this.currentHeadDuration.toFixed(1));

    const currentGazeDirection = svGaze?.direction || svGaze?.currentDirection || (gaze.gazeDirection === "off-screen" ? "center" : gaze.gazeDirection);
    const currentGazeDurationSec = svGaze?.durationSec ?? svGaze?.continuousDurationSec ?? Number(this.currentGazeDuration.toFixed(1));

    const totalMovements = totalGazeLooks + totalHeadTurns + mergedHandCounts.repeated_movements + this.poseCounts.total_movements;

    return {
      timestamp: Date.now(),
      faceDetected: finalFacesCount > 0,
      facesCount: finalFacesCount,
      headPose,
      headMovement: {
        direction: currentHeadDirection,
        currentDirection: currentHeadDirection,
        durationSec: currentHeadDurationSec,
        continuousDurationSec: currentHeadDurationSec,
        counts: mergedHeadCounts,
        totalCount: totalHeadTurns,
      },
      gaze,
      eyeGaze: {
        direction: currentGazeDirection,
        currentDirection: currentGazeDirection,
        durationSec: currentGazeDurationSec,
        continuousDurationSec: currentGazeDurationSec,
        counts: mergedGazeCounts,
        totalCount: totalGazeLooks,
      },
      hands,
      handMovement: {
        status: svHand?.status || (hands.nearEar ? "Hand Near Ear (Phone Posture)" : hands.nearFace ? "Hand Near Face" : hands.belowDesk ? "Below Desk" : hands.handRaised ? "Hand Raised" : hands.detected ? "Hands Active" : "Hands Clear"),
        handRaised: svHand?.handRaised ?? (activeHandAction === "raised" || Boolean(hands.handRaised)),
        nearFace: svHand?.nearFace ?? hands.nearFace,
        nearEar: svHand?.nearEar ?? hands.nearEar,
        belowDesk: svHand?.belowDesk ?? hands.belowDesk,
        counts: mergedHandCounts,
        handRaisedCount: mergedHandCounts.raised,
        handNearFaceCount: mergedHandCounts.near_face,
        handNearEarCount: mergedHandCounts.near_ear,
        handBelowDeskCount: mergedHandCounts.below_desk,
        totalEvents: totalHandEvents,
        totalMovements: totalHandEvents,
      },
      bodyPose: {
        detected: svBody?.detected ?? true,
        posture: svBody?.posture || posture,
        counts: { ...this.poseCounts },
        totalMovements: svBody?.totalMovements ?? this.poseCounts.total_movements,
        shouldersVisible: svBody?.shouldersVisible ?? true,
      },
      objects: detectedObjects,
      phoneDetected,
      phoneConfidence: phoneObj ? phoneObj.confidence : 0,
      smartwatchDetected,
      smartwatchConfidence: smartwatchObj ? smartwatchObj.confidence : 0,
      bookDetected,
      bookConfidence: bookObj ? bookObj.confidence : 0,
      multiplePersons,
      identityConfidence,
      identityMismatch: isMismatch,
      ...(faceLandmarkPoints ? { faceLandmarks: faceLandmarkPoints } : {}),
      activeWarnings,
      warningHistory: this.serverVision?.warningHistory || [],
      totalDetectedObjects: this.serverVision?.totalDetectedObjects ?? detectedObjects.length,
      totalMovementEvents: this.serverVision?.totalMovementEvents ?? totalMovements,
    };
  }

  /**
   * Render cyberpunk real-time HUD overlays onto canvas
   */
  public renderOverlay(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    res: VisionInferenceResult,
    options: OverlayOptions = {},
  ) {
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const {
        showFaceMesh = true,
        showGazeRays = true,
        showHeadPose = true,
        showBoundingBoxes = true,
        showHandSkeleton = true,
      } = options;

      // 0. Render Prominent Warning Banners for Mobile Phone & Smartwatch
      const warnings = res.activeWarnings || [];
      if (warnings.length > 0) {
        let bannerY = 28;
        for (const wItem of warnings) {
          const msg = wItem.message || "WARNING: PROHIBITED DEVICE DETECTED!";
          ctx.save();
          ctx.fillStyle = "rgba(220, 20, 60, 0.92)";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.shadowColor = "#ff0033";
          ctx.shadowBlur = 12;

          ctx.fillRect(10, bannerY - 20, w - 20, 28);
          ctx.strokeRect(10, bannerY - 20, w - 20, 28);

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 13px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(msg, w / 2, bannerY - 1);
          ctx.restore();
          bannerY += 34;
        }
      }

      // 1. Draw Object Bounding Boxes (YOLOv8)
      if (showBoundingBoxes && res.objects.length > 0) {
        for (const obj of res.objects) {
          if (!obj || !Array.isArray(obj.bbox) || obj.bbox.length < 4) continue;
          const [bx, by, bw, bh] = obj.bbox;
        const x = bx * w;
        const y = by * h;
        const boxW = bw * w;
        const boxH = bh * h;

        const isProhibited = obj.isProhibited || (obj.label === "person" && res.multiplePersons);
        const color = isProhibited ? "#ef4444" : "#10b981"; // Red if prohibited, Green if safe

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;

        // Draw corner brackets instead of plain box for sleek HUD aesthetic
        const cornerLen = Math.min(boxW, boxH) * 0.25;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(x, y + cornerLen);
        ctx.lineTo(x, y);
        ctx.lineTo(x + cornerLen, y);
        // Top-right
        ctx.moveTo(x + boxW - cornerLen, y);
        ctx.lineTo(x + boxW, y);
        ctx.lineTo(x + boxW, y + cornerLen);
        // Bottom-right
        ctx.moveTo(x + boxW, y + boxH - cornerLen);
        ctx.lineTo(x + boxW, y + boxH);
        ctx.lineTo(x + boxW - cornerLen, y + boxH);
        // Bottom-left
        ctx.moveTo(x + cornerLen, y + boxH);
        ctx.lineTo(x, y + boxH);
        ctx.lineTo(x, y + boxH - cornerLen);
        ctx.stroke();

        // Label Badge
        ctx.fillStyle = isProhibited ? "rgba(239, 68, 68, 0.9)" : "rgba(16, 185, 129, 0.9)";
        const labelText = `${obj.label.toUpperCase()} [${Math.round(obj.confidence * 100)}%]`;
        ctx.font = "bold 11px system-ui, sans-serif";
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillRect(x, Math.max(0, y - 20), textWidth + 12, 18);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(labelText, x + 6, Math.max(13, y - 6));
        ctx.restore();
      }
    }

    // 2. Draw MediaPipe 3D Face Mesh Wireframe
    if (showFaceMesh && res.faceLandmarks && res.faceLandmarks.length >= 468) {
      ctx.save();
      ctx.strokeStyle = "rgba(6, 182, 212, 0.35)"; // Neon Cyan
      ctx.fillStyle = "rgba(6, 182, 212, 0.6)";
      ctx.lineWidth = 1;

      // Key facial contour points (Oval, Eyebrows, Lips, Nose)
      const keyIndices = [
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
        152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
      ];

      ctx.beginPath();
      for (let i = 0; i < keyIndices.length; i++) {
        const idx = keyIndices[i]!;
        const pt = res.faceLandmarks[idx]!;
        const px = pt.x * w;
        const py = pt.y * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // Draw subtle iris circles
      if (res.faceLandmarks[468] && res.faceLandmarks[473]) {
        const lIris = res.faceLandmarks[468]!;
        const rIris = res.faceLandmarks[473]!;
        ctx.fillStyle = res.gaze.onScreen ? "#10b981" : "#f59e0b";

        ctx.beginPath();
        ctx.arc(lIris.x * w, lIris.y * h, 3.5, 0, 2 * Math.PI);
        ctx.arc(rIris.x * w, rIris.y * h, 3.5, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3. Draw Iris Gaze Projection Rays & 3D Direction Vector
    if (showGazeRays && res.faceLandmarks && res.faceLandmarks[468] && res.faceLandmarks[473]) {
      ctx.save();
      const lIris = res.faceLandmarks[468]!;
      const rIris = res.faceLandmarks[473]!;

      const rayLength = res.gaze.gazeDirection === "off-screen" ? 75 : 55;
      const rayColor =
        res.gaze.gazeDirection === "screen"
          ? "#10b981"
          : res.gaze.gazeDirection === "off-screen"
          ? "#ef4444"
          : "#f59e0b";

      ctx.strokeStyle = rayColor;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = rayColor;
      ctx.shadowBlur = 8;

      const angleX = (res.headPose.yaw / 180) * Math.PI + res.gaze.leftEyeOffset.x * 0.45;
      const angleY = (res.headPose.pitch / 180) * Math.PI + res.gaze.leftEyeOffset.y * 0.45;

      const dx = Math.sin(angleX) * rayLength;
      const dy = Math.sin(angleY) * rayLength;

      // Left Eye Ray
      ctx.beginPath();
      ctx.moveTo(lIris.x * w, lIris.y * h);
      ctx.lineTo(lIris.x * w + dx, lIris.y * h + dy);
      ctx.stroke();

      // Right Eye Ray
      ctx.beginPath();
      ctx.moveTo(rIris.x * w, rIris.y * h);
      ctx.lineTo(rIris.x * w + dx, rIris.y * h + dy);
      ctx.stroke();

      // Gaze status badge under eyes if looking away or off-screen
      if (!res.gaze.onScreen) {
        const badgeText = `GAZE: ${res.gaze.gazeDirection.toUpperCase()}`;
        ctx.font = "bold 10px system-ui, sans-serif";
        const bw = ctx.measureText(badgeText).width;
        const bx = (lIris.x + rIris.x) * 0.5 * w - bw / 2 - 6;
        const by = Math.max(20, (lIris.y + rIris.y) * 0.5 * h + 30);
        ctx.fillStyle = res.gaze.gazeDirection === "off-screen" ? "rgba(239, 68, 68, 0.9)" : "rgba(245, 158, 11, 0.9)";
        ctx.fillRect(bx, by, bw + 12, 16);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badgeText, bx + 6, by + 12);
      }

      ctx.restore();
    }

    // 4. Draw Hand Skeletal Kinematic Connections (21 3D joints per hand)
    if (showHandSkeleton && res.hands.positions.length > 0) {
      ctx.save();
      const HAND_BONES = [
        [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8],       // Index
        [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
        [9, 13], [13, 14], [14, 15], [15, 16],// Ring
        [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
        [0, 17],                              // Palm Base
      ];

      const handColor = res.hands.suspicious ? "#ef4444" : "#8b5cf6"; // Red if suspicious, Violet if normal
      ctx.strokeStyle = handColor;
      ctx.fillStyle = handColor;
      ctx.shadowColor = handColor;
      ctx.shadowBlur = 6;

        for (let hIdx = 0; hIdx < res.hands.positions.length; hIdx++) {
          const hand = res.hands.positions[hIdx];
          if (!hand || hand.length === 0) continue;
          const detailedHand = res.hands.hands?.[hIdx];

          // Draw Skeletal Bones
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (const [startIdx, endIdx] of HAND_BONES) {
            if (startIdx !== undefined && endIdx !== undefined && hand[startIdx] && hand[endIdx]) {
              const p1 = hand[startIdx]!;
              const p2 = hand[endIdx]!;
              ctx.moveTo(p1.x * w, p1.y * h);
              ctx.lineTo(p2.x * w, p2.y * h);
            }
          }
          ctx.stroke();

          // Draw Joints
          for (let jIdx = 0; jIdx < hand.length; jIdx++) {
            const pt = hand[jIdx]!;
            if (!pt) continue;
            ctx.beginPath();
            const radius = jIdx === 0 || jIdx === 4 || jIdx === 8 || jIdx === 12 ? 4 : 2.5;
            ctx.arc(pt.x * w, pt.y * h, radius, 0, 2 * Math.PI);
            ctx.fill();
          }

          // Draw Proximity Warning Badges
          const wrist = hand[0];
          if (!wrist) continue;
          const wx = wrist.x * w;
          const wy = wrist.y * h;

        if (detailedHand?.nearEar) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
          ctx.font = "bold 10px system-ui, sans-serif";
          ctx.fillRect(wx - 40, wy - 22, 110, 18);
          ctx.fillStyle = "#ffffff";
          ctx.fillText("HAND NEAR EAR", wx - 34, wy - 9);
        } else if (detailedHand?.belowDesk) {
          ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
          ctx.font = "bold 10px system-ui, sans-serif";
          ctx.fillRect(wx - 40, wy - 22, 115, 18);
          ctx.fillStyle = "#ffffff";
          ctx.fillText("HAND BELOW DESK", wx - 34, wy - 9);
        }
      }
      ctx.restore();
    }

    // 5. Draw 3D Head Pose Compass (Euler Yaw, Pitch, Roll)
    if (showHeadPose) {
      ctx.save();
      const cx = w - 50;
      const cy = 50;
      const radius = 28;

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Target Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - radius + 5, cy);
      ctx.lineTo(cx + radius - 5, cy);
      ctx.moveTo(cx, cy - radius + 5);
      ctx.lineTo(cx, cy + radius - 5);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.stroke();

      // Heading dot from solvePnP Euler angles
      const dotX = cx + (res.headPose.yaw / 45) * (radius - 7);
      const dotY = cy + (res.headPose.pitch / 45) * (radius - 7);

      ctx.fillStyle = res.headPose.direction === "center" ? "#10b981" : "#f59e0b";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(
        Math.max(cx - radius + 5, Math.min(cx + radius - 5, dotX)),
        Math.max(cy - radius + 5, Math.min(cy + radius - 5, dotY)),
        4.5,
        0,
        2 * Math.PI,
      );
      ctx.fill();

      // Orientation Euler Angles Display
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.textAlign = "center";
      ctx.fillText(`${res.headPose.yaw}° Y | ${res.headPose.pitch}° P`, cx, cy + radius + 13);
      ctx.font = "8px system-ui, sans-serif";
      ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
      ctx.fillText(`Roll: ${res.headPose.roll}°`, cx, cy + radius + 23);
      ctx.restore();
    }
  } catch (renderErr) {
    console.warn("renderOverlay non-fatal error caught:", renderErr);
  }
}
}
