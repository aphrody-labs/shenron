// SPDX-License-Identifier: Apache-2.0

export const GDS_COLORS = {
  primary: "var(--md-sys-color-primary, #6750a4)",
  onPrimary: "var(--md-sys-color-on-primary, #ffffff)",
  primaryContainer: "var(--md-sys-color-primary-container, #eaddff)",
  onPrimaryContainer: "var(--md-sys-color-on-primary-container, #21005d)",
  secondary: "var(--md-sys-color-secondary, #625b71)",
  onSecondary: "var(--md-sys-color-on-secondary, #ffffff)",
  secondaryContainer: "var(--md-sys-color-secondary-container, #e8def8)",
  onSecondaryContainer: "var(--md-sys-color-on-secondary-container, #1d192b)",
  tertiary: "var(--md-sys-color-tertiary, #7d5260)",
  onTertiary: "var(--md-sys-color-on-tertiary, #ffffff)",
  tertiaryContainer: "var(--md-sys-color-tertiary-container, #ffd8e4)",
  onTertiaryContainer: "var(--md-sys-color-on-tertiary-container, #31111d)",
  background: "var(--md-sys-color-background, #fef7ff)",
  onBackground: "var(--md-sys-color-on-background, #1d1b20)",
  surface: "var(--md-sys-color-surface, #fef7ff)",
  onSurface: "var(--md-sys-color-on-surface, #1d1b20)",
  surfaceVariant: "var(--md-sys-color-surface-variant, #e7e0ec)",
  onSurfaceVariant: "var(--md-sys-color-on-surface-variant, #49454f)",
  surfaceContainer: "var(--md-sys-color-surface-container, #f3edf7)",
  surfaceContainerLow: "var(--md-sys-color-surface-container-low, #f7f2fa)",
  surfaceContainerHigh: "var(--md-sys-color-surface-container-high, #ece6f0)",
  outline: "var(--md-sys-color-outline, #79747e)",
  outlineVariant: "var(--md-sys-color-outline-variant, #cac4d0)",
  error: "var(--md-sys-color-error, #b3261e)",
  onError: "var(--md-sys-color-on-error, #ffffff)",
} as const;

export const GDS_ELEVATION = {
  level0: "none",
  level1: "0px 1px 3px 1px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.30)",
  level2: "0px 2px 6px 2px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.30)",
  level3: "0px 4px 8px 3px rgba(0, 0, 0, 0.15), 0px 1px 3px 0px rgba(0, 0, 0, 0.30)",
  level4: "0px 6px 10px 4px rgba(0, 0, 0, 0.15), 0px 2px 3px 0px rgba(0, 0, 0, 0.30)",
  level5: "0px 8px 12px 6px rgba(0, 0, 0, 0.15), 0px 4px 4px 0px rgba(0, 0, 0, 0.30)",
} as const;

export const GDS_SHAPE = {
  none: "0px",
  extraSmall: "4px",
  small: "8px",
  medium: "12px",
  large: "16px",
  extraLarge: "28px",
  full: "9999px",
} as const;
