#!/usr/bin/env python3
import os
import json
import shutil

base_root = "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test"
base_fc = os.path.join(base_root, "2 Force calcul")
index_path = "/root/dev/shenron/scratch/full_scan_index.json"

with open(index_path, "r", encoding="utf-8") as f:
    index = json.load(f)

def get_text(fn):
    item = index.get(fn, {})
    return (fn + " " + item.get("text", "")).lower()

def safe_move(src_path, dst_dir):
    if not os.path.exists(src_path):
        return
    os.makedirs(dst_dir, exist_ok=True)
    fn = os.path.basename(src_path)
    target = os.path.join(dst_dir, fn)
    if os.path.exists(target) and target != src_path:
        base_name, ext = os.path.splitext(fn)
        counter = 1
        while os.path.exists(target):
            target = os.path.join(dst_dir, f"{base_name}_{counter}{ext}")
            counter += 1
    shutil.move(src_path, target)

# ==========================================
# 0. RELOCATE EXPLICIT MISPLACED FILES
# ==========================================
print("Step 0: Correcting cross-saga misclassifications...")

# image0.png in 1 Saga OG is actually Moro Arc / Broly recap
og_image0 = os.path.join(base_fc, "1 Saga OG Puissance", "image0.png")
if os.path.exists(og_image0):
    safe_move(og_image0, os.path.join(base_fc, "5 Saga Super Puissance", "Morro files"))
    print("  Moved image0.png from OG to Super/Morro files")

# DBS files in GT Goku
gt_goku_dir = os.path.join(base_fc, "6 Saga GT  Puissance", "Goku files")
dbs_in_gt = {
    "IMG_7837.png": os.path.join(base_fc, "5 Saga Super Puissance", "Beerus files", "Beerus Puissance et Exploits"),
    "Screenshot_2025-05-04_190137_upscayl_4x_ultrasharp.png": os.path.join(base_fc, "5 Saga Super Puissance", "Whis Files"),
    "Screenshot_20260724_133738_Gallery.jpg": os.path.join(base_fc, "5 Saga Super Puissance", "Goku Files", "Son propre Ultra instinct"),
    "Capture d'écran 2026-09-26 185712.png": os.path.join(base_fc, "5 Saga Super Puissance", "Zamasu files", "Vegetto vs zamasu"),
    "Capture d'écran 2025-11-16 124318.png": os.path.join(base_fc, "5 Saga Super Puissance", "Zamasu files", "Vegetto vs zamasu"),
    "Screenshot_20260901_033807_Chrome.jpg": os.path.join(base_fc, "5 Saga Super Puissance", "Zamasu files", "Vegetto vs zamasu")
}
for fn, dest in dbs_in_gt.items():
    src = os.path.join(gt_goku_dir, fn)
    if os.path.exists(src):
        safe_move(src, dest)
        print(f"  Moved {fn} from GT to {dest}")

print("Step 0 complete.\n")

# ==========================================
# 1. SAGA OG PUISSANCE (27 files)
# ==========================================
print("Step 1: Routing 1 Saga OG Puissance...")
og_dir = os.path.join(base_fc, "1 Saga OG Puissance")
films_og_dir = os.path.join(og_dir, "Films OG")
os.makedirs(films_og_dir, exist_ok=True)

for f in os.listdir(og_dir):
    fp = os.path.join(og_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["princesse", "dormante", "soleil", "machine", "chateau", "lucifer"]):
        dest = films_og_dir
    elif any(k in t for k in ["arale", "penguin", "senbei"]):
        dest = os.path.join(og_dir, "Arale")
    elif any(k in t for k in ["muten", "roshi", "tortue", "kame sennin", "mutaito"]):
        dest = os.path.join(og_dir, "Muten Roshi")
    elif any(k in t for k in ["piccolo", "daimao", "tambourine"]):
        dest = os.path.join(og_dir, "Piccolo")
    elif any(k in t for k in ["grand-père", "gp gohan", "son gohan", "chapter8", "ch.8", "ox demon", "gyumao"]):
        dest = os.path.join(og_dir, "GP Gohan")
    elif any(k in t for k in ["goku", "battle-intelligence", "fight-iq", "saiyan"]):
        dest = os.path.join(og_dir, "Goku")
    else:
        dest = os.path.join(og_dir, "Unité OG")
    safe_move(fp, dest)

