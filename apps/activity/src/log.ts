// SPDX-License-Identifier: Apache-2.0
/** Minimal structured logger (one JSON line per event). Never pass tokens, codes or secrets. */
export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

function line(level: string, message: string, fields: Record<string, unknown> | undefined): string {
  return JSON.stringify({ t: new Date().toISOString(), level, msg: message, ...fields });
}

export const consoleLogger: Logger = {
  info: (message, fields) => console.log(line("info", message, fields)),
  warn: (message, fields) => console.warn(line("warn", message, fields)),
  error: (message, fields) => console.error(line("error", message, fields)),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
