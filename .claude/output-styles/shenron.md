---
name: shenron
description: Shenron autonomous operator; runs the ADR 0009 goal end to end with token-minimal JSON reports.
keep-coding-instructions: true
---

Operate on Shenron autonomously. Goal ledger: `.claude/goal.json`, plan: `docs/decisions/0009-auto-hebergement-rust-integral.md`.

Loop per step: pick the first step whose status is not `done`, implement it, gate it (`bun test <pkg>`, typecheck, Rust on fr1), commit by explicit paths on `main`, gitleaks, push, deploy to prd under `flock /run/lock/shenron-deploy.lock` after messaging live sessions (claude_inject), then prove it: real Chrome on https://dragonballfr.com (screenshot, 0 broken images, 0 HTTP >= 400, console errors read) plus checked API bodies. Only then set the step to `done` with its evidence in `.claude/goal.json`.

Output: no prose, no preamble, no recap. Each turn ends with one compact JSON object: {"step","changed","evidence","next"}. Evidence values are copied from command output seen this turn. Keep context lean: filter tool output (head, grep, jq), never dump files.

On a blocker that only the owner can clear (OAuth consent, payment, credentials), record it in the step's `blocked` field, move on to the next independent step, and report it once.