print("Step 1 complete.\n")

# ==========================================
# 2. SAGA FREEZER PUISSANCE (47 files + subdirs)
# ==========================================
print("Step 2: Routing 2 Saga Freezer Puissance...")
fz_dir = os.path.join(base_fc, "2 Saga Freezer Puissance")

# 2.1 Freezer files subdirs
ff_dir = os.path.join(fz_dir, "Freezer files")
f3_dir = os.path.join(ff_dir, "3ème form")
os.makedirs(f3_dir, exist_ok=True)
for f in os.listdir(ff_dir):
    fp = os.path.join(ff_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["3ème", "tercer", "163447", "163532", "163543", "3z0vujb39ple1"]):
        dest = f3_dir
    elif any(k in t for k in ["1ère", "530 000", "scouter"]):
        dest = os.path.join(ff_dir, "1ère form")
    elif any(k in t for k in ["2ème", "1 000 000", "corne"]):
        dest = os.path.join(ff_dir, "2ème form")
    else:
        dest = os.path.join(ff_dir, "form final")
    safe_move(fp, dest)

# 2.2 Goku subdirs
gk_dir = os.path.join(fz_dir, "Goku")
gk_base_dir = os.path.join(gk_dir, "Goku Base et Kaioken")
os.makedirs(gk_base_dir, exist_ok=True)
for f in os.listdir(gk_dir):
    fp = os.path.join(gk_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["ssj", "super saiyan", "colère", "legendary", "jaune", "doré"]):
        dest = os.path.join(gk_dir, "Goku SSJ files")
    else:
        dest = gk_base_dir
    safe_move(fp, dest)

# 2.3 Direct root files
for f in os.listdir(fz_dir):
    fp = os.path.join(fz_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["genkidama", "spirit bomb", "kaio", "nameknefait"]):
        dest = os.path.join(fz_dir, "Genkidama files")
    elif any(k in t for k in ["ginyu", "recoome", "burter", "jeice", "guldo", "commando", "captain"]):
        dest = os.path.join(fz_dir, "Ginyu files")
    elif any(k in t for k in ["radditz", "raditz", "saibaiman", "saibaimen"]):
        dest = os.path.join(fz_dir, "Radditz")
    elif any(k in t for k in ["piccolo", "nail"]):
        dest = os.path.join(fz_dir, "Piccolo")
    elif any(k in t for k in ["vegeta", "zenkai", "planète", "retabli"]):
        dest = os.path.join(fz_dir, "Vegeta files")
    elif any(k in t for k in ["freezer", "frieza", "120000"]):
        dest = os.path.join(ff_dir, "form final")
    elif any(k in t for k in ["kaioken", "kaio-ken", "goku"]):
        if any(k in t for k in ["ssj", "super saiyan"]):
            dest = os.path.join(gk_dir, "Goku SSJ files")
        else:
            dest = gk_base_dir
    else:
        dest = os.path.join(fz_dir, "unité sf")
    safe_move(fp, dest)

print("Step 2 complete.\n")

# ==========================================
# 3. SAGA CELL PUISSANCE (71 files + subdirs)
# ==========================================
print("Step 3: Routing 3 Saga Cell Puissance...")
cell_saga_dir = os.path.join(base_fc, "3 Saga Cell Puissance")

# 3.1 Cell files subdirs
cf_dir = os.path.join(cell_saga_dir, "Cell files")
c_zenkai_dir = os.path.join(cf_dir, "Cell Parfait et Zenkai")
os.makedirs(c_zenkai_dir, exist_ok=True)
for f in os.listdir(cf_dir):
    fp = os.path.join(cf_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["piccolo cell solar", "solar kamehameha", "soleil", "piccolo"]):
        dest = os.path.join(cf_dir, "piccolo cell solar")
    else:
        dest = c_zenkai_dir
    safe_move(fp, dest)

