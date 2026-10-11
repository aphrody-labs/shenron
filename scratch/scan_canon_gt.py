#!/usr/bin/env python3
import os
import json
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from rapidocr_onnxruntime import RapidOCR

base_dir = "/mnt/c/Users/omara/Desktop/goku solo/1 DragonWorld/Canon/Canon GT"
output_file = "/root/dev/shenron/scratch/canon_gt_full_analysis.json"

image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
video_exts = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
text_exts = {".txt", ".json", ".md", ".html"}

all_files = []
for root, dirs, files in os.walk(base_dir):
    rel_dir = os.path.relpath(root, base_dir)
    for f in files:
        fp = os.path.join(root, f)
        all_files.append((fp, f, rel_dir))

print(f"Total files in Canon GT to analyze: {len(all_files)}")

def ocr_worker(item):
    fp, fn, rel_dir = item
    ext = Path(fn).suffix.lower()
    res_text = ""
    error = None

    if ext in image_exts:
        try:
            ocr = RapidOCR()
            res, _ = ocr(fp)
            if res:
                detected = [r[1] for r in res]
                res_text = " \n ".join(detected)
        except Exception as e:
            error = str(e)
    elif ext in text_exts:
        try:
            with open(fp, "r", encoding="utf-8", errors="ignore") as tf:
                res_text = tf.read()
        except Exception as e:
            error = str(e)
    elif ext in video_exts:
        res_text = f"[VIDEO] {fn}"

    return {
        "file_path": fp,
        "filename": fn,
        "folder": rel_dir,
        "ext": ext,
        "size": os.path.getsize(fp),
        "text": res_text,
        "error": error
    }

results = []
start_time = time.time()
num_workers = min(8, os.cpu_count() or 4)
print(f"Scanning with {num_workers} workers...")

with ProcessPoolExecutor(max_workers=num_workers) as executor:
    futures = [executor.submit(ocr_worker, item) for item in all_files]
    for future in as_completed(futures):
        res = future.result()
        results.append(res)
        if len(results) % 20 == 0 or len(results) == len(all_files):
            print(f"  Processed {len(results)}/{len(all_files)} files...")

elapsed = time.time() - start_time
print(f"OCR finished in {elapsed:.2f}s.")

# Save results
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"Saved complete extraction to {output_file}")
