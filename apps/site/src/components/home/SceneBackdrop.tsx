// SPDX-License-Identifier: Apache-2.0
"use client";

import Image from "next/image";
import { SceneBackdrop as SharedSceneBackdrop } from "@aphrody/shenron-ui/public/SceneBackdrop";
import { assetUrl } from "@/lib/assets";
import type { HomeScene } from "@/lib/home-scenes";
import { isEditableAsset } from "@/lib/images";

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
  return (
    <SharedSceneBackdrop
      scene={{
        image: assetUrl(scene.image),
        poster: scene.poster ? assetUrl(scene.poster) : undefined,
        video: scene.video ? assetUrl(scene.video.replace(/\.mp4$/i, ".web.mp4")) : undefined,
        accent: scene.accent,
      }}
      active={active}
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