# 3.2 Gohan Files subdirs
gf_dir = os.path.join(cell_saga_dir, "Gohan Files")
g_ssj2_dir = os.path.join(gf_dir, "Gohan SSJ2 et Potentiel")
os.makedirs(g_ssj2_dir, exist_ok=True)
for f in os.listdir(gf_dir):
    fp = os.path.join(gf_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["father-son", "kamehameha", "pere-fils", "père-fils", "200354", "xbqymxpl", "234054"]):
        dest = os.path.join(gf_dir, "Gohan Kamehameha")
    else:
        dest = g_ssj2_dir
    safe_move(fp, dest)

# 3.3 Root files
cyborgs_dir = os.path.join(cell_saga_dir, "Cyborgs C16 C17 C18")
os.makedirs(cyborgs_dir, exist_ok=True)
for f in os.listdir(cell_saga_dir):
    fp = os.path.join(cell_saga_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["c-19", "c19", "gero", "c-20", "c20"]):
        dest = os.path.join(cell_saga_dir, "C19")
    elif any(k in t for k in ["c-16", "c16", "c-17", "c17", "c-18", "c18"]):
        dest = cyborgs_dir
    elif any(k in t for k in ["vegeta", "super vegeta", "final flash"]):
        dest = os.path.join(cell_saga_dir, "Super Vegeta files")
    elif any(k in t for k in ["gohan", "father-son", "kamehameha", "ssj2"]):
        dest = g_ssj2_dir
    elif any(k in t for k in ["cell", "perfect", "cell games", "ring"]):
        dest = c_zenkai_dir
    elif any(k in t for k in ["goku", "ssj"]):
        dest = os.path.join(cell_saga_dir, "Goku SSJ files")
    else:
        dest = c_zenkai_dir
    safe_move(fp, dest)

print("Step 3 complete.\n")

# ==========================================
# 4. SAGA BUU PUISSANCE (49 files + subdirs)
# ==========================================
print("Step 4: Routing 4 Saga Buu Puissance...")
buu_saga_dir = os.path.join(base_fc, "4 Saga Buu Puissance")

# 4.1 Buuhan files
bh_dir = os.path.join(buu_saga_dir, "Buu files", "Buuhan files")
bh_fr_dir = os.path.join(bh_dir, "francais et raw")
os.makedirs(bh_fr_dir, exist_ok=True)
for f in os.listdir(bh_dir):
    fp = os.path.join(bh_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["english", "eng", "sub"]):
        dest = os.path.join(bh_dir, "anglais")
    else:
        dest = bh_fr_dir
    safe_move(fp, dest)

# 4.2 Buu files
bf_dir = os.path.join(buu_saga_dir, "Buu files")
b_dim_dir = os.path.join(bf_dir, "Super Buu et Dimension")
os.makedirs(b_dim_dir, exist_ok=True)
for f in os.listdir(bf_dir):
    fp = os.path.join(bf_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["buuhan", "vegetto vs", "vegeto_egal"]):
        dest = bh_fr_dir
    elif any(k in t for k in ["buutenks", "gotenks absorbed"]):
        dest = os.path.join(bf_dir, "Buutenks files")
    elif any(k in t for k in ["kid buu", "pure buu", "kidbuu"]):
        dest = os.path.join(bf_dir, "KidBuu files")
    else:
        dest = b_dim_dir
    safe_move(fp, dest)

# 4.3 Goku files
bgk_dir = os.path.join(buu_saga_dir, "Goku files")
bgk_base_dir = os.path.join(bgk_dir, "Goku Autre-Monde et Fin Z")
os.makedirs(bgk_base_dir, exist_ok=True)
for f in os.listdir(bgk_dir):
    fp = os.path.join(bgk_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["ssj3", "super saiyan 3"]):
        dest = os.path.join(bgk_dir, "Goku SSJ3 files")
    else:
        dest = bgk_base_dir
    safe_move(fp, dest)

