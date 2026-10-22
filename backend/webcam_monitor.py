"""
webcam_monitor.py
---------------------------------------------------------------------------
AI-Based Smart Exam Monitoring System with Real-Time Webcam Detection.

Powered by MediaPipe (Hands, FaceMesh, Iris Gaze, 3D Pose) & Ultralytics YOLOv8.

Features Implemented:
 1. Human Hand, Head, and Body Movement Detection:
    - 21 3D joints per hand (raising hand, near face, near ear, below desk)
    - Repeated hand movements tracked & counted
    - Head pose Euler angles (Yaw, Pitch, Roll) via cv2.solvePnP
    - Head directions (Up, Down, Left, Right) counted direction-wise with continuous duration
    - Body pose posture tracking (Normal, Leaning Left/Right, Slouching) and shift count
 2. Eye Gaze Tracking and Direction Counting:
    - Iris landmarks & gaze unit vector
    - Direction tracking: Up, Down, Left, Right
    - Counts how many times candidate looks in each direction
    - Continuous gaze fixation duration in current direction
    - Debounce and cooldown thresholds to prevent frame-by-frame overcounting
    - Disambiguates pure eye movement vs head movement
 3. Real-Time Object Detection Using YOLOv8:
    - Bounding boxes, correct object name, and confidence percentage
    - Drawn directly onto the video feed
 4. Mobile Phone and Smartwatch Detection with Warnings:
    - "WARNING: MOBILE PHONE DETECTED!" (flashing prominent warning banner)
    - "WARNING: SMARTWATCH DETECTED!" (flashing prominent warning banner)
    - Consecutive-frame confirmation streak to suppress single-frame false positives
    - Timestamped warning history log
 5. High-Tech Cyberpunk Proctor HUD:
    - Live on-screen telemetry dashboard showing all counts, durations, and warnings
    - Interactive controls: 'q' to quit, 'c' to reset counts, 's' to snapshot evidence, 't' to toggle HUD

Execution:
    python backend/webcam_monitor.py
    python backend/webcam_monitor.py --cam 0
    python backend/webcam_monitor.py --model yolov8n.pt
"""

import sys
import os
import time
import argparse
from datetime import datetime
import cv2
import numpy as np

# Ensure parent path is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from ai_models.yolo_detector import YOLOv8ProctorDetector
from ai_models.mediapipe_tracker import MediaPipeProctorTracker

def parse_args():
    parser = argparse.ArgumentParser(description="Real-Time AI Smart Exam Monitoring System")
    parser.add_argument("--cam", type=int, default=0, help="Webcam device index (default: 0)")
    parser.add_argument("--width", type=int, default=1280, help="Capture width (default: 1280)")
    parser.add_argument("--height", type=int, default=720, help="Capture height (default: 720)")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="YOLOv8 weights path")
    return parser.parse_args()

