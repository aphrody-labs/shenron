import { expect, test } from "bun:test";
import { join } from "node:path";
const root = join(import.meta.dir, "../..");
type Workflow = {
  on?: Record<string, unknown>;
  jobs: Record<
    string,
    { uses?: string; steps?: { run?: string }[]; "runs-on"?: string | string[] }
  >;
};
const workflows = new Map<string, Workflow>();
for await (const file of new Bun.Glob("*.yml").scan(join(root, ".github/workflows")))
  workflows.set(
    file,
    Bun.YAML.parse(await Bun.file(join(root, ".github/workflows", file)).text()) as Workflow,
  );

test("local reusable workflow calls resolve to a callable workflow at the same commit", () => {
  let calls = 0;
  for (const workflow of workflows.values())
    for (const job of Object.values(workflow.jobs)) {
      if (!job.uses?.startsWith("./.github/workflows/")) continue;
      const target = workflows.get(job.uses.replace("./.github/workflows/", ""));
      expect(target).toBeDefined();
      expect(Object.hasOwn(target!.on!, "workflow_call")).toBe(true);
      calls++;
    }
  expect(Object.hasOwn(workflows.get("ci.yml")!.on!, "push")).toBe(true);
  expect(Object.hasOwn(workflows.get("ci.yml")!.on!, "pull_request")).toBe(true);
});

test("workflow execution uses native Bun gates and explicit Ubuntu baselines", () => {
  for (const workflow of workflows.values())
    for (const job of Object.values(workflow.jobs)) {
      expect(job["runs-on"]).not.toBe("ubuntu-latest");
      for (const step of job.steps ?? []) {
        expect(step.run ?? "").not.toMatch(/(?:^|[\s;&|])(?:tsc|oxlint|oxfmt|npx|bunx)(?:\s|$)/);
      }
    }
});

test("release tags remain structured environment input rather than executable shell interpolation", () => {
  for (const job of Object.values(workflows.get("release.yml")!.jobs))
    for (const step of job.steps ?? []) {
      expect(step.run ?? "").not.toMatch(/\$\{\{\s*github\.event\.inputs\.tag/);
    }
});