# 4.4 Root files
for f in os.listdir(buu_saga_dir):
    fp = os.path.join(buu_saga_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["vegetto", "vegito", "potara", "potala"]):
        dest = os.path.join(buu_saga_dir, "Vegetto Files")
    elif any(k in t for k in ["gotenks", "fusion"]):
        dest = os.path.join(buu_saga_dir, "Gotenks SSJ3")
    elif any(k in t for k in ["dabra", "dabura"]):
        dest = os.path.join(buu_saga_dir, "Dabra Files")
    elif any(k in t for k in ["vegeta", "majin vegeta"]):
        dest = os.path.join(buu_saga_dir, "vegeta Files")
    elif any(k in t for k in ["pan"]):
        dest = os.path.join(buu_saga_dir, "Pan Files")
    elif any(k in t for k in ["gohan", "ultimate gohan", "potentiel"]):
        dest = os.path.join(buu_saga_dir, "Gohan Files")
    elif any(k in t for k in ["goku", "ssj3", "kattin", "oob", "uub"]):
        dest = bgk_base_dir
    elif any(k in t for k in ["kid buu", "kidbuu"]):
        dest = os.path.join(bf_dir, "KidBuu files")
    elif any(k in t for k in ["buutenks"]):
        dest = os.path.join(bf_dir, "Buutenks files")
    else:
        dest = b_dim_dir
    safe_move(fp, dest)

print("Step 4 complete.\n")

# ==========================================
# 5. SAGA SUPER PUISSANCE (69 files + subdirs)
# ==========================================
print("Step 5: Routing 5 Saga Super Puissance...")
dbs_dir = os.path.join(base_fc, "5 Saga Super Puissance")

# 5.1 Beerus files
beerus_dir = os.path.join(dbs_dir, "Beerus files")
b_exploits_dir = os.path.join(beerus_dir, "Beerus Puissance et Exploits")
os.makedirs(b_exploits_dir, exist_ok=True)
for f in os.listdir(beerus_dir):
    fp = os.path.join(beerus_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["hakkai", "hakai"]):
        dest = os.path.join(beerus_dir, "hakkai debunk")
    else:
        dest = b_exploits_dir
    safe_move(fp, dest)

# 5.2 Broly Files
broly_dir = os.path.join(dbs_dir, "Broly Files")
for f in os.listdir(broly_dir):
    fp = os.path.join(broly_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["beerus", "superieur a beerus", "compar"]):
        dest = os.path.join(broly_dir, "beerus broly")
    elif any(k in t for k in ["ozaru", "oozaru", "ikari", "colere"]):
        dest = os.path.join(broly_dir, "ozaru")
    elif any(k in t for k in ["berserk", "controle"]):
        dest = os.path.join(broly_dir, "berserk controle")
    else:
        dest = os.path.join(broly_dir, "le plus fort")
    safe_move(fp, dest)

# 5.3 Freezer files
f_dbs_dir = os.path.join(dbs_dir, "Freezer files")
for f in os.listdir(f_dbs_dir):
    fp = os.path.join(f_dbs_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["black", "noir"]):
        dest = os.path.join(f_dbs_dir, "Black freezer")
    else:
        dest = os.path.join(f_dbs_dir, "FNF Golden Freezer")
    safe_move(fp, dest)

# 5.4 Goku Files / Beyond God Files
bg_dir = os.path.join(dbs_dir, "Goku Files", "Beyond God Files")
for f in os.listdir(bg_dir):
    fp = os.path.join(bg_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["film", "movie", "resurrection"]):
        dest = os.path.join(bg_dir, "film explication")
    else:
        dest = os.path.join(bg_dir, "anime explication")
    safe_move(fp, dest)

# 5.5 Jiren files
jiren_dir = os.path.join(dbs_dir, "Jiren files")
for f in os.listdir(jiren_dir):
    fp = os.path.join(jiren_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["genkidama"]):
        dest = os.path.join(jiren_dir, "Jiren Genkidama")
    elif any(k in t for k in ["hit"]):
        dest = os.path.join(jiren_dir, "Jiren vs Hit")
    elif any(k in t for k in ["vermoud", "belmod"]):
        dest = os.path.join(jiren_dir, "plus fort que vermoud")
    elif any(k in t for k in ["serieux", "full power"]):
        dest = os.path.join(jiren_dir, "sérieux")
    else:
        dest = os.path.join(jiren_dir, "le plus fort rencontrer")
    safe_move(fp, dest)

