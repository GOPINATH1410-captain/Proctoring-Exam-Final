# Smartwatch & Mobile Phone YOLOv8 Dataset

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
