# shenron — Gemini & Antigravity Operating Guidelines (`GEMINI.md`)

> **Doctrine**: No Human In The Loop (NHITL) | 100% Upstream Bun v1.4.4+ & Rust 2024 | Sovereign Triad (`vps`, `cdn`, `prod`)

## 1. Context Window & Token Optimization

- **High-Precision Targeting**: Never dump large raw files into context. Use exact line range reads or symbol searches.
- **Zero-Polling Reactive Wakeup**: When launching background tasks or subagents, do not poll. End the turn and wait for reactive notifications.
- **Concise Fact-Based Output**: Report only verified facts, executed commands, test results, and clickable file links (`[file.ext](file:///C:/src/products/shenron/...)`).
- **Strict Zero-Emoji Policy**: Zero emojis in all responses, code, UI, commits, and logs.

## 2. Sovereign Infrastructure Triad

- **`ssh vps` (`10.200.77.1` / `51.77.147.152`)**: 12-core Build Hub, Rust/Bun sccache farm, WireGuard mesh hub.
- **`ssh cdn` (`10.200.77.3` / `51.255.162.6`, alias `bunos`)**: Cloudflare Edge Simulator (Pingora Gateway, Garage S3 R2, RQLite D1, `workerd`, Mail & Auth sync).
- **`ssh prod` (`10.200.77.5` / `72.60.186.43`)**: Arch Linux 7.2.11 production host for `dragonballfr.com` (`shenron-gateway`, `shenron-site`, `shenron-bot`, `shenron-chat`, `shenron-compute`, `shenron-embed`, `shenron-postgres`, `shenron-redis`, `shenron-cloudflared`).

## 3. Autonomous Execution (NHITL)

- **Zero Bottlenecks**: Eliminate redundant build steps, external network dependencies during builds, and sequential bottlenecks.
- **Quality Gates**: Always validate changes with `bun fmt`, `bun lint`, `bun check`, and `bun test` / `cargo test` before committing.
