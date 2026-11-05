// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, spyOn, test } from "bun:test";
import { Box3, Vector3, type BufferGeometry, type Material, type Mesh } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { loadSceneGlb, type SceneGlbAsset } from "../../src/scene3d/glb";
import { PORTAL_DIORAMA_ASSETS, PORTAL_DIORAMA_BUDGET } from "../../src/scene3d/portal-assets";
import { preparePortalDiorama, projectDioramaRect } from "../../src/scene3d/portal-diorama";

const origin = "https://scene-fixture.invalid";
const options = { baseUrl: origin, allowedOrigins: [origin], budget: PORTAL_DIORAMA_BUDGET };
const restorations: (() => void)[] = [];
afterEach(() => {
  for (const restore of restorations.splice(0).toReversed()) restore();
});

function restoreAfterTest<T extends { mockRestore(): void }>(mocked: T): T {
  restorations.push(() => mocked.mockRestore());
  return mocked;
}

const readAsset = (asset: SceneGlbAsset) =>
  Bun.file(new URL(`../../../../apps/site/public${asset.url}`, import.meta.url)).bytes();

const asFetch = (
  implementation: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>,
): typeof fetch => Object.assign(implementation, { preconnect: globalThis.fetch.preconnect });

/** Read actual packaged GLB bytes; unexpected network or decoder requests always fail. */
function serveRealAssets() {
  return restoreAfterTest(
    spyOn(globalThis, "fetch").mockImplementation(
      asFetch(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const asset = PORTAL_DIORAMA_ASSETS.find((candidate) => candidate.url === url.pathname);
        if (url.origin !== origin || !asset) throw new Error("unexpected_network_request");
        expect(init?.credentials).toBe("omit");
        expect(init?.redirect).toBe("error");
        const bytes = await readAsset(asset);
        return new Response(bytes, { headers: { "content-length": String(bytes.length) } });
      }),
    ),
  );
}

function observeDisposal(gltf: GLTF) {
  const resources = new Set<BufferGeometry | Material>();
  for (const scene of gltf.scenes)
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.geometry) resources.add(mesh.geometry);
      if (mesh.material)
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          resources.add(material);
    });
  const events = new Map([...resources].map((resource) => [resource, 0]));
  for (const resource of resources)
    resource.addEventListener("dispose", () => events.set(resource, events.get(resource)! + 1));
  return events;
}

test.each(PORTAL_DIORAMA_ASSETS)(
  "decodes reviewed real $id with its pinned hash and geometry",
  async (asset) => {
    const network = serveRealAssets();
    const loaded = await loadSceneGlb(asset, options);
    try {
      expect(network).toHaveBeenCalledTimes(1);
      expect(loaded.resources).toEqual({ nodes: 4, triangles: asset.triangles, texturePixels: 0 });
      const bounds = new Box3().setFromObject(loaded.gltf.scene);
      expect(bounds.min.y).toBeCloseTo(-0.05, 8);
      expect(bounds.max.y).toBeCloseTo(asset.bounds.max[1], 7);
    } finally {
      loaded.dispose();
    }
  },
);

test("rejects a changed SHA even when the downloaded asset is a valid GLB", async () => {
  serveRealAssets();
  await expect(
    loadSceneGlb({ ...PORTAL_DIORAMA_ASSETS[0], sha256: "0".repeat(64) }, options),
  ).rejects.toThrow("glb_hash_mismatch");
});

test("rejects a byte budget before requesting data", async () => {
  const network = serveRealAssets();
  await expect(
    loadSceneGlb(PORTAL_DIORAMA_ASSETS[0], {
      ...options,
      budget: { ...PORTAL_DIORAMA_BUDGET, maxBytes: 20 },
    }),
  ).rejects.toThrow("glb_budget_exceeded");
  expect(network).not.toHaveBeenCalled();
});

