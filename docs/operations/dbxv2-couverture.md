# Couverture DBXV2 : synthèse chiffrée

Synthèse de l'exploitation des données privées du jeu (usage privé uniquement ; aucune donnée du jeu
dans Git). Mesure du 2026-10-18 sur l'index des 26 archives : 140 009 fichiers, 39,25 Go stockés,
56,93 Go extraits, 155 extensions. Le détail par format reste dans `var/reports/dbxv2-coverage/` (ignoré).

| état | extensions | fichiers | stocké Go |
|---|---|---|---|
| exploité (servi par `dbxv2-serve` et converti) : vidéo, textures, audio, modèles, squelettes | 6 | 88 303 | 36,50 |
| exploité et indexé (textes multilingues, personnages) | 2 | 7 330 | 0,06 |
| résumé d'en-tête seulement (gameplay, animations, matériaux) | 9 | 24 090 | 1,43 |
| lecteur probable, non câblé (squelettes alternatifs) | 1 | 1 197 | 0,44 |
| non exploité (octets bruts servis, ligne d'index seule) | 137 | 19 089 | 0,81 |

Priorités : 1) données de combat (frame data) pour Dragon Pixel, dont les lecteurs n'émettent que des
en-têtes ; 2) animations et textures PS4 pour `model_serve` ; 3) effets et noms de cues audio pour Bevy.
Les trous sont portés à la session Bun OS ; l'indexation en base (`packages/db/src/dbxv2`) suivra les lecteurs.

## Exécutable principal et deux formats résolus (2026-10-22)

`DBXV2.exe` (le binaire Windows, pas une donnée `.cpk`) est enveloppé par **SteamStub x64**
(DRM Steamworks natif) : signature détectée et section `.text` à une entropie de 7.9999/8
bits/octet (chiffrée au repos). Aucun outil de retrait de ce DRM n'a été utilisé ni produit ;
le code réel ne se déchiffre qu'en mémoire sous une session Steam valide. Les sections `.rdata`,
`.data`, `.rsrc`, `.reloc` restent en clair et ont servi à confirmer, sur chemins réels, deux
formats manquants ci-dessus : **`.emo`** (objet de VFX, agrège des modèles `.emd` et une
hiérarchie de nœuds) et **`.ema`** (mouvement associé, trois genres confirmés sur octets réels
du CPK : `.obj.ema` = objet, `.mat.ema` = matériau, `.light.ema` = lumière). En-tête commun aux
deux : magique `#EMO`/`#EMA`, `u16 0xFFFE`, `u16 header_size` fixe à 32, un `u32` de version de
format partagé par le build (pas un champ par fichier) ; pour `#EMA`, `u16` à l'octet 0x10 =
nombre d'animations, `u16` à l'octet 0x12 = genre (3 objet, 4 lumière, 8 matériau).

Les parseurs réels vivent côté Bun OS : `crates/re/src/game/formats/{emo,ema}.rs` (branchés
dans `api::summarize`/`support`), documentés dans `bun-os/docs/re/DBXV2-EMO-EMA.md` — pas dans
`crates/shenron-re` de ce dépôt. Historique de l'investigation (Ghidra sur `xgcore.dll`,
identification SteamStub, confirmation sur octets réels) : `replica/dbxv2/wasm-port-feasibility.md`.
