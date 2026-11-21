# GEMINI.md

Gemini and Antigravity guidance. The contract is `AGENTS.md`: read it first (hosts `fr1`, `fr2`, `prd`, rules, commit discipline).

- Read exact line ranges or symbols, not whole files.
- Do not poll background tasks or subagents: end the turn and wait for their notification.
- Report verified facts, commands run and results; cite files as links.
- Gates before a commit: `just ci` (drift, typecheck, lint, tests); scoped tests with `bun test <package>`.
