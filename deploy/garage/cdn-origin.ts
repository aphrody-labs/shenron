// SPDX-License-Identifier: Apache-2.0
// Garage-backed public CDN origin: the manifest gate of deploy/cloudflare/cdn-worker.ts (same handler,
// same headers) reading manifests and `_objects/<sha256>` from Garage instead of R2. It is the
// reference implementation of the serving path until shenron-edge serves `cdn.` natively.
//
//   GARAGE_ACCESS_KEY_ID / GARAGE_SECRET_ACCESS_KEY: read-only key (never the mirror key)
//   GARAGE_ENDPOINT, GARAGE_BUCKET, GARAGE_REGION, CDN_ORIGIN_HOST, CDN_ORIGIN_PORT: optional overrides,
//   derived from deploy/garage/cluster.toml and deploy/environment.json otherwise.
import { loadCluster, meshAddresses } from "../../scripts/ops/garage-config";
import { handleCdn, type CdnBucket, type StoredObject } from "../cloudflare/cdn-worker";
import { S3 } from "./s3";

const HEX64 = /^_objects\/([a-f0-9]{64})$/;

/** Adapts a Garage bucket to the CdnBucket contract used by handleCdn. Read only. */
export function garageBucket(s3: S3): CdnBucket {
  const stored = (response: Response, key: string, extra?: Partial<StoredObject>): StoredObject => {
    const size =
      response.status === 206
        ? Number(/\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1])
        : Number(response.headers.get("content-length"));
    return {
      size,
      // Objects are content addressed: the key is the digest the mirror verified before writing.
      customMetadata: {
        sha256: HEX64.exec(key)?.[1] ?? response.headers.get("x-amz-meta-sha256") ?? "",
      },
      ...extra,
    };
  };
  return {
    async head(key) {
      const head = await s3.head(key);
      if (!head) return null;
      return {
        size: head.size,
        customMetadata: {
          sha256: HEX64.exec(key)?.[1] ?? head.headers.get("x-amz-meta-sha256") ?? "",
        },
      };
    },
    async get(key, options) {
      const response = await s3.get(key, options?.range);
      if (!response) return null;
      if (key.startsWith("_migration/")) {
        const text = await response.text();
        return { size: text.length, json: async <T>() => JSON.parse(text) as T };
      }
      return stored(response, key, { body: response.body ?? undefined });
    },
    async put() {
      throw new Error("Garage origin is read only");
    },
  };
}

export async function startGarageOrigin() {
  const cluster = await loadCluster();
  const mesh = await meshAddresses();
  const node = cluster.nodes.find((entry) => entry.name === cluster.serving.origin_node);
  if (!node) throw new Error("serving.origin_node is not a declared node");
  const meshIp = mesh(node.triad);
  const s3 = new S3({
    endpoint: process.env.GARAGE_ENDPOINT ?? `http://${meshIp}:${cluster.ports.s3}`,
    region: process.env.GARAGE_REGION ?? cluster.garage.s3_region,
    accessKeyId: process.env.GARAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.GARAGE_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.GARAGE_BUCKET ?? cluster.bucket.name,
  });
  if (!s3.config.accessKeyId || !s3.config.secretAccessKey)
    throw new Error("GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY are required");
  const env = {
    CDN: garageBucket(s3),
    MANIFEST_PREFIX: cluster.serving.manifest_prefix,
    DYNAMIC_ORIGIN: cluster.serving.dynamic_origin,
  };
  return Bun.serve({
    hostname: process.env.CDN_ORIGIN_HOST ?? meshIp,
    port: Number(process.env.CDN_ORIGIN_PORT ?? cluster.serving.origin_port),
    fetch: (request) => handleCdn(request, env),
  });
}

if (import.meta.main) {
  const server = await startGarageOrigin();
  console.error(`shenron-cdn-garage listening on ${server.hostname}:${server.port}`);
}
