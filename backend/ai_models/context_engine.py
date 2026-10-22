"""
context_engine.py
---------------------------------------------------------------------------
Production Context-Aware Multimodal Behaviour Analysis & Risk Engine.
Comprehensive Implementation for All 14 Proctoring Features:

 Feature 1: Repeated Left, Right, and Downward Looking
 Feature 2: Book, Notes, and Paper Detection
 Feature 3: External AI or Chatbot Usage
 Feature 4: External Website or Search Usage
 Feature 5: Second Monitor or Additional Device
 Feature 6: Unauthorized Audio or Communication Devices
 Feature 7: Suspicious External Input or Keyboard Activity
 Feature 8: Multiple People Detection
 Feature 9: Student Leaving the Camera View
 Feature 10: Face Missing Detection
 Feature 11: Identity Mismatch Detection
 Feature 12: Camera Blocking or Tampering
 Feature 13: Another Person's Voice or Possible Verbal Assistance
 Feature 14: Repeated Network or Session Interruptions

Key Design Principles:
 - Configurable thresholds and sliding time windows
 - Consecutive-frame confirmation
 - Grace periods for camera startup, lighting, and temporary loss
 - Absence deduplication (no spam during continuous absence)
 - Technical network incidents isolated from cheating risk scores
 - Dual scoring: Contextual Suspicion Score vs Sensor Evidence Confidence
"""

import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

