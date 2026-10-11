#!/usr/bin/env python3
import os
import json
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

base = "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test"
index_file = "scratch/full_scan_index.json"

# Load existing index
full_index = {}
if os.path.exists(index_file):
    try:
        with open(index_file, "r", encoding="utf-8") as f:
            full_index = json.load(f)
        print(f"Loaded {len(full_index)} entries from full_scan_index.json")
    except Exception as e:
        print(f"Error loading full_scan_index: {e}")

# Also import existing audit_index.json
if os.path.exists("scratch/audit_index.json"):
    try:
        with open("scratch/audit_index.json", "r", encoding="utf-8") as f:
            old_audit = json.load(f)
        for k, v in old_audit.items():
            fn = v["filename"]
            if fn not in full_index and v.get("text"):
                full_index[fn] = v
        print(f"Merged with audit_index. Total known entries: {len(full_index)}")
    except Exception as e:
        print(f"Error merging old audit: {e}")

# Find target files:
# 1) all files in non-leaf directories (dirs with subdirs)
# 2) all files in 4 Debunk/Debunk aleatoire
target_paths = []
for root, dirs, files in os.walk(base):
    rel = os.path.relpath(root, base)
    is_non_leaf = len(dirs) > 0 and len(files) > 0
    is_debunk_aleatoire = rel == "4 Debunk/Debunk aleatoire"

    if is_non_leaf or is_debunk_aleatoire:
        for f in files:
            target_paths.append(os.path.join(root, f))

print(f"Total target files to verify/scan: {len(target_paths)}")

to_scan = []
image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
video_exts = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
text_exts = {".txt", ".json", ".md", ".html"}

for p in target_paths:
    fn = os.path.basename(p)
    if fn in full_index and full_index[fn].get("status") == "done":
        continue
    to_scan.append(p)

print(f"Files needing OCR scan: {len(to_scan)}")

def process_single_file(file_path):
    fn = os.path.basename(file_path)
    ext = Path(fn).suffix.lower()
    item = {
        "filename": fn,
        "full_path": file_path,
        "ext": ext,
        "size": os.path.getsize(file_path),
        "text": "",
        "status": "done"
    }

    if ext in image_exts:
        try:
            from rapidocr_onnxruntime import RapidOCR
            ocr = RapidOCR()
            res, _ = ocr(file_path)
            if res:
                detected = [r[1] for r in res]
                item["text"] = " \n ".join(detected)
        except Exception as e:
            item["error"] = str(e)
    elif ext in text_exts:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as tf:
                item["text"] = tf.read()
        except Exception as e:
            item["error"] = str(e)
    elif ext in video_exts:
        item["text"] = fn

    return fn, item

if to_scan:
    start_time = time.time()
    num_workers = min(10, os.cpu_count() or 4)
    print(f"Starting parallel OCR with {num_workers} workers for {len(to_scan)} files...")

    completed = 0
    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(process_single_file, p): p for p in to_scan}
        for future in as_completed(futures):
            try:
                fn, item = future.result()
                full_index[fn] = item
                completed += 1
                if completed % 100 == 0:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed
                    remaining_sec = (len(to_scan) - completed) / rate if rate > 0 else 0
                    print(f"Progress: {completed}/{len(to_scan)} ({completed*100/len(to_scan):.1f}%) in {elapsed:.1f}s (~{remaining_sec:.0f}s left)")
                    with open(index_file, "w", encoding="utf-8") as f:
                        json.dump(full_index, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"Error processing item: {e}")

    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(full_index, f, ensure_ascii=False, indent=2)

    elapsed = time.time() - start_time
    print(f"Parallel scan finished in {elapsed:.1f}s! Total indexed entries: {len(full_index)}")
else:
    print("All files already indexed!")
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(full_index, f, ensure_ascii=False, indent=2)
