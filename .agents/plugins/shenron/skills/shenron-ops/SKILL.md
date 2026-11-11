---
name: shenron-ops
description: Operational actions, health checks, and deployment verification for the Shenron monorepo platform.
---

# Shenron Operations (`shenron-ops`)

## Actions

- **Type Check**: Run `bun check` across all packages and apps.
- **Code Lint & Format**: Run `just lint` and `just format-check`.
- **Unit & Integration Tests**: Run `just test`.
- **Deploy Plan & Lanes**: Run `just deploy-plan` to inspect affected zero-downtime activation lanes.
