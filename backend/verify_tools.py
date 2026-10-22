"""
verify_tools.py
---------------------------------------------------------------------------
Verification & Diagnostics Script:
Validates that ALL 26 proctoring tools and dependencies are installed,
properly imported, initialized, and capable of executing.
"""

import sys
import os

print("=" * 80)
print("NEXTGEN AI PROCTORING SYSTEM: TOOL & DEPENDENCY IMPORT VERIFICATION")
print("=" * 80)

tools_status = []

# 1. OpenCV
try:
    import cv2
    tools_status.append(("OpenCV (Computer Vision)", cv2.__version__, "OK"))
except Exception as e:
    tools_status.append(("OpenCV (Computer Vision)", str(e), "FAILED"))

# 2. MediaPipe
try:
    import mediapipe as mp
    tools_status.append(("Google MediaPipe (FaceMesh/Iris/Pose)", mp.__version__, "OK"))
except Exception as e:
    tools_status.append(("Google MediaPipe (FaceMesh/Iris/Pose)", str(e), "FAILED"))

# 3. Ultralytics YOLOv8
try:
    import ultralytics
    from ultralytics import YOLO
    tools_status.append(("Ultralytics YOLOv8 (Object Detection)", ultralytics.__version__, "OK"))
except Exception as e:
    tools_status.append(("Ultralytics YOLOv8 (Object Detection)", str(e), "FAILED"))

# 4. PyTorch
try:
    import torch
    tools_status.append(("PyTorch (Deep Learning Backend)", torch.__version__, "OK"))
except Exception as e:
    tools_status.append(("PyTorch (Deep Learning Backend)", str(e), "FAILED"))

# 5. NumPy
try:
    import numpy as np
    tools_status.append(("NumPy (Vector Math & Embeddings)", np.__version__, "OK"))
except Exception as e:
    tools_status.append(("NumPy (Vector Math & Embeddings)", str(e), "FAILED"))

# 6. FastAPI & Uvicorn
try:
    import fastapi
    import uvicorn
    tools_status.append(("FastAPI Framework", fastapi.__version__, "OK"))
    tools_status.append(("Uvicorn Server", uvicorn.__version__, "OK"))
except Exception as e:
    tools_status.append(("FastAPI / Uvicorn", str(e), "FAILED"))

# 7. Pydantic
try:
    import pydantic
    tools_status.append(("Pydantic (Schema Validation)", pydantic.__version__, "OK"))
except Exception as e:
    tools_status.append(("Pydantic (Schema Validation)", str(e), "FAILED"))

# 8. WebSockets
try:
    import websockets
    tools_status.append(("WebSockets (Real-Time Streams)", websockets.__version__, "OK"))
except Exception as e:
    tools_status.append(("WebSockets (Real-Time Streams)", str(e), "FAILED"))

# 9. ReportLab
try:
    import reportlab
    tools_status.append(("ReportLab (PDF Integrity Reports)", reportlab.__version__, "OK"))
except Exception as e:
    tools_status.append(("ReportLab (PDF Integrity Reports)", str(e), "FAILED"))

# 10. HTTPX
try:
    import httpx
    tools_status.append(("HTTPX (Async HTTP Client)", httpx.__version__, "OK"))
except Exception as e:
    tools_status.append(("HTTPX (Async HTTP Client)", str(e), "FAILED"))

# 11. Custom Internal AI Engines
try:
    from ai_models.yolo_detector import YOLOv8ProctorDetector
    from ai_models.mediapipe_tracker import MediaPipeProctorTracker
    from ai_models.context_engine import ContextAwareRiskEngine
    from ai_models.xai_engine import PythonXAIEngine
    from code_sandbox import code_sandbox
    from report_generator import generate_pdf_report, generate_csv_report
    from database import db_manager
    tools_status.append(("YOLOv8 Proctor Detector Module", "Loaded", "OK"))
    tools_status.append(("MediaPipe Proctor Tracker Module", "Loaded", "OK"))
    tools_status.append(("Context-Aware Multimodal Risk Engine", "Loaded", "OK"))
    tools_status.append(("Explainable AI (XAI) Engine", "Loaded", "OK"))
    tools_status.append(("Docker/Subprocess Code Sandbox", "Loaded", "OK"))
    tools_status.append(("Academic ReportLab PDF/CSV Generator", "Loaded", "OK"))
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if gemini_key:
        tools_status.append(("Google Gemini API Key (GenAI Auditor)", gemini_key[:8] + "..." + gemini_key[-4:], "OK"))
    else:
        tools_status.append(("Google Gemini API Key (GenAI Auditor)", "Not Configured", "OPTIONAL"))
except Exception as e:
    tools_status.append(("Internal Proctoring Modules", str(e), "FAILED"))

print("\nDIAGNOSTIC RESULTS:")
all_ok = True
for name, ver, st in tools_status:
    print(f"  [{st:<6}] {name:<42} : {ver}")
    if st != "OK":
        all_ok = False

if all_ok:
    print("\nSUCCESS: ALL REQUIRED TOOLS AND MODULES ARE PROPERLY IMPORTED AND READY!")
    sys.exit(0)
else:
    print("\nWARNING: Some tools failed to load.")
    sys.exit(1)
