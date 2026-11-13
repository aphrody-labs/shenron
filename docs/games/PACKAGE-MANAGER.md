# Dragon Ball Ultimate Games Package Manager (`db-games`)

Unified package manager and edge distribution engine for Dragon Ball games across modern PC platforms (Steam / SteamDB), retro emulators (RetroArch / Libretro), community repositories, and Cloudflare R2 object storage with Nginx edge caching.

## 1. Capabilities

- **Steam & SteamDB Integration**:
  - Full metadata for modern titles: _Sparking! ZERO_ (AppID 1790600), _Xenoverse 2_ (AppID 454650), _KAKAROT_ (AppID 851850), _FighterZ_ (AppID 678950), _THE BREAKERS_ (AppID 1276760), and _Xenoverse 1_ (AppID 323470).
  - Headless SteamCMD script generator (`@ShutdownOnFailedCommand 1`, depot keys, validation).
  - Native launch protocol generation (`steam://run/<AppID>`).
- **RetroArch & Libretro Core Resolution**:
  - Direct mapping for 10+ platforms:
    - Nintendo Wii / GameCube: `dolphin_libretro` (_Budokai Tenkaichi 2 & 3_, _Revenge of King Piccolo_)
    - Sony PlayStation 2: `pcsx2_libretro` (_Budokai Tenkaichi 1-3_, _Budokai 1-3_, _Infinite World_)
    - Sony PlayStation 1: `swanstation_libretro` (_Ultimate Battle 22_, _Final Bout_)
    - Game Boy Advance: `mgba_libretro` (_Legacy of Goku II_, _Buu's Fury_, _Supersonic Warriors_, _Advanced Adventure_)
    - Nintendo DS: `melonds_libretro` (_Ultimate Butoden_, _Attack of the Saiyans_)
    - Super Nintendo: `snes9x_libretro` (_Super Butōden 1-3_, _Hyper Dimension_)
    - Sega Mega Drive: `genesis_plus_gx_libretro` (_Buyū Retsuden_)
    - Arcade: `fbneo_libretro` (_Dragon Ball Z 2: Super Battle_)
  - Nightly core downloads directly from `buildbot.libretro.com`.
  - Auto-generated low-latency RetroArch configuration (vsync, hard sync, 16:9 / 4:3 aspect ratios, auto-save state).
- **Cloudflare R2 Storage & Nginx Edge Caching**:
  - Range-request slicing (`slice 4m; proxy_cache_slice;`) for zero-memory streaming of multi-gigabyte ISOs and RVZs.
  - Sub-millisecond `Bun.S3Client` integration.
  - Mandatory WebAssembly cross-origin isolation headers (`COOP: same-origin`, `COEP: require-corp`).
- **Deployment Ready**:
  - Standalone multi-stage Dockerfile (`deploy/docker/Dockerfile.games-engine`).
  - Production compose stack (`deploy/prod/docker-compose.games.yml`).
  - Nginx edge cache gateway (`deploy/docker/nginx-games.conf`).

## 2. CLI Commands (`just db-games`)

```sh
# Search games across English, Japanese titles and platforms
just db-games search "tenkaichi"

# Resolve complete package for a game (Steam, Libretro, R2, Serials)
just db-games info budokai-tenkaichi-3-wii

# List all games or filter by platform
just db-games list --platform wii

# Generate automated SteamCMD depot download script
just db-games steamcmd sparking-zero

# Resolve Libretro core download URL and generate RetroArch config
just db-games retroarch budokai-tenkaichi-3-ps2

# Generate Cloudflare R2 edge deployment manifest
just db-games manifest

# Start local or edge REST API daemon on port 3030
just db-games serve --port 3030
```

## 3. Production Deployment

### Launch with Docker Compose:

```sh
docker compose -f deploy/prod/docker-compose.games.yml up -d
```

### Healthcheck:

```sh
curl http://localhost:3030/healthz
# {"status":"ok","gamesCount":22,"engine":"Bun v1.4.4"}
```
