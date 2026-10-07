<!-- SPDX-License-Identifier: Apache-2.0 -->
# Spécifications Techniques : `shenron-re`

> **Rattachement** : Section 4 du [Plan Directeur Unique](file:///home/aphro/shenron/docs/reference/root/PLAN.md).  
> **Cible** : Workspace Shenron ([`crates/shenron-re`](file:///home/aphro/shenron/crates/shenron-re)), ponts `aphrody-re` & `aphrody-winclean`.

---

## 1. Découpage Modulaire

* **`shenron-re-fs`** : Parsing pur Rust des archives CRIWARE CPK et compression CRILAYLA (`zerocopy` + `binrw`).
* **`shenron-re-formats`** : Décodage des formats binaires Dimps de Dragon Ball Xenoverse 2 :
  * `BAC` : Scripts d'animation, déclencheurs d'effets visuels et hitbox.
  * `BDM` : Matrices de dégâts et coefficients d'impact.
  * `CUS` & `PUP` : Métadonnées des compétences et modificateurs de statistiques de combat.
  * `MSG` : Dialogues et fiches multilingues intégrés au RAG et au VFS.
* **`shenron-re-live`** : Inspection mémoire temps réel en environnement de test isolé.

---

## 2. Intégration dans l'Écosystème Shenron

* **RAG & Connaissance** : Les extractions de lore et descriptions alimentent le corpus RAG (`aphrody-rag`).
* **API Publique** : Les multiplicateurs et données de combat alimentent les fiches de techniques sur `dragonballfr.com`.
* **Shenron Studio** : Rendu des modèles 3D via le viewport WebGPU et lecture des fichiers audio HCA.