class ContextAwareRiskEngine:
    def __init__(self, baseline_duration_sec: int = 15):
        self.baseline_duration_sec = baseline_duration_sec
        self.start_time = time.time()
        self.baseline_established = False

        # Rolling buffers & history
        self.observations: List[Dict[str, Any]] = []
        self.events_history: List[Dict[str, Any]] = []
        self.detected_chains: List[Dict[str, Any]] = []

        # Feature 1: Repeated Movement Tracking
        self.movement_episodes: List[Dict[str, Any]] = []
        self.repeated_looking_alert: bool = False
        self.look_away_streak: float = 0.0
        self.gaze_down_streak: float = 0.0
        self.head_down_streak: float = 0.0

        # Feature 2: Book / Notes Tracking
        self.book_streak: float = 0.0
        self.book_detected_count: int = 0

        # Feature 3: External AI / Chatbot Environment Status
        self.ai_monitoring_support: str = "PARTIALLY_SUPPORTED" # In browser sandbox

        # Feature 4: External Website & Search Usage
        self.tab_switch_count: int = 0
        self.fullscreen_exit_count: int = 0
        self.away_duration_total: float = 0.0
        self.current_away_start: Optional[float] = None

        # Feature 5: Second Monitor & Device Tracking
        self.phone_streak: float = 0.0
        self.second_device_detected: bool = False
        self.multi_screen_connected: bool = False

        # Feature 6: Unauthorized Audio / Earphone Tracking
        self.hand_near_ear_streak: float = 0.0
        self.hand_below_desk_streak: float = 0.0
        self.hand_near_head_streak: float = 0.0

        # Feature 7: Input & Clipboard Activity
        self.clipboard_event_count: int = 0
        self.large_paste_count: int = 0

        # Feature 8: Multiple People Tracking
        self.multi_person_streak: float = 0.0

        # Feature 9: Student Leaving Camera View (Stateful Grace Period)
        self.absence_state: str = "IN_VIEW" # "IN_VIEW" | "GRACE_PERIOD" | "ABSENT"
        self.absence_start_time: Optional[float] = None
        self.absence_grace_period_sec: float = 4.0
        self.absence_episodes: List[Dict[str, Any]] = []
        self.total_absence_duration: float = 0.0
        self.absence_alert_emitted: bool = False # Suppresses duplicates during continuous absence

        # Feature 10: Face Missing Tracking
        self.no_face_streak: float = 0.0
        self.face_missing_grace_period_sec: float = 4.0

        # Feature 11: Identity Mismatch Tracking
        self.identity_mismatch_count: int = 0
        self.identity_confidence: float = 0.95
        self.identity_status: str = "VERIFIED" # "VERIFIED" | "NEEDS_MANUAL_REVIEW"

        # Feature 12: Camera Tampering & Quality
        self.camera_obscured: bool = False
        self.camera_frozen: bool = False
        self.camera_status: str = "NORMAL"

        # Feature 13: Voice Activity Detection (VAD)
        self.voice_streak: float = 0.0
        self.voice_event_count: int = 0
        self.audio_monitoring_consented: bool = True

        # Feature 14: Network & Technical Interruptions (Isolated from Cheating Risk)
        self.network_incident_count: int = 0
        self.total_offline_seconds: float = 0.0
        self.reconnect_count: int = 0
        self.technical_status: str = "STABLE"

        # Baseline profile statistics
        self.baseline_stats = {
            "gaze_variance": 0.0,
            "head_pitch_avg": 0.0,
            "head_yaw_avg": 0.0,
            "ambient_audio_rms": 0.0,
            "samples_count": 0
        }

        # Dual scores
        self.suspicion_score = 0.0
        self.evidence_confidence = 0.95

        # Configurable Risk Thresholds
        self.thresholds = {
            "low": 30.0,
            "medium": 65.0,
            "critical": 85.0
        }

    def set_thresholds(self, low: float, medium: float, critical: float):
        self.thresholds = {"low": low, "medium": medium, "critical": critical}

    def evaluate(self, vision_res: Dict[str, Any], audio_rms: float, browser_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Multimodal snapshot evaluation computing all 14 features, temporal correlation,
        and isolated technical metrics.
        """
        now = time.time()
        elapsed = now - self.start_time
        browser_state = browser_state or {}

        # 1. Vision Signals
        objects = vision_res.get("objects", [])
        has_phone = any("phone" in o.get("label", "").lower() for o in objects)
        phone_conf = max([o.get("confidence", 0.0) for o in objects if "phone" in o.get("label", "").lower()], default=0.0)

        has_book = any(o.get("label") == "book" for o in objects)
        book_conf = max([o.get("confidence", 0.0) for o in objects if o.get("label") == "book"], default=0.0)

        has_laptop = any(o.get("label") == "laptop" for o in objects)
        has_tv = any(o.get("label") in ("tv", "monitor") for o in objects)

        face_detected = vision_res.get("faceDetected", True)
        faces_count = vision_res.get("facesCount", 1 if face_detected else 0)

        head_pose = vision_res.get("headPose", {})
        head_dir = head_pose.get("direction", "center")
        head_pitch = head_pose.get("pitch", 0.0)
        head_yaw = head_pose.get("yaw", 0.0)

        gaze = vision_res.get("gaze", {})
        gaze_dir = gaze.get("gazeDirection", "screen")
        gaze_on_screen = gaze.get("onScreen", True)
        gaze_conf = gaze.get("confidence", 0.92)

        hands = vision_res.get("hands", {})
        hand_detected = hands.get("detected", False)
        hand_near_head = hands.get("nearHead", False)
        hand_near_ear = hands.get("nearEar", False)
        hand_below_desk = hands.get("belowDesk", False)
        hand_suspicious = hands.get("suspicious", False)

        camera_status_data = vision_res.get("cameraStatus", {})
        camera_obscured = camera_status_data.get("isObscured", False)
        camera_frozen = camera_status_data.get("isFrozen", False)
        camera_diag_status = camera_status_data.get("status", "NORMAL")

        movement_tracking_data = vision_res.get("movementTracking", {})
        repeated_movement_alert = movement_tracking_data.get("repeatedMovementAlert", False)

        # 2. Audio Signals
        voice_active = audio_rms > 0.35

        # 3. Browser & Environment Signals
        tab_active = browser_state.get("tabActive", True)
        screen_sharing = browser_state.get("screenSharing", True)
        clipboard_attempt = browser_state.get("clipboardAttempt", False)
        large_paste = browser_state.get("largePaste", False)
        is_online = browser_state.get("isOnline", True)
        is_extended_screen = browser_state.get("isExtendedScreen", False)
        away_duration = float(browser_state.get("awayDuration", 0.0))

        generated_events: List[Dict[str, Any]] = []

        # -------------------------------------------------------------
        # Baseline Establishment Phase
        # -------------------------------------------------------------
        if not self.baseline_established:
            if elapsed < self.baseline_duration_sec:
                self.baseline_stats["samples_count"] += 1
                cnt = self.baseline_stats["samples_count"]
                self.baseline_stats["head_pitch_avg"] += (head_pitch - self.baseline_stats["head_pitch_avg"]) / cnt
                self.baseline_stats["head_yaw_avg"] += (head_yaw - self.baseline_stats["head_yaw_avg"]) / cnt
                self.baseline_stats["ambient_audio_rms"] += (audio_rms - self.baseline_stats["ambient_audio_rms"]) / cnt
            else:
                self.baseline_established = True
                generated_events.append({
                    "eventType": "BASELINE_ESTABLISHED",
                    "confidence": 0.98,
                    "duration": self.baseline_duration_sec,
                    "riskContribution": 0.0,
                    "source": "ContextEngine",
                    "metadata": {
                        "ambientRms": round(self.baseline_stats["ambient_audio_rms"], 3),
                        "headPitchAvg": round(self.baseline_stats["head_pitch_avg"], 1),
                        "headYawAvg": round(self.baseline_stats["head_yaw_avg"], 1)
                    }
                })

        # -------------------------------------------------------------
        # Streaks Update with Leaky Integrator
        # -------------------------------------------------------------
        decay = 0.5
        if has_phone: self.phone_streak += 1.0
        else: self.phone_streak = max(0.0, self.phone_streak - decay)

        if has_book: self.book_streak += 1.0
        else: self.book_streak = max(0.0, self.book_streak - decay)

        if head_dir == "down" or head_pitch < -14.0: self.head_down_streak += 1.0
        else: self.head_down_streak = max(0.0, self.head_down_streak - decay)

        if gaze_dir in ("down", "side") or (not gaze_on_screen and head_dir == "down"):
            self.gaze_down_streak += 1.0
        else:
            self.gaze_down_streak = max(0.0, self.gaze_down_streak - decay)

        if not gaze_on_screen: self.look_away_streak += 1.0
        else: self.look_away_streak = max(0.0, self.look_away_streak - decay)

        if hand_near_ear: self.hand_near_ear_streak += 1.0
        else: self.hand_near_ear_streak = max(0.0, self.hand_near_ear_streak - decay)

        if hand_below_desk: self.hand_below_desk_streak += 1.0
        else: self.hand_below_desk_streak = max(0.0, self.hand_below_desk_streak - decay)

        if hand_near_head: self.hand_near_head_streak += 1.0
        else: self.hand_near_head_streak = max(0.0, self.hand_near_head_streak - decay)

        if voice_active: self.voice_streak += 1.0
        else: self.voice_streak = max(0.0, self.voice_streak - decay)

        if faces_count > 1: self.multi_person_streak += 1.0
        else: self.multi_person_streak = max(0.0, self.multi_person_streak - decay)

        if not face_detected or faces_count == 0: self.no_face_streak += 1.0
        else: self.no_face_streak = max(0.0, self.no_face_streak - 1.0)

        # -------------------------------------------------------------
        # Feature 9: Student Leaving Camera View (Stateful Grace Period)
        # -------------------------------------------------------------
        student_present = face_detected and (faces_count > 0)
        if not student_present:
            if self.absence_state == "IN_VIEW":
                self.absence_state = "GRACE_PERIOD"
                self.absence_start_time = now
            elif self.absence_state == "GRACE_PERIOD":
                if now - (self.absence_start_time or now) >= self.absence_grace_period_sec:
                    self.absence_state = "ABSENT"
                    if not self.absence_alert_emitted:
                        self.absence_alert_emitted = True
                        generated_events.append({
                            "eventType": "STUDENT_LEAVING_CAMERA_VIEW",
                            "confidence": 0.95,
                            "duration": round(now - (self.absence_start_time or now), 1),
                            "riskContribution": 35.0,
                            "source": "ContextEngine",
                            "metadata": {
                                "absenceStartTime": datetime.fromtimestamp(self.absence_start_time or now, timezone.utc).isoformat(),
                                "gracePeriodAppliedSec": self.absence_grace_period_sec,
                                "requiresFacultyReview": True
                            }
                        })
        else:
            # Student is back in view
            if self.absence_state == "ABSENT":
                absence_dur = now - (self.absence_start_time or now)
                self.total_absence_duration += absence_dur
                self.absence_episodes.append({
                    "start": self.absence_start_time,
                    "end": now,
                    "duration": round(absence_dur, 1)
                })
                generated_events.append({
                    "eventType": "STUDENT_RETURNED",
                    "confidence": 0.98,
                    "duration": round(absence_dur, 1),
                    "riskContribution": 0.0,
                    "source": "ContextEngine",
                    "metadata": {
                        "totalAbsenceDurationSec": round(absence_dur, 1),
                        "recoveryTimestamp": datetime.fromtimestamp(now, timezone.utc).isoformat()
                    }
                })
            self.absence_state = "IN_VIEW"
            self.absence_start_time = None
            self.absence_alert_emitted = False

        # -------------------------------------------------------------
        # Feature 12: Camera Obscured / Tampering
        # -------------------------------------------------------------
        self.camera_obscured = camera_obscured
        self.camera_frozen = camera_frozen
        self.camera_status = camera_diag_status
        if camera_obscured:
            generated_events.append({
                "eventType": "CAMERA_OBSCURED",
                "confidence": 0.96,
                "duration": 2.0,
                "riskContribution": 45.0,
                "source": "OpenCV Diagnostics",
                "metadata": camera_status_data
            })
        elif camera_frozen:
            generated_events.append({
                "eventType": "VIDEO_INTERRUPTED",
                "confidence": 0.95,
                "duration": 3.0,
                "riskContribution": 30.0,
                "source": "OpenCV Diagnostics",
                "metadata": camera_status_data
            })

        # -------------------------------------------------------------
        # Feature 1: Repeated Left, Right, Downward Movement Alert
        # -------------------------------------------------------------
        if repeated_movement_alert and not self.repeated_looking_alert:
            self.repeated_looking_alert = True
            generated_events.append({
                "eventType": "REPEATED_LOOK_AWAY",
                "confidence": 0.88,
                "duration": 5.0,
                "riskContribution": 35.0,
                "source": "ContextEngine",
                "metadata": movement_tracking_data
            })
        elif not repeated_movement_alert:
            self.repeated_looking_alert = False

        # -------------------------------------------------------------
        # Feature 2: Book / Notes Consecutive Detection
        # -------------------------------------------------------------
        if self.book_streak >= 3.0:
            generated_events.append({
                "eventType": "BOOK_NOTES_DETECTED",
                "confidence": round(book_conf, 2),
                "duration": int(self.book_streak),
                "riskContribution": 55.0,
                "source": "YOLOv8",
                "metadata": {
                    "isConfirmedUnauthorized": False,
                    "requiresFacultyConfirmation": True,
                    "detail": "Book / notes detected across consecutive frames."
                }
            })

        # -------------------------------------------------------------
        # Feature 8: Multiple People Detection Confirmation
        # -------------------------------------------------------------
        if self.multi_person_streak >= 3.0:
            generated_events.append({
                "eventType": "MULTIPLE_PEOPLE_DETECTED",
                "confidence": 0.94,
                "duration": int(self.multi_person_streak),
                "riskContribution": 85.0,
                "source": "YOLOv8 + MediaPipe",
                "metadata": {
                    "personCount": faces_count,
                    "consecutiveConfirmation": True
                }
            })

        # -------------------------------------------------------------
        # Feature 5: Second Monitor or Additional Device
        # -------------------------------------------------------------
        has_second_device = has_phone or has_laptop or has_tv or is_extended_screen
        if has_second_device:
            self.second_device_detected = True
            device_names = []
            if has_phone: device_names.append("phone")
            if has_laptop: device_names.append("laptop")
            if has_tv: device_names.append("external monitor/tv")
            if is_extended_screen: device_names.append("extended display (os/api)")
            
            if (self.phone_streak >= 2.0 or is_extended_screen) and not any(e.get("eventType") == "SECOND_DEVICE_DETECTED" for e in generated_events):
                generated_events.append({
                    "eventType": "SECOND_DEVICE_DETECTED",
                    "confidence": 0.90,
                    "duration": int(self.phone_streak or 1.0),
                    "riskContribution": 65.0,
                    "source": "YOLOv8 + DisplayAPI",
                    "metadata": {
                        "devices": device_names,
                        "isExtendedDisplay": is_extended_screen,
                        "disclaimer": "Detection within camera view and permitted display API only."
                    }
                })

        # -------------------------------------------------------------
        # Feature 7: Input & Large Paste Monitoring
        # -------------------------------------------------------------
        if large_paste:
            self.large_paste_count += 1
            generated_events.append({
                "eventType": "LARGE_PASTE_OPERATION",
                "confidence": 1.0,
                "duration": 1.0,
                "riskContribution": 35.0,
                "source": "Browser Input Monitor",
                "metadata": {
                    "pasteLength": browser_state.get("pasteLength", 0),
                    "target": browser_state.get("pasteTarget", "code_editor"),
                    "disclaimer": "No keystroke logging or password collection performed."
                }
            })

        # -------------------------------------------------------------
        # Feature 14: Network & Technical Interruptions (Isolated)
        # -------------------------------------------------------------
        if not is_online:
            self.technical_status = "OFFLINE"
            self.total_offline_seconds += 1.0
        else:
            self.technical_status = "STABLE"

        # -------------------------------------------------------------
        # Temporal Behaviour Chain Detection
        # -------------------------------------------------------------
        is_mobile_pattern = (
            has_phone and
            self.phone_streak >= 1.0 and
            (self.gaze_down_streak >= 1.0 or self.head_down_streak >= 1.0)
        )
        if is_mobile_pattern and self.tab_switch_count > 0 and self.phone_streak >= 3.0:
            chain_id = f"chain_{int(now)}"
            chain_obj = {
                "id": chain_id,
                "startTime": datetime.fromtimestamp(now - 15, timezone.utc).isoformat(),
                "endTime": datetime.fromtimestamp(now, timezone.utc).isoformat(),
                "eventsInvolved": ["TAB_SWITCH", "GAZE_DOWN", "PHONE_DETECTED", "HEAD_DOWN"],
                "eventOrder": ["TAB_SWITCH", "GAZE_DOWN", "PHONE_DETECTED", "MOBILE_ASSISTED_SUSPICIOUS_PATTERN"],
                "combinedRisk": 92.0,
                "evidenceReferences": [],
                "description": "Correlated sequence: candidate switched tab, redirected gaze downward, and accessed a mobile device for >3s."
            }
            if not any(c.get("description") == chain_obj["description"] for c in self.detected_chains[-3:]):
                self.detected_chains.append(chain_obj)
                generated_events.append({
                    "eventType": "BEHAVIOUR_CHAIN_DETECTED",
                    "confidence": 0.94,
                    "duration": 15.0,
                    "riskContribution": 92.0,
                    "source": "ContextEngine",
                    "metadata": chain_obj
                })

        # -------------------------------------------------------------
        # Dual Risk Scoring: Contextual Suspicion vs Evidence Confidence
        # -------------------------------------------------------------
        raw_suspicion = 0.0
        contributing = []
        conf_weights = []

        if is_mobile_pattern:
            raw_suspicion += 85.0
            conf_weights.append((phone_conf or 0.9, 0.45))
            contributing.append({"factor": "Mobile Assisted Pattern", "contribution": 45, "confidence": phone_conf or 0.9})
        elif has_phone and self.phone_streak >= 1:
            raw_suspicion += 60.0
            conf_weights.append((phone_conf or 0.85, 0.35))
            contributing.append({"factor": "Mobile Phone Visible", "contribution": 30, "confidence": phone_conf or 0.85})

        if self.multi_person_streak >= 2:
            raw_suspicion += 85.0
            conf_weights.append((0.94, 0.40))
            contributing.append({"factor": "Multiple Persons Confirmed", "contribution": 35, "confidence": 0.94})

        if self.absence_state == "ABSENT":
            raw_suspicion += 55.0
            conf_weights.append((0.96, 0.30))
            contributing.append({"factor": "Candidate Left Camera View", "contribution": 25, "confidence": 0.96})

        if self.book_streak >= 2:
            raw_suspicion += 50.0
            conf_weights.append((book_conf or 0.85, 0.25))
            contributing.append({"factor": "Prohibited Notes / Book Detected", "contribution": 20, "confidence": book_conf or 0.85})

        if self.camera_obscured:
            raw_suspicion += 45.0
            conf_weights.append((0.95, 0.25))
            contributing.append({"factor": "Camera Obscured or Tampered", "contribution": 25, "confidence": 0.95})

        if repeated_movement_alert:
            raw_suspicion += 35.0
            conf_weights.append((0.88, 0.20))
            contributing.append({"factor": "Repeated Left/Right/Down Gaze Shifts", "contribution": 18, "confidence": 0.88})

        if self.voice_streak >= 2:
            raw_suspicion += 30.0
            conf_weights.append((0.85, 0.20))
            contributing.append({"factor": "Voice Activity Detected (VAD)", "contribution": 15, "confidence": 0.85})

        if self.tab_switch_count >= 2:
            raw_suspicion += min(35.0, self.tab_switch_count * 10.0)
            conf_weights.append((1.0, 0.20))
            contributing.append({"factor": "Exam Window Focus Loss / Tab Switch", "contribution": 20, "confidence": 1.0})

        if self.large_paste_count >= 1:
            raw_suspicion += min(35.0, self.large_paste_count * 18.0)
            conf_weights.append((1.0, 0.25))
            contributing.append({"factor": "Unusually Large External Paste", "contribution": 20, "confidence": 1.0})

        if self.identity_mismatch_count >= 1:
            raw_suspicion += 60.0
            conf_weights.append((0.94, 0.35))
            contributing.append({"factor": "Biometric Identity Review Flagged", "contribution": 35, "confidence": 0.94})

        # Calculate Overall Evidence Confidence
        if conf_weights:
            total_w = sum(w for _, w in conf_weights)
            self.evidence_confidence = round(sum(c * w for c, w in conf_weights) / total_w, 2)
        else:
            self.evidence_confidence = 0.95

        # Smoothing on Contextual Suspicion Score
        alpha = 0.30
        self.suspicion_score = round(self.suspicion_score * (1 - alpha) + raw_suspicion * alpha, 1)
        self.suspicion_score = max(0.0, min(100.0, self.suspicion_score))

        # Risk Category
        score = self.suspicion_score
        if score >= self.thresholds["critical"]: risk_level = "CRITICAL"
        elif score >= self.thresholds["medium"]: risk_level = "HIGH"
        elif score >= self.thresholds["low"]: risk_level = "MEDIUM"
        else: risk_level = "LOW"

        dominant_contexts = [c["factor"] for c in contributing[:3]]
        dominant_str = " + ".join(dominant_contexts) if dominant_contexts else "Normal Focused Examination"

        diff_explanation = (
            f"Evidence Confidence ({int(self.evidence_confidence*100)}%) measures physical detector precision, "
            f"whereas Contextual Suspicion Score ({int(self.suspicion_score)}%) models academic dishonesty risk "
            f"across temporal correlations, durations, and co-occurring events. Technical network drops are isolated."
        )

        # -------------------------------------------------------------
        # Fourteen Full Detections Status Specification (Features 1-14)
        # -------------------------------------------------------------
        fourteen_detections = {
            "repeatedLooking": {
                "id": "feature_1",
                "featureNumber": 1,
                "label": "Repeated Left, Right & Down Looking",
                "detected": repeated_movement_alert,
                "movementCount": movement_tracking_data.get("movementCount", len(self.movement_episodes)),
                "status": "alert" if repeated_movement_alert else ("warning" if (head_dir != "center" or not gaze_on_screen) else "normal"),
                "statusText": f"Repeated Glance Alert ({movement_tracking_data.get('movementCount', 0)})" if repeated_movement_alert else ("Gaze Diverted" if not gaze_on_screen else "Gaze Focused"),
                "tool": "MediaPipe Face Landmarker (478 pts) + cv2.solvePnP",
                "disclaimer": "Gaze direction is a behavioral indicator, not proof of cheating."
            },
            "bookNotesDetection": {
                "id": "feature_2",
                "featureNumber": 2,
                "label": "Book, Notes, and Paper Detection",
                "detected": has_book and (self.book_streak >= 2.0),
                "confidence": round(book_conf, 2),
                "status": "alert" if (has_book and self.book_streak >= 2.0) else "normal",
                "statusText": "Prohibited Book/Notes in View" if has_book else "Zero Unauthorized Materials",
                "tool": "Ultralytics YOLOv8 Object Detection",
                "isConfirmedUnauthorized": False,
                "requiresFacultyVerification": True
            },
            "externalAiUsage": {
                "id": "feature_3",
                "featureNumber": 3,
                "label": "External AI or Chatbot Usage",
                "detected": browser_state.get("extensionViolation", False),
                "supportStatus": "PARTIALLY_SUPPORTED",
                "status": "alert" if browser_state.get("extensionViolation", False) else "normal",
                "statusText": "Standard Browser Sandbox (Focus/Paste Guard Active)",
                "tool": "Browser Visibility API + Secure Browser Integration",
                "disclaimer": "Webcam footage alone cannot identify chatbot usage; monitored via permitted browser focus and clipboard events."
            },
            "externalWebsiteSearch": {
                "id": "feature_4",
                "featureNumber": 4,
                "label": "External Website or Search Usage",
                "detected": self.tab_switch_count > 0 or not tab_active,
                "tabSwitches": self.tab_switch_count,
                "awayDurationSec": round(away_duration, 1),
                "status": "alert" if not tab_active else ("warning" if self.tab_switch_count > 0 else "normal"),
                "statusText": f"Tab Switch Recorded ({self.tab_switch_count})" if self.tab_switch_count > 0 else "Exam Page Active & Focused",
                "tool": "Browser Visibility API & Window Focus Events",
                "disclaimer": "Monitors exam page visibility without accessing private tabs or browsing history."
            },
            "secondMonitorDevice": {
                "id": "feature_5",
                "featureNumber": 5,
                "label": "Second Monitor or Additional Device",
                "detected": has_phone or has_laptop or has_tv or is_extended_screen,
                "status": "alert" if (has_phone or has_laptop or has_tv) else ("warning" if is_extended_screen else "normal"),
                "statusText": "External Device Visible" if (has_phone or has_laptop or has_tv) else ("Extended Screen Detected" if is_extended_screen else "Single Display Verified"),
                "tool": "YOLOv8 Object Detection + Screen Details API",
                "disclaimer": "Detections limited to camera view and permitted display APIs."
            },
            "unauthorizedAudioDevice": {
                "id": "feature_6",
                "featureNumber": 6,
                "label": "Unauthorized Audio or Communication Device",
                "detected": hand_near_ear and (self.hand_near_ear_streak >= 2.0),
                "status": "alert" if (hand_near_ear and self.hand_near_ear_streak >= 2.0) else ("warning" if (hand_near_ear and self.hand_near_ear_streak >= 1.0) else "normal"),
                "statusText": "Alert: Hand Near Ear / Holding Device" if (hand_near_ear and self.hand_near_ear_streak >= 2.0) else ("Checking Hand Proximity..." if (hand_near_ear and self.hand_near_ear_streak >= 1.0) else "Ear Area Clear"),
                "tool": "MediaPipe Hand Landmarker (21 3D joints) + Proximity Analysis",
                "disclaimer": "Invisible earpieces cannot be reliably proven from audio or vision alone."
            },
            "suspiciousInputActivity": {
                "id": "feature_7",
                "featureNumber": 7,
                "label": "Suspicious External Input / Large Paste",
                "detected": self.large_paste_count > 0 or self.clipboard_event_count > 0,
                "largePastes": self.large_paste_count,
                "clipboardEvents": self.clipboard_event_count,
                "status": "alert" if self.large_paste_count > 0 else ("warning" if self.clipboard_event_count > 0 else "normal"),
                "statusText": f"Large Paste Flagged ({self.large_paste_count})" if self.large_paste_count > 0 else "Standard Keyboard Input",
                "tool": "Browser Input & Clipboard Event Interceptors",
                "disclaimer": "Privacy-preserving: passwords and regular keystrokes are never logged."
            },
            "multiplePeople": {
                "id": "feature_8",
                "featureNumber": 8,
                "label": "Multiple People Detection",
                "detected": self.multi_person_streak >= 2.5 and faces_count > 1,
                "personCount": faces_count,
                "status": "alert" if (self.multi_person_streak >= 2.5 and faces_count > 1) else "normal",
                "statusText": f"Alert: {faces_count} Persons in Frame" if (self.multi_person_streak >= 2.5 and faces_count > 1) else "Single Candidate Verified",
                "tool": "Ultralytics YOLOv8 Person Detection + MediaPipe",
                "disclaimer": "Confirmed across consecutive frames to prevent momentary artifacts."
            },
            "studentLeavingView": {
                "id": "feature_9",
                "featureNumber": 9,
                "label": "Student Leaving the Camera View",
                "detected": self.absence_state == "ABSENT",
                "state": self.absence_state,
                "totalAbsenceSec": round(self.total_absence_duration, 1),
                "gracePeriodSec": self.absence_grace_period_sec,
                "status": "alert" if self.absence_state == "ABSENT" else ("warning" if self.absence_state == "GRACE_PERIOD" else "normal"),
                "statusText": "Alert: Student Absent from Workstation" if self.absence_state == "ABSENT" else ("Grace Period Active" if self.absence_state == "GRACE_PERIOD" else "Candidate In View"),
                "tool": "MediaPipe FaceMesh + Person Tracker",
                "disclaimer": "Grace period applied; continuous absence deduplicated into a single episode."
            },
            "faceMissing": {
                "id": "feature_10",
                "featureNumber": 10,
                "label": "Face Missing Detection",
                "detected": not face_detected or self.no_face_streak >= 3.0,
                "streakSec": int(self.no_face_streak),
                "status": "alert" if (not face_detected and self.no_face_streak >= 3.0) else "normal",
                "statusText": "Alert: Face Absent from Frame" if (not face_detected and self.no_face_streak >= 3.0) else "Face Clearly Detected",
                "tool": "OpenCV + MediaPipe Face Landmarker",
                "disclaimer": "Grace period protects against camera startup and temporary lighting shifts."
            },
            "identityMismatch": {
                "id": "feature_11",
                "featureNumber": 11,
                "label": "Identity Mismatch Detection",
                "detected": self.identity_mismatch_count > 0,
                "confidence": round(float(vision_res.get("identityConfidence", self.identity_confidence)), 2),
                "status": "alert" if self.identity_mismatch_count > 0 else "normal",
                "statusText": "Marked for Manual Identity Review" if self.identity_mismatch_count > 0 else "Biometric Verified",
                "tool": "Face Verification + Quality Gating",
                "disclaimer": "Marked for manual faculty review only. Automatic penalties prohibited."
            },
            "cameraBlockingTampering": {
                "id": "feature_12",
                "featureNumber": 12,
                "label": "Camera Blocking or Tampering",
                "detected": self.camera_obscured or self.camera_frozen,
                "isObscured": self.camera_obscured,
                "isFrozen": self.camera_frozen,
                "cameraStatus": self.camera_status,
                "status": "alert" if (self.camera_obscured or self.camera_frozen) else "normal",
                "statusText": f"Tampering Alert: {self.camera_status}" if (self.camera_obscured or self.camera_frozen) else "Camera Stream Operational",
                "tool": "OpenCV Frame Brightness, Blur & Frame Difference",
                "disclaimer": "Distinguishes dark/obscured image from frozen stream or disconnected camera."
            },
            "voiceVerbalAssistance": {
                "id": "feature_13",
                "featureNumber": 13,
                "label": "Voice Activity Detection (VAD)",
                "detected": voice_active,
                "audioLevel": round(audio_rms, 2),
                "voiceStreakSec": int(self.voice_streak),
                "status": "alert" if self.voice_streak >= 2.0 else ("warning" if voice_active else "normal"),
                "statusText": "Speech / Audible Voice Detected" if voice_active else "Ambient Audio Normal",
                "tool": "WebAudio RMS & Spectral Energy VAD",
                "disclaimer": "VAD tracks acoustic speech presence, not proof of second speaker. No raw audio stored."
            },
            "networkInterruptions": {
                "id": "feature_14",
                "featureNumber": 14,
                "label": "Network & Session Interruptions",
                "detected": not is_online or self.network_incident_count > 0,
                "isOnline": is_online,
                "incidentCount": self.network_incident_count,
                "totalOfflineSec": round(self.total_offline_seconds, 1),
                "status": "alert" if not is_online else ("warning" if self.network_incident_count > 0 else "normal"),
                "statusText": "Network Offline" if not is_online else (f"Instability Logged ({self.network_incident_count})" if self.network_incident_count > 0 else "Connection Stable"),
                "tool": "Browser Online/Offline API + WebSocket Heartbeat",
                "disclaimer": "Technical connectivity problems are tracked separately from cheating risk."
            }
        }

        # Backward compatible tenDetections alias mapping
        ten_detections = {
            "faceDetection": fourteen_detections["faceMissing"],
            "multiplePersonDetection": fourteen_detections["multiplePeople"],
            "faceMissingDetection": fourteen_detections["studentLeavingView"],
            "identityMismatch": fourteen_detections["identityMismatch"],
            "eyeGazeDetection": fourteen_detections["repeatedLooking"],
            "headPoseDetection": {
                "direction": head_dir,
                "pitch": round(head_pitch, 1),
                "yaw": round(head_yaw, 1),
                "label": f"Head Pose: {head_dir.upper()}" if head_dir != "center" else "Head Centered",
                "status": "warning" if head_dir != "center" else "normal",
                "tool": "MediaPipe + OpenCV (cv2.solvePnP Euler Angles)"
            },
            "handActivityDetection": fourteen_detections["unauthorizedAudioDevice"],
            "mobilePhoneDetection": {
                "detected": has_phone,
                "confidence": round(phone_conf, 2),
                "label": f"Phone Detected ({int(phone_conf*100)}%)" if has_phone else "No Phone in View",
                "status": "alert" if has_phone else "normal",
                "tool": "Ultralytics YOLOv8"
            },
            "prohibitedObjectDetection": fourteen_detections["bookNotesDetection"],
            "mobileGazeCorrelation": {
                "detected": is_mobile_pattern,
                "label": "Mobile + Gaze Correlated" if is_mobile_pattern else "No Correlation Anomaly",
                "status": "alert" if is_mobile_pattern else "normal",
                "tool": "YOLOv8 + MediaPipe + Context Engine"
            },
            "behaviourDeviation": {
                "detected": any(e.get("eventType") == "BEHAVIOUR_DEVIATION" for e in generated_events),
                "label": "Deviation from Baseline" if any(e.get("eventType") == "BEHAVIOUR_DEVIATION" for e in generated_events) else "Normal Exam Baseline",
                "status": "warning" if any(e.get("eventType") == "BEHAVIOUR_DEVIATION" for e in generated_events) else "normal",
                "tool": "Python + Context-Aware Behaviour Engine"
            }
        }

        return {
            "suspicionScore": self.suspicion_score,
            "evidenceConfidence": round(self.evidence_confidence * 100, 1),
            "riskLevel": risk_level,
            "dominantContext": dominant_str,
            "contributingEvents": contributing,
            "generatedEvents": generated_events,
            "behaviourChains": self.detected_chains[-5:],
            "baselineEstablished": self.baseline_established,
            "differenceExplanation": diff_explanation,
            "fourteenDetections": fourteen_detections,
            "tenDetections": ten_detections,
            "technicalMetrics": {
                "isOnline": is_online,
                "technicalStatus": self.technical_status,
                "incidentCount": self.network_incident_count,
                "totalOfflineSec": round(self.total_offline_seconds, 1),
                "reconnectCount": self.reconnect_count
            },
            "metrics": {
                "phoneStreakSec": int(self.phone_streak),
                "lookAwayStreakSec": int(self.look_away_streak),
                "gazeDownStreakSec": int(self.gaze_down_streak),
                "headDownStreakSec": int(self.head_down_streak),
                "voiceStreakSec": int(self.voice_streak),
                "multiPersonStreakSec": int(self.multi_person_streak),
                "noFaceStreakSec": int(self.no_face_streak),
                "totalAbsenceSec": int(self.total_absence_duration),
                "tabSwitches": self.tab_switch_count,
                "largePastes": self.large_paste_count
            }
        }

    def ingest_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Directly ingests a discrete ProctorEvent across all 14 monitoring features
        and updates temporal risk state.
        """
        ev_type = str(event.get("eventType", "")).upper()
        duration = float(event.get("duration", 1.0))
        confidence = float(event.get("confidence", 0.9))

        vision_mock: Dict[str, Any] = {"faceDetected": True, "facesCount": 1, "objects": []}
        audio_rms = 0.0
        browser_state: Dict[str, Any] = {"tabActive": True, "screenSharing": True, "isOnline": True}

        # Feature 1: Gaze & Movement
        if ev_type in ("LOOKING_AWAY", "GAZE_AWAY", "EYE_GAZE_AWAY", "REPEATED_LOOK_AWAY"):
            self.look_away_streak += duration
            vision_mock["headPose"] = {"pitch": -20.0, "yaw": 25.0, "direction": "down_left"}
            vision_mock["gaze"] = {"onScreen": False, "gazeDirection": "away", "confidence": confidence}
        elif ev_type in ("GAZE_DOWN", "HEAD_POSE_DOWN", "HEAD_DOWN"):
            self.head_down_streak += duration
            self.gaze_down_streak += duration
            vision_mock["headPose"] = {"pitch": -30.0, "direction": "down"}
            vision_mock["gaze"] = {"onScreen": False, "gazeDirection": "down", "confidence": confidence}
        elif ev_type in ("GAZE_SIDE", "HEAD_LEFT", "HEAD_RIGHT"):
            self.look_away_streak += duration
            vision_mock["headPose"] = {"yaw": 35.0 if "RIGHT" in ev_type else -35.0, "direction": "right" if "RIGHT" in ev_type else "left"}
            vision_mock["gaze"] = {"onScreen": False, "gazeDirection": "side", "confidence": confidence}

        # Feature 2: Book / Notes
        elif ev_type in ("PROHIBITED_OBJECT_DETECTED", "BOOK_DETECTED", "NOTES_DETECTED", "BOOK_NOTES_DETECTED"):
            vision_mock["objects"].append({"label": "book", "confidence": confidence})
            self.book_streak += duration
            self.book_detected_count += 1

        # Feature 3: External AI
        elif ev_type in ("EXTERNAL_AI_USAGE", "EXTENSION_POLICY_VIOLATION"):
            browser_state["extensionViolation"] = True
            browser_state["clipboardAttempt"] = True

        # Feature 4: External Website & Navigation
        elif ev_type in ("TAB_SWITCH", "EXTERNAL_WEBSITE_SEARCH", "WINDOW_BLUR"):
            self.tab_switch_count += 1
            browser_state["tabActive"] = False
            browser_state["awayDuration"] = duration
        elif ev_type == "FULLSCREEN_EXIT":
            self.fullscreen_exit_count += 1

        # Feature 5: Second Monitor & Device
        elif ev_type in ("PHONE_DETECTED", "PHONE_IN_FRAME", "SECOND_DEVICE_DETECTED"):
            vision_mock["objects"].append({"label": "cell phone", "confidence": confidence})
            self.phone_streak += duration
            self.second_device_detected = True
        elif ev_type == "SECOND_MONITOR_CONNECTED":
            browser_state["isExtendedScreen"] = True
            self.multi_screen_connected = True

        # Feature 6: Unauthorized Audio
        elif ev_type in ("HAND_NEAR_EAR", "UNAUTHORIZED_AUDIO_DEVICE"):
            vision_mock["hands"] = {"detected": True, "nearEar": True, "suspicious": True}
            self.hand_near_ear_streak += duration

        # Feature 7: Input & Large Paste
        elif ev_type in ("COPY_ATTEMPT", "PASTE_ATTEMPT", "CUT_ATTEMPT"):
            self.clipboard_event_count += 1
            browser_state["clipboardAttempt"] = True
        elif ev_type == "LARGE_PASTE_OPERATION":
            self.large_paste_count += 1
            browser_state["largePaste"] = True
            browser_state["pasteLength"] = event.get("metadata", {}).get("pasteLength", 200)

        # Feature 8: Multiple People
        elif ev_type in ("MULTIPLE_PERSON", "MULTIPLE_PERSONS", "MULTIPLE_PEOPLE_DETECTED"):
            vision_mock["facesCount"] = 2
            self.multi_person_streak += duration

        # Feature 9: Student Leaving Camera View
        elif ev_type in ("STUDENT_LEAVING_CAMERA_VIEW", "STUDENT_ABSENT"):
            vision_mock["faceDetected"] = False
            vision_mock["facesCount"] = 0
            self.absence_state = "ABSENT"
            self.total_absence_duration += duration

        # Feature 10: Face Missing
        elif ev_type in ("FACE_MISSING", "NO_FACE"):
            vision_mock["faceDetected"] = False
            vision_mock["facesCount"] = 0
            self.no_face_streak += duration

        # Feature 11: Identity Mismatch
        elif ev_type == "IDENTITY_MISMATCH":
            self.identity_mismatch_count += 1
            self.identity_status = "NEEDS_MANUAL_REVIEW"

        # Feature 12: Camera Obscured / Tampering
        elif ev_type in ("CAMERA_OBSCURED", "VIDEO_INTERRUPTED"):
            self.camera_obscured = (ev_type == "CAMERA_OBSCURED")
            self.camera_frozen = (ev_type == "VIDEO_INTERRUPTED")
            vision_mock["cameraStatus"] = {
                "isObscured": self.camera_obscured,
                "isFrozen": self.camera_frozen,
                "status": ev_type
            }

        # Feature 13: Voice Activity
        elif ev_type in ("VOICE_ACTIVITY", "AUDIO_SPOKEN", "VOICE_DETECTED", "REPEATED_VOICE_ACTIVITY"):
            audio_rms = 0.55
            self.voice_streak += duration
            self.voice_event_count += 1

        # Feature 14: Technical Interruptions (Isolated)
        elif ev_type in ("NETWORK_DISCONNECTED", "NETWORK_UNSTABLE", "WEBSOCKET_DISCONNECTED"):
            self.network_incident_count += 1
            browser_state["isOnline"] = False
            self.technical_status = "OFFLINE"
        elif ev_type in ("NETWORK_RECONNECTED", "WEBSOCKET_RECONNECTED"):
            self.reconnect_count += 1
            browser_state["isOnline"] = True
            self.technical_status = "STABLE"

        return self.evaluate(vision_mock, audio_rms, browser_state)

# Aliases for backward compatibility
PythonContextEngine = ContextAwareRiskEngine