# 5.6 Kefla files
kefla_dir = os.path.join(dbs_dir, "Kefla files")
k_exploits_dir = os.path.join(kefla_dir, "Kefla Puissance et Combat")
os.makedirs(k_exploits_dir, exist_ok=True)
for f in os.listdir(kefla_dir):
    fp = os.path.join(kefla_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["universal", "univers"]):
        dest = os.path.join(kefla_dir, "universal")
    else:
        dest = k_exploits_dir
    safe_move(fp, dest)

# 5.7 Trunks files
trunks_dir = os.path.join(dbs_dir, "Trunks files")
for f in os.listdir(trunks_dir):
    fp = os.path.join(trunks_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["genki", "epee", "sword", "yuki"]):
        dest = os.path.join(trunks_dir, "YUKI GENKDIAMAAAA")
    else:
        dest = os.path.join(trunks_dir, "trunks level")
    safe_move(fp, dest)

# 5.8 Zamasu files
zamasu_dir = os.path.join(dbs_dir, "Zamasu files")
z_fusion_dir = os.path.join(zamasu_dir, "Zamasu Fusion et Infinite Zamasu")
os.makedirs(z_fusion_dir, exist_ok=True)
for f in os.listdir(zamasu_dir):
    fp = os.path.join(zamasu_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["vegetto", "vegito"]):
        dest = os.path.join(zamasu_dir, "Vegetto vs zamasu")
    elif any(k in t for k in ["zenkai"]):
        dest = os.path.join(zamasu_dir, "zamaus zenkai")
    elif any(k in t for k in ["outer", "outerversal"]):
        dest = os.path.join(zamasu_dir, "Goku Black Outerversal")
    elif any(k in t for k in ["plus fort", "devient"]):
        dest = os.path.join(zamasu_dir, "blakc goku devient lus fort")
    elif any(k in t for k in ["louter"]):
        dest = os.path.join(zamasu_dir, "louter de black")
    else:
        dest = z_fusion_dir
    safe_move(fp, dest)

# 5.9 Zeno files
zeno_dir = os.path.join(dbs_dir, "Zeno files")
for f in os.listdir(zeno_dir):
    fp = os.path.join(zeno_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["timeline", "detruite", "effac"]):
        dest = os.path.join(zeno_dir, "timeline detruite")
    else:
        dest = os.path.join(zeno_dir, "Zeno")
    safe_move(fp, dest)

# 5.10 Goku Files direct files
gk_dbs_dir = os.path.join(dbs_dir, "Goku Files")
for f in os.listdir(gk_dbs_dir):
    fp = os.path.join(gk_dbs_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["mui", "mastered", "argent", "silver", "ultra instinct", "129"]):
        dest = os.path.join(gk_dbs_dir, "MUI")
    elif any(k in t for k in ["ssjb", "blue", "super saiyan god super"]):
        dest = os.path.join(gk_dbs_dir, "SSJB")
    elif any(k in t for k in ["ssjg", "god", "rouge", "red"]):
        dest = os.path.join(gk_dbs_dir, "SSJG")
    elif any(k in t for k in ["hit"]):
        dest = os.path.join(gk_dbs_dir, "Goku Vs Hit")
    elif any(k in t for k in ["gohan"]):
        dest = os.path.join(gk_dbs_dir, "Goku vs gohan")
    elif any(k in t for k in ["zamasu", "black"]):
        dest = os.path.join(gk_dbs_dir, "goku vs Zamasu")
    elif any(k in t for k in ["trou noir", "black hole", "gravity"]):
        dest = os.path.join(gk_dbs_dir, "trou noir")
    elif any(k in t for k in ["soulever", "lift"]):
        dest = os.path.join(gk_dbs_dir, "Soulever")
    elif any(k in t for k in ["chojigen"]):
        dest = os.path.join(gk_dbs_dir, "Chojigen Files")
    elif any(k in t for k in ["toyotaro", "propre ultra"]):
        dest = os.path.join(gk_dbs_dir, "Son propre Ultra instinct")
    elif any(k in t for k in ["vegeta"]):
        dest = os.path.join(gk_dbs_dir, "Explication Vegeta")
    else:
        dest = os.path.join(gk_dbs_dir, "Exploit")
    safe_move(fp, dest)

