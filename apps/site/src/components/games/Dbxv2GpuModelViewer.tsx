// SPDX-License-Identifier: Apache-2.0
"use client";

import { createGlbScene } from "@aphrody/shenron-engine/glb-scene";
import {
  Dbxv2ModelViewer,
  type Dbxv2ModelRendererFactory,
  type Dbxv2ModelViewerProps,
} from "@aphrody/shenron-ui/dbxv2";

const openModel: Dbxv2ModelRendererFactory = createGlbScene;

/** The app supplies its engine; the shared UI keeps ownership of the GPU lifecycle. */
export function Dbxv2GpuModelViewer(props: Omit<Dbxv2ModelViewerProps, "renderer">) {
  return <Dbxv2ModelViewer {...props} renderer={openModel} />;
}
