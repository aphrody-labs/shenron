// SPDX-License-Identifier: Apache-2.0
import { useId, useMemo } from "react";
import { wikiWorldGeometry } from "./scene-geometry";
import { SCENE_PALETTE } from "./scene-palette";
import type { WikiSceneCamera } from "./scene-catalogue";
import { SCENE_BACKDROPS, SCENE_CLOUDS, SCENE_TEXTURE_SHEETS } from "./scene-media";

/** Vector landmarks and honestly identified source media share the same camera. No disguised character PNGs. */
export function WikiWorldFallback({
  camera,
  width,
  height,
}: {
  camera: WikiSceneCamera;
  width: number;
  height: number;
}) {
  const layers = useMemo(() => wikiWorldGeometry(), []);
  const unique = useId().replaceAll(":", "");
  return (
    <svg
      className="wiki-world-svg"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
        <defs>
          {SCENE_BACKDROPS.filter((entry) => entry.clip === "ellipse").map((entry) => (
            <clipPath id={`world-backdrop-${unique}-${entry.id}`} key={entry.id}>
              <ellipse
                cx={entry.left + entry.width / 2}
                cy={entry.top + entry.height / 2}
                rx={entry.width / 2}
                ry={entry.height / 2}
              />
            </clipPath>
          ))}
        </defs>
        {layers.map((layer) => (
          <g key={layer.id} data-layer={layer.id}>
            {layer.shapes.map((shape) => {
              const key = JSON.stringify(shape);
              const attributes = {
                fill: `var(--scene-art-${shape.fill}, ${SCENE_PALETTE[shape.fill]})`,
                fillOpacity: shape.alpha ?? 1,
                stroke: shape.stroke
                  ? `var(--scene-art-${shape.stroke}, ${SCENE_PALETTE[shape.stroke]})`
                  : undefined,
                strokeWidth: shape.lineWidth,
              };
              if (shape.kind === "ellipse")
                return (
                  <ellipse
                    key={key}
                    cx={shape.x}
                    cy={shape.y}
                    rx={shape.rx}
                    ry={shape.ry}
                    {...attributes}
                  />
                );
              if (shape.kind === "rect")
                return (
                  <rect
                    key={key}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    rx={shape.radius}
                    {...attributes}
                  />
                );
              return (
                <polygon
                  key={key}
                  points={shape.points
                    .reduce((text, value, at) => `${text}${at % 2 ? "," : " "}${value}`, "")
                    .trim()}
                  {...attributes}
                />
              );
            })}
            {layer.id === "distant-sky" &&
              SCENE_BACKDROPS.map((entry) => (
                <image
                  key={entry.id}
                  href={SCENE_TEXTURE_SHEETS[entry.sheet].src}
                  data-source-format="raster"
                  x={entry.left}
                  y={entry.top}
                  width={entry.width}
                  height={entry.height}
                  clipPath={
                    entry.clip === "ellipse"
                      ? `url(#world-backdrop-${unique}-${entry.id})`
                      : undefined
                  }
                />
              ))}
            {layer.id === "clouds" &&
              SCENE_CLOUDS.map((cloud) => (
                <svg
                  key={cloud.id}
                  x={cloud.left}
                  y={cloud.top}
                  width={cloud.width}
                  height={cloud.height}
                  viewBox={`${cloud.frame.x} ${cloud.frame.y} ${cloud.frame.w} ${cloud.frame.h}`}
                  overflow="hidden"
                >
                  <image href={SCENE_TEXTURE_SHEETS.clouds.src} width={1024} height={1024} />
                </svg>
              ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