test("rejects a geometry budget and disposes the real decoded result", async () => {
  serveRealAssets();
  const original = GLTFLoader.prototype.parseAsync;
  let disposal: ReturnType<typeof observeDisposal> | undefined;
  restoreAfterTest(
    spyOn(GLTFLoader.prototype, "parseAsync").mockImplementation(async function (
      this: GLTFLoader,
      data,
      path,
    ) {
      const gltf = await original.call(this, data, path);
      disposal = observeDisposal(gltf);
      return gltf;
    }),
  );
  await expect(
    loadSceneGlb(PORTAL_DIORAMA_ASSETS[0], {
      ...options,
      budget: { ...PORTAL_DIORAMA_BUDGET, maxTriangles: 100 },
    }),
  ).rejects.toThrow("glb_budget_exceeded");
  expect(disposal?.size).toBeGreaterThan(0);
  expect([...disposal!.values()].every((count) => count === 1)).toBe(true);
});

test("cancels an oversized response body instead of continuing to consume it", async () => {
  const asset = PORTAL_DIORAMA_ASSETS[0];
  const bytes = new Uint8Array(asset.bytes + 1);
  bytes.set(await readAsset(asset));
  let cancellations = 0;
  restoreAfterTest(
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
          },
          cancel() {
            cancellations++;
          },
        }),
      ),
    ),
  );
  await expect(loadSceneGlb(asset, options)).rejects.toThrow("glb_size_mismatch");
  expect(cancellations).toBe(1);
});

test("a pre-aborted request never downloads a model", async () => {
  const network = serveRealAssets();
  const controller = new AbortController();
  controller.abort(new Error("cancel_before_download"));
  await expect(
    loadSceneGlb(PORTAL_DIORAMA_ASSETS[0], { ...options, signal: controller.signal }),
  ).rejects.toThrow("cancel_before_download");
  expect(network).not.toHaveBeenCalled();
});

test("an abort at real decoder completion releases the late model exactly once", async () => {
  serveRealAssets();
  const controller = new AbortController();
  const original = GLTFLoader.prototype.parseAsync;
  let result: GLTF | undefined;
  let disposal: ReturnType<typeof observeDisposal> | undefined;
  restoreAfterTest(
    spyOn(GLTFLoader.prototype, "parseAsync").mockImplementation(async function (
      this: GLTFLoader,
      data,
      path,
    ) {
      result = await original.call(this, data, path);
      disposal = observeDisposal(result);
      controller.abort(new Error("cancel_after_decode"));
      return result;
    }),
  );
  await expect(
    loadSceneGlb(PORTAL_DIORAMA_ASSETS[0], { ...options, signal: controller.signal }),
  ).rejects.toThrow("cancel_after_decode");
  expect(result?.scene.children).toHaveLength(0);
  expect(disposal?.size).toBeGreaterThan(0);
  expect([...disposal!.values()].every((count) => count === 1)).toBe(true);
});

test("explicit disposal detaches the model and releases each geometry and material once", async () => {
  serveRealAssets();
  const loaded = await loadSceneGlb(PORTAL_DIORAMA_ASSETS[0], options);
  const disposal = observeDisposal(loaded.gltf);
  loaded.dispose();
  loaded.dispose();
  expect(loaded.gltf.scene.children).toHaveLength(0);
  expect(disposal.size).toBeGreaterThan(0);
  expect([...disposal.values()].every((count) => count === 1)).toBe(true);
});

