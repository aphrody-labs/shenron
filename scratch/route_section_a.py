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

# 1. 1 DragonWorld/Canon/Debunk Canon (28 files) -> Retcon Explain
debunk_canon_dir = os.path.join(base, "1 DragonWorld/Canon/Debunk Canon")
retcon_dir = os.path.join(debunk_canon_dir, "Retcon Explain")
os.makedirs(retcon_dir, exist_ok=True)
for f in os.listdir(debunk_canon_dir):
    fp = os.path.join(debunk_canon_dir, f)
    if os.path.isfile(fp):
        shutil.move(fp, os.path.join(retcon_dir, f))
print("Moved Debunk Canon files to Retcon Explain")

# 2. 1 DragonWorld/Canon/Canon GT (24 files)
gt_dir = os.path.join(base, "1 DragonWorld/Canon/Canon GT")
for f in os.listdir(gt_dir):
    fp = os.path.join(gt_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if "bog" in t or "battle of gods" in t:
        dest = "BOG"
    elif "dbs" in t or "super" in t:
        dest = "DBS"
    elif "shueisha" in t:
        dest = "Chronological SHUEISHA"
    elif "chronological table" in t or "table" in t:
        dest = "Chronological table of DB World"
    elif "continuation" in t or "dbz" in t:
        dest = "DBZ continuation"
    elif "slump" in t:
        dest = "DrSLump"
    elif "livre" in t or "official" in t or "databook" in t:
        dest = "Livre officiel"
    elif "side story" in t:
        dest = "side story"
    elif "timeline" in t or "chronologie" in t or "age" in t:
        dest = "timeline"
    else:
        dest = "Autre debunk gt"
    shutil.move(fp, os.path.join(gt_dir, dest, f))
print("Moved Canon GT files into subfolders")

# 3. 1 DragonWorld/Canon (108 files)
canon_dir = os.path.join(base, "1 DragonWorld/Canon")
for f in os.listdir(canon_dir):
    fp = os.path.join(canon_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if "daima" in t:
        dest = "Canon Daima"
    elif "gt" in t:
        dest = "Canon GT/Autre debunk gt"
    elif "film" in t or "movie" in t:
        dest = "Canon Film"
    elif "slump" in t:
        dest = "Canon DrSlump"
    elif "jaco" in t:
        dest = "Canon Jaco"
    elif "neko" in t:
        dest = "Canon NekoM"
    elif "game" in t or "jeu" in t or "kakarot" in t or "dbo" in t or "heroes" in t:
        dest = "Canon Jeu"
    elif "toriyama" in t or "interview" in t or "author" in t or "鳥山明" in t or "supervision" in t:
        dest = "toriyama implication"
    elif "timeline" in t or "chronologie" in t:
        dest = "timeline"
    elif "dbs" in t or "super" in t or "dbz" in t or "manga" in t or "tome" in t or "chapitre" in t:
        dest = "Canon DBZ-S"
    elif "debunk" in t or "retcon" in t:
        dest = "Debunk Canon/Retcon Explain"
    else:
        dest = "Canon Autre"
    shutil.move(fp, os.path.join(canon_dir, dest, f))
print("Moved Canon files into subfolders")

# 4. 1 DragonWorld/Cosmos (161 files)
cosmos_dir = os.path.join(base, "1 DragonWorld/Cosmos")
for f in os.listdir(cosmos_dir):
    fp = os.path.join(cosmos_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if "deadzone" in t or "dead zone" in t:
        dest = "DeadZone"
    elif "dimension broly" in t or ("broly" in t and "dimension" in t):
        dest = "Dimension Broly Gogeta"
    elif "koyama" in t:
        dest = "koyama tweet"
    elif "toribot" in t or "tori-bot" in t or "arale" in t:
        dest = "arale toribot"
    elif "makai" in t or "demon" in t or "démon" in t:
        dest = "Monde des Démons"
    elif "kaioshin" in t:
        dest = "Monde des Kaioshin"
    elif "salle de l'esprit" in t or "rosat" in t or "chambre du temps" in t:
        dest = "Salle de l'esprit et du temps"
    elif "sugoroku" in t:
        dest = "Sugoroku Space"
    elif "tdp" in t or "tournoi du pouvoir" in t or "tournoi" in t or "arène" in t:
        dest = "TDP map"
    elif "macrocosm" in t or "macrocosme" in t or "map" in t or "carte" in t:
        dest = "Macrocosm Map"
    elif "autre monde" in t or "afterlife" in t or "enma" in t or "paradis" in t or "enfer" in t:
        dest = "L'autre monde"
    else:
        dest = "L'univers"
    shutil.move(fp, os.path.join(cosmos_dir, dest, f))
print("Moved Cosmos files into subfolders")

# 5. 1 DragonWorld/Ki Fonctionnement (14 files)
ki_dir = os.path.join(base, "1 DragonWorld/Ki Fonctionnement")
for f in os.listdir(ki_dir):
    fp = os.path.join(ki_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if "cyborg" in t or "17" in t or "18" in t or "infini" in t:
        dest = "Cyborg"
    elif "fort" in t or "entrainement" in t or "potentiel" in t:
        dest = "Devenir plus fort"
    elif "gagner" in t or "tactique" in t or "strategie" in t:
        dest = "Pour gagner"
    else:
        dest = "Les composants du ki"
    shutil.move(fp, os.path.join(ki_dir, dest, f))
print("Moved Ki Fonctionnement files into subfolders")
