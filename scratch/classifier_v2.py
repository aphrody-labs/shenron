#!/usr/bin/env python3
import json
import os
import re
from collections import Counter

with open("scratch/audit_index.json", "r", encoding="utf-8") as f:
    data = json.load(f)

base = "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test"

def classify_item_v2(item):
    pool = item["pool"]
    filename = item["filename"].lower()
    text = item.get("text", "").lower()
    combined = f"{filename} \n {text}"

    # 1. ROOT & SPECIAL OVERRIDES
    if pool == "jsp_mauvaise_trad":
        return "4 Debunk/Mauvaise Trad + falacieux"
    if pool == "root":
        if "barrier" in filename:
            return "3 Capacité et autre/barrière d'énergie"
        if "ttg" in filename:
            return "4 Debunk/Saga buu/Statement Z"
        if "14.jpg" in filename:
            return "2 Force calcul/7 Saga Film Puissance"

    # 2. CROSSVERSE / MATCHUPS / GOKU SOLO
    if any(k in combined for k in [
        "anos", "jin woo", "jinwoo", "yogiri", "relevancy league", "madoka", "goku solo", "goku solos",
        "vs battle", "crossverse", "solos", "mogger"
    ]):
        return "4 Debunk/Crossverse et Matchups"
    if "saitama" in combined or "opm" in combined or "one punch" in combined:
        return "4 Debunk/opm debunk"

    # 3. BUU SAGA (all buu mentions across pools, especially saga_buu_a_trier)
    if pool == "saga_buu_a_trier" or "buu" in combined or "boo" in combined or "ブウ" in combined:
        if "beerus" in combined and ("kid" in combined or "buu" in combined or "vs" in combined):
            return "4 Debunk/Saga buu/KidBuu VS Beerus"
        if "moro" in combined or "morro" in combined or "モロ" in combined:
            return "4 Debunk/Saga buu/Morro Arc"
        if "daima" in combined or "ダイマ" in combined:
            return "4 Debunk/Saga buu/Statement Daima"
        if "gt" in combined and ("uub" in combined or "oubou" in combined or "baby" in combined):
            return "4 Debunk/Saga buu/Statement GT"
        if any(k in combined for k in ["carddass", "kakarot", "budokai", "tenkaichi", "dokkan", "legends", "game", "jeu", "カードダス"]):
            return "4 Debunk/Saga buu/Statement Jeu"
        if "super" in combined and ("dbs" in combined or "anime" in combined or "アニメ" in combined):
            return "4 Debunk/Saga buu/Statement Super"
        if "koyama" in combined or "小山" in combined:
            return "4 Debunk/Saga buu/Cas de Koyama"
        if "buutenks" in combined or "gotenks absorb" in combined:
            return "4 Debunk/Saga buu/debunk buutenks"
        if "buuhan" in combined or "gohan absorb" in combined or "悟飯吸収" in combined:
            return "4 Debunk/Saga buu/Buuhan SSJ3"
        if "genkidama" in combined or "spirit bomb" in combined or "元気玉" in combined:
            return "4 Debunk/Saga buu/Genkidama"
        if "gohan" in combined and "ssj3" in combined:
            return "4 Debunk/Saga buu/Gohan SSJ3"
        if "gohan" in combined and ("gotenks" in combined or "superbuu" in combined or "super buu" in combined):
            return "4 Debunk/Saga buu/Gotenks SuperBuu Gohan"
        if "gohan" in combined and ("protag" in combined or "potentiel" in combined or "mystic" in combined or "ultimate" in combined or "15代前" in combined or "老界王神" in combined):
            return "4 Debunk/Saga buu/Gohan Protagoniste"
        if "ment" in combined and "goku" in combined:
            return "4 Debunk/Saga buu/Goku ment sur sa force"
        if "numéro 1" in combined or "numero 1" in combined or "number 1" in combined or "nanbaa wan" in combined or "perdu" in combined:
            return "4 Debunk/Saga buu/Goku numéro 1"
        if any(k in combined for k in ["databook", "daizenshuu", "chozenshu", "forever", "densetsu", "大全集", "超全集"]):
            return "4 Debunk/Saga buu/KidBuu DataBook"
        if "ssj3" in combined and ("minute" in combined or "kid" in combined or "rassemble" in combined or "énergie" in combined):
            return "4 Debunk/Saga buu/KidBuu SSJ3"
        if "intérieur" in combined or "interieur" in combined or "inside" in combined or "cuerpo" in combined:
            return "4 Debunk/Saga buu/Buu Intérieur"
        if "kaioshin" in combined or "界王神" in combined or "daikaiohshin" in combined or "大界王神" in combined:
            return "4 Debunk/Saga buu/Kaioshin Explication"
        if "knock" in combined or "ko" in combined or "dégâts" in combined:
            return "4 Debunk/Saga buu/Knock-Out"
        if "end of z" in combined or "eoz" in combined or "10 ans" in combined:
            return "4 Debunk/Saga buu/End Of Z"
        if "dernière chance" in combined or "derniere chance" in combined:
            return "4 Debunk/Saga buu/Dernière Chance"
        if "insondable" in combined:
            return "4 Debunk/Saga buu/Insondable"
        if "interview" in combined or "toriyama" in combined:
            return "4 Debunk/Saga buu/Interview Toriyama"
        if "freezer" in combined and ("peur" in combined or "fear" in combined):
            return "4 Debunk/Saga buu/Freezer peur"
        if "moquerie" in combined or "vegeta moqu" in combined:
            return "4 Debunk/Saga buu/Vegeta moquerie"
        if "vsbattles" in combined or "vs battles" in combined:
            return "4 Debunk/Saga buu/vsbattles_rules"
        if "english sub" in combined or "eng sub" in combined:
            return "4 Debunk/Saga buu/Statement Z/english sub"
        if "statement z" in combined or "dbz" in combined or "épisode" in combined or "episode" in combined or "話" in combined:
            return "4 Debunk/Saga buu/Statement Z"
        if "super buu" in combined:
            return "4 Debunk/Saga buu/Super Buu et KidBuu"
        if pool == "saga_buu_a_trier":
            return "4 Debunk/Saga buu"
        if "puissance" in combined or "calcul" in combined:
            return "2 Force calcul/4 Saga Buu Puissance"

    # 4. CAPACITÉS & TECHNIQUES
    if any(k in combined for k in ["ultra instinct", "migatte", "身勝手", "極意", "新極意", "mui", "tui"]):
        if "whis" in combined or "ウイス" in combined:
            return "3 Capacité et autre/Ultra Instinct/explication whis"
        if "popo" in combined or "ポポ" in combined:
            return "3 Capacité et autre/Ultra Instinct/entrianement popo"
        if "corps" in combined or "fort" in combined:
            return "3 Capacité et autre/Ultra Instinct/Coprs devient plus fort"
        if "calme" in combined:
            return "3 Capacité et autre/Ultra Instinct/besoin d'esprit calme"
        if "automatique" in combined or "deplacement" in combined:
            return "3 Capacité et autre/Ultra Instinct/deplacmeent uatomatique du corps"
        if "kefla" in combined:
            return "3 Capacité et autre/Ultra Instinct/Kefla vs goku"
        if "genkidama" in combined:
            return "3 Capacité et autre/Ultra Instinct/genkdiama carburant"
        return "3 Capacité et autre/Ultra Instinct"

    if any(k in combined for k in ["hakkai", "hakai", "破壊神", "破壊"]):
        if "zamasu" in combined:
            return "3 Capacité et autre/Hakkai/Goku Zamasu Hakkai"
        return "3 Capacité et autre/Hakkai/Fonctionnement du Hakkai"

    if any(k in combined for k in ["barrière", "barriere", "barrier", "バリヤー"]):
        return "3 Capacité et autre/barrière d'énergie"

    if any(k in combined for k in ["4ème mur", "4eme mur", "fourth wall", "quatrième mur"]):
        if "manga" in combined:
            return "3 Capacité et autre/4ème mur/manga"
        if "anime" in combined:
            return "3 Capacité et autre/4ème mur/Anime"
        if "jeu" in combined or "game" in combined:
            return "3 Capacité et autre/4ème mur/jeu vidéo"
        return "3 Capacité et autre/4ème mur"

    if any(k in combined for k in ["respirer", "espace", "vacuum", "vaccum", "survive in space", "oxygène"]):
        return "3 Capacité et autre/respirer dans l'espace"

    if any(k in combined for k in ["outer", "outerversal", "boundless", "hyperversal"]):
        return "3 Capacité et autre/Outer"

    if any(k in combined for k in ["déplacement instantané", "deplacement instantane", "instant transmission", "teleport", "shunkan", "瞬間移動"]):
        return "3 Capacité et autre/Déplacement instantané"

    if any(k in combined for k in ["absorption", "absorbtion", "吸収"]):
        return "3 Capacité et autre/Absorbtion"

    if any(k in combined for k in ["regen", "régénération", "regeneration", "再生"]):
        return "3 Capacité et autre/regen"

    if any(k in combined for k in ["potentiel", "potential", "bottomless", "unlimited"]):
        if "tdp" in combined or "tournoi" in combined:
            return "3 Capacité et autre/Potentiel/tdp"
        return "3 Capacité et autre/Potentiel/aucune limite"

    if any(k in combined for k in ["toonforce", "toon force", "arale", "アラレ", "dr slump", "dr. slump", "gag"]):
        return "3 Capacité et autre/ToonForce/arale"

    if any(k in combined for k in ["fusion technique", "danse métamol", "metamol", "fusion dance", "フュージョン"]):
        return "3 Capacité et autre/fusion technique"

    if any(k in combined for k in ["copier", "copie de technique", "mimicry"]):
        return "3 Capacité et autre/copier les techniques"

    if any(k in combined for k in ["clonage", "clone", "duplication", "分身"]):
        return "3 Capacité et autre/clonage"

    if any(k in combined for k in ["télépathie", "telepathie", "telepathy"]):
        return "3 Capacité et autre/télépathie"

    if any(k in combined for k in ["télékinésie", "telekinesie", "telekinesis"]):
        return "3 Capacité et autre/telekinésie"

    if any(k in combined for k in ["sentir", "détection", "detection", "percevoir"]) and "ki" in combined:
        return "3 Capacité et autre/Sentir les autres et ce qu'il se passe"

    if "intentions" in combined:
        return "3 Capacité et autre/Sentir les intentions"

    if any(k in combined for k in ["kamehameha", "かめはめ波"]):
        return "3 Capacité et autre/kamehameha"

    if any(k in combined for k in ["susano", "avatar de ki", "giant avatar"]):
        return "3 Capacité et autre/susano"

    if "plot armor" in combined:
        return "3 Capacité et autre/Plot Armor"

    if any(k in combined for k in ["attaque invisible", "invisible attack", "onde invisible"]):
        return "3 Capacité et autre/attaque invisible"

    if any(k in combined for k in ["electricité", "electricite", "lightning", "éclair"]):
        return "3 Capacité et autre/electricité"

    if "mort mais vivant" in combined or ("auréole" in combined and "vivant" in combined):
        return "3 Capacité et autre/mort mais vivant"

    if pool == "capacite_root":
        return "3 Capacité et autre"

    # 5. COSMOLOGIE & DRAGONWORLD (1 DragonWorld)
    if "deadzone" in combined or "dead zone" in combined:
        return "1 DragonWorld/Cosmos/DeadZone"
    if "dimension broly" in combined or ("broly" in combined and "gogeta" in combined and "dimension" in combined):
        return "1 DragonWorld/Cosmos/Dimension Broly Gogeta"
    if any(k in combined for k in ["autre monde", "afterlife", "enma", "閻魔", "anoyo", "paradis", "enfer"]):
        return "1 DragonWorld/Cosmos/L'autre monde"
    if any(k in combined for k in ["macrocosm", "univers 7", "macrocosme", "carte du cosmos"]):
        return "1 DragonWorld/Cosmos/Macrocosm Map"
    if any(k in combined for k in ["royaume des démons", "monde des demons", "makai", "魔界"]):
        return "1 DragonWorld/Cosmos/Monde des Démons"
    if any(k in combined for k in ["monde des kaioshin", "kaioshin realm", "界王神界", "planète des kaioshin"]):
        return "1 DragonWorld/Cosmos/Monde des Kaioshin"
    if any(k in combined for k in ["salle de l'esprit", "chambre du temps", "rosat", "room of spirit", "精神と時の部屋"]):
        return "1 DragonWorld/Cosmos/Salle de l'esprit et du temps"
    if "sugoroku" in combined or "スゴロク" in combined:
        return "1 DragonWorld/Cosmos/Sugoroku Space"
    if any(k in combined for k in ["tournoi du pouvoir", "tdp map", "力の大会", "arène du tournoi"]):
        return "1 DragonWorld/Cosmos/TDP map"
    if any(k in combined for k in ["toribot", "tori-bot", "トリボット"]):
        return "1 DragonWorld/Cosmos/arale toribot"
    if "koyama" in combined and ("cosmos" in combined or "tweet" in combined or "dimension" in combined):
        return "1 DragonWorld/Cosmos/koyama tweet"
    if any(k in combined for k in ["chronologie", "timeline", "âge ", "age ", "年表", "エイジ"]):
        if "gt" in combined:
            return "1 DragonWorld/Canon/Canon GT/timeline"
        return "1 DragonWorld/Chronologie"
    if any(k in combined for k in ["canon", "retcon"]):
        if "gt" in combined:
            return "1 DragonWorld/Canon/Canon GT"
        if "daima" in combined:
            return "1 DragonWorld/Canon/Canon Daima"
        if "film" in combined or "movie" in combined or "劇場版" in combined:
            return "1 DragonWorld/Canon/Canon Film"
        if "slump" in combined:
            return "1 DragonWorld/Canon/Canon DrSlump"
        if "jaco" in combined:
            return "1 DragonWorld/Canon/Canon Jaco"
        if "jeu" in combined or "game" in combined or "dbo" in combined:
            return "1 DragonWorld/Canon/Canon Jeu"
        if "neko" in combined:
            return "1 DragonWorld/Canon/Canon NekoM"
        if "toriyama" in combined or "鳥山明" in combined:
            return "1 DragonWorld/Canon/toriyama implication"
        if "retcon" in combined:
            return "1 DragonWorld/Canon/Debunk Canon/Retcon Explain"
        return "1 DragonWorld/Canon/Canon Autre"

    if any(k in combined for k in ["composants du ki", "genki", "yuki", "shoki", "元気", "勇気", "正気"]):
        return "1 DragonWorld/Ki Fonctionnement/Les composants du ki"
    if "devenir plus fort" in combined:
        return "1 DragonWorld/Ki Fonctionnement/Devenir plus fort"
    if "pour gagner" in combined:
        return "1 DragonWorld/Ki Fonctionnement/Pour gagner"
    if any(k in combined for k in ["cyborg", "c-17", "c-18", "人造人間", "générateur infini", "énergie éternelle"]):
        return "1 DragonWorld/Ki Fonctionnement/Cyborg"

    if pool == "dragonworld_root":
        if any(k in combined for k in ["univers", "espace", "galaxies", "cosmos", "cosmologie"]):
            return "1 DragonWorld/Cosmos/L'univers"
        if "ki" in combined or "énergie" in combined:
            return "1 DragonWorld/Ki Fonctionnement/Les composants du ki"
        return "1 DragonWorld/Canon/Canon Autre"

    # 6. FORCE CALCUL PAR SAGAS (2 Force calcul)
    # Xenoverse / SDBH
    if any(k in combined for k in ["xenoverse", "xeno", "sdbh", "heroes", "demigra", "fu ", "tokitoki", "toki toki", "ヒーローズ"]):
        return "2 Force calcul/9 Xenoverse & SDBH"
    # Jump Force
    if any(k in combined for k in ["jump force", "god fusion", "godfusion"]):
        return "2 Force calcul/10 Jump Force & GodFusion"
    # Daima
    if any(k in combined for k in ["daima", "gomah", "degesu", "glorio", "tamagami", "ダイマ"]):
        return "2 Force calcul/8 Saga Daima"
    # GT
    if any(k in combined for k in ["gt", "ssj4", "baby", "omega shenron", "rilder", "super 17", "超サイヤ人4", "超4"]):
        if "baby" in combined or "ベビー" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Baby files"
        if "gogeta" in combined and "4" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Gogeta 4 files"
        if "omega" in combined or "shinron" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Omega Shenron files"
        if "rilder" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Rilder files"
        if "17" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Super c17 files"
        if "uub" in combined or "majuub" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Majuub Files"
        return "2 Force calcul/6 Saga GT  Puissance/Goku files"
    # Films Z
    if any(k in combined for k in ["janemba", "hildegarn", "hatchiyack", "tapion", "cooler", "slug", "turles", "thalès", "ジャネンバ", "ヒルデガーン"]):
        if "janemba" in combined:
            return "2 Force calcul/7 Saga Film Puissance/Janemba files"
        if "hildegarn" in combined:
            return "2 Force calcul/7 Saga Film Puissance/Hildegarnes files"
        if "hatchiyack" in combined:
            return "2 Force calcul/7 Saga Film Puissance/Hatchiyack files"
        return "2 Force calcul/7 Saga Film Puissance"
    # Saga Super
    if any(k in combined for k in ["super", "dbs", "jiren", "zeno", "zamasu", "goku black", "kefla", "hit", "moro", "granolah", "gas", "champa", "vados", "全王", "大神官", "ジレン", "ザマス"]):
        if "jiren" in combined or "ジレン" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Jiren files"
        if "zamasu" in combined or "black" in combined or "ザマス" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Zamasu files"
        if "zeno" in combined or "全王" in combined or "大神官" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Zeno files"
        if "kefla" in combined or "ケフラ" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Kefla files/universal"
        if "trunks" in combined or "トランクス" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Trunks files"
        if "freezer" in combined or "golden" in combined or "フリーザ" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Freezer files"
        if "broly" in combined or "ブロリー" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Broly Files"
        if "chojigen" in combined or "超次元" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/Chojigen Files"
        if "beyond god" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/Beyond God Files"
        if "ssjg" in combined or "god" in combined and "red" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/SSJG"
        if "ssjb" in combined or "blue" in combined or "ブルー" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/SSJB"
        if "trou noir" in combined or "black hole" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/trou noir"
        return "2 Force calcul/5 Saga Super Puissance/Goku Files"

    # Cell Saga
    if any(k in combined for k in ["cell", "セル", "gohan ssj2", "cell game", "c-16", "c-19", "c-20", "gero"]):
        return "2 Force calcul/3 Saga Cell Puissance"

    # Freezer Saga
    if any(k in combined for k in ["freezer", "フリーザ", "namek", "ナメック", "ginyu", "ギニュー", "reacoom", "zarbon", "dodoria"]):
        return "2 Force calcul/2 Saga Freezer Puissance"

    # OG Saga
    if any(k in combined for k in ["ruban rouge", "red ribbon", "taopaipai", "mutaito", "piccolo daimao", "ピッコロ大魔王", "budokai", "karin", "カリン", "roshi", "jackie"]):
        return "2 Force calcul/1 Saga OG Puissance"

    # 7. DEBUNKS DIVERS
    if any(k in combined for k in ["vegetto", "gogeta", "potara", "metamol", "ベジット", "ゴジータ", "ポタラ"]):
        return "4 Debunk/Vegetto Gogeta"
    if any(k in combined for k in ["dyspo", "ディスポ", "vitesse de dyspo"]):
        return "4 Debunk/dyspo vitesse"
    if any(k in combined for k in ["laser", "sorbet", "ring laser"]):
        return "4 Debunk/laser lasseau"
    if "ssjbe" in combined or "blue evolution" in combined:
        return "4 Debunk/ssjbe manga may 22 2020"
    if any(k in combined for k in ["akira forget", "forgot", "toriyama oubli"]):
        return "4 Debunk/Akira forget"
    if any(k in combined for k in ["ment", "mensonge"]) and "beerus" in combined:
        return "4 Debunk/beerus ment"
    if "ki divin" in combined or "god ki" in combined:
        return "4 Debunk/Ki divin"

    # Fallbacks by pool
    if pool == "debunk_root":
        return "4 Debunk/Debunk aleatoire"
    if pool == "dragonworld_root":
        return "1 DragonWorld/Canon/Canon Autre"
    if pool == "capacite_root":
        return "3 Capacité et autre"
    if pool == "saga_buu_a_trier":
        return "4 Debunk/Saga buu"

    # Final fallback for jsp_root:
    # Check if text talks about combat/force vs lore/debunk
    if any(k in combined for k in ["battle power", "puissance", "force", "power", "戦闘力", "vs"]):
        return "2 Force calcul/force"
    return "4 Debunk/Debunk aleatoire"

plan_v2 = {}
for path, item in data.items():
    dest_rel = classify_item_v2(item)
    plan_v2[path] = {
        "filename": item["filename"],
        "pool": item["pool"],
        "source": path,
        "target_rel": dest_rel,
        "target_full": os.path.join(base, dest_rel, item["filename"])
    }

dest_counts = Counter(v["target_rel"] for v in plan_v2.values())
print(f"Total items planned v2: {len(plan_v2)}")
print(f"Total destination folders targeted: {len(dest_counts)}")
print("\nTop 35 destination folders by item count:")
for d, c in dest_counts.most_common(35):
    print(f"  {c:4d} --> {d}")

with open("scratch/routing_plan_v2.json", "w", encoding="utf-8") as f:
    json.dump(plan_v2, f, ensure_ascii=False, indent=2)
