# Plan de Mise en Œuvre : Dragon Ball Xenoverse 2 WebGPU / WASM Engine Replica

Rédigé d'après `replica/dbxv2/recon.md`, `replica/dbxv2/features.csv`, `replica/dbxv2/wasm-port-feasibility.md` et les spécifications techniques de `docs/products/dbxv2-plugin.md`.

---

## 1. Philosophie & Stratégie d'Ingénierie (Clean-Room Engine)

L'exécutable x86-64 `DBXV2.exe` étant protégé au repos par SteamStub DRM, la stratégie souveraine consiste en une **ré-implémentation propre (Clean-Room)** du moteur de combat et d'exploration 3D dans le navigateur, alimenté directement par les archives de données canoniques extraites du store VPS (`data.cpk`, `data2.cpk` - 26 archives, 39.2 Go) :

1. **Zéro contournement de DRM** : Le code natif fermé n'est ni cracké ni décompilé.
2. **Réutilisation des Formats Dimps Canoniques** : Exploitation des parseurs Rust/WASM existants (`@aphrody/shenron-engine/xv2-character` et `glb-scene`) pour charger directement les maillages `.emd`, textures `.emb`, animations `.ean`, et scripts de combat `.bac`.
3. **Moteur 3D Aérien Déterministe** : Exécution WebGPU 60 FPS avec vol libre à 360°, téléportation instantanée (Z-Vanish), super attaques (Kamehameha, Spirit Bomb) et jauges d'Endurance (Stamina Break).

---

## 2. Stack Technique du Port

| Composant                     | Choix Technique                                    | Rôle & Justification                                                                                 |
| :---------------------------- | :------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **Moteur Graphique 3D**       | WebGPU (WGPU 30) + Shaders Cel-Shading             | Rendu 3D temps réel des arènes géantes (Conton City, Namek, Espace) sans lag.                        |
| **Logique de Combat WASM**    | Rust 2024 compilé en `wasm32-unknown-unknown`      | Traitement déterministe des collisions sphériques, de la physique de vol et du lock-on caméra.       |
| **Parseurs de Formats Dimps** | `packages/engine/src/wasm` & `crates/dragon-pixel` | Désérialisation binaire instantanée de `.emd` (maillages), `.ean` (squelettes), `.bac` (actions).    |
| **Stockage & Streaming VFS**  | Cloudflare R2 / Garage S3 + Cache IndexedDB        | Téléchargement à la demande des segments d'arène et des costumes sans télécharger 40 Go en une fois. |
| **Audio & Voix**              | Décodeur WebAudio HCA/ADX2                         | Rendu audio spatialisé 3D pour les impacts et les répliques japonaises/anglaises.                    |

---

## 3. Schéma de Données & Formats Binaires

### 3.1 Formats de Données Dimps Traités

- **`.emd`** : Modèles 3D, sous-maillages avec pondération osseuse (Bone Weights) et normales de surface.
- **`.emb`** : Paquets de textures compressées DXGI (BC1/BC3/BC7) converties à la volée vers KTX2/WebGPU.
- **`.ean`** : Pistes d'animation squelettique clé-par-clé (Keyframes quaternions et translations).
- **`.bac`** : Timelines d'actions de combat (Frame où la hitbox s'active, coût en Ki/Endurance, effets de caméra).
- **`.bcs`** : Définition des parties de corps (cheveux, torse, bras, jambes) et palette de couleurs.
- **`.msg`** : Tables de chaînes multilingues (dialogues de quête, noms de techniques).

### 3.2 Tables PostgreSQL (`schema.sql`)

```sql
-- Personnages créés par l'utilisateur (Time Patroller)
create table if not exists xv2_user_avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ba_user(id) on delete cascade,
  name text not null,
  race text not null check (race in ('saiyan_male', 'saiyan_female', 'earthling_male', 'earthling_female', 'namekian', 'frieza_race', 'majin_male', 'majin_female')),
  level integer not null default 1 check (level >= 1 and level <= 99),
  attributes jsonb not null default '{"max_hp": 0, "max_ki": 0, "max_stamina": 0, "basic_attacks": 0, "strike_supers": 0, "ki_blast_supers": 0}',
  equipped_skills jsonb not null default '{"super_1": null, "super_2": null, "super_3": null, "super_4": null, "ultimate_1": null, "ultimate_2": null, "evasive": null, "awoken": null}',
  equipment jsonb not null default '{"costume_upper": null, "costume_lower": null, "costume_hands": null, "costume_feet": null, "accessory": null, "super_soul": null}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Quêtes Parallèles (Parallel Quests) & Progression
create table if not exists xv2_quest_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ba_user(id) on delete cascade,
  quest_number integer not null,
  cleared boolean not null default false,
  ultimate_finish boolean not null default false,
  rank text check (rank in ('D', 'C', 'B', 'A', 'S', 'Z')),
  best_score integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, quest_number)
);
```

