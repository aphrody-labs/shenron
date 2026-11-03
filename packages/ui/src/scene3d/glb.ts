// SPDX-License-Identifier: Apache-2.0
import {
  LoadingManager,
  type Material,
  type Mesh,
  type Texture,
  type Skeleton,
  type SkinnedMesh,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

/** Describes a reviewed delivery asset, not a generated character or an authoring source. */
export interface SceneGlbAsset {
  id: string;
  url: string;
  sha256: string;
  bytes: number;
  units: "meters";
  upAxis: "Y";
  provenance: { referenceUrl: string; creator: string; license: string };
}
export interface SceneGlbBudget {
  maxBytes: number;
  maxNodes: number;
  maxTriangles: number;
  maxTexturePixels: number;
}
export interface SceneGlbOptions {
  baseUrl: string;
  allowedOrigins: readonly string[];
  budget: SceneGlbBudget;
  signal?: AbortSignal;
}

/** Release every scene, including geometry/material/bitmap shared between glTF scene roots. */
export function disposeSceneGlb(gltf: GLTF): void {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<Skeleton>();
  const images = new Set<{ close?: () => void }>();
  for (const scene of gltf.scenes)
    scene.traverse((object) => {
      const mesh = object as Mesh;
      const skinned = object as SkinnedMesh;
      if (skinned.isSkinnedMesh) skeletons.add(skinned.skeleton);
      if (mesh.geometry) geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [])
        materials.add(material);
    });
  for (const material of materials) {
    for (const value of Object.values(material) as unknown[]) {
      if (value && typeof value === "object" && "isTexture" in value && value.isTexture === true)
        textures.add(value as Texture);
    }
    material.dispose();
  }
  for (const texture of textures) {
    if (texture.image && typeof texture.image === "object")
      images.add(texture.image as { close?: () => void });
    texture.dispose();
  }
  for (const image of images) image.close?.();
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const scene of gltf.scenes) {
    scene.removeFromParent();
    scene.clear();
  }
}

function inspectEnvelope(bytes: Uint8Array, budget: SceneGlbBudget) {
  if (bytes.length < 20) throw new Error("invalid_glb");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error("invalid_glb");
  const jsonLength = view.getUint32(12, true);
  if (jsonLength > bytes.length - 20) throw new Error("invalid_glb");
  const json = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, 20 + jsonLength)),
  ) as {
    asset?: { version?: string };
    nodes?: unknown[];
    buffers?: { uri?: string }[];
    images?: { uri?: string }[];
    extensionsUsed?: string[];
    extensionsRequired?: string[];
  };
  if (
    json.asset?.version !== "2.0" ||
    (json.nodes?.length ?? 0) > budget.maxNodes ||
    [...(json.buffers ?? []), ...(json.images ?? [])].some((entry) => entry.uri !== undefined)
  )
    throw new Error("glb_not_self_contained");
  // No implicit decoder download, unknown extension omission or embedded light conversion.
  const supported = new Set([
    "KHR_materials_unlit",
    "KHR_texture_transform",
    "KHR_mesh_quantization",
  ]);
  if (
    [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])].some(
      (extension) => !supported.has(extension),
    )
  )
    throw new Error("glb_extension_not_qualified");
}

/** Fetch a bounded, hash-pinned GLB. The loader is never allowed to fetch a secondary URL. */
export async function loadSceneGlb(asset: SceneGlbAsset, options: SceneGlbOptions) {
  const { signal, budget } = options;
  signal?.throwIfAborted();
  if (
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !Number.isSafeInteger(asset.bytes) ||
    asset.bytes < 20 ||
    asset.units !== "meters" ||
    asset.upAxis !== "Y" ||
    !asset.provenance.referenceUrl ||
    !asset.provenance.creator ||
    !asset.provenance.license
  )
    throw new Error("invalid_glb_descriptor");
  if (
    [budget?.maxBytes, budget?.maxNodes, budget?.maxTriangles, budget?.maxTexturePixels].some(
      (value) => !Number.isSafeInteger(value) || value < 1,
    ) ||
    asset.bytes > budget.maxBytes
  )
    throw new Error("glb_budget_exceeded");
  const url = new URL(asset.url, options.baseUrl);
  const base = new URL(options.baseUrl);
  if (
    !options.allowedOrigins.includes(url.origin) ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === base.origin)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith(".glb")
  )
    throw new Error("unapproved_glb_url");
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    redirect: "error",
    cache: "force-cache",
  });
  if (!response.ok || !response.body) throw new Error("glb_unavailable");
  const announced = response.headers.get("content-length");
  if (announced !== null && Number(announced) !== asset.bytes) {
    await response.body.cancel();
    throw new Error("glb_size_mismatch");
  }
  const bytes = new Uint8Array(asset.bytes);
  const reader = response.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > bytes.length) throw new Error("glb_size_mismatch");
      bytes.set(value, size);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (size !== asset.bytes) throw new Error("glb_size_mismatch");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if ([...digest].map((value) => value.toString(16).padStart(2, "0")).join("") !== asset.sha256)
    throw new Error("glb_hash_mismatch");
  signal?.throwIfAborted();
  inspectEnvelope(bytes, budget);
  const manager = new LoadingManager();
  manager.setURLModifier((resource) => {
    if (!resource.startsWith("blob:")) throw new Error("glb_external_resource_forbidden");
    return resource;
  });
  // Embedded image decoding has no cancellation API. Late results are always disposed.
  const gltf = await new GLTFLoader(manager).parseAsync(bytes.buffer, "");
  try {
    signal?.throwIfAborted();
    let nodes = 0,
      triangles = 0,
      texturePixels = 0;
    const textures = new Set<Texture>();
    for (const scene of gltf.scenes)
      scene.traverse((object) => {
        nodes++;
        const mesh = object as Mesh & { isInstancedMesh?: boolean; count?: number };
        if (mesh.geometry)
          triangles +=
            ((mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3) *
            (mesh.isInstancedMesh ? (mesh.count ?? 1) : 1);
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [])
          for (const value of Object.values(material) as unknown[])
            if (
              value &&
              typeof value === "object" &&
              "isTexture" in value &&
              value.isTexture === true
            )
              textures.add(value as Texture);
      });
    for (const texture of textures) {
      const image = texture.image as { width?: number; height?: number } | null;
      texturePixels += (image?.width ?? 0) * (image?.height ?? 0);
    }
    if (
      nodes > budget.maxNodes ||
      triangles > budget.maxTriangles ||
      texturePixels > budget.maxTexturePixels
    )
      throw new Error("glb_budget_exceeded");
    let disposed = false;
    return {
      asset,
      gltf,
      resources: { nodes, triangles, texturePixels },
      dispose() {
        if (!disposed) {
          disposed = true;
          disposeSceneGlb(gltf);
        }
      },
    };
  } catch (error) {
    disposeSceneGlb(gltf);
    throw error;
  }
}
