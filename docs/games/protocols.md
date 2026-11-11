# Dragon Ball Modern Games Protocol & Netcode Specification

## 1. Overview & Protocol Stacks

Modern Dragon Ball games employ a multi-tier network topology:
1. **HTTP/REST Web API Tier (`TLGameServer`)**: Handles authentication, user profile management, leaderboards, lobbies, store/DLC verification, and telemetry.
2. **Platform Session Layer (`mnp` - Multi Network Platform)**: Abstracts platform-specific matchmaking, P2P NAT punch-through, and party management across Steamworks, PSN, Xbox Live, Nintendo Switch, and WeGame.
3. **Deterministic Rollback Netcode (`GGPOUE4` / `REDGGPOManager`)**: Real-time 60Hz deterministic peer-to-peer combat synchronization with rollback capability.

---

## 2. Bandai Namco Backend Web API (`TLGameServer`)

### 2.1 Host Resolution & Environments
The game binary targets the Bandai Namco Channel network infrastructure:
- **Production Host**: `https://dbf.channel.or.jp/api/`
- **Staging / Dev Host**: `https://dbf-dev-new01.channel.or.jp/api/`
- **Testing Host**: `https://dbf-test-new01.channel.or.jp/api/`
- **Beta / Open Tournament**: `https://obtp-dbf.channel.or.jp/api/` (PlayStation), `https://obtx-dbf.channel.or.jp/api/` (Xbox)

### 2.2 Endpoint Catalog & Payloads

#### User & Authentication Services
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/user/create` | Register new game user profile and obtain unique player identifier |
| `POST` | `/api/user/login` | Authenticate session ticket with Steam / PSN ticket |
| `POST` | `/api/user/get_userinfo` | Retrieve player R-Code, BP, rank, and badges |
| `POST` | `/api/user/namechange` | Update player public display name |
| `POST` | `/api/user/set_private` | Toggle match visibility and privacy settings |

#### Lobby & Matchmaking Catalog
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/catalog/get_region` | List available world regions (North America, Europe, Japan, Asia) |
| `POST` | `/api/catalog/get_area` | List areas within a region |
| `POST` | `/api/catalog/get_lobby` | Query 64-player interactive lobby room instances and load factors |
| `POST` | `/api/catalog/get_event_lobby` | Query special event lobbies (Party Battle, Raid) |

#### R-Code & Profiles (`REDNetworkRCode`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tus/read` | Read Title User Storage (remote player card state) |
| `POST` | `/api/tus/write` | Write Title User Storage (sync customization, titles, badges) |
| `POST` | `/api/tss/read` | Read Title Shared Storage (public game configuration) |

#### Replay Network Channel (`REDReplay`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/replay/data_save` | Upload serialized input stream recording with match metadata |
| `POST` | `/api/replay/data_load` | Download serialized replay packet by ReplayID |
| `POST` | `/api/replay/set_data` | Update replay tags, character picks, and visibility |
| `POST` | `/api/catalog/get_replay` | Search replay channel by character, rank, or player ID |

#### Leaderboards & Tournaments (`zleague` & `cup`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ranking/tenkaichi_bp` | Global BP leaderboard |
| `POST` | `/api/ranking/monthly_wins` | Monthly win count leaderboard |
| `POST` | `/api/cup/entry` | Register entry for Tenkaichi Budokai cup tournament |
| `POST` | `/api/cup/get_final_tournament`| Retrieve tournament bracket state and seeding |
| `POST` | `/api/zleague/get_league` | Z-League division standing and union points |

---

## 3. Matchmaking State Machine (`REDNetworkQuickMatch`)

The quick match / ranked matching pipeline follows an asynchronous state lifecycle:

```
[STATE_INIT]
     │
     ▼
[STATE_READY]
     │
     ▼
[STATE_SEARCHING] ──(Timeout/Cancel)──► [STATE_CANCEL] / [STATE_CANCEL_ASYNC]
     │
     ▼
[STATE_MEMBER_INFO_WAIT]
     │
     ▼
[STATE_RCODESYNC] ◄── Sync player cards & connection quality
     │
     ▼
[STATE_MATCHING_COMPLETE]
     │
     ▼
[STATE_INBATTLE] ──(Match Finished)──► [STATE_END]
     │
   (Error / Drop)
     ▼
[STATE_ERROR] ──► [STATE_DISCONNECT_WAIT]
```

---

## 4. Multi-Network Platform Layer (`mnp`)

The `mnp` layer decouples Arc System Works game logic from platform networking APIs.
- **Steamworks Module**: `mnp_Steam.cpp`, `mnp_SessionSteam.cpp`, `mnp_ThreadSteam.cpp`, `mnp_UserState_Steam.cpp`.
- **Packet Serialization**: `mnp_SessionShell.hxx` with `PacketPostOfficer` queue.
- **Memory Allocation**: Custom pinned ring allocator (`mnp_MemoryMapper.cpp`) ensuring deterministic bounds without heap fragmentation during gameplay.

---

## 5. Rollback Netcode Protocol (`REDGGPO` / `GGPOUE4`)

DRAGON BALL FighterZ integrates a custom port of the GGPO (Good Great Peace Out) rollback netcode into Unreal Engine (`REDGGPOManager.cpp` and `GGPOUE4`).

### 5.1 Protocol Primitives
- **Frame Spec**: 60 ticks per second (16.666 ms per simulation frame).
- **Transport**: UDP peer-to-peer over platform sockets with packet loss recovery.
- **Input Encoding**: Compact bitvector representing 8-way directional lever plus action buttons:
  - Lever: `BtnU`, `BtnD`, `BtnL`, `BtnR`
  - Attack: `AtkL` (Light), `AtkM` (Medium), `AtkH` (Heavy), `AtkE` (Special/Ki)
  - Assists: `AtkA1` (Assist 1), `AtkA2` (Assist 2)
  - Modifiers: `AtkPlay`, `AtkRec` (Training mode state)
- **Ring Buffers**:
  - `ring_buffer.h` and `static_buffer.h` for zero-allocation state capture.
  - Snapshot state captures `battle_ObjectManager` state for rewinds up to 7 frames.
  - Resimulation re-applies stored input queues (`input_queue.cpp`) to reconcile speculative execution.
