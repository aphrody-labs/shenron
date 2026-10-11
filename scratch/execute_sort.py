#!/usr/bin/env python3
import json
import os
import shutil

with open("scratch/routing_plan_v2.json", "r", encoding="utf-8") as f:
    plan = json.load(f)

base = "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test"

print(f"Starting execution of sorting for {len(plan)} files...")

moved_count = 0
errors = []

for src, info in plan.items():
    dst = info["target_full"]
    dst_dir = os.path.dirname(dst)

    if src == dst:
        continue

    if not os.path.exists(src):
        errors.append(f"Source not found: {src}")
        continue

    # Ensure destination directory exists
    os.makedirs(dst_dir, exist_ok=True)

    try:
        shutil.move(src, dst)
        moved_count += 1
    except Exception as e:
        errors.append(f"Error moving {src} -> {dst}: {e}")

print(f"Successfully moved {moved_count} files!")
if errors:
    print(f"Encountered {len(errors)} errors:")
    for err in errors[:10]:
        print(" ", err)

# Cleanup empty directories
dirs_to_clean = [
    os.path.join(base, "jsp", "Mauvaise Trad + falacieux"),
    os.path.join(base, "jsp"),
    os.path.join(base, "4 Debunk", "Saga buu", "a trier"),
]

for d in dirs_to_clean:
    if os.path.exists(d):
        try:
            # Check if directory is empty
            if not os.listdir(d):
                os.rmdir(d)
                print(f"Removed empty directory: {d}")
            else:
                print(f"Directory not empty: {d} (contains {len(os.listdir(d))} items)")
        except Exception as e:
            print(f"Could not remove {d}: {e}")

# Verification of root and main folder states
print("\n--- POST-SORT VERIFICATION ---")
main_dirs = [
    base,
    os.path.join(base, "1 DragonWorld"),
    os.path.join(base, "2 Force calcul"),
    os.path.join(base, "3 Capacité et autre"),
    os.path.join(base, "4 Debunk"),
]

for md in main_dirs:
    if os.path.exists(md):
        loose_files = [f for f in os.listdir(md) if os.path.isfile(os.path.join(md, f))]
        rel = os.path.relpath(md, base)
        print(f"Folder '{rel}': {len(loose_files)} loose files remaining.")

jsp_exists = os.path.exists(os.path.join(base, "jsp"))
print(f"Folder 'jsp' exists: {jsp_exists}")

a_trier_exists = os.path.exists(os.path.join(base, "4 Debunk", "Saga buu", "a trier"))
print(f"Folder 'a trier' exists: {a_trier_exists}")
