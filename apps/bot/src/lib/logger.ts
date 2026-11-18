import { botOperationalLogs } from "./operational-logs";

export type LogLevelName = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";
const LEVELS: Record<LogLevelName, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 70,
};
const COLORS: Record<number, string> = {
  10: "\x1b[90m",
  20: "\x1b[36m",
  30: "\x1b[32m",
  40: "\x1b[33m",
  50: "\x1b[31m",
  60: "\x1b[35m",
};
const LABELS: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

export interface Logger {
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

export interface CreateLoggerOptions {
  level?: string;
  base?: Record<string, unknown>;
  pretty?: boolean;
  onLog?: (level: number, args: unknown[]) => void;
  write?: (line: string) => void;
}

const normErr = (e: Error) => ({ type: e.name, message: e.message, stack: e.stack });

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const min = LEVELS[(opts.level as LogLevelName) ?? "info"] ?? 30;
  const write = opts.write ?? ((s: string) => process.stdout.write(`${s}\n`));
  const log = (lvl: number, args: unknown[]) => {
    if (lvl < min) return;
    opts.onLog?.(lvl, args);
    const [first, ...rest] = args;
    const obj =
      first instanceof Error
        ? { err: normErr(first) }
        : typeof first === "object" && first && !Array.isArray(first)
          ? Object.fromEntries(
              Object.entries(first).map(([k, v]) => [k, v instanceof Error ? normErr(v) : v]),
            )
          : undefined;
    const msg = obj
      ? rest.map(String).join(" ") || (first instanceof Error ? first.message : "")
      : args.map(String).join(" ");
    if (opts.pretty)
      return write(
        `[${new Date().toISOString().slice(11, 23)}] ${COLORS[lvl] ?? ""}${LABELS[lvl] ?? "INFO"}\x1b[0m: ${msg}${obj && Object.keys(obj).length ? ` ${JSON.stringify(obj)}` : ""}`,
      );
    write(JSON.stringify({ level: lvl, time: Date.now(), ...opts.base, ...obj, msg }));
  };
  return {
    trace: (...a) => log(10, a),
    debug: (...a) => log(20, a),
    info: (...a) => log(30, a),
    warn: (...a) => log(40, a),
    error: (...a) => log(50, a),
    fatal: (...a) => log(60, a),
    child: (bindings) => createLogger({ ...opts, base: { ...opts.base, ...bindings } }),
  };
}

let defaultLogger: Logger | undefined;
const getDefault = () =>
  (defaultLogger ??= createLogger({
    level: process.env.LOG_LEVEL ?? "info",
    pretty: process.env.NODE_ENV === "development",
    onLog: (lvl, a) => botOperationalLogs.record(lvl, a),
  }));
export const logger: Logger = {
  trace: (...a) => getDefault().trace(...a),
  debug: (...a) => getDefault().debug(...a),
  info: (...a) => getDefault().info(...a),
  warn: (...a) => getDefault().warn(...a),
  error: (...a) => getDefault().error(...a),
  fatal: (...a) => getDefault().fatal(...a),
  child: (b) => getDefault().child(b),
};
