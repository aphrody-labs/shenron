/** Thin wrapper over the `agent-browser` CLI (one named session, JSON output). */

export class Browser {
  constructor(readonly session: string) {}

  run(...args: string[]): {
    ok: boolean;
    text: string;
    json?: { data?: { result?: unknown }; error?: unknown };
  } {
    const proc = Bun.spawnSync(["agent-browser", "--session", this.session, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = proc.stdout.toString() + proc.stderr.toString();
    return { ok: proc.exitCode === 0, text };
  }

  /** Evaluates an expression in the page and returns its JSON-serialisable result. */
  eval<T>(expression: string): T {
    const proc = Bun.spawnSync(
      ["agent-browser", "--session", this.session, "--json", "eval", expression],
      { stdout: "pipe", stderr: "pipe" },
    );
    const raw = proc.stdout.toString();
    let parsed: { success?: boolean; data?: { result?: T }; error?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`eval returned non-JSON: ${raw.slice(0, 300)} ${proc.stderr.toString()}`);
    }
    if (!parsed.success) throw new Error(`eval failed: ${JSON.stringify(parsed.error)}`);
    return parsed.data?.result as T;
  }

  must(...args: string[]): string {
    const result = this.run(...args);
    if (!result.ok) throw new Error(`agent-browser ${args.join(" ")} failed: ${result.text}`);
    return result.text;
  }

  async waitFor(expression: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.eval<boolean>(expression)) return;
      await Bun.sleep(40);
    }
    throw new Error(`timeout waiting for ${expression}`);
  }
}
