#!/usr/bin/env python3
import os
import shutil

base = "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test"
cap_dir = os.path.join(base, "3 Capacité et autre")

rules = {
    # Mort mais vivant
    "Capture d'écran 2026-06-30 180451.png": "3 Capacité et autre/mort mais vivant",
    "Capture d'écran 2026-06-30 180501.png": "3 Capacité et autre/mort mais vivant",
    "Capture d'écran 2026-06-30 180517.png": "3 Capacité et autre/mort mais vivant",
    "Capture d'écran 2026-06-03 152729.png": "3 Capacité et autre/mort mais vivant",

    # Déplacement instantané
    "Capture d'écran 2025-10-14 204047.png": "3 Capacité et autre/Déplacement instantané",
    "Capture d'écran 2025-10-14 204358.png": "3 Capacité et autre/Déplacement instantané",

    # Barrière
    "6t09Z2R.png": "3 Capacité et autre/barrière d'énergie",

    # Kamehameha & Dragon Fist
    "Capture d'écran 2025-09-15 191056.png": "3 Capacité et autre/kamehameha",

    # 4ème mur / Médias
    "Capture d'écran 2026-06-17 162200.png": "3 Capacité et autre/4ème mur/télévision",
    "IMG_0279.png": "3 Capacité et autre/4ème mur/manga",
    "IMG_0280.png": "3 Capacité et autre/4ème mur/manga",
    "IMG_0281.png": "3 Capacité et autre/4ème mur/manga",

    # Faiblesse Saiyan
    "Capture d'écran 2026-06-11 123349.png": "4 Debunk/faiblesse siayan",
    "Capture d'écran 2026-06-30 174033.png": "4 Debunk/faiblesse siayan",
    "yhynyrjrtjt.png": "4 Debunk/faiblesse siayan",

    # Absorption
    "image.png": "3 Capacité et autre/Absorbtion",

    # Films Puissance
    "kaioken100.jpg": "2 Force calcul/7 Saga Film Puissance",
    "20150411HNW_DragonBallZResurrectionF008-266x400.jpg": "2 Force calcul/5 Saga Super Puissance/Freezer files",

    # Cosmologie
    "Capture d'écran 2025-09-29 174802.png": "1 DragonWorld/Cosmos/L'autre monde",
    "image-224.png": "1 DragonWorld/Cosmos/L'autre monde",

    # Potentiel / Aucune limite (default for saiyan statements)
    "228A553F-F534-4FCB-8CC8-4266E9C314ED.jpeg": "3 Capacité et autre/Potentiel/aucune limite",
    "Capture d'écran 2026-01-29 212821.png": "3 Capacité et autre/Potentiel/aucune limite",
    "Capture d'écran 2026-02-01 134209.png": "3 Capacité et autre/Potentiel/aucune limite",
    "Capture d'écran 2026-05-19 213140.png": "3 Capacité et autre/Potentiel/aucune limite",
    "Capture d'écran 2026-05-22 165018.png": "3 Capacité et autre/Potentiel/aucune limite",
    "Capture d'écran 2026-06-18 211139.png": "3 Capacité et autre/Potentiel/aucune limite",
    "Capture d'écran 2025-12-23 103713.png": "3 Capacité et autre/Potentiel/aucune limite",
    "HCQGRrNWgAAtAGV.jpg": "3 Capacité et autre/Potentiel/aucune limite",

    # Vidéos
    "D82wjU3.mp4": "3 Capacité et autre/Potentiel",
    "F7psUpe.mp4": "3 Capacité et autre/Potentiel",
    "FXMIQRtw6F2KU7ji.mp4": "3 Capacité et autre/Potentiel",
    "IU7Z9s5.mp4": "3 Capacité et autre/Potentiel",
    "kdA0ipl.mp4": "3 Capacité et autre/Potentiel",
    "ScreenRecording_06-09-2025_23-37-37_1.mov": "3 Capacité et autre/Potentiel",

    # Techniques
    "dragon-ball-techniques-1240833.webp": "3 Capacité et autre/copier les techniques",
}

default_dest = "3 Capacité et autre/Potentiel/aucune limite"

loose_files = [f for f in os.listdir(cap_dir) if os.path.isfile(os.path.join(cap_dir, f))]
print(f"Sorting remaining {len(loose_files)} loose files from 3 Capacité et autre...")

for f in loose_files:
    dest_sub = rules.get(f, default_dest)
    dest_dir = os.path.join(base, dest_sub)
    os.makedirs(dest_dir, exist_ok=True)

    src = os.path.join(cap_dir, f)
    dst = os.path.join(dest_dir, f)
    shutil.move(src, dst)
    print(f"Moved {f} -> {dest_sub}")

remaining = [f for f in os.listdir(cap_dir) if os.path.isfile(os.path.join(cap_dir, f))]
print(f"\nRemaining loose files in '3 Capacité et autre': {len(remaining)}")
