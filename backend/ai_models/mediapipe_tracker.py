"""
mediapipe_tracker.py
---------------------------------------------------------------------------
Production MediaPipe Computer Vision Tracking Engine for Exam Proctoring.

Comprehensive Multimodal Biometrics & Movement Detection:
 1. Human Hands Movement Detection (21 3D joints per hand):
    - Hand raising detection (wrist/fingers raised above shoulder/nose level)
    - Hands near face and ear proximity detection
    - Repeated hand movements tracking and counting
 2. 3D Head Pose & Direction Counting:
    - 3D Euler angles (Yaw, Pitch, Roll) via cv2.solvePnP & cv2.RQDecomp3x3
    - Direction detection: Up, Down, Left, Right, Center
    - Direction-wise counts: Up, Down, Left, Right
    - Continuous head turn duration tracking
    - Movement transitions with debounce & cooldown logic
 3. Eye Gaze Tracking & Direction Counting:
    - 478 3D facial landmarks with iris centers (468, 473)
    - Direction detection: Up, Down, Left, Right, Screen (Center)
    - Direction-wise counts: Up, Down, Left, Right
    - Continuous gaze duration tracking
    - Distinguishes pure eye movement from head rotation
    - Debounce and cooldown logic to prevent frame-by-frame overcounting
 4. Body Pose Movement Detection:
    - MediaPipe PoseLandmarker (33 landmarks)
    - Shoulders, posture tracking (Normal, Leaning Left, Leaning Right, Slouching)
    - Body movement events & counts
 5. Face Embedding Verification & Quality Gating
 6. Camera Tampering, Frozen Stream & Obscured Frame Detection
"""

import os
import time
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
import cv2
import numpy as np

HAND_JOINT_NAMES = [
    "wrist",
    "thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip",
    "index_mcp", "index_pip", "index_dip", "index_tip",
    "middle_mcp", "middle_pip", "middle_dip", "middle_tip",
    "ring_mcp", "ring_pip", "ring_dip", "ring_tip",
    "pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip"
]

