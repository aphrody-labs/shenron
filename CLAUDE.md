# CLAUDE.md

Claude Code guidance. The contract is `AGENTS.md`.

@AGENTS.md

## Claude Code notes

- Goal loop: `.claude/goal.json` holds the steps; the Stop hook `.claude/hooks/goal-continue.ts` is registered in `.claude/settings.local.json` (gitignored, per machine) and does not block while a step is `in_progress`. Output style `shenron`: one compact JSON object per turn.
- MCP: `.mcp.json` stays anonymous (read-only tools). The admin tier is a local `shenron-admin` entry in `~/.claude.json` with the bearer taken from `SHENRON_MCP_TOKEN`; `${VAR}` expansion inside `.mcp.json` broke the config, do not reintroduce it.
- `apps/site/AGENTS.md` is rewritten when the Next dev server starts: `git checkout -- apps/site/AGENTS.md` before committing.
- Over ssh, `pkill -f 'pattern'` also matches the remote shell that carries the pattern: write `[p]attern`.
- Do not add Cargo files here: Rust lives in `../wiki` (see `AGENTS.md`); Bun scripts read its output through `packages/config/src/wiki-artifacts.ts`.
- Sub-agent briefs name the files and gates, forbid deploys unless asked, and require the `git commit -- <paths>` rule of `AGENTS.md`.
- Multi-agent code work runs as loops: one narrow task from a queue file, one implementer, two adversarial reviewers that see only the diff (they reject stubs, skipped tests and workarounds that need a paragraph of comment), one fixer; trial on 3 items before fanning out. Broad "replace all X" agents produced nothing usable on 2026-11-19.
- Research and fact checks: use the `searxng` MCP tools first (`searxng_web_search`, `web_url_read`; self-hosted SearXNG on fr2, no quota), then the repo, `gh api` and registries for versions; Context7 only for library API docs. A fact in a plan or report needs its source and date.
