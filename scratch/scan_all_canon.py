#!/usr/bin/env python3
import os
import json
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from rapidocr_onnxruntime import RapidOCR

base_dir = "/mnt/c/Users/omara/Desktop/goku solo/1 DragonWorld/Canon"
output_file = "/root/dev/shenron/scratch/canon_total_analysis.json"
index_path = "/root/dev/shenron/scratch/full_scan_index.json"
gt_path = "/root/dev/shenron/scratch/canon_gt_full_analysis.json"

known_cache = {}
if os.path.exists(index_path):
    with open(index_path, "r", encoding="utf-8") as f:
        known_cache.update(json.load(f))
if os.path.exists(gt_path):
    with open(gt_path, "r", encoding="utf-8") as f:
        for item in json.load(f):
            known_cache[item["filename"]] = item

image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
video_exts = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
text_exts = {".txt", ".json", ".md", ".html"}

all_files = []
for root, dirs, files in os.walk(base_dir):
    rel_dir = os.path.relpath(root, base_dir)
    for f in files:
        fp = os.path.join(root, f)
        all_files.append((fp, f, rel_dir))

print(f"Total files in Canon: {len(all_files)}")

to_process = []
cached_results = []

for fp, fn, rel_dir in all_files:
    ext = Path(fn).suffix.lower()
    cached = known_cache.get(fn)
    if cached and len(cached.get("text", "").strip()) > 0:
        cached_results.append({
            "file_path": fp,
            "filename": fn,
            "folder": rel_dir,
            "ext": ext,
            "size": os.path.getsize(fp),
            "text": cached.get("text", ""),
            "source": "cache"
        })
    else:
        to_process.append((fp, fn, rel_dir))

print(f"Loaded from cache: {len(cached_results)}")
print(f"Files needing live OCR: {len(to_process)}")

def ocr_task(item):
    fp, fn, rel_dir = item
    ext = Path(fn).suffix.lower()
    res_text = ""
    error = None

    if ext in image_exts:
        try:
            ocr = RapidOCR()
            res, _ = ocr(fp)
            if res:
                res_text = " \n ".join([r[1] for r in res])
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
        "source": "ocr_fresh",
        "error": error
    }

live_results = []
if to_process:
    start_time = time.time()
    num_workers = min(8, os.cpu_count() or 4)
    print(f"Starting OCR with {num_workers} workers...")
    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        futures = [executor.submit(ocr_task, it) for it in to_process]
        for fut in as_completed(futures):
            res = fut.result()
            live_results.append(res)
            if len(live_results) % 25 == 0 or len(live_results) == len(to_process):
                print(f"  Processed {len(live_results)}/{len(to_process)}...")
    print(f"OCR finished in {time.time() - start_time:.2f}s.")

total_results = cached_results + live_results
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(total_results, f, ensure_ascii=False, indent=2)

print(f"Saved complete extraction of all {len(total_results)} files to {output_file}")
