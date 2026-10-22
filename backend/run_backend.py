"""
run_backend.py
---------------------------------------------------------------------------
Convenience runner to start the FastAPI Proctoring Backend with live auto-reload.
"""

import sys
import subprocess

def main():
    print("=" * 65)
    print(" NextGen AI Online Exam Proctoring — FastAPI Server")
    print(" Powered by Ultralytics YOLOv8 & MediaPipe")
    print("=" * 65)

    try:
        import uvicorn
    except ImportError:
        print("[!] Uvicorn not installed. Please run: pip install -r requirements.txt")
        sys.exit(1)

    print("[+] Starting FastAPI server at http://127.0.0.1:8000 ...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    main()
