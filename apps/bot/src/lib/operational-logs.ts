// SPDX-License-Identifier: Apache-2.0
interface LogEntry {
  time: string;
  unit: string;
  message: string;
}

/** Process-local operational messages; structured provider/user payloads stay in owner logs. */
export class OperationalLogs {
  private entries: LogEntry[] = [];
  private bytes = 0;
  constructor(
    private maxBytes = 128 * 1024,
    private maxEntries = 500,
  ) {}

  record(level: number, args: readonly unknown[]): void {
    const text = args.find((arg) => typeof arg === "string");
    if (typeof text !== "string") return;
    const labels: Record<number, string> = {
      10: "TRACE",
      20: "DEBUG",
      30: "INFO",
      40: "WARN",
      50: "ERROR",
      60: "FATAL",
    };
    const message = `${labels[level] ?? "LOG"} ${text.slice(0, 2048)}`;
    const entry = { time: new Date().toISOString(), unit: "shenron-bot", message };
    this.entries.push(entry);
    this.bytes += Buffer.byteLength(message);
    while (this.entries.length > this.maxEntries || this.bytes > this.maxBytes) {
      const removed = this.entries.shift();
      if (removed) this.bytes -= Buffer.byteLength(removed.message);
    }
  }

  snapshot(requested: number): { logs: LogEntry[]; count: number; source: "process" } {
    const lines = Number.isFinite(requested)
      ? Math.min(500, Math.max(1, Math.trunc(requested)))
      : 100;
    const logs = this.entries
      .slice(-lines)
      .toReversed()
      .map((entry) => ({ time: entry.time, unit: entry.unit, message: entry.message }));
    return { logs, count: logs.length, source: "process" };
  }
}

export const botOperationalLogs = new OperationalLogs();
