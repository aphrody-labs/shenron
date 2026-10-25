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
