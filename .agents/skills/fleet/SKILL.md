---
name: fleet
description: Run a command, build or deploy on the three hosts (ssh fr1 = builds, CI, heavy jobs, self-hosted Vercel; ssh fr2 = previews, tests, benchmarks, edge, self-hosted Cloudflare; ssh prd = production, shenron and rosegriffon only). Use for any remote ssh/scp/systemctl/docker work; never a heavy build on the PC.
---

1. Always bound it: `timeout 60 ssh <fr1|fr2|prd> '<cmd>'` (120 for scp and installs). Exit 255 means an overloaded host: retry after `uptime`.
2. Builds and Rust compilation: `fr1` only. Previews and edge: `fr2`. Production: `prd`, shenron units only; rosegriffon shares the host and is another agent's (never touch `rosegriffon-*`, `rg-*`, its nginx).
3. Before a prd deploy, take the lock `/srv/deploy.lock` (flock, content: project and date) and skip if rosegriffon holds it.
4. Deploy one service at a time: `docker compose -f /srv/shenron/compose.yaml up -d --no-deps <service>`; keep the previous image for rollback.
5. Prove a deploy with content, not a status: a screenshot of the rendered page, or an API call whose response body is checked. A bare HTTP code proves nothing.
6. Secrets stay in env files outside the repository; never print or commit them.
