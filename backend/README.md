# NextGen AI Online Exam Proctoring Backend

Production FastAPI server providing real-time computer vision inference with **Ultralytics YOLOv8**, **MediaPipe (FaceMesh, Iris Gaze, 3D Head Pose, Hands)**, **Context-Aware AI Temporal Engine**, and **Explainable AI (XAI)**.

---

## Features

- **YOLOv8 Object Detection**: High-speed detection of mobile phones, books, notes, laptops, and multiple people.
- **MediaPipe 3D FaceMesh & Gaze**: 478 3D landmarks, iris gaze tracking vector calculation, and SolvePnP 3D Head Pose Euler angles (Pitch, Yaw, Roll).
- **MediaPipe Hands**: 21 3D joints per hand, detecting hand-to-ear, hand-to-face, and below-desk positioning.
- **Context-Aware Temporal Engine**: Rolling sliding window correlation (e.g., gaze looking down + hand below desk + phone detected = high confidence phone cheating).
- **Explainable AI (XAI)**: SHAP-style mathematical factor attribution decomposition (%) and natural language contextual reasoning.
- **WebSocket Streaming**: High-throughput `/api/v1/ws/proctor` for continuous camera frame inference.

---

## Quickstart

### 1. Install Dependencies

```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Run Backend Server

```bash
python run_backend.py
```

Or directly with Uvicorn:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive Swagger API docs will be available at `http://127.0.0.1:8000/docs`.

---

## Docker Deployment

```bash
docker build -t nextgen-proctor-ai-backend .
docker run -p 8000:8000 nextgen-proctor-ai-backend
```
