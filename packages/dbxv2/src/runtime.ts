/**
 * Runtime used by the modules the `dbxv2:` plugin generates. Resolves the private server from the
 * environment on first use (so nothing about the game or the token is fixed at build time), and
 * starts the loopback signing proxy lazily for URL imports.
 */
import { Dbxv2Client, type Dbxv2Binary } from "./client";
import { currentEnv, dbxv2Status, describeDisabledReason, type Dbxv2EnvInput } from "./env";
import { Dbxv2DisabledError } from "./errors";
import { createDbxv2Proxy, type Dbxv2Proxy } from "./proxy";
import {
  parseRef,
  type Dbxv2Ref,
  type Dbxv2RefInput,
  type Dbxv2ResourceKind,
  type Dbxv2ResourceParams,
} from "./refs";
import type { Dbxv2ModelJson } from "./schemas";

export interface Dbxv2Runtime {
  readonly client: Dbxv2Client;
  /** Started on first use. */
  proxy(): Dbxv2Proxy;
  stop(): void;
}

let current: { runtime: Dbxv2Runtime; key: string } | null = null;

/** Client + proxy built from the environment; throws {@link Dbxv2DisabledError} when disabled. */
export function getDbxv2Runtime(env: Dbxv2EnvInput = currentEnv()): Dbxv2Runtime {
  const status = dbxv2Status(env);
  if (!status.enabled) {
    throw new Dbxv2DisabledError(
      `DBXV2 is disabled: ${describeDisabledReason(status.reason)}. ` +
        "Set DBXV2_SERVER_URL and DBXV2_TOKEN (see docs/products/dbxv2-plugin.md).",
    );
  }
  const key = `${status.config.baseUrl}\n${status.config.token}`;
  if (current?.key === key) return current.runtime;
  current?.runtime.stop();
  let proxy: Dbxv2Proxy | null = null;
  const client = new Dbxv2Client(status.config);
  const runtime: Dbxv2Runtime = {
    client,
    proxy: () => (proxy ??= createDbxv2Proxy({ upstream: status.config, env })),
    stop: () => {
      proxy?.stop();
      proxy = null;
    },
  };
  current = { runtime, key };
  return runtime;
}

/** Stops the proxy and forgets the cached runtime (tests, shutdown). */
export function resetDbxv2Runtime(): void {
  current?.runtime.stop();
  current = null;
}

export interface Dbxv2Resource {
  readonly ref: Dbxv2Ref;
  readonly kind: Dbxv2ResourceKind;
  /** Short-lived signed loopback URL, safe for `<img>`, `<audio>`, `<video>` or a native loader. */
  url(): string;
  blob(signal?: AbortSignal): Promise<Blob>;
  arrayBuffer(signal?: AbortSignal): Promise<ArrayBuffer>;
  /** `model.json` only. */
  model(signal?: AbortSignal): Promise<Dbxv2ModelJson>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Handle on one resource; nothing is fetched until a method is called. */
export function resource(
  input: Dbxv2RefInput,
  kind: Dbxv2ResourceKind,
  params: Dbxv2ResourceParams = {},
): Dbxv2Resource {
  const ref = parseRef(input);
  const load = async (
    signal?: AbortSignal,
  ): Promise<Dbxv2Binary | { bytes: Uint8Array; contentType: string }> => {
    const { client } = getDbxv2Runtime();
    switch (kind) {
      case "raw": {
        const whole = await client.download(ref, { signal });
        return { bytes: whole.bytes, contentType: "application/octet-stream" };
      }
      case "png":
        return client.png(ref, { index: params.index, signal });
      case "wav":
        return client.wav(ref, { cue: params.cue, signal });
      case "video":
        return client.video(ref, { signal });
      case "mp4":
        return client.mp4(ref, { signal });
      case "model.json":
        return {
          bytes: new TextEncoder().encode(
            JSON.stringify(await client.modelJson(ref, { ...params, signal })),
          ),
          contentType: "application/json",
        };
      case "model.glb":
        return client.modelGlb(ref, { ...params, signal });
    }
  };
  return {
    ref,
    kind,
    url: () => getDbxv2Runtime().proxy().sign(kind, ref, params),
    async blob(signal) {
      const res = await load(signal);
      return new Blob([toArrayBuffer(res.bytes)], { type: res.contentType });
    },
    async arrayBuffer(signal) {
      return toArrayBuffer((await load(signal)).bytes);
    },
    model: (signal) => getDbxv2Runtime().client.modelJson(ref, { ...params, signal }),
  };
}
