---
name: shenron-selfhost
description: Operate the Shenron self-hosted Rust stack of ADR 0009 (deployd, edge, Garage, MCP admin tier, goal ledger); use before changing prd, the edge, the CDN origin or the deploy path.
metadata:
  short-description: Shenron self-hosting runbook index
---

# Shenron self-hosting (ADR 0009)

Read `docs/decisions/0009-auto-hebergement-rust-integral.md` first, then the runbook of the piece you touch. Do not copy numbers from this file: hosts, versions and ports come from `AGENTS.md`, `deploy/environment.json`, `ssh -G <host>` and the live system.

## Where things are

| Need | Source |
|---|---|
| Step status and evidence | `.claude/goal.json` (steps 0 to 8) |
| Release without SSH | `docs/runbooks/deployd.md`, `../wiki/crates/shenron-deployd` |
| Edge replacing nginx | `../wiki/crates/shenron-edge`, `deploy/edge/` |
| CDN origin replacing R2 and the Worker | `docs/runbooks/cdn-garage-cutover.md`, `deploy/garage/` |
| Claude on Postgres, Redis and Dragon Ball context | `docs/runbooks/shenron-mcp-admin.md` |
| Dated dependency versions | `docs/research/` (re-run the survey before pinning) |
| Bun and Rust pins | `package.json#packageManager`, `../wiki/rust-toolchain.toml`, `bun scripts/deploy/environment.ts --check` |

## Rules that bit before

- A prd change takes the deploy lock (`flock`, path in `AGENTS.md`) and notifies live sessions first. Rose Griffon shares prd: never touch its units.
- Rust is built in `aphrody-labs/wiki` on fr1 only, niced when load is high (`nice -n 19 ionice -c3`, `-j2`); check load before starting a build and never start a second one on the same target dir.
- A step is `done` only after proof on the public origin: rendered screenshot, broken images, failed requests, console errors, checked API bodies. A green HTTP status is not proof. A release that exists only in a repo is `in_progress`.
- Commit by explicit path (`git commit -- <paths>`): another agent's staged files are swept into a plain `git commit` of the shared index. No stash, no reset, no `git add -A`, gitleaks before every push.
- Cutovers (CDN, edge) wait for the new path to serve the traffic class first; the old path stays until parity is measured (`scripts/ops/cdn-parity.ts`, `scripts/ops/edge-header-diff.ts`).
- Disk: Garage with replication 2 on two zones stores every object on both; check `df` per node before a mirror run.
- Tags: `v*` triggers the release workflow. Session snapshots use `session-<date>-<sha>`.

## Prove an MCP change

Anonymous `tools/list` returns the read-only set; a bearer (header from `SHENRON_MCP_TOKEN`, never printed) returns the admin set. `db.query` must refuse writes and multi-statement input, `db.exec` must refuse without `confirm`, and a `NOTIFY` on a watched channel must update a subscribed resource.
