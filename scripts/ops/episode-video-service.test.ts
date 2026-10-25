// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  createEpisodeVideoServiceHandler,
  episodeVideoSource,
  verifyEpisodeVideoFile,
} from "./episode-video-service";

const metadata = { durationSeconds: 10, fps: 24, frameCount: 240, width: 1920, height: 1080 };
const request = (path: string, method = "GET") =>
  new Request(`http://localhost${path}`, { method });
const endpoint = "/api/episodes/877/timeline";

test("the service delegates only the approved episode and fixed local file", async () => {
  const paths: string[] = [];
  const handler = createEpisodeVideoServiceHandler({
    available: () => true,
    metadata: async (path) => {
      paths.push(path);
      return metadata;
    },
    image: async () => new Uint8Array([1, 2, 3]),
  });
  expect(await (await handler(request(endpoint))).json()).toEqual(metadata);
  expect(paths).toEqual([episodeVideoSource.file]);
  for (const path of ["/api/episodes/876/timeline", "/source.mp4", "/", "/healthz?extra=1"])
    expect((await handler(request(path))).status).toBe(404);
  expect((await handler(request(endpoint, "POST"))).status).toBe(405);
  expect((await handler(request(endpoint, "HEAD"))).headers.get("allow")).toBe("GET");
  const health = await handler(request("/healthz"));
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({
    ok: true,
    episodeId: 877,
    sourceHash: episodeVideoSource.sha256,
    videoAvailable: true,
  });
});

test("frame and GIF requests keep the existing bounds and cannot select another source", async () => {
  const profiles: unknown[] = [];
  const handler = createEpisodeVideoServiceHandler({
    available: () => true,
    metadata: async () => metadata,
    image: async (path, kind, index, _metadata, settings) => {
      profiles.push({ path, kind, index, settings });
      return new Uint8Array([4, 5, 6]);
    },
  });
  const frame = await handler(request(`${endpoint}?kind=frame&index=24`));
  expect(frame.headers.get("content-type")).toBe("image/webp");
  expect(await frame.bytes()).toEqual(new Uint8Array([4, 5, 6]));
  const gif = await handler(request(`${endpoint}?kind=gif&index=24&duration=2&fps=12&width=480`));
  expect(gif.headers.get("content-type")).toBe("image/gif");
  expect(profiles).toEqual([
    {
      path: episodeVideoSource.file,
      kind: "frame",
      index: 24,
      settings: { duration: 2, fps: 6, width: 320 },
    },
    {
      path: episodeVideoSource.file,
      kind: "gif",
      index: 24,
      settings: { duration: 2, fps: 12, width: 480 },
    },
  ]);
  for (const query of [
    "?url=http://127.0.0.1/private",
    "?kind=frame&index=240",
    "?kind=frame&index=-1",
    "?kind=gif&index=0&duration=6",
    "?kind=gif&index=0&fps=60",
    "?kind=gif&index=0&width=1920",
  ])
    expect((await handler(request(endpoint + query))).status).toBe(400);
  expect(profiles.length).toBe(2);
});

test("startup file verification requires the exact digest and a nonempty file", async () => {
  const path = `${Bun.env.TEMP ?? "/tmp"}/shenron-video-integrity-${crypto.randomUUID()}.txt`;
  const bytes = new TextEncoder().encode("file-integrity-fixture");
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  try {
    await Bun.write(path, bytes);
    expect(await verifyEpisodeVideoFile(path, sha256)).toEqual({ bytes: bytes.length, sha256 });
    await expect(verifyEpisodeVideoFile(path, "0".repeat(64))).rejects.toThrow(
      "source_integrity_failed",
    );
    await expect(verifyEpisodeVideoFile(path, "invalid")).rejects.toThrow("invalid_source_hash");
    await Bun.write(path, "");
    await expect(verifyEpisodeVideoFile(path, sha256)).rejects.toThrow("source_unavailable");
  } finally {
    await Bun.file(path).delete();
  }
});
