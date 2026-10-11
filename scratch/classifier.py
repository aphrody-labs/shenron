#!/usr/bin/env python3
import json
import os
import re
from collections import Counter

with open("scratch/audit_index.json", "r", encoding="utf-8") as f:
    data = json.load(f)

base = "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test"

def classify_item(item):
    pool = item["pool"]
    filename = item["filename"].lower()
    text = item.get("text", "").lower()
    combined = f"{filename} \n {text}"

    # 1. Exact pool specific overrides
    if pool == "jsp_mauvaise_trad":
        return "4 Debunk/Mauvaise Trad + falacieux"

    if pool == "root":
        if "barrier" in filename:
            return "3 Capacité et autre/barrière d'énergie"
        if "ttg" in filename:
            return "4 Debunk/Saga buu/Statement Z"
        if "14.jpg" in filename:
            return "2 Force calcul/7 Saga Film Puissance"

    # 2. Crossverse / Vs Battles (Goku solo, Anos, Jinwoo, Yogiri, OPM, etc.)
    if any(k in combined for k in ["anos", "jin woo", "jinwoo", "yogiri", "relevancy league", "madoka", "goku solo", "goku solos"]):
        return "4 Debunk/Crossverse et Matchups"
    if "saitama" in combined or "opm" in combined or "one punch" in combined:
        return "4 Debunk/opm debunk"

    # 3. Specific Debunk topics
    if any(k in combined for k in ["akira forget", "toriyama forgot", "forgot", "oublié"]):
        if pool == "debunk_root" or "forget" in filename:
            return "4 Debunk/Akira forget"
    if "dyspo" in combined:
        return "4 Debunk/dyspo vitesse"
    if "laser" in combined or "sorbet" in combined:
        return "4 Debunk/laser lasseau"
    if "cellule" in combined and "cell" in combined and ("noyau" in combined or "core" in combined or "regen" in combined):
        return "4 Debunk/cellule cell"
    if "ment" in combined and "beerus" in combined:
        return "4 Debunk/beerus ment"
    if "ki divin" in combined or "god ki" in combined:
        return "4 Debunk/Ki divin"
    if "ssjbe" in combined or "blue evolution" in combined or "evolved" in combined:
        return "4 Debunk/ssjbe manga may 22 2020"
    if "faiblesse" in combined and ("saiyan" in combined or "siayan" in combined or "queue" in combined or "heart" in combined):
        return "4 Debunk/faiblesse siayan"
    if "delaisser" in combined or "slacking" in combined or "rouille" in combined:
        return "4 Debunk/delaisser l'entrainement"
    if "mentalité" in combined or "mentalite" in combined or "selfish" in combined:
        return "4 Debunk/goku mentalité"
    if "souvenir" in combined and "fusion" in combined:
        return "4 Debunk/debun fusion osuvenir"
    if "perfect edition" in combined or "kanzenban" in combined:
        return "4 Debunk/perfect edition"

    # 4. Saga Buu specific debunks (for saga_buu_a_trier and general buu debunks)
    if pool == "saga_buu_a_trier" or "buu" in combined or "boo" in combined:
        if "kidbuu vs beerus" in combined or ("beerus" in combined and "kid" in combined and "buu" in combined):
            return "4 Debunk/Saga buu/KidBuu VS Beerus"
        if "morro" in combined or "moro" in combined:
            return "4 Debunk/Saga buu/Morro Arc"
        if "daima" in combined:
            return "4 Debunk/Saga buu/Statement Daima"
        if "gt" in combined and ("baby" in combined or "uub" in combined or "statement" in combined):
            return "4 Debunk/Saga buu/Statement GT"
        if any(k in combined for k in ["kakarot", "budokai", "tenkaichi", "game", "jeu", "dokkan"]):
            return "4 Debunk/Saga buu/Statement Jeu"
        if "super" in combined and ("dbs" in combined or "anime" in combined):
            return "4 Debunk/Saga buu/Statement Super"
        if "koyama" in combined:
            return "4 Debunk/Saga buu/Cas de Koyama"
        if "buutenks" in combined:
            return "4 Debunk/Saga buu/debunk buutenks"
        if "buuhan" in combined:
            return "4 Debunk/Saga buu/Buuhan SSJ3"
        if "genkidama" in combined or "spirit bomb" in combined:
            return "4 Debunk/Saga buu/Genkidama"
        if "gohan" in combined and "ssj3" in combined:
            return "4 Debunk/Saga buu/Gohan SSJ3"
        if "gohan" in combined and ("gotenks" in combined or "superbuu" in combined):
            return "4 Debunk/Saga buu/Gotenks SuperBuu Gohan"
        if "gohan" in combined and ("protag" in combined or "potentiel" in combined or "mystic" in combined or "ultimate" in combined):
            return "4 Debunk/Saga buu/Gohan Protagoniste"
        if "ment" in combined and "goku" in combined:
            return "4 Debunk/Saga buu/Goku ment sur sa force"
        if "numéro 1" in combined or "numero 1" in combined or "number 1" in combined:
            return "4 Debunk/Saga buu/Goku numéro 1"
        if "databook" in combined or "daizenshuu" in combined or "chozenshu" in combined:
            return "4 Debunk/Saga buu/KidBuu DataBook"
        if "ssj3" in combined and "kid" in combined:
            return "4 Debunk/Saga buu/KidBuu SSJ3"
        if "intérieur" in combined or "interieur" in combined or "inside" in combined:
            return "4 Debunk/Saga buu/Buu Intérieur"
        if "kaioshin" in combined:
            return "4 Debunk/Saga buu/Kaioshin Explication"
        if "knock" in combined or "ko" in combined:
            return "4 Debunk/Saga buu/Knock-Out"
        if "end of z" in combined or "eoz" in combined:
            return "4 Debunk/Saga buu/End Of Z"
        if "dernière chance" in combined or "derniere chance" in combined:
            return "4 Debunk/Saga buu/Dernière Chance"
        if "insondable" in combined:
            return "4 Debunk/Saga buu/Insondable"
        if "interview" in combined:
            return "4 Debunk/Saga buu/Interview Toriyama"
        if "vsbattles" in combined or "vs battles" in combined:
            return "4 Debunk/Saga buu/vsbattles_rules"
        if "english sub" in combined or "eng sub" in combined:
            return "4 Debunk/Saga buu/Statement Z/english sub"
        if "statement z" in combined or "dbz" in combined or "épisode" in combined or "episode" in combined:
            return "4 Debunk/Saga buu/Statement Z"
        if "super buu" in combined:
            return "4 Debunk/Saga buu/Super Buu et KidBuu"
        if pool == "saga_buu_a_trier":
            return "4 Debunk/Saga buu"
        if pool == "fc_buu" or "puissance" in combined:
            return "2 Force calcul/4 Saga Buu Puissance"

    # 5. Capacité et autre
    if "ultra instinct" in combined or "migatte" in combined or " ui " in combined or "mui" in combined or "tui" in combined:
        if pool == "capacite_root" or pool == "jsp_root":
            if "whis" in combined:
                return "3 Capacité et autre/Ultra Instinct/explication whis"
            if "popo" in combined:
                return "3 Capacité et autre/Ultra Instinct/entrianement popo"
            if "corps" in combined or "fort" in combined:
                return "3 Capacité et autre/Ultra Instinct/Coprs devient plus fort"
            if "calme" in combined:
                return "3 Capacité et autre/Ultra Instinct/besoin d'esprit calme"
            if "automatique" in combined or "deplacement" in combined:
                return "3 Capacité et autre/Ultra Instinct/deplacmeent uatomatique du corps"
            if "kefla" in combined:
                return "3 Capacité et autre/Ultra Instinct/Kefla vs goku"
            return "3 Capacité et autre/Ultra Instinct"
        else:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/MUI"

    if "hakkai" in combined or "hakai" in combined or "destruction" in combined and "beerus" in combined:
        if "zamasu" in combined:
            return "3 Capacité et autre/Hakkai/Goku Zamasu Hakkai"
        return "3 Capacité et autre/Hakkai"
    if "barrière" in combined or "barriere" in combined or "barrier" in combined or "c-17" in combined and "barrier" in combined:
        return "3 Capacité et autre/barrière d'énergie"
    if "4eme mur" in combined or "4ème mur" in combined or "fourth wall" in combined:
        return "3 Capacité et autre/4ème mur"
    if "espace" in combined and ("respirer" in combined or "survive" in combined or "vaccum" in combined or "vacuum" in combined):
        return "3 Capacité et autre/respirer dans l'espace"
    if "outer" in combined or "outerversal" in combined or "boundless" in combined:
        return "3 Capacité et autre/Outer"
    if "déplacement instantané" in combined or "deplacement instantane" in combined or "instant transmission" in combined or "teleport" in combined or "shunkan" in combined:
        return "3 Capacité et autre/Déplacement instantané"
    if "absorbtion" in combined or "absorption" in combined:
        return "3 Capacité et autre/Absorbtion"
    if "regen" in combined or "régénération" in combined or "regeneration" in combined:
        return "3 Capacité et autre/regen"
    if "potentiel" in combined:
        return "3 Capacité et autre/Potentiel"
    if "toon" in combined or "toonforce" in combined or "gag" in combined:
        return "3 Capacité et autre/ToonForce"
    if "copier" in combined:
        return "3 Capacité et autre/copier les techniques"
    if "clonage" in combined or "clone" in combined:
        return "3 Capacité et autre/clonage"
    if "télépathie" in combined or "telepathie" in combined:
        return "3 Capacité et autre/télépathie"
    if "télékinésie" in combined or "telekinesie" in combined:
        return "3 Capacité et autre/telekinésie"
    if "sentir" in combined and ("ki" in combined or "présence" in combined or "presence" in combined):
        return "3 Capacité et autre/Sentir les autres et ce qu'il se passe"
    if "intentions" in combined:
        return "3 Capacité et autre/Sentir les intentions"
    if "kamehameha" in combined:
        return "3 Capacité et autre/kamehameha"
    if "susano" in combined or "avatar" in combined and "ki" in combined:
        return "3 Capacité et autre/susano"
    if "plot armor" in combined:
        return "3 Capacité et autre/Plot Armor"
    if "attaque invisible" in combined or "invisible" in combined:
        return "3 Capacité et autre/attaque invisible"
    if "electricité" in combined or "electricite" in combined or "lightning" in combined:
        return "3 Capacité et autre/electricité"
    if "mort mais vivant" in combined or "dead" in combined and "alive" in combined:
        return "3 Capacité et autre/mort mais vivant"
    if pool == "capacite_root":
        return "3 Capacité et autre"

    # 6. Cosmologie et DragonWorld (1 DragonWorld)
    if "deadzone" in combined or "dead zone" in combined:
        return "1 DragonWorld/Cosmos/DeadZone"
    if "dimension broly" in combined or ("broly" in combined and "gogeta" in combined and "dimension" in combined):
        return "1 DragonWorld/Cosmos/Dimension Broly Gogeta"
    if "autre monde" in combined or "afterlife" in combined or "enma" in combined or "kaio" in combined and "monde" in combined:
        return "1 DragonWorld/Cosmos/L'autre monde"
    if "macrocosm" in combined or "univers 7" in combined and "map" in combined or "carte" in combined:
        return "1 DragonWorld/Cosmos/Macrocosm Map"
    if "démon" in combined or "demon" in combined or "makai" in combined and ("monde" in combined or "royaume" in combined):
        return "1 DragonWorld/Cosmos/Monde des Démons"
    if "kaioshin" in combined and ("monde" in combined or "planète" in combined or "realm" in combined):
        return "1 DragonWorld/Cosmos/Monde des Kaioshin"
    if "salle de l'esprit" in combined or "chambre du temps" in combined or "room of spirit" in combined or "rosat" in combined:
        return "1 DragonWorld/Cosmos/Salle de l'esprit et du temps"
    if "sugoroku" in combined:
        return "1 DragonWorld/Cosmos/Sugoroku Space"
    if "tournoi du pouvoir" in combined and "map" in combined or "arène" in combined or "tdp map" in combined:
        return "1 DragonWorld/Cosmos/TDP map"
    if "toribot" in combined or "tori-bot" in combined:
        return "1 DragonWorld/Cosmos/arale toribot"
    if "chronologie" in combined or "timeline" in combined or "âge " in combined or "age " in combined:
        if "gt" in combined:
            return "1 DragonWorld/Canon/Canon GT/timeline"
        return "1 DragonWorld/Chronologie"
    if "canon" in combined or "retcon" in combined:
        if "gt" in combined:
            return "1 DragonWorld/Canon/Canon GT"
        if "daima" in combined:
            return "1 DragonWorld/Canon/Canon Daima"
        if "film" in combined:
            return "1 DragonWorld/Canon/Canon Film"
        if "slump" in combined:
            return "1 DragonWorld/Canon/Canon DrSlump"
        if "jaco" in combined:
            return "1 DragonWorld/Canon/Canon Jaco"
        if "jeu" in combined:
            return "1 DragonWorld/Canon/Canon Jeu"
        if "neko" in combined:
            return "1 DragonWorld/Canon/Canon NekoM"
        if "toriyama" in combined:
            return "1 DragonWorld/Canon/toriyama implication"
        if "retcon" in combined:
            return "1 DragonWorld/Canon/Debunk Canon/Retcon Explain"
        return "1 DragonWorld/Canon/Canon Autre"
    if "composants du ki" in combined or ("genki" in combined and "yuki" in combined):
        return "1 DragonWorld/Ki Fonctionnement/Les composants du ki"
    if "devenir plus fort" in combined:
        return "1 DragonWorld/Ki Fonctionnement/Devenir plus fort"
    if "cyborg" in combined and ("énergie" in combined or "energie" in combined or "infinie" in combined):
        return "1 DragonWorld/Ki Fonctionnement/Cyborg"
    if pool == "dragonworld_root":
        if "cosmos" in combined or "univers" in combined or "espace" in combined:
            return "1 DragonWorld/Cosmos/L'univers"
        if "ki" in combined:
            return "1 DragonWorld/Ki Fonctionnement/Les composants du ki"
        return "1 DragonWorld/Canon/Canon Autre"

    # 7. Force Calcul par Sagas (2 Force calcul)
    # Xenoverse / SDBH
    if any(k in combined for k in ["xenoverse", "xeno", "sdbh", "heroes", "demigra", "fu ", "tokitoki", "toki toki"]):
        return "2 Force calcul/9 Xenoverse & SDBH"
    # Jump Force
    if "jump force" in combined or "god fusion" in combined or "godfusion" in combined:
        return "2 Force calcul/10 Jump Force & GodFusion"
    # Daima
    if "daima" in combined or "gomah" in combined or "degesu" in combined or "glorio" in combined:
        return "2 Force calcul/8 Saga Daima"
    # GT
    if "gt" in combined or "ssj4" in combined or "baby" in combined or "omega shenron" in combined or "rilder" in combined or "super 17" in combined:
        if "baby" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Baby files"
        if "gogeta" in combined and "4" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Gogeta 4 files"
        if "omega" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Omega Shenron files"
        if "rilder" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Rilder files"
        if "17" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Super c17 files"
        if "uub" in combined or "majuub" in combined:
            return "2 Force calcul/6 Saga GT  Puissance/Majuub Files"
        return "2 Force calcul/6 Saga GT  Puissance/Goku files"
    # Films Z
    if any(k in combined for k in ["janemba", "hildegarn", "hatchiyack", "tapion", "cooler", "slug", "turles", "thalès"]):
        if "janemba" in combined:
            return "2 Force calcul/7 Saga Film Puissance/Janemba files"
        if "hildegarn" in combined:
            return "2 Force calcul/7 Saga Film Puissance/Hildegarnes files"
        if "hatchiyack" in combined:
            return "2 Force calcul/7 Saga Film Puissance/Hatchiyack files"
        return "2 Force calcul/7 Saga Film Puissance"
    # Saga Super
    if any(k in combined for k in ["super", "dbs", "jiren", "zeno", "zamasu", "goku black", "black goku", "kefla", "hit", "moro", "granolah", "gas", "champa", "vados"]):
        if "jiren" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Jiren files"
        if "zamasu" in combined or "black" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Zamasu files"
        if "zeno" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Zeno files"
        if "kefla" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Kefla files/universal"
        if "trunks" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Trunks files"
        if "freezer" in combined or "golden" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Freezer files"
        if "broly" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Broly Files"
        if "chojigen" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/Chojigen Files"
        if "beyond god" in combined or "saiyan beyond" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/Beyond God Files"
        if "ssjg" in combined or "god" in combined and "red" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/SSJG"
        if "ssjb" in combined or "blue" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/SSJB"
        if "trou noir" in combined or "black hole" in combined:
            return "2 Force calcul/5 Saga Super Puissance/Goku Files/trou noir"
        return "2 Force calcul/5 Saga Super Puissance/Goku Files"

    # Sagas OG / Freezer / Cell
    if any(k in combined for k in ["cell", "gohan ssj2", "cell game", "c-16", "c-17", "c-18", "c-19", "c-20", "gero"]):
        return "2 Force calcul/3 Saga Cell Puissance"
    if any(k in combined for k in ["freezer", "namek", "ginyu", "reacoom", "zarbon", "dodoria", "kaioken", "ssj goku"]):
        return "2 Force calcul/2 Saga Freezer Puissance"
    if any(k in combined for k in ["ruban rouge", "red ribbon", "taopaipai", "mutaito", "piccolo daimao", "daimao", "21e", "22e", "23e", "budokai", "karin", "roshi", "jackie"]):
        return "2 Force calcul/1 Saga OG Puissance"

    # Vegetto / Gogeta
    if "vegetto" in combined or "gogeta" in combined or "potara" in combined or "metamol" in combined:
        return "4 Debunk/Vegetto Gogeta"

    # Fallbacks by pool
    if pool == "debunk_root":
        return "4 Debunk/Debunk aleatoire"
    if pool == "dragonworld_root":
        return "1 DragonWorld/Canon/Canon Autre"
    if pool == "capacite_root":
        return "3 Capacité et autre"
    if pool == "saga_buu_a_trier":
        return "4 Debunk/Saga buu"

    # Fallback for jsp_root
    return "4 Debunk/Debunk aleatoire"

plan = {}
for path, item in data.items():
    dest_rel = classify_item(item)
    plan[path] = {
        "filename": item["filename"],
        "pool": item["pool"],
        "source": path,
        "target_rel": dest_rel,
        "target_full": os.path.join(base, dest_rel, item["filename"])
    }

dest_counts = Counter(v["target_rel"] for v in plan.values())
print(f"Total items planned: {len(plan)}")
print(f"Total destination folders targeted: {len(dest_counts)}")
print("\nTop 30 destination folders by item count:")
for d, c in dest_counts.most_common(30):
    print(f"  {c:4d} --> {d}")

with open("scratch/routing_plan.json", "w", encoding="utf-8") as f:
    json.dump(plan, f, ensure_ascii=False, indent=2)
print("\nSaved routing plan to scratch/routing_plan.json")
