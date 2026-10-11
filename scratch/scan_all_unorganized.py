#!/usr/bin/env python3
import os
import json
import time
from pathlib import Path
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR()

pools = [
    {"name": "root", "path": "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test", "recursive": False},
    {"name": "jsp_root", "path": "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/jsp", "recursive": False},
    {"name": "jsp_mauvaise_trad", "path": "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/jsp/Mauvaise Trad + falacieux", "recursive": False},
    {"name": "dragonworld_root", "path": "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/1 DragonWorld", "recursive": False},
    {"name": "capacite_root", "path": "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/3 Capacité et autre", "recursive": False},
    {"name": "debunk_root", "path": "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/4 Debunk", "recursive": False},
    {"name": "saga_buu_a_trier", "path": "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/4 Debunk/Saga buu/a trier", "recursive": False},
]

output_file = "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/_audit_index.json"
local_output = "scratch/audit_index.json"

results = {}
if os.path.exists(local_output):
    try:
        with open(local_output, "r", encoding="utf-8") as f:
            results = json.load(f)
        print(f"Loaded {len(results)} existing entries.")
    except Exception as e:
        print(f"Could not load existing index: {e}")

image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
video_exts = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
text_exts = {".txt", ".json", ".md", ".html"}

start_time = time.time()
processed = 0

for pool in pools:
    pool_name = pool["name"]
    pool_path = pool["path"]
    if not os.path.exists(pool_path):
        continue

    entries = os.listdir(pool_path)
    for entry in entries:
        full_path = os.path.join(pool_path, entry)
        if not os.path.isfile(full_path):
            continue

        # Unique key is full_path
        if full_path in results and results[full_path].get("status") == "done":
            continue

        ext = Path(entry).suffix.lower()
        item_data = {
            "pool": pool_name,
            "filename": entry,
            "full_path": full_path,
            "ext": ext,
            "size": os.path.getsize(full_path),
            "text": "",
            "type": "other",
            "status": "done"
        }

        if ext in image_exts:
            item_data["type"] = "image"
            try:
                ocr_res, _ = ocr(full_path)
                if ocr_res:
                    detected = [r[1] for r in ocr_res]
                    item_data["text"] = " \n ".join(detected)
            except Exception as e:
                item_data["error"] = str(e)
        elif ext in text_exts:
            item_data["type"] = "text"
            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as tf:
                    item_data["text"] = tf.read()
            except Exception as e:
                item_data["error"] = str(e)
        elif ext in video_exts:
            item_data["type"] = "video"
            item_data["text"] = entry # filename conveys intent

        results[full_path] = item_data
        processed += 1

        if processed % 50 == 0:
            elapsed = time.time() - start_time
            print(f"Processed {processed} items in {elapsed:.1f}s (Total in index: {len(results)})")
            with open(local_output, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)

with open(local_output, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

elapsed = time.time() - start_time
print(f"Completed! Processed {processed} items in {elapsed:.1f}s. Total indexed: {len(results)}")
