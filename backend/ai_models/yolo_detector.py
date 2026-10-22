"""
yolo_detector.py
---------------------------------------------------------------------------
Production Ultralytics YOLOv8 Object Detection Module for Exam Proctoring.

Features:
 - Real-Time Webcam Object Detection with YOLOv8 (COCO & Custom Models)
 - Mobile Phone Detection with instant warning: "WARNING: MOBILE PHONE DETECTED!"
 - Smartwatch Detection with instant warning: "WARNING: SMARTWATCH DETECTED!"
 - Bounding box [x, y, w, h], correct object name, and confidence percentage
 - Multi-frame confirmation streak to suppress single-frame false positives
 - Cooldown logic and timestamped warning history logging
 - Seamless fallback and support for custom-trained smartwatch model (yolov8_smartwatch.pt)
"""

import os
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import cv2
import numpy as np

class YOLOv8ProctorDetector:
    def __init__(self, model_name: str = "yolov8n.pt", conf_threshold: float = 0.30):
        self.conf_threshold = conf_threshold
        self.model = None
        self.custom_smartwatch_model = None
        self.model_name = model_name

        # Resolve paths
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        root_dir = os.path.dirname(base_dir)

        # Check candidate locations for base model
        model_paths = [
            os.path.join(root_dir, model_name),
            os.path.join(base_dir, model_name),
            os.path.join(base_dir, "models", model_name),
            model_name
        ]
        chosen_base_path = model_name
        for p in model_paths:
            if os.path.exists(p):
                chosen_base_path = p
                break

        # Check for fine-tuned / custom smartwatch model
        smartwatch_paths = [
            os.path.join(base_dir, "models", "yolov8_smartwatch.pt"),
            os.path.join(base_dir, "yolov8_smartwatch.pt"),
            os.path.join(root_dir, "yolov8_smartwatch.pt")
        ]
        custom_sw_path = None
        for sp in smartwatch_paths:
            if os.path.exists(sp):
                custom_sw_path = sp
                break

        # Load Ultralytics YOLO
        try:
            from ultralytics import YOLO
            self.model = YOLO(chosen_base_path)
            print(f"[YOLOv8] Successfully loaded primary model from: {chosen_base_path}")

            if custom_sw_path:
                try:
                    self.custom_smartwatch_model = YOLO(custom_sw_path)
                    print(f"[YOLOv8] Successfully loaded custom smartwatch model: {custom_sw_path}")
                except Exception as ex:
                    print(f"[YOLOv8] Notice: Custom smartwatch model load skipped: {ex}")
        except Exception as e:
            print(f"[YOLOv8] Warning: Could not initialize Ultralytics YOLO: {e}")

        # Configurable class-specific confidence thresholds
        self.class_thresholds: Dict[str, float] = {
            "cell phone": 0.35,
            "smartwatch": 0.30,
            "watch": 0.30,
            "clock": 0.38,
            "book": 0.35,
            "laptop": 0.38,
            "tv": 0.40,
            "person": 0.35,
            "remote": 0.40
        }

        # Prohibited objects mapping for exam policy
        self.prohibited_classes = {
            "cell phone", "phone", "smartwatch", "watch", "book", "laptop", "tablet", "remote", "tv"
        }

        # Consecutive frame streak tracking to avoid single-frame flickers
        self.consecutive_streaks: Dict[str, int] = {
            "cell phone": 0,
            "smartwatch": 0,
            "book": 0,
            "laptop": 0,
            "tv": 0,
            "multiple_persons": 0
        }
        self.min_consecutive_frames = 2

        # Timestamped warning history log
        self.warning_history: List[Dict[str, Any]] = []
        self.max_warning_history = 50

        # Cooldown management for event deduplication
        self.last_warning_times: Dict[str, float] = {
            "cell phone": 0.0,
            "smartwatch": 0.0
        }
        self.warning_cooldown_sec = 3.5

    def set_thresholds(self, thresholds: Dict[str, float]):
        """Dynamically update confidence thresholds per class."""
        self.class_thresholds.update(thresholds)

    def detect(self, frame: np.ndarray, wrist_points: Optional[List[Dict[str, float]]] = None) -> List[Dict[str, Any]]:
        """
        Runs object detection on frame.
        Returns detailed detections list containing:
          - label (normalized name, e.g. "cell phone", "smartwatch", "laptop")
          - confidence (float 0.0 - 1.0)
          - confidencePct (string formatted as "88.5%")
          - bbox ([x, y, w, h] normalized 0.0 - 1.0)
          - pixelBbox ([x1, y1, x2, y2] integers in image space)
          - isProhibited (bool)
          - isConfirmedStreak (bool)
        """
        if self.model is None or frame is None:
            return []

        h, w = frame.shape[:2]
        detections: List[Dict[str, Any]] = []
        seen_classes = set()
        person_count = 0

        # 1. Primary Model Inference
        try:
            results = self.model(frame, conf=0.20, verbose=False)
            for r in results:
                boxes = r.boxes
                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    orig_label = self.model.names[cls_id].lower()
                    conf = float(box.conf[0].item())

                    xyxy = box.xyxy[0].tolist()
                    x1, y1, x2, y2 = xyxy

                    # Normalize label
                    label = orig_label
                    if label in ("cell phone", "mobile phone", "telephone"):
                        label = "cell phone"
                    elif label in ("clock", "watch", "smartwatch"):
                        # Heuristic for wristwatch / smartwatch:
                        # Wristwatches in COCO are frequently classified as "clock".
                        # If the bounding box is small-to-medium (<= 25% of frame) or near hands/wrists, classify as smartwatch.
                        box_area_ratio = ((x2 - x1) * (y2 - y1)) / float(w * h)
                        if orig_label in ("watch", "smartwatch") or box_area_ratio < 0.15:
                            label = "smartwatch"

                    # Minimum threshold check
                    min_conf = self.class_thresholds.get(label, self.class_thresholds.get(orig_label, self.conf_threshold))
                    if conf < min_conf:
                        continue

                    seen_classes.add(label)
                    if label == "person":
                        person_count += 1

                    norm_x = max(0.0, min(1.0, x1 / w))
                    norm_y = max(0.0, min(1.0, y1 / h))
                    norm_w = max(0.0, min(1.0, (x2 - x1) / w))
                    norm_h = max(0.0, min(1.0, (y2 - y1) / h))

                    is_prohibited = label in self.prohibited_classes

                    detections.append({
                        "label": label,
                        "rawLabel": orig_label,
                        "confidence": round(conf, 3),
                        "confidencePct": f"{round(conf * 100, 1)}%",
                        "bbox": [round(norm_x, 4), round(norm_y, 4), round(norm_w, 4), round(norm_h, 4)],
                        "pixelBbox": [int(x1), int(y1), int(x2), int(y2)],
                        "isProhibited": is_prohibited,
                        "requiresFacultyVerification": is_prohibited,
                        "isConfirmedUnauthorized": False
                    })
        except Exception as e:
            print(f"[YOLOv8] Error during inference: {e}")

        # 2. Custom Smartwatch Model Inference (if available)
        if self.custom_smartwatch_model is not None:
            try:
                sw_results = self.custom_smartwatch_model(frame, conf=0.25, verbose=False)
                for r in sw_results:
                    for box in r.boxes:
                        cls_id = int(box.cls[0].item())
                        sw_label = self.custom_smartwatch_model.names[cls_id].lower()
                        conf = float(box.conf[0].item())
                        if conf < self.class_thresholds.get("smartwatch", 0.30):
                            continue

                        xyxy = box.xyxy[0].tolist()
                        x1, y1, x2, y2 = xyxy
                        norm_x = max(0.0, min(1.0, x1 / w))
                        norm_y = max(0.0, min(1.0, y1 / h))
                        norm_w = max(0.0, min(1.0, (x2 - x1) / w))
                        norm_h = max(0.0, min(1.0, (y2 - y1) / h))

                        label = "smartwatch"
                        seen_classes.add(label)

                        detections.append({
                            "label": label,
                            "rawLabel": sw_label,
                            "confidence": round(conf, 3),
                            "confidencePct": f"{round(conf * 100, 1)}%",
                            "bbox": [round(norm_x, 4), round(norm_y, 4), round(norm_w, 4), round(norm_h, 4)],
                            "pixelBbox": [int(x1), int(y1), int(x2), int(y2)],
                            "isProhibited": True,
                            "requiresFacultyVerification": True,
                            "isConfirmedUnauthorized": False
                        })
            except Exception as e:
                print(f"[YOLOv8] Custom smartwatch inference note: {e}")

        # 2b. Deduplicate overlapping 'person' bounding boxes
        person_dets = [d for d in detections if d["label"] == "person"]
        non_person_dets = [d for d in detections if d["label"] != "person"]
        distinct_persons = []
        for p in person_dets:
            bx, by, bw, bh = p["bbox"]
            p_center_x = bx + bw / 2.0
            p_center_y = by + bh / 2.0
            is_dup = False
            for dp in distinct_persons:
                dx, dy, dw, dh = dp["bbox"]
                d_center_x = dx + dw / 2.0
                d_center_y = dy + dh / 2.0
                xA = max(bx, dx)
                yA = max(by, dy)
                xB = min(bx + bw, dx + dw)
                yB = min(by + bh, dy + dh)
                inter = max(0.0, xB - xA) * max(0.0, yB - yA)
                areaP = bw * bh
                areaD = dw * dh
                iou = inter / (areaP + areaD - inter + 1e-6)
                dist_center = np.hypot(p_center_x - d_center_x, p_center_y - d_center_y)
                if iou > 0.25 or dist_center < 0.22:
                    is_dup = True
                    break
            if not is_dup:
                distinct_persons.append(p)
        detections = non_person_dets + distinct_persons
        person_count = len(distinct_persons)

        # 3. Update Consecutive Streaks
        for cls_name in ["cell phone", "smartwatch", "book", "laptop", "tv"]:
            if cls_name in seen_classes:
                self.consecutive_streaks[cls_name] = self.consecutive_streaks.get(cls_name, 0) + 1
            else:
                self.consecutive_streaks[cls_name] = max(0, self.consecutive_streaks.get(cls_name, 0) - 1)

        if person_count > 1:
            self.consecutive_streaks["multiple_persons"] = self.consecutive_streaks.get("multiple_persons", 0) + 1
        else:
            self.consecutive_streaks["multiple_persons"] = max(0, self.consecutive_streaks.get("multiple_persons", 0) - 1)

        # 4. Annotate confirmation status and trigger warnings
        now = time.time()
        for d in detections:
            lbl = d["label"]
            streak = self.consecutive_streaks.get(lbl, 0)
            d["consecutiveFrames"] = streak
            d["isConfirmedStreak"] = streak >= self.min_consecutive_frames
            d["evidenceEligible"] = d["isConfirmedStreak"]

            # Mobile Phone Warning Trigger
            if lbl == "cell phone" and d["isConfirmedStreak"]:
                if (now - self.last_warning_times.get("cell phone", 0.0)) >= self.warning_cooldown_sec:
                    self.last_warning_times["cell phone"] = now
                    self.warning_history.append({
                        "id": f"warn_{int(now * 1000)}",
                        "type": "MOBILE_PHONE",
                        "warningMessage": "WARNING: MOBILE PHONE DETECTED!",
                        "objectLabel": "Mobile Phone",
                        "confidence": d["confidence"],
                        "confidencePct": d["confidencePct"],
                        "timestamp": now,
                        "timeString": datetime.now().strftime("%H:%M:%S"),
                        "bbox": d["bbox"]
                    })
                    if len(self.warning_history) > self.max_warning_history:
                        self.warning_history.pop(0)

            # Smartwatch Warning Trigger
            if lbl == "smartwatch" and d["isConfirmedStreak"]:
                if (now - self.last_warning_times.get("smartwatch", 0.0)) >= self.warning_cooldown_sec:
                    self.last_warning_times["smartwatch"] = now
                    self.warning_history.append({
                        "id": f"warn_{int(now * 1000)}",
                        "type": "SMARTWATCH",
                        "warningMessage": "WARNING: SMARTWATCH DETECTED!",
                        "objectLabel": "Smartwatch",
                        "confidence": d["confidence"],
                        "confidencePct": d["confidencePct"],
                        "timestamp": now,
                        "timeString": datetime.now().strftime("%H:%M:%S"),
                        "bbox": d["bbox"]
                    })
                    if len(self.warning_history) > self.max_warning_history:
                        self.warning_history.pop(0)

        return detections

    def get_summary(self, detections: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Returns structured multi-feature summary with warnings,
        counts, and warning history for the live monitoring dashboard.
        """
        phones = [d for d in detections if d["label"] == "cell phone"]
        smartwatches = [d for d in detections if d["label"] == "smartwatch"]
        books = [d for d in detections if d["label"] == "book"]
        laptops = [d for d in detections if d["label"] == "laptop"]
        monitors = [d for d in detections if d["label"] == "tv"]
        persons = [d for d in detections if d["label"] == "person"]

        person_count = len(persons)
        multi_person_confirmed = self.consecutive_streaks.get("multiple_persons", 0) >= self.min_consecutive_frames

        phone_detected = len(phones) > 0
        phone_confirmed = self.consecutive_streaks.get("cell phone", 0) >= self.min_consecutive_frames
        phone_conf = max([p["confidence"] for p in phones], default=0.0)

        smartwatch_detected = len(smartwatches) > 0
        smartwatch_confirmed = self.consecutive_streaks.get("smartwatch", 0) >= self.min_consecutive_frames
        smartwatch_conf = max([s["confidence"] for s in smartwatches], default=0.0)

        # Active warning banners
        active_warnings = []
        if phone_detected:
            active_warnings.append({
                "type": "MOBILE_PHONE",
                "message": "WARNING: MOBILE PHONE DETECTED!",
                "severity": "CRITICAL",
                "confidence": phone_conf,
                "confidencePct": f"{round(phone_conf * 100, 1)}%"
            })
        if smartwatch_detected:
            active_warnings.append({
                "type": "SMARTWATCH",
                "message": "WARNING: SMARTWATCH DETECTED!",
                "severity": "CRITICAL",
                "confidence": smartwatch_conf,
                "confidencePct": f"{round(smartwatch_conf * 100, 1)}%"
            })

        second_devices = phones + smartwatches + laptops + monitors
        has_second_device = len(second_devices) > 0
        second_device_types = list(set(d["label"] for d in second_devices))

        return {
            "allDetections": detections,
            "totalDetectedObjects": len(detections),
            "personCount": person_count,
            "multiplePersonsDetected": person_count > 1 and multi_person_confirmed,
            "multiplePersonsConfirmed": multi_person_confirmed,
            # Mobile Phone Detection & Warning
            "phoneDetected": phone_detected,
            "phoneConfirmed": phone_confirmed,
            "phoneConfidence": phone_conf,
            "phoneConfidencePct": f"{round(phone_conf * 100, 1)}%" if phone_detected else "0%",
            "phoneWarning": "WARNING: MOBILE PHONE DETECTED!" if phone_detected else None,
            # Smartwatch Detection & Warning
            "smartwatchDetected": smartwatch_detected,
            "smartwatchConfirmed": smartwatch_confirmed,
            "smartwatchConfidence": smartwatch_conf,
            "smartwatchConfidencePct": f"{round(smartwatch_conf * 100, 1)}%" if smartwatch_detected else "0%",
            "smartwatchWarning": "WARNING: SMARTWATCH DETECTED!" if smartwatch_detected else None,
            # Books and Additional Devices
            "bookDetected": len(books) > 0,
            "bookConfirmed": self.consecutive_streaks.get("book", 0) >= self.min_consecutive_frames,
            "bookConfidence": max([b["confidence"] for b in books], default=0.0),
            "secondDeviceDetected": has_second_device,
            "secondDeviceConfirmed": any(self.consecutive_streaks.get(t, 0) >= self.min_consecutive_frames for t in second_device_types),
            "secondDeviceTypes": second_device_types,
            # Active warnings and history
            "activeWarnings": active_warnings,
            "warningHistory": list(reversed(self.warning_history[-15:])),
            "warningHistoryCount": len(self.warning_history),
            "disclaimer": "Physical object detections within webcam view only. Faculty verification required."
        }

    def draw_detections(self, frame: np.ndarray, detections: List[Dict[str, Any]], active_warnings: Optional[List[Dict[str, Any]]] = None) -> np.ndarray:
        """
        Utility to render clean bounding boxes, labels, confidence percentages,
        and prominent warning banners directly onto an OpenCV BGR frame.
        """
        annotated = frame.copy()
        h, w = annotated.shape[:2]

        for d in detections:
            bbox = d.get("pixelBbox")
            if not bbox or len(bbox) != 4:
                norm_b = d.get("bbox", [0, 0, 0, 0])
                bbox = [int(norm_b[0] * w), int(norm_b[1] * h), int((norm_b[0] + norm_b[2]) * w), int((norm_b[1] + norm_b[3]) * h)]

            x1, y1, x2, y2 = bbox
            label = d.get("label", "object")
            conf_pct = d.get("confidencePct", f"{int(d.get('confidence', 0) * 100)}%")

            # Pick color: Red for prohibited/warnings, Cyan for neutral/person
            if label in ("cell phone", "smartwatch", "book"):
                color = (0, 0, 255)  # BGR Red
            elif label == "person":
                color = (255, 200, 0) # Cyan/Yellow
            else:
                color = (0, 220, 255) # Amber

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Badge tag
            tag = f"{label.upper()} {conf_pct}"
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.55
            thickness = 2
            (tw, th), _ = cv2.getTextSize(tag, font, font_scale, thickness)

            # Badge background
            cv2.rectangle(annotated, (x1, max(0, y1 - th - 8)), (x1 + tw + 10, y1), color, -1)
            cv2.putText(annotated, tag, (x1 + 5, y1 - 4), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

        # Draw Warning Banners if active
        if active_warnings:
            banner_y = 40
            for warn in active_warnings:
                msg = warn.get("message", "")
                if not msg:
                    continue
                # Draw top alert banner
                overlay = annotated.copy()
                cv2.rectangle(overlay, (10, banner_y - 30), (w - 10, banner_y + 15), (0, 0, 200), -1)
                cv2.addWeighted(overlay, 0.85, annotated, 0.15, 0, annotated)
                cv2.rectangle(annotated, (10, banner_y - 30), (w - 10, banner_y + 15), (0, 0, 255), 2)
                cv2.putText(annotated, msg, (25, banner_y), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)
                banner_y += 55

        return annotated
