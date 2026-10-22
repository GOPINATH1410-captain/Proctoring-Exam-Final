"""
train_smartwatch_model.py
---------------------------------------------------------------------------
Training & Fine-Tuning Pipeline for Custom YOLOv8 Smartwatch & Mobile Phone Detection.

Use this script to train or fine-tune YOLOv8 on custom-labeled smartwatch and
mobile phone datasets when higher accuracy on wearable wrist devices is required.

Workflow:
 1. Prepare / verify dataset structure:
      dataset/
        ├── data.yaml
        ├── images/
        │   ├── train/
        │   └── val/
        └── labels/
            ├── train/
            └── val/
 2. Classes defined in data.yaml:
      names:
        0: cell phone
        1: smartwatch
 3. Run fine-tuning:
      python backend/train_smartwatch_model.py --epochs 25 --batch 16
 4. The resulting best model weights will be exported to:
      backend/models/yolov8_smartwatch.pt
    which is automatically discovered and loaded by YOLOv8ProctorDetector!
"""

import os
import sys
import argparse
import yaml

def parse_args():
    parser = argparse.ArgumentParser(description="Train custom YOLOv8 model for smartwatch & phone detection")
    parser.add_argument("--base-model", type=str, default="yolov8n.pt", help="Base pretrained YOLO weights")
    parser.add_argument("--data", type=str, default="dataset/smartwatch_data.yaml", help="Path to dataset YAML")
    parser.add_argument("--epochs", type=int, default=25, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution")
    parser.add_argument("--output", type=str, default="models/yolov8_smartwatch.pt", help="Target export weights path")
    parser.add_argument("--create-template", action="store_true", help="Generate template dataset directory & data.yaml")
    return parser.parse_args()

def create_dataset_template(dataset_dir="dataset"):
    """Creates directory structure and sample data.yaml for labeling smartwatches."""
    os.makedirs(os.path.join(dataset_dir, "images", "train"), exist_ok=True)
    os.makedirs(os.path.join(dataset_dir, "images", "val"), exist_ok=True)
    os.makedirs(os.path.join(dataset_dir, "labels", "train"), exist_ok=True)
    os.makedirs(os.path.join(dataset_dir, "labels", "val"), exist_ok=True)

    yaml_path = os.path.join(dataset_dir, "smartwatch_data.yaml")
    yaml_content = {
        "path": os.path.abspath(dataset_dir),
        "train": "images/train",
        "val": "images/val",
        "nc": 2,
        "names": ["cell phone", "smartwatch"]
    }

    with open(yaml_path, "w") as f:
        yaml.dump(yaml_content, f, sort_keys=False)

    readme_path = os.path.join(dataset_dir, "README.md")
    with open(readme_path, "w") as f:
        f.write("""# Smartwatch & Mobile Phone YOLOv8 Dataset

Place your training images into `images/train/` and annotations into `labels/train/`.
Place validation images into `images/val/` and annotations into `labels/val/`.

Annotation format (YOLO normalized):
`<class_id> <x_center> <y_center> <width> <height>`

Class Mapping:
- 0: cell phone
- 1: smartwatch

Recommended Public Datasets for Labeling & Augmentation:
- Roboflow Universe: Search "smartwatch-detection" or "wearables"
- Open Images Dataset v7: Class "Watch"
""")

    print(f"[OK] Generated dataset template at: {os.path.abspath(dataset_dir)}")
    print(f"[OK] Generated YAML configuration at: {os.path.abspath(yaml_path)}")
    return yaml_path

def train_model(args):
    print("=" * 70)
    print("CUSTOM YOLOV8 SMARTWATCH & MOBILE PHONE DETECTOR TRAINING")
    print("=" * 70)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] Ultralytics is not installed. Run: pip install ultralytics")
        return 1

    if args.create_template or not os.path.exists(args.data):
        if not os.path.exists(args.data):
            print(f"[!] Dataset config {args.data} not found. Creating template...")
        create_dataset_template(os.path.dirname(args.data) or "dataset")
        if args.create_template:
            return 0

    print(f"[*] Base model: {args.base_model}")
    print(f"[*] Dataset YAML: {args.data}")
    print(f"[*] Epochs: {args.epochs} | Batch: {args.batch} | Image Size: {args.imgsz}")

    model = YOLO(args.base_model)

    print("[*] Launching Ultralytics training session...")
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        save=True,
        project="runs/detect",
        name="smartwatch_proctor"
    )

    # Save to target export path
    best_weights = os.path.join("runs", "detect", "smartwatch_proctor", "weights", "best.pt")
    if os.path.exists(best_weights):
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        import shutil
        shutil.copy(best_weights, args.output)
        print(f"[SUCCESS] Exported trained weights to: {args.output}")
    else:
        print(f"[!] Training complete. Check output in: runs/detect/smartwatch_proctor")

    return 0

if __name__ == "__main__":
    args = parse_args()
    sys.exit(train_model(args))