---

## 4. Matrice des Écrans & Routes

| ID      | Écran                    | Route                        | Rôle & Fonctionnalités                                                                   |
| :------ | :----------------------- | :--------------------------- | :--------------------------------------------------------------------------------------- |
| **S01** | Hub Conton City          | `/games/xenoverse-2`         | Exploration 3D libre du hub, marchands, portail de quêtes, classement.                   |
| **S02** | Créateur de Patrouilleur | `/games/xenoverse-2/creator` | Sélection de race, personnalisation visuelle, attribution des points d'attributs.        |
| **S03** | Arène de Combat 3D       | `/games/xenoverse-2/battle`  | Vol à 360°, ciblage de l'ennemi (lock-on), jauges de Ki/Stamina, super frappes.          |
| **S04** | Quêtes Parallèles        | `/games/xenoverse-2/quests`  | Sélection de missions d'histoire alternative avec conditions secrètes (Ultimate Finish). |

---

## 5. Découpage en Tranches Verticales (Build Order)

### Tranche 1 : Visualiseur d'Arène et Vol Libre 3D (`apps/site/src/app/games/xenoverse-2/page.tsx`)

- Chargement d'une arène canonique (Arène du Tournoi ou Wasteland) via `@aphrody/shenron-engine/glb-scene`.
- Caméra orbitale à la troisième personne avec contrôles Z/Q/S/D + Espace (Voler haut) / Shift (Descendre).
- Télémétrie 60 FPS affichée dans le HUD.

### Tranche 2 : Rendu de Personnage & Animation Osseuse (`S02`)

- Chargement d'un avatar (Goku ou Patrouilleur Saiyan) avec squelette `.ean`.
- Animation de vol stationnaire (`idle_flight`) et accélération (`boost_dash`).
- Shaders de contour et d'aura d'énergie en WGSL.

### Tranche 3 : Système de Combat Aérien 3D (`S03`)

- Verrouillage de cible (Lock-on sur touche `Tab` ou bouton manette R3).
- Combo au corps à corps (enchaînement de 5 coups avec projection).
- Téléportation instantanée (Z-Vanish sur `Space` en consommant 1 barre de Stamina).
- Déclenchement du Kamehameha avec temps de charge et rayon d'énergie volumétrique.

### Tranche 4 : Quêtes Parallèles & Gestion de Quêtes (`S04`)

- Première quête jouable : « Assaut des Saiyans » (Raditz, Nappa, Vegeta).
- Détection des conditions d'échec et de victoire avec attribution d'un rang (D à Z).

---

## 6. Les Points de Vigilance (The Parts that Bite)

1. **Volume de Téléchargement** : Les modèles haute définition et textures pèsent plusieurs dizaines de mégaoctets par personnage. Le système de streaming VFS doit utiliser un cache local persistant (`IndexedDB`) et charger les LOD (Levels of Detail) les plus bas en premier.
2. **Physique Aérienne à 360°** : Contrairement à un jeu de combat 2D, les combattants évoluent sur les axes X, Y et Z sans sol fixe. Les angles d'attaque et les orientations doivent utiliser des quaternions rigoureux pour éviter le blocage de cardan (Gimbal Lock).
3. **Gestion de l'Endurance (Stamina Break)** : Mécanique fondamentale de Xenoverse 2. Vider son endurance laisse le joueur sans défense pendant 4 secondes. La logique doit être synchronisée frame-par-frame.

---

## 7. Critères d'Achèvement (Definition of Done)

- [ ] L'avatar peut voler librement dans l'arène 3D à 60 FPS stable sans saccade.
- [ ] Le ciblage, le corps-à-corps et la téléportation Z-Vanish fonctionnent au clavier et à la manette.
- [ ] Au moins 3 super attaques emblématiques (Kamehameha, Masenko, Galick Gun) sont exécutables.
- [ ] Une quête parallèle complète peut être jouée du début à la fin avec calcul du score.
