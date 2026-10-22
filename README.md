# 🛡️ NextGen AI Online Examination & Multimodal Proctoring System

<p align="center">
  <a href="https://proctoring-exam-final.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20Website-proctoring--exam--final.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" />
  </a>
  <a href="https://github.com/GOPINATH1410-captain/Proctoring-Exam-Final">
    <img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" />
  </a>
  <img src="https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%20%7C%20TanStack-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/AI%20Engine-YOLOv8%20%7C%20MediaPipe%20%7C%20OpenCV-FF6F00?style=for-the-badge&logo=pytorch&logoColor=white" alt="PyTorch & YOLO" />
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%7C%20WebSockets-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
</p>

---

## 📌 Quick Access Links

| Resource | Link | Description |
| :--- | :--- | :--- |
| 🌐 **Live Web Application** | [https://proctoring-exam-final.vercel.app/](https://proctoring-exam-final.vercel.app/) | Production frontend hosted on Vercel |
| 📂 **GitHub Repository** | [https://github.com/GOPINATH1410-captain/Proctoring-Exam-Final](https://github.com/GOPINATH1410-captain/Proctoring-Exam-Final) | Complete open-source project code |
| 🎓 **Student Exam Portal** | [Live Portal: `/student`](https://proctoring-exam-final.vercel.app/student) | Student dashboard & live proctored environment |
| 🔍 **Faculty Live Console** | [Live Console: `/faculty`](https://proctoring-exam-final.vercel.app/faculty) | Real-time candidate monitoring & risk telemetry |
| 📊 **Integrity Reports & Audits** | [Audit Portal: `/faculty/reports`](https://proctoring-exam-final.vercel.app/faculty/reports) | Evidence-backed forensic report generation |

---

## 📖 Project Overview

**NextGen AI Proctoring** is an enterprise-grade, state-of-the-art online examination and integrity auditing platform. Built to solve the security flaws of conventional remote testing, the platform fuses **computer vision, acoustic monitoring, browser sandboxing, contextual behavioural modeling, and Explainable AI (XAI)** into an automated 26-point detection matrix.

Instead of outputting an arbitrary "cheating percentage," NextGen calculates a transparent **0–100 Integrity Risk Score** backed by timestamped video frames, confidence metrics, and human-readable forensic justifications powered by Google Gemini and deep learning algorithms.

---

## 🌟 Key Features

### 1. 🤖 Multi-Modal AI Detection (26 Core Modules)
* **Vision & Head-Pose:** MediaPipe 468-point 3D Face Mesh tracking yaw, pitch, and roll via `cv2.solvePnP` to identify off-screen glances.
* **Deep Learning Object Detection:** Custom Ultralytics YOLOv8 inference spotting smartphones, printed books, earphones, and secondary occupants in the camera frame.
* **Continuous Biometric Verification:** Periodic face embedding checks against baseline registration photos to detect identity swapping.
* **Acoustic Surveillance:** High-frequency Web Audio API spectrum analysis detecting whispering, speech patterns, and background dictation.
* **Event Sequence Fusion:** Context engine correlating micro-actions (e.g., eye gaze deviation downwards + hand displacement = high-confidence phone usage).

### 2. 🔒 Comprehensive Browser Lockdown
* Fullscreen enforcement with automated penalty timers on exit attempts.
* Multi-monitor and tab-switch interception via Page Visibility API.
* Clipboard restrictions blocking copy, cut, paste, and developer shortcut combinations (`F12`, `Ctrl+Shift+I`, `Alt+Tab`).
* Screen-share permission verification and disconnect detection.

### 3. 📝 Versatile Examination Engine
* Supports rich **Multiple Choice Questions (MCQ)** and **Interactive Programming Challenges**.
* In-browser live multi-language code runner (Python, JavaScript, TypeScript, C++, Java).
* Autosave telemetry and resilient offline queues ensuring zero answer or event loss during network interruptions.

### 4. 👨‍🏫 Live Faculty Command Center
* Multi-student live status grid updating at 1 Hz via high-throughput WebSockets.
* Instant visual warnings and candidate risk tier categorization (Low, Moderate, High, Severe).
* 3-column chronological audit view with synchronized webcam thumbnails and flag timestamps.
* One-click PDF & CSV integrity report generation for academic committees.

---

## 🛠️ Complete 26-Detection Architecture

The platform's 26 automated detection modules operate in concert:

| No. | Category | Detection Module | Technology Stack |
| :---: | :--- | :--- | :--- |
| **1** | **Camera / Vision** | Face Detection & Bounding | OpenCV + MediaPipe Face Mesh |
| **2** | **Camera / Vision** | Multiple Person in Frame | Ultralytics YOLOv8 + OpenCV |
| **3** | **Camera / Vision** | Face Absence / Camera Covered | MediaPipe Confidence Thresholding |
| **4** | **Camera / Vision** | Biometric Identity Swap | Face Embeddings + Vector Distance |
| **5** | **Camera / Vision** | Eye Gaze & Iris Deviation | MediaPipe Iris Landmarker |
| **6** | **Camera / Vision** | 3D Head Pose Angle (Yaw/Pitch/Roll) | MediaPipe + `cv2.solvePnP` |
| **7** | **Camera / Vision** | Smartphone & Mobile Phone Presence | Ultralytics YOLOv8 (COCO & Custom) |
| **8** | **Camera / Vision** | Prohibited Materials (Books, Notes) | YOLOv8 Object Classification |
| **9** | **Camera / Vision** | Gaze-to-Hand Correlation | YOLOv8 Bounding + MediaPipe Fusion |
| **10** | **Camera / Vision** | Suspicious Posture Shift | 33-point MediaPipe BlazePose |
| **11** | **Acoustic / Audio** | Voice Activity Detection (VAD) | Web Audio API + AudioContext RMS |
| **12** | **Acoustic / Audio** | Continuous / Dictation Speech | Rolling Temporal Frequency Spectrum |
| **13** | **Browser Lockdown** | Tab Switch & Window Blur | Page Visibility API + Window Blur |
| **14** | **Browser Lockdown** | Copy Attempt | Clipboard Event Listeners |
| **15** | **Browser Lockdown** | Paste Attempt | Clipboard Event Listeners |
| **16** | **Browser Lockdown** | Cut Attempt | Clipboard Event Listeners |
| **17** | **Browser Lockdown** | Screen Share Terminated | MediaStream `track.onended` Event |
| **18** | **Browser Lockdown** | Fullscreen Exit Attempt | Fullscreen Change API |
| **19** | **Browser Lockdown** | Network Disconnection | `navigator.onLine` + Socket Timeout |
| **20** | **Browser Lockdown** | Network Latency & Ping Spike | Heartbeat Latency Tracking |
| **21** | **Context Engine** | Suspicious Chain Sequence | Temporal Multi-Event Windowing |
| **22** | **Context Engine** | Multi-Factor Risk Synthesis | Weighted Behaviour Fusion Algorithm |
| **23** | **Context Engine** | Synchronized Timeline Correlation | Indexed Session Telemetry Store |
| **24** | **Context Engine** | Dynamic Risk Scoring (0–100%) | Calibrated Cumulative Decay Engine |
| **25** | **Context Engine** | Forensic Evidence Confidence Metric | Multi-Model Confidence Aggregation |
| **26** | **Explainable AI** | Automated Human-Readable Audit Verdict | Google Gemini / OpenAI XAI Engine |

---

## 🏛️ System Architecture

```text
       +--------------------------------------------------------------+
       |                  NextGen AI Proctor Client                   |
       |     React 19 + Vite + TanStack Start (Hosted on Vercel)      |
       +-------------------------------+------------------------------+
                                       |
                   HTTP / REST (JSON)  |  WebSockets (ws://)
                                       v
       +--------------------------------------------------------------+
       |                 FastAPI Real-Time AI Backend                 |
       |                 (Python 3.11 + Uvicorn)                      |
       +-------------------------------+------------------------------+
                                       |
             +-------------------------+-------------------------+
             |                         |                         |
             v                         v                         v
+-------------------------+ +---------------------+ +----------------------+
|     Ultralytics YOLO    | | Google MediaPipe    | |   XAI Engine (Gemini)  |
| (Phones, Books, People) | | (Iris, Pose, Face)  | |  (Audit Report Gen)    |
+-------------------------+ +---------------------+ +----------------------+
```

---

## 💻 Tech Stack

* **Frontend:** React 19, TypeScript, Vite, TanStack Start, TanStack Router, Tailwind CSS, Lucide Icons, Recharts, Sonner.
* **Backend:** Python 3.11, FastAPI, Uvicorn, WebSockets, PyTorch (CPU-optimized), OpenCV (`opencv-python-headless`), Google MediaPipe, Ultralytics YOLOv8.
* **Database & Cloud:** MongoDB / Firebase, Google Gemini API, Docker, Vercel Build Output API v3.

---

## 🚀 Getting Started Locally

### 1. Clone the Repository
```bash
git clone https://github.com/GOPINATH1410-captain/Proctoring-Exam-Final.git
cd Proctoring-Exam-Final
```

### 2. Frontend Setup
```bash
# Install node dependencies
npm install

# Start local frontend development server
npm run dev
```
*Frontend runs at: `http://localhost:5173` (or `http://localhost:3000`)*

### 3. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment (Optional but recommended)
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate # macOS / Linux

# Install Python requirements
pip install -r requirements.txt

# Start FastAPI server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend runs at: `http://localhost:8000`*  
*Swagger Documentation: `http://localhost:8000/docs`*

---

## 🌐 Live Application Portals

Explore the live portals deployed at **[proctoring-exam-final.vercel.app](https://proctoring-exam-final.vercel.app/)**:

* **Landing & Features:** `/`
* **Student Candidate Portal:** `/student`
* **11-Point Environment Pre-Check:** `/student/precheck?exam=e1`
* **Live Monitored Exam Room:** `/student/exam?exam=e1`
* **Faculty Real-Time Dashboard:** `/faculty`
* **3-Column Session Audit:** `/faculty/session/s-test-1`
* **Integrity Reports & Analytics:** `/faculty/reports`

---

## 📄 License & Attribution

Developed with ❤️ by **[GOPINATH1410-captain](https://github.com/GOPINATH1410-captain)**.  
Designed for universities, accreditation institutions, and enterprise certification providers.
