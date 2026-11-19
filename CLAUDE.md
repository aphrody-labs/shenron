# CLAUDE.md

Claude Code guidance. The contract is `AGENTS.md`.

@AGENTS.md

## Claude Code notes

- Goal loop: `.claude/goal.json` holds the steps; the Stop hook `.claude/hooks/goal-continue.ts` is registered in `.claude/settings.local.json` and does not block while a step is `in_progress`. Output style `shenron`: one compact JSON object per turn.
- MCP: `.mcp.json` stays anonymous (read-only tools). The admin tier is a local `shenron-admin` entry in `~/.claude.json` with the bearer taken from `SHENRON_MCP_TOKEN`; `${VAR}` expansion inside `.mcp.json` broke the config, do not reintroduce it.
- `apps/site/AGENTS.md` is rewritten when the Next dev server starts: `git checkout -- apps/site/AGENTS.md` before committing.
- Over ssh, `pkill -f 'pattern'` also matches the remote shell that carries the pattern: write `[p]attern`.
- `crates/shenron-deployd` and `shenron-tv` are standalone crates (own `Cargo.lock`, excluded from the workspace): build them from their own directory.
- Sub-agent briefs name the files and gates, forbid deploys unless asked, and require `git commit -- <paths>`; a worker without that rule sweeps the shared index.
