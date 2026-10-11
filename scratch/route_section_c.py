#!/usr/bin/env python3
import os
import json
import shutil

base = "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test"

with open("scratch/full_scan_index.json", "r", encoding="utf-8") as f:
    index = json.load(f)

def get_text(fn):
    item = index.get(fn, {})
    return (fn + " " + item.get("text", "")).lower()

# 1. 3 Capacité et autre/Hakkai (45 files)
hakkai_dir = os.path.join(base, "3 Capacité et autre/Hakkai")
for f in os.listdir(hakkai_dir):
    fp = os.path.join(hakkai_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if "zamasu" in t or "goku" in t and "hakkai" in t:
        dest = "Goku Zamasu Hakkai"
    else:
        dest = "Fonctionnement du Hakkai"
    shutil.move(fp, os.path.join(hakkai_dir, dest, f))
print("Moved Hakkai files into subfolders")

# 2. 3 Capacité et autre/Potentiel (9 files)
pot_dir = os.path.join(base, "3 Capacité et autre/Potentiel")
for f in os.listdir(pot_dir):
    fp = os.path.join(pot_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if "tdp" in t or "tournoi" in t or "arène" in t:
        dest = "tdp"
    else:
        dest = "aucune limite"
    shutil.move(fp, os.path.join(pot_dir, dest, f))
print("Moved Potentiel files into subfolders")

# 3. 3 Capacité et autre/ToonForce (5 files)
toon_dir = os.path.join(base, "3 Capacité et autre/ToonForce")
for f in os.listdir(toon_dir):
    fp = os.path.join(toon_dir, f)
    if not os.path.isfile(fp): continue
    dest = "arale"
    shutil.move(fp, os.path.join(toon_dir, dest, f))
print("Moved ToonForce files into arale")

# 4. 3 Capacité et autre/Ultra Instinct (23 files)
ui_dir = os.path.join(base, "3 Capacité et autre/Ultra Instinct")
for f in os.listdir(ui_dir):
    fp = os.path.join(ui_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if "tui" in t or "true ultra instinct" in t or "son propre" in t:
        dest = "Tui"
    elif "whis" in t or "ウイス" in t:
        dest = "explication whis"
    elif "popo" in t:
        dest = "entrianement popo"
    elif "calme" in t or "esprit" in t or "tranquille" in t:
        dest = "besoin d'esprit calme"
    elif "automatique" in t or "esquive" in t:
        dest = "deplacmeent uatomatique du corps"
    elif "danger" in t or "évite" in t or "evite" in t:
        dest = "évite tout danger"
    elif "genkidama" in t or "carburant" in t:
        dest = "genkdiama carburant"
    elif "kefla" in t:
        dest = "Kefla vs goku"
    elif "corps" in t or "dur" in t or "renforc" in t:
        dest = "Coprs devient plus fort"
    elif "prémice" in t or "premice" in t or "sign" in t or "signe" in t:
        dest = "premice"
    else:
        dest = "Puissance necessaire"
    shutil.move(fp, os.path.join(ui_dir, dest, f))
print("Moved Ultra Instinct files into subfolders")
