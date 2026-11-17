// SPDX-License-Identifier: Apache-2.0
"use client";

import Image from "next/image";
import { SceneBackdrop as SharedSceneBackdrop } from "@aphrody/shenron-ui/public/SceneBackdrop";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { assetUrl } from "@/lib/assets";
import type { HomeScene } from "@aphrody/shenron-config/home";
import { isEditableAsset } from "@/lib/images";
import { useHomeMotion } from "./HomeMotion";

/** Home scene clips are owned CDN assets, not pages in the wiki router. */
export function homeSceneAssetUrl(source: string): string {
  return source.startsWith("/wiki/")
    ? `${DEFAULT_PUBLIC_ORIGINS.cdn}/assets${source}`
    : assetUrl(source);
}

/** Only legacy owned clips have the qualified compressed sibling. */
export function homeSceneVideoUrl(source: string): string {
  const compressed =
    source.startsWith("/wiki/") && !/\.web\.mp4(?:[?#]|$)/i.test(source)
      ? source.replace(/\.mp4(?=[?#]|$)/i, ".web.mp4")
      : source;
  return homeSceneAssetUrl(compressed);
}

/** The site only resolves assets and supplies its optimized image renderer. */
export function SceneBackdrop({
  scene,
  active,
  priority = false,
  visible = true,
}: {
  scene: HomeScene;
  active: boolean;
  priority?: boolean;
  visible?: boolean;
}) {
  const motion = useHomeMotion();
  return (
    <SharedSceneBackdrop
      scene={{
        image: homeSceneAssetUrl(scene.image),
        poster: scene.poster ? homeSceneAssetUrl(scene.poster) : undefined,
        video: scene.video ? homeSceneVideoUrl(scene.video) : undefined,
        accent: scene.accent,
      }}
      active={active && motion}
      priority={priority}
      visible={visible}
      renderImage={({ src, alt, priority: imagePriority, className }) => (
        <Image
          src={src}
          alt={alt}
          fill
          priority={imagePriority}
          sizes="100vw"
          quality={70}
          unoptimized={isEditableAsset(scene.image)}
          className={className}
        />
      )}
    />
  );
}