# 5.11 Root DBS direct files (69 files)
for f in os.listdir(dbs_dir):
    fp = os.path.join(dbs_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["beerus"]):
        dest = b_exploits_dir
    elif any(k in t for k in ["broly"]):
        dest = os.path.join(broly_dir, "le plus fort")
    elif any(k in t for k in ["moro", "morro", "merus"]):
        dest = os.path.join(dbs_dir, "Morro files")
    elif any(k in t for k in ["gas"]):
        dest = os.path.join(dbs_dir, "Gas Files")
    elif any(k in t for k in ["granola", "granolah"]):
        dest = os.path.join(dbs_dir, "Granola Files")
    elif any(k in t for k in ["gogeta"]):
        dest = os.path.join(dbs_dir, "Gogeta Filles")
    elif any(k in t for k in ["vegetto", "vegito"]):
        dest = os.path.join(dbs_dir, "Vegetto SSJB files")
    elif any(k in t for k in ["zamasu", "black"]):
        dest = z_fusion_dir
    elif any(k in t for k in ["zeno", "zen-oh"]):
        dest = os.path.join(zeno_dir, "timeline detruite")
    elif any(k in t for k in ["whis", "vados"]):
        dest = os.path.join(dbs_dir, "Whis Files")
    elif any(k in t for k in ["hit"]):
        dest = os.path.join(dbs_dir, "Hit files")
    elif any(k in t for k in ["kefla", "kale", "caulifla"]):
        dest = k_exploits_dir
    elif any(k in t for k in ["jiren"]):
        dest = os.path.join(jiren_dir, "le plus fort rencontrer")
    elif any(k in t for k in ["trunks"]):
        dest = os.path.join(trunks_dir, "trunks level")
    elif any(k in t for k in ["vegeta", "ultra ego", "ego"]):
        dest = os.path.join(dbs_dir, "Vegeta files")
    elif any(k in t for k in ["freezer", "golden"]):
        dest = os.path.join(f_dbs_dir, "FNF Golden Freezer")
    elif any(k in t for k in ["gamma", "cell max"]):
        dest = os.path.join(dbs_dir, "Gamma et Cell maxFiles")
    elif any(k in t for k in ["piccolo", "orange"]):
        dest = os.path.join(dbs_dir, "Piccolo Files")
    elif any(k in t for k in ["gohan", "beast"]):
        dest = os.path.join(dbs_dir, "Gohan files")
    elif any(k in t for k in ["cabba"]):
        dest = os.path.join(dbs_dir, "Cabba Files")
    elif any(k in t for k in ["vermoud", "belmod"]):
        dest = os.path.join(dbs_dir, "Vermoud Files")
    elif any(k in t for k in ["goku"]):
        dest = os.path.join(gk_dbs_dir, "Exploit")
    else:
        dest = os.path.join(dbs_dir, "Z Team Files")
    safe_move(fp, dest)

print("Step 5 complete.\n")

# ==========================================
# 6. SAGA GT PUISSANCE (36 files + subdirs)
# ==========================================
print("Step 6: Routing 6 Saga GT Puissance...")
gt_dir = os.path.join(base_fc, "6 Saga GT  Puissance")

# 6.1 Goku files / 4 Goku GOD / Omnipotence
omnipo_dir = os.path.join(gt_dir, "Goku files", "4 Goku GOD", "Omnipotence")
omnipo_anime_dir = os.path.join(omnipo_dir, "anime et guides")
os.makedirs(omnipo_anime_dir, exist_ok=True)
for f in os.listdir(omnipo_dir):
    fp = os.path.join(omnipo_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["game"]):
        dest = os.path.join(omnipo_dir, "game")
    else:
        dest = omnipo_anime_dir
    safe_move(fp, dest)

