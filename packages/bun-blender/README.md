# bun-blender

Headless Blender 5.2.3 LTS pipeline integration for Bun.

## Overview

`bun-blender` provides high-performance FFI bindings and CLI bridges to run Blender headless workflows, scene asset conversions, 3D model processing, and render automation within the Shenron platform.

## Architecture

- Pure Bun FFI bindings (`bun:ffi`) to native C ABI shared libraries.
- Headless invocation without display requirements (`--background` mode).
- Integration with Shenron Studio and asset conversion pipelines.

## Usage

```typescript
import { BlenderBridge } from "bun-blender";

const bridge = new BlenderBridge();
await bridge.renderScene({
  blendFile: "assets/scenes/arena.blend",
  output: "dist/renders/frame_0001.png",
});
```
