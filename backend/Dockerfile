# FastAPI YOLOv8 + MediaPipe Proctoring Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV and OpenGL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download YOLOv8 nano model
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