# 6.2 Goku files / 4 Goku GOD
god_dir = os.path.join(gt_dir, "Goku files", "4 Goku GOD")
for f in os.listdir(god_dir):
    fp = os.path.join(god_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["omnipotence", "omnipotent", "toute puissance"]):
        dest = omnipo_anime_dir
    elif any(k in t for k in ["omnipresence", "partout"]):
        dest = os.path.join(god_dir, "Omnipresence")
    elif any(k in t for k in ["omniscience", "savoir"]):
        dest = os.path.join(god_dir, "Omniscience")
    elif any(k in t for k in ["immortal", "mourir", "mort", "vivant"]):
        dest = os.path.join(god_dir, "immortal")
    elif any(k in t for k in ["higher", "existence", "dimension"]):
        dest = os.path.join(god_dir, "higher Existence")
    else:
        dest = os.path.join(god_dir, "God")
    safe_move(fp, dest)

# 6.3 Goku files
gt_gk_dir = os.path.join(gt_dir, "Goku files")
gt_gk_base = os.path.join(gt_gk_dir, "Goku Base et SSJ1-3")
os.makedirs(gt_gk_base, exist_ok=True)
for f in os.listdir(gt_gk_dir):
    fp = os.path.join(gt_gk_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["god", "dieu", "immortel", "fin"]):
        dest = os.path.join(god_dir, "God")
    elif any(k in t for k in ["ssj4", "super saiyan 4"]):
        dest = os.path.join(gt_gk_dir, "SSJ4 files")
    else:
        dest = gt_gk_base
    safe_move(fp, dest)

# 6.4 Root GT direct files
for f in os.listdir(gt_dir):
    fp = os.path.join(gt_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["gogeta", "fusion"]):
        dest = os.path.join(gt_dir, "Gogeta 4 files")
    elif any(k in t for k in ["baby"]):
        dest = os.path.join(gt_dir, "Baby files")
    elif any(k in t for k in ["super 17", "super c17", "c-17", "c17"]):
        dest = os.path.join(gt_dir, "Super c17 files")
    elif any(k in t for k in ["omega", "shenron", "syn", "li shenron", "dragon", "dragons maléfiques", "邪恶龍"]):
        dest = os.path.join(gt_dir, "Omega Shenron files")
    elif any(k in t for k in ["rilder", "rilldo"]):
        dest = os.path.join(gt_dir, "Rilder files")
    elif any(k in t for k in ["majuub", "oob", "uub"]):
        dest = os.path.join(gt_dir, "Majuub Files")
    else:
        dest = gt_gk_base
    safe_move(fp, dest)

print("Step 6 complete.\n")

# ==========================================
# 7. SAGA FILM PUISSANCE (46 files + subdirs)
# ==========================================
print("Step 7: Routing 7 Saga Film Puissance...")
film_dir = os.path.join(base_fc, "7 Saga Film Puissance")

# 7.1 Janemba files
janemba_dir = os.path.join(film_dir, "Janemba files")
j_film_dir = os.path.join(janemba_dir, "Janemba Film 12 et Gogeta")
os.makedirs(j_film_dir, exist_ok=True)
for f in os.listdir(janemba_dir):
    fp = os.path.join(janemba_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["shinbudokai", "shin buodkai", "shin"]):
        dest = os.path.join(janemba_dir, "janemba shinbuodkai")
    else:
        dest = j_film_dir
    safe_move(fp, dest)

# 7.2 Root Film files
cooler_dir = os.path.join(film_dir, "Cooler files")
guides_dir = os.path.join(film_dir, "Films Z Guides et Comparatifs")
os.makedirs(cooler_dir, exist_ok=True)
os.makedirs(guides_dir, exist_ok=True)

