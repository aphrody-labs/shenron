// Stop hook: keeps the session working while .claude/goal.json has open steps.
// Pause with "active": false; bounded by maxContinuations (counter in .claude/goal.state.json).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const goalPath = join(root, ".claude", "goal.json");
const statePath = join(root, ".claude", "goal.state.json");
if (!existsSync(goalPath)) process.exit(0);

const goal = JSON.parse(readFileSync(goalPath, "utf8"));
if (!goal.active) process.exit(0);
const open = goal.steps.filter((s: { status: string; blocked?: string }) => s.status !== "done" && !(s.status === "blocked"));
if (open.length === 0) process.exit(0);
// Delegated work running: its completion notification resumes the session, no block.
if (open.some((s: { status: string }) => s.status === "in_progress")) process.exit(0);

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { count: 0 };
if (state.count >= (goal.maxContinuations ?? 40)) process.exit(0);
state.count += 1;
writeFileSync(statePath, JSON.stringify(state));

const next = open[0];
process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason: `Goal open (${open.length} steps). Continue step ${next.id}: ${next.name}. Follow the shenron output style loop; update .claude/goal.json with evidence when done.`,
  }),
);
