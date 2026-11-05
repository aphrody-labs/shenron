// SPDX-License-Identifier: Apache-2.0
import {
  Box3,
  Group,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  type Material,
  type Mesh,
} from "three";
import { loadSceneGlb } from "./glb";
import { PORTAL_DIORAMA_ASSETS, PORTAL_DIORAMA_BUDGET } from "./portal-assets";
import { createStrictWebGpuRenderer, type StrictWebGpuOptions } from "./strict-webgpu";

export interface DioramaPalette {
  foliage: string;
  trunk: string;
  grass: string;
  earth: string;
}
export interface DioramaWorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DioramaCamera2d {
  scale: number;
  x: number;
  y: number;
}
export interface PreparePortalDioramaOptions {
  baseUrl: string;
  allowedOrigins: readonly string[];
  palette: DioramaPalette;
  signal?: AbortSignal;
}

/** Use the portal's authoritative camera and world rect, including its letterbox offsets. */
export function projectDioramaRect(camera: DioramaCamera2d, rect: DioramaWorldRect) {
  if (
    ![camera.x, camera.y, camera.scale, rect.x, rect.y, rect.width, rect.height].every(
      Number.isFinite,
    ) ||
    camera.scale <= 0 ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    throw new Error("invalid_diorama_projection");
  return {
    left: camera.x + rect.x * camera.scale,
    top: camera.y + rect.y * camera.scale,
    width: rect.width * camera.scale,
    height: rect.height * camera.scale,
  };
}

/** Load and compose real reviewed assets without requesting a GPU or mounting a canvas. */
export async function preparePortalDiorama(options: PreparePortalDioramaOptions) {
  if (
    [
      options.palette?.foliage,
      options.palette?.trunk,
      options.palette?.grass,
      options.palette?.earth,
    ].some((colour) => typeof colour !== "string" || !colour.trim())
  )
    throw new Error("invalid_diorama_palette");
  const loaded: Awaited<ReturnType<typeof loadSceneGlb>>[] = [];
  const scene = new Scene();
  const island = new Group();
  scene.add(island);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const model of loaded) model.dispose();
    scene.clear();
  };
  try {
    for (const asset of PORTAL_DIORAMA_ASSETS) {
      const model = await loadSceneGlb(asset, {
        baseUrl: options.baseUrl,
        allowedOrigins: options.allowedOrigins,
        budget: PORTAL_DIORAMA_BUDGET,
        signal: options.signal,
      });
      loaded.push(model);
      const measured = new Box3().setFromObject(model.gltf.scene);
      for (const [index, axis] of (["x", "y", "z"] as const).entries()) {
        if (
          Math.abs(measured.min[axis] - asset.bounds.min[index]!) > 0.00001 ||
          Math.abs(measured.max[axis] - asset.bounds.max[index]!) > 0.00001
        )
          throw new Error("diorama_bounds_changed");
      }
      if (model.resources.triangles !== asset.triangles || model.resources.texturePixels !== 0)
        throw new Error("diorama_resources_changed");
      // The illustration deliberately uses unlit theme roles, not the source's metallic PBR look.
      const materials = new Map<Material, MeshBasicMaterial>();
      const roles = {
        woodBark: "trunk",
        leafsGreen: "foliage",
        grass: "grass",
        dirt: "earth",
      } as const;
      model.gltf.scene.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        const replace = (material: Material) => {
          let replacement = materials.get(material);
          if (!replacement) {
            const role = roles[material.name as keyof typeof roles];
            if (!role) throw new Error("diorama_material_changed");
            replacement = new MeshBasicMaterial({
              color: options.palette[role],
              side: material.side,
            });
            replacement.name = material.name;
            materials.set(material, replacement);
          }
          return replacement;
        };
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(replace)
          : replace(mesh.material);
      });
      for (const original of materials.keys()) original.dispose();
      // The source nodes include a -0.05m ground offset; normalize without editing the GLB.
      model.gltf.scene.position.y -= measured.min.y;
      const placement = new Group();
      placement.add(model.gltf.scene);
      island.add(placement);
    }
    const [tree, rock, cliff] = island.children;
    tree!.position.set(-0.75, 0, -0.2);
    tree!.scale.setScalar(1.1);
    rock!.position.set(0.75, 0, 0.45);
    rock!.scale.setScalar(1.3);
    cliff!.position.y = -0.28;
    cliff!.scale.set(3.2, 0.28, 2.4);
    island.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(island);
    const center = bounds.getCenter(new Vector3());
    const camera = new OrthographicCamera(-3, 3, 3, -3, 0.1, 100);
    camera.position.copy(center).add(new Vector3(4, 3.2, 5));
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    // Camera-space corners let every aspect ratio retain the exact same whole island.
    const projected = new Box3();
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z])
          projected.expandByPoint(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    const fitAspect = (aspect: number) => {
      if (disposed || !Number.isFinite(aspect) || aspect <= 0) return false;
      const halfHeight =
        Math.max(projected.max.y - projected.min.y, (projected.max.x - projected.min.x) / aspect) *
        0.55;
      const centerX = (projected.min.x + projected.max.x) / 2;
      const centerY = (projected.min.y + projected.max.y) / 2;
      camera.left = centerX - halfHeight * aspect;
      camera.right = centerX + halfHeight * aspect;
      camera.top = centerY + halfHeight;
      camera.bottom = centerY - halfHeight;
      camera.updateProjectionMatrix();
      return true;
    };
    fitAspect(1);
    return { scene, camera, bounds, fitAspect, dispose, assets: PORTAL_DIORAMA_ASSETS };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Explicit enhancement only: the portal owns placement, visibility, navigation and fallback. */
export async function createPortalDiorama(
  options: PreparePortalDioramaOptions & StrictWebGpuOptions,
) {
  const prepared = await preparePortalDiorama(options);
  try {
    let cleanupAfterRenderer: (() => void) | undefined;
    const renderer = await createStrictWebGpuRenderer({
      ...options,
      onUnavailable(reason) {
        cleanupAfterRenderer?.();
        options.onUnavailable(reason);
      },
    });
    let closed: Promise<void> | undefined;
    const destroy = () => {
      options.signal?.removeEventListener("abort", onAbort);
      closed ??= renderer.destroy().finally(prepared.dispose);
      return closed;
    };
    const onAbort = () => {
      void destroy().catch(() => {
        /* Reported by the renderer's onCleanupError. */
      });
    };
    cleanupAfterRenderer = onAbort;
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) {
      await destroy();
      options.signal.throwIfAborted();
    }
    return {
      assets: prepared.assets,
      render: () => renderer.render(prepared.scene, prepared.camera),
      setPaused: renderer.setPaused,
      setHidden: renderer.setHidden,
      resize(width: number, height: number, pixelRatio = 1) {
        return renderer.resize(width, height, pixelRatio) && prepared.fitAspect(width / height);
      },
      destroy,
    };
  } catch (error) {
    prepared.dispose();
    throw error;
  }
}