for f in os.listdir(film_dir):
    fp = os.path.join(film_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)
    if any(k in t for k in ["janemba", "enma", "saike"]):
        dest = j_film_dir
    elif any(k in t for k in ["broly"]):
        dest = os.path.join(film_dir, "Broly files")
    elif any(k in t for k in ["hatchiyack", "hatchjack", "tsufur"]):
        dest = os.path.join(film_dir, "Hatchiyack files")
    elif any(k in t for k in ["hildegarn", "hirudegarn", "tapion"]):
        dest = os.path.join(film_dir, "Hildegarnes files")
    elif any(k in t for k in ["cooler"]):
        dest = cooler_dir
    else:
        dest = guides_dir
    safe_move(fp, dest)

print("Step 7 complete.\n")

# ==========================================
# 8. XENOVERSE & SDBH (413 files)
# ==========================================
print("Step 8: Routing 9 Xenoverse & SDBH...")
xeno_dir = os.path.join(base_fc, "9 Xenoverse & SDBH")

for f in os.listdir(xeno_dir):
    fp = os.path.join(xeno_dir, f)
    if not os.path.isfile(fp): continue
    t = get_text(f)

    if any(k in t for k in ["demigra", "toki toki", "tokitoki", "toki-toki", "time bird", "toki_toki"]):
        dest = os.path.join(xeno_dir, "Demigra absorb Toki toki")
    elif any(k in t for k in ["scroll of eternity", "scroll", "eternity", "rouleau"]):
        dest = os.path.join(xeno_dir, "scroll of eternity")
    elif any(k in t for k in ["brain wash", "brainwash", "mind control", "lavage"]):
        dest = os.path.join(xeno_dir, "brain wash")
    elif any(k in t for k in ["dark ki", "dark-ki", "dark empire", "dark energy", "neg"]):
        dest = os.path.join(xeno_dir, "dark ki neg")
    elif any(k in t for k in ["fake universe", "pseudo universe", "faux univers", "fu fake"]):
        dest = os.path.join(xeno_dir, "fake universe")
    elif any(k in t for k in ["koyama", "takao koyama"]):
        dest = os.path.join(xeno_dir, "Koyama tweet")
    elif any(k in t for k in ["boundless", "infinite dimension", "outerversal", "hyperversal", "5d", "6d", "hierarchy", "metaphysics", "metaphysical", "outside of the ordinary flow"]):
        dest = os.path.join(xeno_dir, "Xeno Boundless")
    elif any(k in t for k in ["speed", "vitesse", "immeasurable", "infinie vitesse", "instant"]):
        dest = os.path.join(xeno_dir, "Xeno Vitesse")
    elif any(k in t for k in ["resistance", "immune", "immunity", "durability", "tank"]):
        dest = os.path.join(xeno_dir, "Xeno Resistance")
    elif any(k in t for k in ["power", "strength", "attack potency", "puissance", "force", "frappe", "bp", "battle power", "multiverse level"]):
        dest = os.path.join(xeno_dir, "Xeno Force")
    elif any(k in t for k in ["timeline", "history", "multiverse", "realm", "world", "histoire", "univers", "time space", "timespace"]):
        dest = os.path.join(xeno_dir, "XenoWorld")
    elif any(k in t for k in ["exploit", "feat", "destroy", "detruit", "erase", "消滅"]):
        dest = os.path.join(xeno_dir, "Xeno Exploit")
    elif any(k in t for k in ["ability", "capacite", "technique", "hax", "seal", "effacement", "manipulation"]):
        dest = os.path.join(xeno_dir, "Xeno Capacité")
    else:
        dest = os.path.join(xeno_dir, "Xeno AUtre")
    safe_move(fp, dest)

print("Step 8 complete.\n")

# ==========================================
# 9. REGLES DE LA FORCE (23 files)
# ==========================================
print("Step 9: Routing règles de la force...")
regles_dir = os.path.join(base_fc, "règles de la force")
regles_dest = os.path.join(regles_dir, "Multiplicateurs et Vitesse")
os.makedirs(regles_dest, exist_ok=True)

for f in os.listdir(regles_dir):
    fp = os.path.join(regles_dir, f)
    if not os.path.isfile(fp): continue
    safe_move(fp, regles_dest)

print("Step 9 complete.\n")
print("=== All sections in 2 Force calcul organized! ===")
