@echo off
title NextGen AI Proctoring System Launcher
echo ================================================================================
echo           NEXTGEN AI ONLINE EXAMINATION & MULTIMODAL PROCTORING SYSTEM
echo ================================================================================
echo.
echo [1/2] Launching Python FastAPI AI Backend (YOLOv8 + MediaPipe + cv2.solvePnP)...
start "AI Proctoring Backend (Port 8000)" cmd /k "cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Launching Frontend Web Interface (Vite / TanStack Start)...
start "Frontend Web Application" cmd /k "npm run dev"

echo.
echo ================================================================================
echo BOTH SERVERS LAUNCHED SUCCESSFULLY:
echo  - Python AI Engine : http://localhost:8000 (WebSocket: ws://localhost:8000/api/v1/ws/proctor)
echo  - Web Application  : http://localhost:3000
echo ================================================================================
pause