class MediaPipeProctorTracker:
    def __init__(self):
        self.mode = "none"  # "tasks" | "solutions" | "cascade"
        self.face_landmarker = None
        self.hand_landmarker = None
        self.pose_landmarker = None
        self.face_mesh = None
        self.hands = None
        self.pose = None
        self.face_cascade = None

        # Resolve paths for MediaPipe Tasks .task models
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        face_model_path = os.path.join(base_dir, "models", "face_landmarker.task")
        hand_model_path = os.path.join(base_dir, "models", "hand_landmarker.task")
        pose_model_path = os.path.join(base_dir, "models", "pose_landmarker.task")

        # 1. Try modern MediaPipe Tasks Vision API (Python 3.12+ compatible)
        try:
            import mediapipe as mp
            from mediapipe.tasks import python
            from mediapipe.tasks.python import vision

            if os.path.exists(face_model_path):
                f_opts = vision.FaceLandmarkerOptions(
                    base_options=python.BaseOptions(model_asset_path=face_model_path),
                    output_face_blendshapes=True,
                    output_facial_transformation_matrixes=True,
                    num_faces=3
                )
                self.face_landmarker = vision.FaceLandmarker.create_from_options(f_opts)

            if os.path.exists(hand_model_path):
                h_opts = vision.HandLandmarkerOptions(
                    base_options=python.BaseOptions(model_asset_path=hand_model_path),
                    num_hands=2,
                    min_hand_detection_confidence=0.75,
                    min_hand_presence_confidence=0.75,
                    min_tracking_confidence=0.75
                )
                self.hand_landmarker = vision.HandLandmarker.create_from_options(h_opts)

            if os.path.exists(pose_model_path):
                p_opts = vision.PoseLandmarkerOptions(
                    base_options=python.BaseOptions(model_asset_path=pose_model_path),
                    num_poses=1
                )
                self.pose_landmarker = vision.PoseLandmarker.create_from_options(p_opts)

            if self.face_landmarker is not None:
                self.mode = "tasks"
                print(f"[MediaPipe Tasks] Successfully initialized FaceLandmarker, HandLandmarker"
                      f"{', PoseLandmarker' if self.pose_landmarker else ''}")
        except Exception as e:
            print(f"[MediaPipe Tasks] Note on Tasks API: {e}")

        # 2. Fallback to legacy MediaPipe Solutions API if Tasks not loaded
        if self.mode == "none":
            try:
                import mediapipe as mp
                if hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
                    self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                        max_num_faces=3,
                        refine_landmarks=True,
                        min_detection_confidence=0.5,
                        min_tracking_confidence=0.5
                    )
                    self.hands = mp.solutions.hands.Hands(
                        max_num_hands=2,
                        min_detection_confidence=0.75,
                        min_tracking_confidence=0.75
                    )
                    if hasattr(mp.solutions, "pose"):
                        self.pose = mp.solutions.pose.Pose(
                            min_detection_confidence=0.5,
                            min_tracking_confidence=0.5
                        )
                    self.mode = "solutions"
                    print("[MediaPipe Solutions] Loaded legacy FaceMesh, Hands, Pose")
            except Exception as e:
                print(f"[MediaPipe Solutions] Legacy solutions not available: {e}")

        # 3. Fallback: OpenCV Cascade Classifier for Face Detection
        try:
            cascade_path = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
            if os.path.exists(cascade_path):
                self.face_cascade = cv2.CascadeClassifier(cascade_path)
                if self.mode == "none":
                    self.mode = "cascade"
                    print("[OpenCV] Loaded fallback face cascade classifier")
        except Exception as e:
            print(f"[OpenCV] Warning: Could not initialize face cascade fallback: {e}")

        # 3D Canonical Anthropometric Face Model for cv2.solvePnP
        self.model_points = np.array([
            (0.0, 0.0, 0.0),             # Nose tip (landmark 1)
            (0.0, 330.0, -65.0),         # Chin (landmark 152)
            (-225.0, -170.0, -135.0),    # Left eye outer corner (landmark 33)
            (225.0, -170.0, -135.0),     # Right eye outer corner (landmark 263)
            (-150.0, 150.0, -125.0),     # Left mouth corner (landmark 61)
            (150.0, 150.0, -125.0)       # Right mouth corner (landmark 291)
        ], dtype=np.float64)

        # ------------------------------------------------------------------
        # STATEFUL TRACKERS: EYE GAZE, HEAD POSE, HANDS & BODY POSE
        # ------------------------------------------------------------------

        # Feature 1 & 2: Direction-Wise Eye Gaze Event Counter & Duration
        self.gaze_counts: Dict[str, int] = {"up": 0, "down": 0, "left": 0, "right": 0, "off_screen": 0, "screen": 0}
        self.current_gaze_dir: str = "screen"
        self.current_gaze_start: float = time.time()
        self.current_gaze_duration: float = 0.0
        self.last_gaze_counted_dir: Optional[str] = None
        self.last_gaze_counted_time: float = 0.0
        self.last_gaze_off_screen_time: float = 0.0
        self.min_gaze_hold_sec: float = 0.22       # Natural glance transition threshold
        self.gaze_cooldown_sec: float = 0.70       # Cooldown to avoid double-counting same look

        # Feature 1: Direction-Wise Head Movement Event Counter & Duration
        self.head_counts: Dict[str, int] = {"up": 0, "down": 0, "left": 0, "right": 0, "center": 0}
        self.current_head_dir: str = "center"
        self.current_head_start: float = time.time()
        self.current_head_duration: float = 0.0
        self.last_head_counted_dir: Optional[str] = None
        self.last_head_counted_time: float = 0.0
        self.min_head_hold_sec: float = 0.25       # Natural head turn transition threshold
        self.head_cooldown_sec: float = 0.70

        # Feature 1: Hand Movement Tracking & Counting
        self.hand_counts: Dict[str, int] = {
            "raised": 0,
            "near_face": 0,
            "near_ear": 0,
            "below_desk": 0,
            "repeated_movements": 0
        }
        self.current_hand_action: str = "none"
        self.current_hand_start: float = time.time()
        self.last_hand_counted_action: Optional[str] = None
        self.last_hand_counted_time: float = 0.0
        self.min_hand_hold_sec: float = 0.25
        self.hand_cooldown_sec: float = 0.70

        # Body Pose Movement Tracking & Counting
        self.pose_counts: Dict[str, int] = {
            "leaning_left": 0,
            "leaning_right": 0,
            "slouching": 0,
            "total_movements": 0
        }
        self.current_body_posture: str = "Normal Posture"
        self.current_posture_start: float = time.time()
        self.last_pose_counted: Optional[str] = None
        self.last_pose_counted_time: float = 0.0

        # Camera Tampering & Quality Tracking State
        self.prev_small_gray: Optional[np.ndarray] = None
        self.frozen_frames_count: int = 0
        self.obscured_frames_count: int = 0
        self.movement_history: List[Dict[str, Any]] = []

    # =========================================================================
    # 1. 3D HEAD POSE & GAZE CALCULATION
    # =========================================================================

    def _compute_head_pose_and_gaze(self, landmarks, w: int, h: int) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Computes 3D Head Pose Euler angles (Yaw, Pitch, Roll) using cv2.solvePnP
        and 3D Iris Gaze direction vector with pure eye vs head disambiguation.
        """
        head_pose = {
            "pitch": 0.0,
            "yaw": 0.0,
            "roll": 0.0,
            "direction": "center",
            "euler": [0.0, 0.0, 0.0]
        }
        gaze = {
            "gazeDirection": "screen",
            "pureEyeDirection": "screen",
            "distinguishedMovement": "Head & Eyes Centered",
            "onScreen": True,
            "confidence": 0.92,
            "vector": {"x": 0.0, "y": 0.0, "z": -1.0},
            "irisRatios": {"horizontal": 0.5, "vertical": 0.5}
        }

        if len(landmarks) < 6:
            return head_pose, gaze

        rot_mat = np.eye(3, dtype=np.float64)

        # 1. 3D Head Pose using cv2.solvePnP
        try:
            image_points = np.array([
                (landmarks[1].x * w, landmarks[1].y * h),
                (landmarks[152].x * w, landmarks[152].y * h),
                (landmarks[33].x * w, landmarks[33].y * h),
                (landmarks[263].x * w, landmarks[263].y * h),
                (landmarks[61].x * w, landmarks[61].y * h),
                (landmarks[291].x * w, landmarks[291].y * h)
            ], dtype=np.float64)

            focal_length = float(w)
            center = (w / 2.0, h / 2.0)
            camera_matrix = np.array([
                [focal_length, 0.0, center[0]],
                [0.0, focal_length, center[1]],
                [0.0, 0.0, 1.0]
            ], dtype=np.float64)
            dist_coeffs = np.zeros((4, 1), dtype=np.float64)

            success, rot_vec, trans_vec = cv2.solvePnP(
                self.model_points,
                image_points,
                camera_matrix,
                dist_coeffs,
                flags=cv2.SOLVEPNP_ITERATIVE
            )

            if success:
                rot_mat, _ = cv2.Rodrigues(rot_vec)
                angles, _, _, _, _, _ = cv2.RQDecomp3x3(rot_mat)
                pitch = float(angles[0])  # degrees: negative = down, positive = up
                yaw = float(angles[1])    # degrees: negative = left, positive = right
                roll = float(angles[2])   # degrees

                head_dir = "center"
                if yaw < -16.0:
                    head_dir = "left"
                elif yaw > 16.0:
                    head_dir = "right"
                elif pitch < -12.0:
                    head_dir = "down"
                elif pitch > 15.0:
                    head_dir = "up"

                head_pose = {
                    "pitch": round(pitch, 1),
                    "yaw": round(yaw, 1),
                    "roll": round(roll, 1),
                    "direction": head_dir,
                    "euler": [round(yaw, 1), round(pitch, 1), round(roll, 1)]
                }
        except Exception:
            pass

        # 2. Iris Gaze Direction Tracking & Disambiguation
        try:
            if len(landmarks) >= 478:
                l_outer = landmarks[33]
                l_inner = landmarks[133]
                l_top = landmarks[159]
                l_bot = landmarks[145]
                l_iris = landmarks[468]

                r_inner = landmarks[362]
                r_outer = landmarks[263]
                r_top = landmarks[386]
                r_bot = landmarks[374]
                r_iris = landmarks[473]

                # Horizontal iris ratios (0.0 = outer edge, 0.5 = center, 1.0 = inner edge)
                l_span_x = abs(l_inner.x - l_outer.x) or 0.001
                r_span_x = abs(r_outer.x - r_inner.x) or 0.001
                l_ratio_x = max(0.0, min(1.0, (l_iris.x - min(l_outer.x, l_inner.x)) / l_span_x))
                r_ratio_x = max(0.0, min(1.0, (r_iris.x - min(r_outer.x, r_inner.x)) / r_span_x))
                avg_gaze_x = (l_ratio_x + r_ratio_x) / 2.0

                # Vertical iris ratios
                l_span_y = abs(l_bot.y - l_top.y) or 0.001
                r_span_y = abs(r_bot.y - r_top.y) or 0.001
                l_ratio_y = max(0.0, min(1.0, (l_iris.y - min(l_top.y, l_bot.y)) / l_span_y))
                r_ratio_y = max(0.0, min(1.0, (r_iris.y - min(r_top.y, r_bot.y)) / r_span_y))
                avg_gaze_y = (l_ratio_y + r_ratio_y) / 2.0

                # Determine Pure Eye Gaze Direction (Independent of Head Orientation)
                pure_eye_dir = "screen"
                if avg_gaze_x < 0.38:
                    pure_eye_dir = "left"
                elif avg_gaze_x > 0.62:
                    pure_eye_dir = "right"
                elif avg_gaze_y < 0.38:  # note: y is smaller towards top of frame
                    pure_eye_dir = "up"
                elif avg_gaze_y > 0.64:
                    pure_eye_dir = "down"

                # Composite gaze (combining head pose + eye vector)
                comp_yaw = head_pose["yaw"] + (avg_gaze_x - 0.5) * 55.0
                comp_pitch = head_pose["pitch"] + (avg_gaze_y - 0.5) * 45.0

                gaze_dir = "screen"
                on_screen = True

                if (
                    abs(comp_yaw) > 30.0 or
                    comp_pitch < -22.0 or
                    comp_pitch > 26.0 or
                    avg_gaze_x < 0.20 or avg_gaze_x > 0.80 or
                    avg_gaze_y < 0.20 or avg_gaze_y > 0.80
                ):
                    on_screen = False

                if comp_yaw < -16.0 or (head_pose["direction"] == "left" and pure_eye_dir != "right") or pure_eye_dir == "left":
                    gaze_dir = "left"
                    on_screen = False
                elif comp_yaw > 16.0 or (head_pose["direction"] == "right" and pure_eye_dir != "left") or pure_eye_dir == "right":
                    gaze_dir = "right"
                    on_screen = False
                elif comp_pitch < -12.0 or head_pose["direction"] == "down" or pure_eye_dir == "down":
                    gaze_dir = "down"
                    on_screen = False
                elif comp_pitch > 16.0 or head_pose["direction"] == "up" or pure_eye_dir == "up":
                    gaze_dir = "up"
                    on_screen = False

                # Disambiguate eye movement vs head movement
                dist_movement = "Head & Eyes Centered"
                if head_pose["direction"] != "center" and pure_eye_dir != "screen":
                    dist_movement = f"Coordinated {head_pose['direction'].capitalize()} Head & Eye Turn"
                elif head_pose["direction"] != "center":
                    dist_movement = f"Head Turned {head_pose['direction'].capitalize()} (Eyes Centered)"
                elif pure_eye_dir != "screen":
                    dist_movement = f"Pure Eye Gaze {pure_eye_dir.capitalize()} (Head Centered)"

                # Local 3D unit gaze vector
                vl_x = float(np.clip((avg_gaze_x - 0.5) * 2.0, -1.0, 1.0))
                vl_y = float(np.clip((avg_gaze_y - 0.5) * 2.0, -1.0, 1.0))
                vl_z = -float(np.sqrt(max(0.01, 1.0 - vl_x**2 - vl_y**2)))
                gaze_vec_3d = np.dot(rot_mat, np.array([vl_x, vl_y, vl_z], dtype=np.float64))
                norm_val = np.linalg.norm(gaze_vec_3d)
                if norm_val > 0:
                    gaze_vec_3d = gaze_vec_3d / norm_val

                gaze = {
                    "gazeDirection": gaze_dir,
                    "pureEyeDirection": pure_eye_dir,
                    "distinguishedMovement": dist_movement,
                    "onScreen": on_screen,
                    "confidence": 0.94 if on_screen else 0.96,
                    "vector": {
                        "x": round(float(gaze_vec_3d[0]), 3),
                        "y": round(float(gaze_vec_3d[1]), 3),
                        "z": round(float(gaze_vec_3d[2]), 3)
                    },
                    "irisRatios": {
                        "horizontal": round(float(avg_gaze_x), 3),
                        "vertical": round(float(avg_gaze_y), 3)
                    }
                }
        except Exception:
            pass

        return head_pose, gaze

    # =========================================================================
    # 2. DIRECTION-WISE GAZE & HEAD MOVEMENT EVENT COUNTERS (WITH COOLDOWN)
    # =========================================================================

    def _update_counters_and_durations(self, gaze_dir: str, head_dir: str, on_screen: bool = True) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Updates direction-wise counters and continuous duration for Eye Gaze and Head Pose.
        Applies debounce/fixation thresholds and cooldown logic to accurately count
        each intentional look event rather than every video frame.
        """
        now = time.time()

        # --- EYE GAZE TRACKING ---
        if gaze_dir == self.current_gaze_dir:
            self.current_gaze_duration = now - self.current_gaze_start
        else:
            self.current_gaze_dir = gaze_dir
            self.current_gaze_start = now
            self.current_gaze_duration = 0.0

        # Register gaze event if held long enough and direction is directional (up, down, left, right)
        if gaze_dir in ("up", "down", "left", "right"):
            if self.current_gaze_duration >= self.min_gaze_hold_sec:
                time_since_last = now - self.last_gaze_counted_time
                if self.last_gaze_counted_dir != gaze_dir or time_since_last >= self.gaze_cooldown_sec:
                    self.gaze_counts[gaze_dir] = self.gaze_counts.get(gaze_dir, 0) + 1
                    self.last_gaze_counted_dir = gaze_dir
                    self.last_gaze_counted_time = now
        elif gaze_dir == "screen":
            if self.current_gaze_duration >= 0.35:
                self.last_gaze_counted_dir = "screen"

        # Register off-screen glance count
        if not on_screen or gaze_dir == "off-screen":
            if self.current_gaze_duration >= self.min_gaze_hold_sec:
                if (now - self.last_gaze_off_screen_time) >= self.gaze_cooldown_sec:
                    self.gaze_counts["off_screen"] = self.gaze_counts.get("off_screen", 0) + 1
                    self.last_gaze_off_screen_time = now

        gaze_summary = {
            "direction": self.current_gaze_dir,
            "currentDirection": self.current_gaze_dir,
            "durationSec": round(self.current_gaze_duration, 1),
            "continuousDurationSec": round(self.current_gaze_duration, 1),
            "counts": {
                "up": self.gaze_counts.get("up", 0),
                "down": self.gaze_counts.get("down", 0),
                "left": self.gaze_counts.get("left", 0),
                "right": self.gaze_counts.get("right", 0),
                "off_screen": self.gaze_counts.get("off_screen", 0)
            },
            "totalCount": (
                self.gaze_counts.get("up", 0) +
                self.gaze_counts.get("down", 0) +
                self.gaze_counts.get("left", 0) +
                self.gaze_counts.get("right", 0) +
                self.gaze_counts.get("off_screen", 0)
            )
        }

        # --- HEAD POSE TRACKING ---
        if head_dir == self.current_head_dir:
            self.current_head_duration = now - self.current_head_start
        else:
            self.current_head_dir = head_dir
            self.current_head_start = now
            self.current_head_duration = 0.0

        if head_dir in ("up", "down", "left", "right"):
            if self.current_head_duration >= self.min_head_hold_sec:
                time_since_last_head = now - self.last_head_counted_time
                if self.last_head_counted_dir != head_dir or time_since_last_head >= self.head_cooldown_sec:
                    self.head_counts[head_dir] = self.head_counts.get(head_dir, 0) + 1
                    self.last_head_counted_dir = head_dir
                    self.last_head_counted_time = now
                    # Add to history
                    self.movement_history.append({
                        "direction": head_dir,
                        "timestamp": now,
                        "timeString": datetime.now().strftime("%H:%M:%S")
                    })
                    if len(self.movement_history) > 30:
                        self.movement_history.pop(0)
        elif head_dir == "center":
            if self.current_head_duration >= 0.35:
                self.last_head_counted_dir = "center"

        head_summary = {
            "direction": self.current_head_dir,
            "currentDirection": self.current_head_dir,
            "durationSec": round(self.current_head_duration, 1),
            "continuousDurationSec": round(self.current_head_duration, 1),
            "counts": {
                "up": self.head_counts.get("up", 0),
                "down": self.head_counts.get("down", 0),
                "left": self.head_counts.get("left", 0),
                "right": self.head_counts.get("right", 0)
            },
            "totalCount": (
                self.head_counts.get("up", 0) +
                self.head_counts.get("down", 0) +
                self.head_counts.get("left", 0) +
                self.head_counts.get("right", 0)
            )
        }

        return gaze_summary, head_summary

    # =========================================================================
    # 3. HAND MOVEMENTS & PROXIMITY ANALYSIS
    # =========================================================================

    def _analyze_hands(
        self,
        raw_hands: List[Any],
        face_landmarks: Optional[List[Any]] = None,
        handedness_list: Optional[List[Any]] = None,
        pose_landmarks: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Analyzes 21 3D joints per hand with strict anatomical validation.
        Detects:
          - Raising hands (wrist/fingers above nose or in upper frame)
          - Hands near face and ear
          - Reaching below desk
          - Repeated hand movements and event counts
        """
        now = time.time()

        if not raw_hands or len(raw_hands) == 0:
            self.current_hand_action = "none"
            self.current_hand_start = now
            return {
                "detected": False,
                "handsCount": 0,
                "handRaised": False,
                "nearFace": False,
                "nearEar": False,
                "belowDesk": False,
                "status": "Hands Clear",
                "counts": self.hand_counts,
                "totalEvents": self.hand_counts.get("repeated_movements", 0),
                "hands": []
            }

        detailed_hands = []
        hand_raised_any = False
        near_face_any = False
        near_ear_any = False
        below_desk_any = False

        # Reference anchor points from FaceMesh
        face_center = {"x": 0.5, "y": 0.4, "z": 0.0}
        left_ear = {"x": 0.25, "y": 0.4, "z": 0.0}
        right_ear = {"x": 0.75, "y": 0.4, "z": 0.0}
        nose_y = 0.45
        face_width = 0.25

        if face_landmarks and len(face_landmarks) >= 455:
            pt_nose = face_landmarks[1]
            pt_lear = face_landmarks[234]
            pt_rear = face_landmarks[454]
            nose_y = pt_nose.y
            face_center = {"x": pt_nose.x, "y": pt_nose.y, "z": getattr(pt_nose, "z", 0.0)}
            left_ear = {"x": pt_lear.x, "y": pt_lear.y, "z": getattr(pt_lear, "z", 0.0)}
            right_ear = {"x": pt_rear.x, "y": pt_rear.y, "z": getattr(pt_rear, "z", 0.0)}
            face_width = float(np.hypot(pt_rear.x - pt_lear.x, pt_rear.y - pt_lear.y))

        # Check if candidate's body pose shows arms elevated
        arms_elevated = True
        if pose_landmarks:
            pose_lms = getattr(pose_landmarks, "landmark", pose_landmarks)
            if pose_lms and len(pose_lms) >= 17:
                try:
                    sh_y = (float(pose_lms[11].y) + float(pose_lms[12].y)) / 2.0
                    wrist_min_y = min(float(pose_lms[15].y), float(pose_lms[16].y))
                    # If both wrists are well below shoulder level, candidate's arms are down!
                    if wrist_min_y > sh_y + 0.12:
                        arms_elevated = False
                except Exception:
                    pass

        max_ear_dist = min(0.080, face_width * 0.38)
        max_face_dist = min(0.13, face_width * 0.55)

        for h_idx, hand in enumerate(raw_hands):
            # Check detection confidence score if available
            score = 1.0
            if handedness_list and h_idx < len(handedness_list):
                h_item = handedness_list[h_idx]
                if hasattr(h_item, "score"):
                    score = float(h_item.score)
                elif isinstance(h_item, list) and len(h_item) > 0 and hasattr(h_item[0], "score"):
                    score = float(h_item[0].score)
                elif hasattr(h_item, "classification") and len(h_item.classification) > 0:
                    score = float(h_item.classification[0].score)

            if score < 0.70:
                continue

            lms = getattr(hand, "landmark", hand)
            if not lms or len(lms) < 21:
                continue

            wrist = lms[0]
            index_tip = lms[8]
            thumb_tip = lms[4]
            middle_tip = lms[12]
            ring_tip = lms[16]
            pinky_tip = lms[20]
            index_mcp = lms[5]
            pinky_mcp = lms[17]

            hand_length = float(np.hypot(middle_tip.x - wrist.x, middle_tip.y - wrist.y))
            palm_width = float(np.hypot(pinky_mcp.x - index_mcp.x, pinky_mcp.y - index_mcp.y))

            # Discard geometrically abnormal hands (background objects, shadows)
            if hand_length < 0.055 or hand_length > 0.55 or palm_width < 0.02 or palm_width > hand_length * 1.6:
                continue

            # If hand is miniature compared to face, it is a distant background false positive
            if face_width > 0.06 and hand_length < face_width * 0.35:
                continue

            joints_list = []
            min_dist_to_face = 999.0
            min_dist_to_left_ear = 999.0
            min_dist_to_right_ear = 999.0

            for j_idx, pt in enumerate(lms):
                px = float(pt.x)
                py = float(pt.y)
                pz = float(getattr(pt, "z", 0.0))
                j_name = HAND_JOINT_NAMES[j_idx] if j_idx < len(HAND_JOINT_NAMES) else f"joint_{j_idx}"
                joints_list.append({
                    "id": j_idx,
                    "name": j_name,
                    "x": round(px, 4),
                    "y": round(py, 4),
                    "z": round(pz, 4)
                })

                if j_idx in (0, 4, 8, 12, 16, 20):
                    df = float(np.hypot(px - face_center["x"], py - face_center["y"]))
                    dle = float(np.hypot(px - left_ear["x"], py - left_ear["y"]))
                    dre = float(np.hypot(px - right_ear["x"], py - right_ear["y"]))
                    if df < min_dist_to_face: min_dist_to_face = df
                    if dle < min_dist_to_left_ear: min_dist_to_left_ear = dle
                    if dre < min_dist_to_right_ear: min_dist_to_right_ear = dre

            min_ear_dist = min(min_dist_to_left_ear, min_dist_to_right_ear)
            ear_y = min(left_ear["y"], right_ear["y"])

            # Anatomical hand-near-ear verification:
            # 1. Joint proximity strictly within face-scaled ear boundary
            # 2. Wrist must be anatomically consistent with arm reaching up (wrist y >= ear y - 0.05)
            # 3. Hand length must be realistic relative to face size
            # 4. Arms must be physically elevated
            hand_near_ear = (
                min_ear_dist < max_ear_dist and
                wrist.y >= ear_y - 0.05 and
                min_dist_to_face < face_width * 1.4 and
                hand_length >= face_width * 0.38 and
                arms_elevated
            )

            hand_near_face = (
                min_dist_to_face < max_face_dist and
                wrist.y >= face_center["y"] - 0.10 and
                arms_elevated
            )

            hand_raised = (
                wrist.y < (face_center["y"] + 0.05) and
                wrist.y > 0.08 and
                middle_tip.y < face_center["y"] and
                arms_elevated
            )

            hand_below_desk = (wrist.y > 0.80) or (middle_tip.y > 0.82 and wrist.y > 0.72)

            if hand_raised: hand_raised_any = True
            if hand_near_face: near_face_any = True
            if hand_near_ear: near_ear_any = True
            if hand_below_desk: below_desk_any = True

            handedness = "Hand"
            if handedness_list and h_idx < len(handedness_list):
                h_item = handedness_list[h_idx]
                if hasattr(h_item, "category_name"):
                    handedness = h_item.category_name
                elif isinstance(h_item, list) and len(h_item) > 0 and hasattr(h_item[0], "category_name"):
                    handedness = h_item[0].category_name

            detailed_hands.append({
                "handIndex": h_idx,
                "handedness": handedness,
                "wrist": {"x": round(wrist.x, 3), "y": round(wrist.y, 3)},
                "indexTip": {"x": round(index_tip.x, 3), "y": round(index_tip.y, 3)},
                "distToFace": round(min_dist_to_face, 3),
                "distToLeftEar": round(min_dist_to_left_ear, 3),
                "distToRightEar": round(min_dist_to_right_ear, 3),
                "handRaised": hand_raised,
                "nearFace": hand_near_face,
                "nearEar": hand_near_ear,
                "belowDesk": hand_below_desk,
                "joints": joints_list
            })

        if len(detailed_hands) == 0:
            self.current_hand_action = "none"
            self.current_hand_start = now
            return {
                "detected": False,
                "handsCount": 0,
                "handRaised": False,
                "nearFace": False,
                "nearEar": False,
                "belowDesk": False,
                "status": "Hands Clear",
                "counts": self.hand_counts,
                "totalEvents": self.hand_counts.get("repeated_movements", 0),
                "hands": []
            }

        # Determine dominant active hand movement with strict posture priority
        active_action = "none"
        if near_ear_any:
            active_action = "near_ear"
        elif near_face_any:
            active_action = "near_face"
        elif below_desk_any:
            active_action = "below_desk"
        elif hand_raised_any:
            active_action = "raised"

        # Update event counts with debounce (requires 1.0s continuous hold)
        if active_action != self.current_hand_action:
            self.current_hand_action = active_action
            self.current_hand_start = now
        else:
            duration = now - self.current_hand_start
            if duration >= 1.0 and active_action != "none":
                time_since_counted = now - self.last_hand_counted_time
                if self.last_hand_counted_action != active_action or time_since_counted >= self.hand_cooldown_sec:
                    self.hand_counts[active_action] = self.hand_counts.get(active_action, 0) + 1
                    self.hand_counts["repeated_movements"] += 1
                    self.last_hand_counted_action = active_action
                    self.last_hand_counted_time = now
            elif active_action == "none" and duration >= 0.35:
                self.last_hand_counted_action = "none"

        status_text = "Hands Clear"
        if near_ear_any:
            status_text = "Hand Near Ear"
        elif near_face_any:
            status_text = "Hand Near Face"
        elif below_desk_any:
            status_text = "Reaching Below Desk"
        elif hand_raised_any:
            status_text = "Hand Raised"

        total_hand_movements = (
            self.hand_counts.get("raised", 0) +
            self.hand_counts.get("near_face", 0) +
            self.hand_counts.get("near_ear", 0) +
            self.hand_counts.get("below_desk", 0)
        )

        return {
            "detected": True,
            "handsCount": len(detailed_hands),
            "handRaised": hand_raised_any,
            "nearFace": near_face_any,
            "nearEar": near_ear_any,
            "belowDesk": below_desk_any,
            "suspicious": near_ear_any or (near_face_any and below_desk_any),
            "status": status_text,
            "counts": self.hand_counts,
            "handRaisedCount": self.hand_counts.get("raised", 0),
            "handNearFaceCount": self.hand_counts.get("near_face", 0),
            "handNearEarCount": self.hand_counts.get("near_ear", 0),
            "handBelowDeskCount": self.hand_counts.get("below_desk", 0),
            "totalMovements": total_hand_movements,
            "totalEvents": total_hand_movements,
            "hands": detailed_hands
        }

    # =========================================================================
    # 4. BODY POSE MOVEMENT DETECTION
    # =========================================================================

    def _analyze_body_pose(self, pose_landmarks) -> Dict[str, Any]:
        """
        Analyzes 33 body pose landmarks.
        Detects posture status: Normal Posture, Leaning Left, Leaning Right, Slouching.
        Tracks body movement events and counts.
        """
        now = time.time()

        if not pose_landmarks or len(pose_landmarks) < 17:
            return {
                "detected": False,
                "posture": "Body Partial / Unseen",
                "counts": self.pose_counts,
                "totalMovements": self.pose_counts.get("total_movements", 0),
                "shouldersVisible": False
            }

        # Landmarks: 0: nose, 11: left shoulder, 12: right shoulder
        l_sh = pose_landmarks[11]
        r_sh = pose_landmarks[12]
        nose = pose_landmarks[0]

        sh_dx = r_sh.x - l_sh.x
        sh_dy = r_sh.y - l_sh.y
        sh_tilt_deg = float(np.degrees(np.arctan2(sh_dy, sh_dx)))

        posture = "Normal Posture"
        counted_action = None

        if sh_tilt_deg > 11.0:
            posture = "Leaning Left"
            counted_action = "leaning_left"
        elif sh_tilt_deg < -11.0:
            posture = "Leaning Right"
            counted_action = "leaning_right"
        elif nose.y > ((l_sh.y + r_sh.y) / 2.0 - 0.05):
            posture = "Slouching / Down"
            counted_action = "slouching"

        if counted_action:
            if posture != self.current_body_posture:
                self.current_body_posture = posture
                self.current_posture_start = now
            else:
                dur = now - self.current_posture_start
                if dur >= 0.6:
                    time_since = now - self.last_pose_counted_time
                    if self.last_pose_counted != counted_action or time_since >= 2.0:
                        self.pose_counts[counted_action] = self.pose_counts.get(counted_action, 0) + 1
                        self.pose_counts["total_movements"] += 1
                        self.last_pose_counted = counted_action
                        self.last_pose_counted_time = now
        else:
            self.current_body_posture = "Normal Posture"

        return {
            "detected": True,
            "posture": posture,
            "shoulderTiltDeg": round(sh_tilt_deg, 1),
            "counts": self.pose_counts,
            "totalMovements": self.pose_counts.get("total_movements", 0),
            "shouldersVisible": True
        }

    # =========================================================================
    # 5. FACE EMBEDDING EXTRACTION & VERIFICATION
    # =========================================================================

    def _extract_face_embedding(self, landmarks, w: int, h: int) -> List[float]:
        try:
            key_indices = [1, 152, 10, 33, 263, 133, 362, 61, 291, 199, 94, 2, 98, 327, 234, 454]
            ref_pt = landmarks[1]
            ref_x, ref_y, ref_z = ref_pt.x, ref_pt.y, getattr(ref_pt, "z", 0.0)
            eye_l = landmarks[33]
            eye_r = landmarks[263]
            eye_dist = np.hypot(eye_r.x - eye_l.x, eye_r.y - eye_l.y) or 0.1

            coords = []
            for idx in key_indices:
                pt = landmarks[idx] if idx < len(landmarks) else landmarks[0]
                pt_z = getattr(pt, "z", 0.0)
                coords.extend([
                    (pt.x - ref_x) / eye_dist,
                    (pt.y - ref_y) / eye_dist,
                    (pt_z - ref_z) / eye_dist
                ])

            arr = np.array(coords, dtype=np.float32)
            norm = np.linalg.norm(arr)
            if norm > 0:
                arr = arr / norm
            return [round(float(v), 4) for v in arr]
        except Exception:
            return [0.0] * 48

    def verify_face(
        self,
        live_embedding: List[float],
        enrolled_embedding: List[float],
        head_pose: Dict[str, Any],
        brightness: float,
        threshold: float = 0.70
    ) -> Dict[str, Any]:
        if not enrolled_embedding or not live_embedding:
            return {
                "verified": True,
                "confidence": 0.95,
                "qualitySufficient": True,
                "mismatchDetected": False,
                "status": "NO_BASELINE_ENROLLED",
                "reason": "Enrolled baseline not yet established"
            }

        pitch = abs(head_pose.get("pitch", 0.0))
        yaw = abs(head_pose.get("yaw", 0.0))
        pose_ok = pitch <= 24.0 and yaw <= 24.0
        light_ok = brightness >= 30.0

        if not (pose_ok and light_ok):
            return {
                "verified": True,
                "confidence": 0.90,
                "qualitySufficient": False,
                "mismatchDetected": False,
                "status": "QUALITY_INSUFFICIENT",
                "reason": "Pose or lighting not optimal for biometric match"
            }

        live_arr = np.array(live_embedding, dtype=np.float32)
        enrolled_arr = np.array(enrolled_embedding, dtype=np.float32)
        norm_l = np.linalg.norm(live_arr)
        norm_e = np.linalg.norm(enrolled_arr)
        sim = float(np.dot(live_arr, enrolled_arr) / (norm_l * norm_e)) if (norm_l > 0 and norm_e > 0) else 0.85
        sim_bounded = round(max(0.0, min(1.0, sim)), 3)
        verified = sim_bounded >= threshold

        return {
            "verified": verified,
            "confidence": sim_bounded,
            "threshold": threshold,
            "qualitySufficient": True,
            "mismatchDetected": not verified,
            "status": "VERIFIED" if verified else "NEEDS_MANUAL_REVIEW",
            "reason": "Biometric match confirmed" if verified else f"Similarity {sim_bounded} below threshold {threshold}"
        }

    # =========================================================================
    # 6. CAMERA TAMPERING & QUALITY CHECK
    # =========================================================================

    def _check_camera_tampering(self, frame: np.ndarray, face_detected: bool) -> Dict[str, Any]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        small_gray = cv2.resize(gray, (160, 120))
        frame_diff = 10.0
        if self.prev_small_gray is not None:
            frame_diff = float(np.mean(cv2.absdiff(small_gray, self.prev_small_gray)))
        self.prev_small_gray = small_gray

        if frame_diff < 0.20:
            self.frozen_frames_count += 1
        else:
            self.frozen_frames_count = max(0, self.frozen_frames_count - 2)

        is_dark = brightness < 15.0
        is_overexposed = brightness > 245.0
        is_blurred = laplacian_var < 8.0 and not face_detected

        if is_dark or is_overexposed or is_blurred:
            self.obscured_frames_count += 1
        else:
            self.obscured_frames_count = max(0, self.obscured_frames_count - 2)

        is_frozen = self.frozen_frames_count >= 15
        is_obscured = self.obscured_frames_count >= 10

        status = "NORMAL"
        obscured_reason = "CLEAR"
        if is_frozen:
            status = "VIDEO_INTERRUPTED"
            obscured_reason = "FROZEN_FRAME_STREAM"
        elif is_obscured:
            status = "CAMERA_OBSCURED"
            if is_dark:
                obscured_reason = "DARK_FRAME_BLOCKED"
            elif is_overexposed:
                obscured_reason = "OVEREXPOSED_WASHED_OUT"
            elif is_blurred:
                obscured_reason = "DEFOCUSED_OR_COVERED_LENS"

        return {
            "status": status,
            "isObscured": is_obscured,
            "isFrozen": is_frozen,
            "brightness": round(brightness, 1),
            "blurScore": round(laplacian_var, 1),
            "frameDiff": round(frame_diff, 2),
            "obscuredReason": obscured_reason
        }

    # =========================================================================
    # 7. MAIN PROCESS PIPELINE
    # =========================================================================

    def process(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Processes a single BGR OpenCV frame and returns real-time proctoring metrics:
         - Hands Movement (status, raised, near face/ear, counts)
         - 3D Head Pose & Direction Counting (Up, Down, Left, Right)
         - Eye Gaze Direction Counting & Duration (Up, Down, Left, Right)
         - Body Pose Posture & Movement Counting
         - Camera Obstruction & Frozen Stream Checks
        """
        if frame is None:
            return {
                "faceDetected": False,
                "facesCount": 0,
                "cameraStatus": {"status": "VIDEO_INTERRUPTED", "isFrozen": False, "isObscured": True}
            }

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        faces_count = 0
        head_pose = {"pitch": 0.0, "yaw": 0.0, "roll": 0.0, "direction": "center"}
        gaze = {
            "gazeDirection": "screen",
            "pureEyeDirection": "screen",
            "distinguishedMovement": "Head & Eyes Centered",
            "onScreen": True,
            "confidence": 0.9,
            "vector": {"x": 0.0, "y": 0.0, "z": -1.0},
            "irisRatios": {"horizontal": 0.5, "vertical": 0.5}
        }
        hands_analysis = {
            "detected": False,
            "handsCount": 0,
            "handRaised": False,
            "nearFace": False,
            "nearEar": False,
            "belowDesk": False,
            "status": "Hands Clear",
            "counts": self.hand_counts,
            "totalEvents": self.hand_counts.get("repeated_movements", 0),
            "hands": []
        }
        body_pose_analysis = {
            "detected": False,
            "posture": "Normal Posture",
            "counts": self.pose_counts,
            "totalMovements": self.pose_counts.get("total_movements", 0),
            "shouldersVisible": False
        }
        face_embedding: List[float] = []
        face_lms_export: List[Dict[str, float]] = []
        primary_landmarks = None

        # ------------------------------------------------------------------
        # Mode 1: Modern MediaPipe Tasks API
        # ------------------------------------------------------------------
        if self.mode == "tasks" and self.face_landmarker:
            try:
                import mediapipe as mp
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

                # Face Landmarker
                face_result = self.face_landmarker.detect(mp_img)
                if face_result and face_result.face_landmarks:
                    valid_faces = []
                    for lms in face_result.face_landmarks:
                        if not lms or len(lms) < 10:
                            continue
                        xs = [pt.x for pt in lms]
                        ys = [pt.y for pt in lms]
                        span_x = max(xs) - min(xs)
                        span_y = max(ys) - min(ys)
                        if span_x >= 0.05 and span_y >= 0.05:
                            valid_faces.append(lms)
                    faces_count = len(valid_faces)
                    if faces_count > 0:
                        primary_landmarks = valid_faces[0]
                        head_pose, gaze = self._compute_head_pose_and_gaze(primary_landmarks, w, h)
                        face_embedding = self._extract_face_embedding(primary_landmarks, w, h)

                # Pose Landmarker
                pose_landmarks_pt = None
                if self.pose_landmarker:
                    pose_result = self.pose_landmarker.detect(mp_img)
                    if pose_result and pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0:
                        pose_landmarks_pt = pose_result.pose_landmarks[0]
                        body_pose_analysis = self._analyze_body_pose(pose_landmarks_pt)

                # Hand Landmarker
                if self.hand_landmarker:
                    hand_result = self.hand_landmarker.detect(mp_img)
                    if hand_result and hand_result.hand_landmarks:
                        hands_analysis = self._analyze_hands(
                            hand_result.hand_landmarks,
                            face_landmarks=primary_landmarks,
                            handedness_list=getattr(hand_result, "handedness", None),
                            pose_landmarks=pose_landmarks_pt
                        )

                if primary_landmarks:
                    face_lms_export = [
                        {"x": round(float(pt.x), 4), "y": round(float(pt.y), 4), "z": round(float(getattr(pt, "z", 0.0)), 4)}
                        for pt in primary_landmarks
                    ]
            except Exception as e:
                print(f"[MediaPipe Tasks] Inference exception: {e}")

        # ------------------------------------------------------------------
        # Mode 2: Legacy MediaPipe Solutions API
        # ------------------------------------------------------------------
        elif self.mode == "solutions" and self.face_mesh:
            try:
                results = self.face_mesh.process(rgb)
                if results.multi_face_landmarks:
                    faces_count = len(results.multi_face_landmarks)
                    primary_landmarks = results.multi_face_landmarks[0].landmark
                    head_pose, gaze = self._compute_head_pose_and_gaze(primary_landmarks, w, h)
                    face_embedding = self._extract_face_embedding(primary_landmarks, w, h)

                pose_landmarks_pt = None
                if self.pose:
                    pose_res = self.pose.process(rgb)
                    if pose_res.pose_landmarks:
                        pose_landmarks_pt = pose_res.pose_landmarks.landmark
                        body_pose_analysis = self._analyze_body_pose(pose_landmarks_pt)

                if self.hands:
                    hand_res = self.hands.process(rgb)
                    if hand_res.multi_hand_landmarks:
                        hands_analysis = self._analyze_hands(
                            hand_res.multi_hand_landmarks,
                            face_landmarks=primary_landmarks,
                            handedness_list=getattr(hand_res, "multi_handedness", None),
                            pose_landmarks=pose_landmarks_pt
                        )

                if primary_landmarks:
                    face_lms_export = [
                        {"x": round(float(pt.x), 4), "y": round(float(pt.y), 4), "z": round(float(getattr(pt, "z", 0.0)), 4)}
                        for pt in primary_landmarks
                    ]
            except Exception as e:
                print(f"[MediaPipe Solutions] Inference exception: {e}")

        # ------------------------------------------------------------------
        # Mode 3: Fallback OpenCV Cascade Classifier
        # ------------------------------------------------------------------
        elif self.face_cascade:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60))
            faces_count = len(faces)
            if faces_count > 0:
                (x, y, fw, fh) = faces[0]
                face_center_x = x + fw / 2.0
                face_center_y = y + fh / 2.0
                offset_x = (face_center_x - w / 2.0) / (w / 2.0)
                offset_y = (face_center_y - h / 2.0) / (h / 2.0)

                direction = "center"
                if offset_x < -0.25: direction = "left"
                elif offset_x > 0.25: direction = "right"
                elif offset_y > 0.3: direction = "down"
                elif offset_y < -0.3: direction = "up"

                yaw = round(offset_x * 35.0, 1)
                pitch = round(-offset_y * 25.0, 1)

                head_pose = {
                    "pitch": pitch,
                    "yaw": yaw,
                    "roll": 0.0,
                    "direction": direction,
                    "euler": [yaw, pitch, 0.0]
                }
                gaze_dir = direction if direction != "center" else "screen"
                gaze = {
                    "gazeDirection": gaze_dir,
                    "pureEyeDirection": gaze_dir,
                    "distinguishedMovement": "Head & Eyes",
                    "onScreen": gaze_dir == "screen",
                    "confidence": 0.88,
                    "vector": {"x": round(offset_x, 3), "y": round(offset_y, 3), "z": -1.0},
                    "irisRatios": {"horizontal": round(0.5 + offset_x * 0.3, 2), "vertical": round(0.5 + offset_y * 0.3, 2)}
                }

        # Update Direction-Wise Counters & Durations for Gaze and Head Pose
        gaze_summary, head_summary = self._update_counters_and_durations(
            gaze_dir=gaze.get("gazeDirection", "screen"),
            head_dir=head_pose.get("direction", "center"),
            on_screen=gaze.get("onScreen", True)
        )

        # Camera Obstruction & Frozen Stream Check
        camera_status = self._check_camera_tampering(frame, face_detected=(faces_count > 0))

        # Total combined movement events
        total_movement_events = (
            gaze_summary["totalCount"] +
            head_summary["totalCount"] +
            hands_analysis["totalEvents"] +
            body_pose_analysis["totalMovements"]
        )

        return {
            "faceDetected": faces_count > 0,
            "facesCount": faces_count,
            # Head Movement Tracking & Direction Counting
            "headPose": head_pose,
            "headMovement": head_summary,
            # Eye Gaze Tracking & Direction Counting
            "gaze": gaze,
            "eyeGaze": gaze_summary,
            # Hand Movement Tracking & Counting
            "hands": hands_analysis,
            "handMovement": {
                "status": hands_analysis.get("status", "Hands Clear"),
                "handRaised": hands_analysis.get("handRaised", False),
                "nearFace": hands_analysis.get("nearFace", False),
                "nearEar": hands_analysis.get("nearEar", False),
                "belowDesk": hands_analysis.get("belowDesk", False),
                "counts": hands_analysis.get("counts", {}),
                "handRaisedCount": hands_analysis.get("counts", {}).get("raised", 0),
                "handNearFaceCount": hands_analysis.get("counts", {}).get("near_face", 0),
                "handNearEarCount": hands_analysis.get("counts", {}).get("near_ear", 0),
                "handBelowDeskCount": hands_analysis.get("counts", {}).get("below_desk", 0),
                "totalEvents": hands_analysis.get("totalEvents", 0),
                "totalMovements": hands_analysis.get("totalMovements", hands_analysis.get("totalEvents", 0))
            },
            # Body Pose Movement Tracking & Posture
            "bodyPose": body_pose_analysis,
            # Aggregated Metrics & Summaries
            "totalMovementEvents": total_movement_events,
            "movementHistory": self.movement_history[-10:],
            "faceEmbedding": face_embedding,
            "faceLandmarks": face_lms_export,
            "cameraStatus": camera_status,
            "verificationQuality": {
                "qualitySufficient": (camera_status["brightness"] >= 30.0 and abs(head_pose.get("yaw", 0.0)) <= 24.0),
                "brightness": camera_status["brightness"],
                "blurScore": camera_status["blurScore"]
            }
        }
