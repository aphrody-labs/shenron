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

# 1. Statement Z (56 files) -> english sub vs VF et Raw
stmt_z_dir = os.path.join(base, "4 Debunk/Saga buu/Statement Z")
raw_dir = os.path.join(stmt_z_dir, "VF et Raw")
os.makedirs(raw_dir, exist_ok=True)
for f in os.listdir(stmt_z_dir):
    fp = os.path.join(stmt_z_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if "english" in t or "eng" in t or "sub" in t and "ep" in t:
        dest = "english sub"
    else:
        dest = "VF et Raw"
    shutil.move(fp, os.path.join(stmt_z_dir, dest, f))
print("Moved Statement Z direct files")

# 2. 4 Debunk/Saga buu direct files (415 files)
buu_dir = os.path.join(base, "4 Debunk/Saga buu")
for f in os.listdir(buu_dir):
    fp = os.path.join(buu_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)

    if "beerus" in t and ("kid" in t or "buu" in t or "vs" in t):
        dest = "KidBuu VS Beerus"
    elif "moro" in t or "morro" in t:
        dest = "Morro Arc"
    elif "daima" in t:
        dest = "Statement Daima"
    elif "gt" in t and ("uub" in t or "oubou" in t or "baby" in t):
        dest = "Statement GT"
    elif any(k in t for k in ["carddass", "kakarot", "budokai", "tenkaichi", "dokkan", "legends", "game", "jeu", "カードダス"]):
        dest = "Statement Jeu"
    elif "super" in t and ("dbs" in t or "anime" in t):
        dest = "Statement Super"
    elif "koyama" in t:
        dest = "Cas de Koyama"
    elif "buutenks" in t or "gotenks absorb" in t:
        dest = "debunk buutenks"
    elif "buuhan" in t or "gohan absorb" in t:
        dest = "Buuhan SSJ3"
    elif "genkidama" in t or "spirit bomb" in t:
        dest = "Genkidama"
    elif "gohan" in t and "ssj3" in t:
        dest = "Gohan SSJ3"
    elif "gohan" in t and ("gotenks" in t or "superbuu" in t or "super buu" in t):
        dest = "Gotenks SuperBuu Gohan"
    elif "gohan" in t and ("protag" in t or "potentiel" in t or "mystic" in t or "ultimate" in t or "15代前" in t):
        dest = "Gohan Protagoniste"
    elif "ment" in t and "goku" in t:
        dest = "Goku ment sur sa force"
    elif "numéro 1" in t or "numero 1" in t or "number 1" in t or "nanbaa wan" in t or "perdu" in t:
        dest = "Goku numéro 1"
    elif any(k in t for k in ["databook", "daizenshuu", "chozenshu", "forever", "densetsu", "大全集", "超全集"]):
        dest = "KidBuu DataBook"
    elif "ssj3" in t and ("minute" in t or "kid" in t or "rassemble" in t):
        dest = "KidBuu SSJ3"
    elif "intérieur" in t or "interieur" in t or "inside" in t or "cuerpo" in t:
        dest = "Buu Intérieur"
    elif "kaioshin" in t or "界王神" in t or "daikaiohshin" in t:
        dest = "Kaioshin Explication"
    elif "knock" in t or "ko" in t:
        dest = "Knock-Out"
    elif "end of z" in t or "eoz" in t or "10 ans" in t:
        dest = "End Of Z"
    elif "dernière chance" in t or "derniere chance" in t:
        dest = "Dernière Chance"
    elif "insondable" in t:
        dest = "Insondable"
    elif "interview" in t or "toriyama" in t:
        dest = "Interview Toriyama"
    elif "freezer" in t and ("peur" in t or "fear" in t):
        dest = "Freezer peur"
    elif "moquerie" in t or "vegeta moqu" in t:
        dest = "Vegeta moquerie"
    elif "vsbattles" in t or "vs battles" in t:
        dest = "vsbattles_rules"
    elif "statement z" in t or "dbz" in t or "épisode" in t or "episode" in t:
        dest = "Statement Z/VF et Raw"
    elif "dragonball" in t and "tome" in t and "vœu" in t:
        dest = "Goku DragonBalls"
    elif "retour" in t and "terre" in t:
        dest = "Goku Retour"
    elif "pas sérieux" in t or "dort" in t or "joue" in t:
        dest = "KidBuu pas sérieux"
    elif "pouvoir" in t and "kaioshin" in t:
        dest = "Pouvoir Kaioshin"
    elif "super buu" in t and "kid" in t:
        dest = "Super Buu et KidBuu"
    else:
        dest = "KidBuu Raison"

    shutil.move(fp, os.path.join(buu_dir, dest, f))

print("Moved all 415 direct files from 4 Debunk/Saga buu into subfolders")

# 3. 4 Debunk/Debunk aleatoire (495 files) -> audit & routing
deb_aleatoire_dir = os.path.join(base, "4 Debunk/Debunk aleatoire")
commu_dir = os.path.join(deb_aleatoire_dir, "Debats et Faits Divers")
memes_dir = os.path.join(deb_aleatoire_dir, "Captures et Echanges")
os.makedirs(commu_dir, exist_ok=True)
os.makedirs(memes_dir, exist_ok=True)

for f in os.listdir(deb_aleatoire_dir):
    fp = os.path.join(deb_aleatoire_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)

    # Specific redirects if found in debunk aleatoire:
    if "dyspo" in t:
        dest = os.path.join(base, "4 Debunk/dyspo vitesse")
    elif "laser" in t or "sorbet" in t:
        dest = os.path.join(base, "4 Debunk/laser lasseau")
    elif "beerus" in t and "ment" in t:
        dest = os.path.join(base, "4 Debunk/beerus ment")
    elif "ki divin" in t or "god ki" in t:
        dest = os.path.join(base, "4 Debunk/Ki divin")
    elif "ssjbe" in t:
        dest = os.path.join(base, "4 Debunk/ssjbe manga may 22 2020")
    elif "vegetto" in t or "gogeta" in t:
        dest = os.path.join(base, "4 Debunk/Vegetto Gogeta")
    elif "opm" in t or "saitama" in t:
        dest = os.path.join(base, "4 Debunk/opm debunk")
    elif any(k in t for k in ["anos", "jinwoo", "jin woo", "yogiri", "madoka", "crossverse"]):
        dest = os.path.join(base, "4 Debunk/Crossverse et Matchups")
    elif "cellule" in t and "cell" in t:
        dest = os.path.join(base, "4 Debunk/cellule cell")
    elif "delaisser" in t or "slacking" in t:
        dest = os.path.join(base, "4 Debunk/delaisser l'entrainement")
    elif "faiblesse" in t and "saiyan" in t:
        dest = os.path.join(base, "4 Debunk/faiblesse siayan")
    elif "akira forget" in t or "toriyama forget" in t:
        dest = os.path.join(base, "4 Debunk/Akira forget")
    elif "goku" in t and "mentalité" in t:
        dest = os.path.join(base, "4 Debunk/goku mentalité")
    elif "kanzenban" in t or "perfect edition" in t:
        dest = os.path.join(base, "4 Debunk/perfect edition")
    elif any(k in t for k in ["tweet", "quora", "reddit", "vs", "debate", "forum"]):
        dest = commu_dir
    else:
        dest = memes_dir

    shutil.move(fp, os.path.join(dest, f))

print("Organized Debunk aleatoire into clean subcategories and specific folders")