def draw_hud(frame, mp_data, yolo_summary, fps, show_full_hud=True):
    """
    Renders high-tech proctoring HUD overlay onto frame with:
     - Gaze direction counts (Up, Down, Left, Right)
     - Head pose counts (Up, Down, Left, Right)
     - Hand movement status and counts
     - Body posture
     - Detected objects and confidence scores
     - Mobile phone / smartwatch warnings
    """
    h, w = frame.shape[:2]
    canvas = frame.copy()

    # 1. TOP HEADER BANNER
    cv2.rectangle(canvas, (0, 0), (w, 42), (15, 18, 24), -1)
    cv2.line(canvas, (0, 42), (w, 42), (0, 220, 255), 1)

    title_text = "AI SMART EXAM MONITORING SYSTEM  |  MediaPipe + YOLOv8"
    cv2.putText(canvas, title_text, (18, 27), cv2.FONT_HERSHEY_DUPLEX, 0.65, (0, 230, 255), 1, cv2.LINE_AA)

    fps_text = f"FPS: {int(fps)}  |  {datetime.now().strftime('%H:%M:%S')}"
    cv2.putText(canvas, fps_text, (w - 220, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1, cv2.LINE_AA)

    # 2. ACTIVE WARNING BANNERS (PHONE / SMARTWATCH)
    active_warnings = yolo_summary.get("activeWarnings", [])
    if active_warnings:
        warn_y = 75
        for warn in active_warnings:
            msg = warn.get("message", "WARNING: PROHIBITED ITEM DETECTED!")
            conf_pct = warn.get("confidencePct", "")
            full_msg = f"{msg} ({conf_pct})"

            # Flashing banner
            overlay = canvas.copy()
            cv2.rectangle(overlay, (20, warn_y - 25), (w - 20, warn_y + 15), (0, 0, 190), -1)
            cv2.addWeighted(overlay, 0.88, canvas, 0.12, 0, canvas)
            cv2.rectangle(canvas, (20, warn_y - 25), (w - 20, warn_y + 15), (0, 0, 255), 2)
            cv2.putText(canvas, full_msg, (35, warn_y + 3), cv2.FONT_HERSHEY_DUPLEX, 0.80, (255, 255, 255), 2, cv2.LINE_AA)
            warn_y += 48

    if not show_full_hud:
        return canvas

    # 3. RIGHT SIDEBAR TELEMETRY DASHBOARD
    sidebar_w = 340
    sidebar_x = w - sidebar_w - 15
    sidebar_y = 55
    sidebar_h = h - 70

    overlay_sb = canvas.copy()
    cv2.rectangle(overlay_sb, (sidebar_x, sidebar_y), (sidebar_x + sidebar_w, sidebar_y + sidebar_h), (12, 16, 22), -1)
    cv2.addWeighted(overlay_sb, 0.82, canvas, 0.18, 0, canvas)
    cv2.rectangle(canvas, (sidebar_x, sidebar_y), (sidebar_x + sidebar_w, sidebar_y + sidebar_h), (45, 60, 80), 1)

    cur_y = sidebar_y + 25

    def draw_section_header(title, color=(0, 220, 255)):
        nonlocal cur_y
        cv2.putText(canvas, title, (sidebar_x + 14, cur_y), cv2.FONT_HERSHEY_DUPLEX, 0.52, color, 1, cv2.LINE_AA)
        cv2.line(canvas, (sidebar_x + 14, cur_y + 6), (sidebar_x + sidebar_w - 14, cur_y + 6), color, 1)
        cur_y += 24

    def draw_metric_row(label, val, val_color=(255, 255, 255)):
        nonlocal cur_y
        cv2.putText(canvas, label, (sidebar_x + 16, cur_y), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (180, 190, 205), 1, cv2.LINE_AA)
        cv2.putText(canvas, str(val), (sidebar_x + sidebar_w - 110, cur_y), cv2.FONT_HERSHEY_SIMPLEX, 0.46, val_color, 1, cv2.LINE_AA)
        cur_y += 20

    # SECTION A: EYE GAZE TRACKING & DIRECTION COUNTS
    draw_section_header("1. EYE GAZE DIRECTION COUNTS", (0, 255, 170))
    eg = mp_data.get("eyeGaze", {})
    eg_counts = eg.get("counts", {})
    cur_dir = eg.get("currentDirection", "screen").upper()
    dur = eg.get("continuousDurationSec", 0.0)

    draw_metric_row("Active Gaze:", f"{cur_dir} ({dur}s)", (0, 255, 170) if cur_dir == "SCREEN" else (0, 200, 255))
    draw_metric_row("Looking UP:", f"{eg_counts.get('up', 0)} times", (255, 255, 255))
    draw_metric_row("Looking DOWN:", f"{eg_counts.get('down', 0)} times", (255, 255, 255))
    draw_metric_row("Looking LEFT:", f"{eg_counts.get('left', 0)} times", (255, 255, 255))
    draw_metric_row("Looking RIGHT:", f"{eg_counts.get('right', 0)} times", (255, 255, 255))
    cur_y += 8

    # SECTION B: 3D HEAD MOVEMENT COUNTS
    draw_section_header("2. HEAD MOVEMENT COUNTS", (255, 215, 0))
    hm = mp_data.get("headMovement", {})
    hm_counts = hm.get("counts", {})
    hp = mp_data.get("headPose", {})
    head_cur = hm.get("currentDirection", "center").upper()
    head_dur = hm.get("continuousDurationSec", 0.0)
    euler = hp.get("euler", [0, 0, 0])

    draw_metric_row("Active Head:", f"{head_cur} ({head_dur}s)", (255, 215, 0))
    draw_metric_row("Head Euler (Y,P,R):", f"{euler[0]} / {euler[1]} / {euler[2]}")
    draw_metric_row("Head UP:", f"{hm_counts.get('up', 0)} times")
    draw_metric_row("Head DOWN:", f"{hm_counts.get('down', 0)} times")
    draw_metric_row("Head LEFT:", f"{hm_counts.get('left', 0)} times")
    draw_metric_row("Head RIGHT:", f"{hm_counts.get('right', 0)} times")
    cur_y += 8

    # SECTION C: HAND & BODY MOVEMENT
    draw_section_header("3. HAND & BODY MOVEMENTS", (220, 120, 255))
    hand_mv = mp_data.get("handMovement", {})
    hand_counts = hand_mv.get("counts", {})
    hand_status = hand_mv.get("status", "Hands Clear")
    body_pose = mp_data.get("bodyPose", {})
    posture = body_pose.get("posture", "Normal Posture")

    h_color = (0, 255, 170) if hand_status == "Hands Clear" else (0, 100, 255)
    draw_metric_row("Hand Status:", hand_status, h_color)
    draw_metric_row("Hand Raised Count:", f"{hand_counts.get('raised', 0)} times")
    draw_metric_row("Near Face Count:", f"{hand_counts.get('near_face', 0)} times")
    draw_metric_row("Body Posture:", posture, (255, 255, 255) if posture == "Normal Posture" else (0, 200, 255))
    draw_metric_row("Total Movements:", f"{mp_data.get('totalMovementEvents', 0)} events", (0, 255, 255))
    cur_y += 8

    # SECTION D: DETECTED OBJECTS (YOLOv8)
    draw_section_header("4. YOLOv8 DETECTIONS", (255, 100, 100))
    all_objs = yolo_summary.get("allDetections", [])
    draw_metric_row("Total Objects:", f"{len(all_objs)} in frame")
    draw_metric_row("Phone Detected:", "YES" if yolo_summary.get("phoneDetected") else "None", (0, 0, 255) if yolo_summary.get("phoneDetected") else (0, 255, 170))
    draw_metric_row("Smartwatch:", "YES" if yolo_summary.get("smartwatchDetected") else "None", (0, 0, 255) if yolo_summary.get("smartwatchDetected") else (0, 255, 170))

    cur_y += 8

    # SECTION E: RECENT WARNING HISTORY
    draw_section_header("5. WARNING HISTORY", (255, 80, 80))
    warn_hist = yolo_summary.get("warningHistory", [])
    if warn_hist:
        for w_item in warn_hist[:3]:
            w_msg = w_item.get("objectLabel", "Prohibited Item")
            w_t = w_item.get("timeString", "")
            w_conf = w_item.get("confidencePct", "")
            cv2.putText(canvas, f"[{w_t}] {w_msg.upper()} ({w_conf})", (sidebar_x + 16, cur_y), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 100, 255), 1, cv2.LINE_AA)
            cur_y += 18
    else:
        cv2.putText(canvas, "No warnings recorded.", (sidebar_x + 16, cur_y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (150, 160, 175), 1, cv2.LINE_AA)
        cur_y += 20

    # 4. BOTTOM KEYBOARD SHORTCUTS BAR
    cv2.rectangle(canvas, (0, h - 30), (w, h), (15, 18, 24), -1)
    shortcuts_text = "Controls: [Q] Quit  |  [C] Reset Direction Counts  |  [S] Save Snapshot  |  [T] Toggle HUD"
    cv2.putText(canvas, shortcuts_text, (20, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 190, 200), 1, cv2.LINE_AA)

    return canvas

def main():
    args = parse_args()

    print("=" * 75)
    print("AI-BASED SMART EXAM MONITORING SYSTEM — REAL-TIME WEBCAM ENGINE")
    print("=" * 75)
    print(f"[*] Initializing YOLOv8 Object Detector (model: {args.model})...")
    yolo_detector = YOLOv8ProctorDetector(model_name=args.model)

    print("[*] Initializing MediaPipe Multimodal Proctor Tracker (Face, Gaze, Hands, Pose)...")
    mediapipe_tracker = MediaPipeProctorTracker()

    print(f"[*] Opening webcam index {args.cam}...")
    # Try DirectShow first on Windows for faster initialization, then default backend
    cap = cv2.VideoCapture(args.cam, cv2.CAP_DSHOW) if sys.platform.startswith("win") else cv2.VideoCapture(args.cam)
    if not cap.isOpened():
        print(f"[!] DirectShow open failed on index {args.cam}. Trying default capture backend...")
        cap = cv2.VideoCapture(args.cam)

    if not cap.isOpened():
        print(f"[ERROR] Could not open webcam index {args.cam}.")
        print("Please verify that your webcam is connected and not currently in use by another application.")
        return 1

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    window_name = "AI Smart Exam Monitoring System — MediaPipe & YOLOv8"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1280, 720)

    print("[OK] Webcam stream active. Press 'q' to quit.")
    print("[*] Features Active:")
    print("     - Human Hand Movement Tracking & Counting")
    print("     - 3D Head Movement Tracking & Direction Counting (Up, Down, Left, Right)")
    print("     - Eye Gaze Tracking & Direction Counting (Up, Down, Left, Right)")
    print("     - Real-Time YOLOv8 Object Detection (Name, Confidence %, Bounding Box)")
    print("     - Mobile Phone Warning: 'WARNING: MOBILE PHONE DETECTED!'")
    print("     - Smartwatch Warning: 'WARNING: SMARTWATCH DETECTED!'")

    prev_time = time.time()
    show_full_hud = True
    last_phone_snapshot_time = 0.0

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                print("[!] Failed to grab webcam frame. Retrying...")
                time.sleep(0.05)
                continue

            curr_time = time.time()
            fps = 1.0 / max(0.001, (curr_time - prev_time))
            prev_time = curr_time

            # 1. MediaPipe Multimodal Processing
            mp_data = mediapipe_tracker.process(frame)

            # 2. YOLOv8 Object Detection
            wrist_pts = []
            if mp_data.get("hands", {}).get("detected"):
                for hd in mp_data["hands"].get("hands", []):
                    w_pos = hd.get("wrist")
                    if w_pos:
                        wrist_pts.append(w_pos)

            detections = yolo_detector.detect(frame, wrist_points=wrist_pts)
            yolo_summary = yolo_detector.get_summary(detections)

            # 3. Draw Bounding Boxes and Labels for Every Detected Object
            annotated_frame = yolo_detector.draw_detections(
                frame=frame,
                detections=detections,
                active_warnings=yolo_summary.get("activeWarnings", [])
            )

            # 4. Auto Evidence Screenshot on Mobile Phone Detection
            phone_detected = bool(
                yolo_summary.get("phoneDetected") or
                yolo_summary.get("phoneWarning") or
                any(d.get("label") in ("cell phone", "mobile phone", "telephone") for d in detections)
            )
            if phone_detected and (curr_time - last_phone_snapshot_time >= 4.0):
                last_phone_snapshot_time = curr_time
                snap_dir = os.path.join(current_dir, "snapshots")
                os.makedirs(snap_dir, exist_ok=True)
                snap_path = os.path.join(snap_dir, f"evidence_phone_{int(curr_time)}.jpg")
                cv2.imwrite(snap_path, annotated_frame)
                print(f"[CRITICAL WARNING] 🚨 MOBILE PHONE DETECTED! 📸 Evidence Screenshot Captured: {snap_path}")

            # 5. Draw Comprehensive Dashboard HUD
            output_frame = draw_hud(
                frame=annotated_frame,
                mp_data=mp_data,
                yolo_summary=yolo_summary,
                fps=fps,
                show_full_hud=show_full_hud
            )

            cv2.imshow(window_name, output_frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q') or key == 27:  # 'q' or ESC
                print("[*] Exiting monitoring session...")
                break
            elif key == ord('c') or key == ord('C'):
                # Reset Direction Counters
                mediapipe_tracker.gaze_counts = {"up": 0, "down": 0, "left": 0, "right": 0, "off_screen": 0, "screen": 0}
                mediapipe_tracker.head_counts = {"up": 0, "down": 0, "left": 0, "right": 0, "center": 0}
                mediapipe_tracker.hand_counts = {"raised": 0, "near_face": 0, "near_ear": 0, "below_desk": 0, "repeated_movements": 0}
                print("[*] All direction and movement counters reset to 0.")
            elif key == ord('s') or key == ord('S'):
                # Save snapshot
                snap_dir = os.path.join(current_dir, "snapshots")
                os.makedirs(snap_dir, exist_ok=True)
                snap_path = os.path.join(snap_dir, f"exam_monitoring_{int(time.time())}.jpg")
                cv2.imwrite(snap_path, output_frame)
                print(f"[OK] Snapshot saved to: {snap_path}")
            elif key == ord('t') or key == ord('T'):
                show_full_hud = not show_full_hud
                print(f"[*] HUD toggled: {'ON' if show_full_hud else 'OFF'}")

    finally:
        cap.release()
        cv2.destroyAllWindows()
        print("[*] Webcam released and windows closed successfully.")

    return 0

if __name__ == "__main__":
    sys.exit(main())