test("cancelling the second model also disposes the first model in a partial island", async () => {
  const controller = new AbortController();
  const reason = new Error("cancel_partial_island");
  const bytes = await readAsset(PORTAL_DIORAMA_ASSETS[0]);
  const network = restoreAfterTest(spyOn(globalThis, "fetch"))
    .mockResolvedValueOnce(new Response(bytes))
    .mockImplementationOnce(
      asFetch(async () => {
        controller.abort(reason);
        throw reason;
      }),
    );
  const original = GLTFLoader.prototype.parseAsync;
  let first: GLTF | undefined;
  let disposal: ReturnType<typeof observeDisposal> | undefined;
  restoreAfterTest(
    spyOn(GLTFLoader.prototype, "parseAsync").mockImplementation(async function (
      this: GLTFLoader,
      data,
      path,
    ) {
      first = await original.call(this, data, path);
      disposal = observeDisposal(first);
      return first;
    }),
  );
  await expect(
    preparePortalDiorama({
      ...options,
      signal: controller.signal,
      palette: { foliage: "#8fe4cb", trunk: "#725852", grass: "#58bca8", earth: "#f2dfa2" },
    }),
  ).rejects.toThrow("cancel_partial_island");
  expect(network).toHaveBeenCalledTimes(2);
  expect(first?.scene.children).toHaveLength(0);
  expect(disposal?.size).toBeGreaterThan(0);
  // Source materials were released during theme conversion; geometry during cancellation.
  expect([...disposal!.values()].every((count) => count === 1)).toBe(true);
});

test("the real island uses theme colours and fits entirely at desktop and mobile aspect ratios", async () => {
  serveRealAssets();
  const prepared = await preparePortalDiorama({
    ...options,
    palette: { foliage: "#8fe4cb", trunk: "#725852", grass: "#58bca8", earth: "#f2dfa2" },
  });
  try {
    const expectedColours: Record<string, string> = {
      woodBark: "725852",
      leafsGreen: "8fe4cb",
      grass: "58bca8",
      dirt: "f2dfa2",
    };
    prepared.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        expect(material.type).toBe("MeshBasicMaterial");
        expect((material as import("three").MeshBasicMaterial).color.getHexString()).toBe(
          expectedColours[material.name],
        );
      }
    });
    for (const aspect of [1280 / 720, 390 / 720]) {
      expect(prepared.fitAspect(aspect)).toBe(true);
      const corners = [];
      for (const x of [prepared.bounds.min.x, prepared.bounds.max.x])
        for (const y of [prepared.bounds.min.y, prepared.bounds.max.y])
          for (const z of [prepared.bounds.min.z, prepared.bounds.max.z])
            corners.push(new Vector3(x, y, z).project(prepared.camera));
      expect(
        corners.every(
          (point) => Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1,
        ),
      ).toBe(true);
    }
  } finally {
    prepared.dispose();
  }
  prepared.dispose();
  expect(prepared.scene.children).toHaveLength(0);
  expect(prepared.fitAspect(1)).toBe(false);
});

// Measured against sceneCamera + scenePoint for the portal's 2100x1320 world,
// 720px viewport height, island world rect {x:1180,y:810,width:640,height:350}.
// This package does not import application code or duplicate its camera algorithm.
const projectionCases = [
  {
    label: "1280 atlas",
    camera: { scale: 6 / 11, x: 67.27272727272725, y: 0 },
    expected: [710.909090909091, 441.8181818181818, 349.09090909090907, 190.9090909090909],
  },
  {
    label: "1280 namek",
    camera: { scale: 72 / 67, x: -988.0597014925374, y: -596.4179104477612 },
    expected: [280, 274.0298507462686, 687.7611940298507, 376.1194029850746],
  },
  {
    label: "390 atlas",
    camera: { scale: 13 / 70, x: 0, y: 237.42857142857142 },
    expected: [219.14285714285714, 387.8571428571429, 118.85714285714286, 65],
  },
  {
    label: "390 namek",
    camera: { scale: 0.4875, x: -543.5625, y: -73.875 },
    expected: [31.6875, 321, 312, 170.625],
  },
];
test.each(projectionCases)(
  "aligns the island with the measured $label portal projection",
  ({ camera, expected }) => {
    const projected = projectDioramaRect(camera, { x: 1180, y: 810, width: 640, height: 350 });
    for (const [index, value] of [
      projected.left,
      projected.top,
      projected.width,
      projected.height,
    ].entries())
      expect(value).toBeCloseTo(expected[index]!, 7);
  },
);
