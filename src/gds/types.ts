// SPDX-License-Identifier: Apache-2.0
/**
 * src/gds/types.ts
 *
 * Types for Google Design System (GDS) / Material Design 3 (M3).
 */
import type { GDS_COLORS, GDS_ELEVATION, GDS_SHAPE, GDS_TYPOGRAPHY } from "./tokens";

export type GdsColorKey = keyof typeof GDS_COLORS;
export type GdsElevationKey = keyof typeof GDS_ELEVATION;
export type GdsShapeKey = keyof typeof GDS_SHAPE;
export type GdsTypographyKey = keyof typeof GDS_TYPOGRAPHY;
