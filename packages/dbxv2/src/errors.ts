/** Typed errors and a Result helper. Messages never carry the token or any query string. */

export type Dbxv2ErrorKind =
  | "disabled"
  | "config"
  | "auth"
  | "forbidden"
  | "not_found"
  | "range"
  | "busy"
  | "timeout"
  | "server"
  | "network"
  | "aborted"
  | "schema"
  | "changed"
  | "build_refused";

/** Bytes received before a download failed, to resume with `download({ resume })`. */
export interface Dbxv2Partial {
  readonly bytes: Uint8Array;
  readonly etag: string;
  readonly size: number;
}

export class Dbxv2Error extends Error {
  readonly kind: Dbxv2ErrorKind;
  readonly status: number | null;
  partial?: Dbxv2Partial;

  constructor(
    kind: Dbxv2ErrorKind,
    message: string,
    options: { status?: number | null; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.kind = kind;
    this.status = options.status ?? null;
  }
}

export class Dbxv2DisabledError extends Dbxv2Error {
  constructor(message: string) {
    super("disabled", message);
  }
}
export class Dbxv2ConfigError extends Dbxv2Error {
  constructor(message: string) {
    super("config", message);
  }
}
export class Dbxv2AuthError extends Dbxv2Error {
  constructor(message = "unauthorized: check DBXV2_TOKEN") {
    super("auth", message, { status: 401 });
  }
}
export class Dbxv2ForbiddenError extends Dbxv2Error {
  constructor(message: string) {
    super("forbidden", message, { status: 403 });
  }
}
export class Dbxv2NotFoundError extends Dbxv2Error {
  constructor(message: string) {
    super("not_found", message, { status: 404 });
  }
}
export class Dbxv2RangeError extends Dbxv2Error {
  constructor(message: string) {
    super("range", message, { status: 416 });
  }
}
export class Dbxv2BusyError extends Dbxv2Error {
  constructor(message: string, status = 503) {
    super("busy", message, { status });
  }
}
export class Dbxv2TimeoutError extends Dbxv2Error {
  constructor(message: string, status: number | null = null) {
    super("timeout", message, { status });
  }
}
export class Dbxv2ServerError extends Dbxv2Error {
  constructor(message: string, status: number) {
    super("server", message, { status });
  }
}
export class Dbxv2NetworkError extends Dbxv2Error {
  constructor(message: string, cause?: unknown) {
    super("network", message, { cause });
  }
}
export class Dbxv2AbortError extends Dbxv2Error {
  constructor(message = "request aborted") {
    super("aborted", message);
  }
}
export class Dbxv2SchemaError extends Dbxv2Error {
  readonly issues: readonly string[];
  constructor(message: string, issues: readonly string[] = []) {
    super("schema", message);
    this.issues = issues;
  }
}
/** The entry changed on the server while a ranged download was in progress. */
export class Dbxv2ChangedError extends Dbxv2Error {
  constructor(message: string) {
    super("changed", message, { status: 200 });
  }
}
export class Dbxv2BuildRefusedError extends Dbxv2Error {
  constructor(message: string) {
    super("build_refused", message);
  }
}

export type Result<T, E extends Error = Dbxv2Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Runs `fn` and turns a thrown {@link Dbxv2Error} into a failed Result; other errors propagate. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (error instanceof Dbxv2Error) return { ok: false, error };
    throw error;
  }
}

/** Maps an HTTP error status of the private server to a typed error. */
export function errorForStatus(status: number, detail: string): Dbxv2Error {
  const message = `${detail} (HTTP ${status})`;
  if (status === 401) return new Dbxv2AuthError(message);
  if (status === 403) return new Dbxv2ForbiddenError(message);
  if (status === 404) return new Dbxv2NotFoundError(message);
  if (status === 416) return new Dbxv2RangeError(message);
  if (status === 503) return new Dbxv2BusyError(message, status);
  if (status === 504) return new Dbxv2TimeoutError(message, status);
  return new Dbxv2ServerError(message, status);
}
