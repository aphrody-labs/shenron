# Modern Dragon Ball Games Manifest & Asset Specification

## 1. Overview & Scope

This specification documents the container formats, file manifests, asset structures, and character representations common across modern Dragon Ball gaming titles (_DRAGON BALL FighterZ_, _Xenoverse 2_, _Kakarot_, and _Sparking! ZERO_).

---

## 2. Unreal Engine Asset Pipeline (`.pak` Chunks)

In Unreal-based Dragon Ball games (_FighterZ_, _Kakarot_, _Sparking! ZERO_), assets are split into distinct pak chunks:

### 2.1 Chunk Partitioning

- **`pakchunk0` (Base Content)**:
  - Game Engine core scripts and shaders (`REDGameShader`).
  - Base character roster assets: meshes, skeletons, animations, physics cloth (`NvCloth`).
  - Global audio banks (Ogg/Vorbis music, sound effects, voice tracks in English and Japanese).
  - Common UI widgets (`Slate` / UMG UI blueprints).
- **`pakchunk1+` (DLC & Patches)**:
  - Post-launch characters (e.g. Broly, Bardock, Vegito, Gogeta, Ultra Instinct Goku, Android 21 Lab Coat).
  - New stages, BGM packs, and dramatic finish sequences.
  - Balance patches and updated game state definitions.

### 2.2 Signature Validation (`.sig`)

Each `.pak` file has an associated `.sig` file containing:

1. RSA-signed SHA-256 hashes for each 64KB chunk of the `.pak`.
2. Master signature validated by EasyAntiCheat (`EasyAntiCheatP2P`) and the game engine linker before mounting.

---

## 3. Character Data Architecture

### 3.1 Character Identifiers (Internal Roster Codes)

Arc System Works uses uniform 3-letter / short identifiers for roster objects:

- `Goku` / `GKN` (Super Saiyan Goku), `GKB` (SSGSS Goku), `GKU` (Base Goku), `GKT` (GT Goku), `GKI` (Ultra Instinct)
- `Vegeta` / `VGN` (SS Vegeta), `VGB` (SSGSS Vegeta), `VGU` (Base Vegeta)
- `Gohan` / `GHN` (Teen Gohan), `GHA` (Adult Gohan)
- `Piccolo` / `PCL`
- `Krillin` / `KRL`
- `Trunks` / `TRK`
- `Frieza` / `FRZ`
- `Cell` / `CEL`
- `MajinBuu` / `MBU` (Good Buu), `KBU` (Kid Buu)
- `Android18` / `A18`
- `Android16` / `A16`
- `Android21` / `A21` (Original character supervised by Akira Toriyama)
- `Hit` / `HIT`
- `Beerus` / `BRS`
- `GokuBlack` / `GKB`
- `Yamcha` / `YMC`
- `Tien` / `TEN`
- `Nappa` / `NAP`
- `CaptainGinyu` / `GNY` (includes Ginyu Force summons: Recoome, Burter, Jeice, Guldo)
- `Broly` / `BRL` (Z Broly), `BRS` (Super Broly)
- `Bardock` / `BDK`
- `Vegito` / `VGT` (SSGSS Vegito)
- `Gogeta` / `GGT` (SSGSS Gogeta), `GG4` (SS4 Gogeta)
- `Kefla` / `KFL`
- `MasterRoshi` / `MSK`
- `SuperBaby2` / `SBB`

### 3.2 Move & Animation Table Structure

Every character defines an action and animation table containing:

1. **Normal Attacks**:
   - Standing: `5A` (`NmlAtk5A`), `5B`, `5C`
   - Crouching: `2A`, `2B`, `2C`
   - Jumping: `j.A`, `j.B`, `j.C`
2. **Special Attacks**:
   - `Atk236` (Quarter-circle forward)
   - `Atk214` (Quarter-circle back)
   - `Atk623` (Z-motion / Dragon Punch)
   - `Atk421` (Reverse Dragon Punch)
3. **Super Moves (Level 1 / Level 3)**:
   - Super animations with cinematic camera control: `camera_set_look_at_pos`, `camera_rot_play`, `setDOF_distance`.
   - Special flags: `Hakai` (Destruction finish), `BodyChange` (Character state swap).

---

## 4. Save Data & Profile Architecture (`WindowsSaveData`)

### 4.1 Save Container

- Saved locally under Steam user appdata: `%LOCALAPPDATA%\RED\Saved\SaveGames\`.
- Encryption: Blowfish/AES-CTR encrypted block using game title key.
- Save data modules:
  - `game_Save.cpp`: System configuration, key bindings, audio/display settings.
  - `game_CardDataCS.cpp`: Player R-Code customizations, unlocked titles, badges, avatars, and stamp loadouts.
  - `REDDataTable_ProfileCustomize.cpp`: Zeni, Premium Z Coins, and unlocked Shop items.
