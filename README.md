# NextGen AI Online Examination and Multimodal Proctoring System

An enterprise-grade, real-time AI online examination platform supporting MCQ and multi-language programming exams with multimodal proctoring powered by **YOLOv8, Google MediaPipe, OpenCV, Web Audio API, Context-Aware Behaviour Fusion, and Explainable AI (XAI)**.

---

## 🛠️ Complete Tools & Technologies Architecture

All 26 detections are active and unified under the **Context-Aware Behaviour & Risk Engine**:

### 1. AI / Camera Detections (10 Modules)
| No. | Detection | Tool / Technology | Implementation Source |
| :---: | :--- | :--- | :--- |
| **1** | Face Detection | **OpenCV + MediaPipe Face Detection** | `backend/ai_models/mediapipe_tracker.py` |
| **2** | Multiple Person Detection | **YOLOv8 + OpenCV** | `backend/ai_models/yolo_detector.py` |
| **3** | Face Missing Detection | **MediaPipe + OpenCV** | `backend/ai_models/mediapipe_tracker.py` |
| **4** | Identity Mismatch | **Face Recognition + OpenCV / Face Embeddings** | `backend/main.py` (`/api/v1/face_verify`) |
| **5** | Eye/Gaze Detection | **MediaPipe Face Landmarker / Iris + OpenCV** | `src/lib/realtime-ai-engine.ts` |
| **6** | Head Pose Detection | **MediaPipe + OpenCV (SolvePnP)** | `backend/ai_models/mediapipe_tracker.py` |
| **7** | Mobile Phone Detection | **Ultralytics YOLOv8** | `backend/ai_models/yolo_detector.py` |
| **8** | Prohibited Object Detection | **YOLOv8 custom-trained / COCO** | `backend/ai_models/yolo_detector.py` |
| **9** | Mobile + Gaze Correlation | **YOLOv8 + MediaPipe + Context Engine** | `backend/ai_models/context_engine.py` |
| **10** | Behaviour Deviation | **Python + Context-Aware Behaviour Engine** | `backend/ai_models/context_engine.py` |

### 2. Audio Detection (2 Modules)
| No. | Detection | Tool / Technology | Implementation Source |
| :---: | :--- | :--- | :--- |
| **11** | Voice Activity Detection | **Web Audio API + Python VAD** | `src/lib/detection-engine.ts` + `backend/ai_models/context_engine.py` |
| **12** | Repeated Voice Activity | **VAD + Python + Context Engine** | `backend/ai_models/context_engine.py` |

### 3. Browser / Exam Activity (8 Modules)
| No. | Detection | Tool / Technology | Implementation Source |
| :---: | :--- | :--- | :--- |
| **13** | Tab Switch Detection | **JavaScript Page Visibility API + Focus/Blur** | `src/routes/student/exam.tsx` |
| **14** | Copy Attempt | **JavaScript Clipboard Events** | `src/routes/student/exam.tsx` |
| **15** | Paste Attempt | **JavaScript Clipboard Events** | `src/routes/student/exam.tsx` |
| **16** | Cut Attempt | **JavaScript Clipboard Events** | `src/routes/student/exam.tsx` |
| **17** | Screen Sharing Stop | **Browser getDisplayMedia() API** | `src/routes/student/exam.tsx` |
| **18** | Fullscreen Exit | **Fullscreen API + JavaScript** | `src/routes/student/exam.tsx` |
| **19** | Network Disconnection | **navigator.onLine + WebSocket** | `src/routes/student/exam.tsx` |
| **20** | Network Instability | **WebSocket Heartbeat + Latency Monitoring** | `src/routes/student/exam.tsx` |

### 4. Advanced AI / Context Engine (6 Modules)
| No. | Detection | Tool / Technology | Implementation Source |
| :---: | :--- | :--- | :--- |
| **21** | Suspicious Behaviour Chain | **Python + Event Sequence Engine** | `backend/ai_models/context_engine.py` |
| **22** | Context-Aware Risk Detection | **Python Risk Engine** | `backend/ai_models/context_engine.py` |
| **23** | Event Correlation | **Python + Event Correlation Logic** | `src/routes/faculty/session/$id.tsx` |
| **24** | Risk Score Generation | **Python Scoring Engine** | `backend/ai_models/context_engine.py` |
| **25** | Evidence Confidence Score | **YOLO/MediaPipe Confidence + Risk Engine** | `backend/ai_models/context_engine.py` |
| **26** | AI Behaviour Explanation | **OpenAI / Gemini API** | `backend/ai_models/xai_engine.py` |

---

## 📦 Installation & Setup

### 1. Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Verify All Tools & Imports
Run the automated diagnostic tool to verify that all 26 tools are correctly imported and ready:
```bash
python verify_tools.py
```
Expected output:
```
[OK    ] OpenCV (Computer Vision)                   : 5.0.0
[OK    ] Google MediaPipe (FaceMesh/Iris/Pose)      : 0.10.35
[OK    ] Ultralytics YOLOv8 (Object Detection)      : 8.4.126
[OK    ] PyTorch (Deep Learning Backend)            : 2.13.0+cpu
[OK    ] NumPy (Vector Math & Embeddings)           : 2.5.2
[OK    ] FastAPI Framework                          : 0.116.1
[OK    ] Uvicorn Server                             : 0.35.0
[OK    ] Pydantic (Schema Validation)               : 2.11.7
[OK    ] WebSockets (Real-Time Streams)             : 17.0.1
[OK    ] ReportLab (PDF Integrity Reports)          : 5.0.0
[OK    ] HTTPX (Async HTTP Client)                  : 0.28.1
SUCCESS: ALL REQUIRED TOOLS AND MODULES ARE PROPERLY IMPORTED AND READY!
```

### 3. Run the Automated 26-Detection Suite
```bash
python scratch/verify_all_26_detections.py
```
Confirms 100% execution pass rate across all 26 detection modules.

### 4. Install Frontend Dependencies
```bash
npm install
```

---

## 🚀 Running the Application

### Start Backend Server
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Start Frontend Server
```bash
npm run dev
```

### Portals
- **Student Dashboard**: `http://localhost:5173/student`
- **Pre-Exam 11-Step Check**: `http://localhost:5173/student/precheck?exam=e1`
- **Live Exam Environment**: `http://localhost:5173/student/exam?exam=e1`
- **Faculty Live Console**: `http://localhost:5173/faculty`
- **3-Column Session Audit**: `http://localhost:5173/faculty/session/s-test-1`
- **Exam Management**: `http://localhost:5173/faculty/exams`
- **Integrity Reports**: `http://localhost:5173/faculty/reports`
- **AI Analytics**: `http://localhost:5173/faculty/analytics`
- **Proctor Settings**: `http://localhost:5173/faculty/settings`
