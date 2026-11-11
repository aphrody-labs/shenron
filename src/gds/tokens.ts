// SPDX-License-Identifier: Apache-2.0
/**
 * src/gds/tokens.ts
 *
 * Google Design System (GDS) / Material Design 3 (M3) Canonical Design Tokens.
 * Implements Google's dynamic color roles, elevation surfaces, typography,
 * shape scales, and state layers for native and browser WebUI.
 */

export const GDS_COLORS = {
  // Primary (Dragon Ball Amber / Solar Burst)
  primary: "#e06000",
  onPrimary: "#ffffff",
  primaryContainer: "#ffdbca",
  onPrimaryContainer: "#341100",

  // Secondary (Royal Saiyan Navy)
  secondary: "#1e3a8a",
  onSecondary: "#ffffff",
  secondaryContainer: "#dbeafe",
  onSecondaryContainer: "#1e293b",

  // Tertiary (God of Destruction Ultra Ego Magenta)
  tertiary: "#7c3aed",
  onTertiary: "#ffffff",
  tertiaryContainer: "#ede9fe",
  onTertiaryContainer: "#2e1065",

  // Neutral / Surface System (Dark Mode Baseline)
  background: "#0b0f19",
  onBackground: "#f8fafc",
  surface: "#0f172a",
  onSurface: "#f8fafc",
  surfaceVariant: "#1e293b",
  onSurfaceVariant: "#cbd5e1",
  surfaceContainerLowest: "#06090e",
  surfaceContainerLow: "#0b0f19",
  surfaceContainer: "#131b2e",
  surfaceContainerHigh: "#1a243d",
  surfaceContainerHighest: "#222f4d",

  // Outlines & Dividers
  outline: "#334155",
  outlineVariant: "#1e293b",

  // Status & Feedback
  error: "#ef4444",
  onError: "#ffffff",
  errorContainer: "#fee2e2",
  onErrorContainer: "#7f1d1d",
  success: "#10b981",
  onSuccess: "#ffffff",
  warning: "#f59e0b",
  onWarning: "#000000",
} as const;

export const GDS_ELEVATION = {
  level0: "none",
  level1: "0px 1px 3px 1px rgba(0, 0, 0, 0.25), 0px 1px 2px 0px rgba(0, 0, 0, 0.40)",
  level2: "0px 2px 6px 2px rgba(0, 0, 0, 0.25), 0px 1px 2px 0px rgba(0, 0, 0, 0.40)",
  level3: "0px 4px 8px 3px rgba(0, 0, 0, 0.30), 0px 1px 3px 0px rgba(0, 0, 0, 0.45)",
  level4: "0px 6px 10px 4px rgba(0, 0, 0, 0.35), 0px 2px 3px 0px rgba(0, 0, 0, 0.45)",
  level5: "0px 8px 12px 6px rgba(0, 0, 0, 0.40), 0px 4px 4px 0px rgba(0, 0, 0, 0.50)",
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

export const GDS_TYPOGRAPHY = {
  displayLarge: {
    fontFamily: "Google Sans, var(--font-display, sans-serif)",
    fontSize: "57px",
    lineHeight: "64px",
    fontWeight: "700",
    letterSpacing: "-0.25px",
  },
  headlineLarge: {
    fontFamily: "Google Sans, var(--font-display, sans-serif)",
    fontSize: "32px",
    lineHeight: "40px",
    fontWeight: "700",
    letterSpacing: "0px",
  },
  headlineMedium: {
    fontFamily: "Google Sans, var(--font-display, sans-serif)",
    fontSize: "28px",
    lineHeight: "36px",
    fontWeight: "600",
    letterSpacing: "0px",
  },
  titleLarge: {
    fontFamily: "Google Sans, sans-serif",
    fontSize: "22px",
    lineHeight: "28px",
    fontWeight: "600",
    letterSpacing: "0px",
  },
  titleMedium: {
    fontFamily: "Google Sans, sans-serif",
    fontSize: "16px",
    lineHeight: "24px",
    fontWeight: "600",
    letterSpacing: "0.15px",
  },
  bodyLarge: {
    fontFamily: "Roboto, sans-serif",
    fontSize: "16px",
    lineHeight: "24px",
    fontWeight: "400",
    letterSpacing: "0.5px",
  },
  bodyMedium: {
    fontFamily: "Roboto, sans-serif",
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: "400",
    letterSpacing: "0.25px",
  },
  labelLarge: {
    fontFamily: "Google Sans, sans-serif",
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: "500",
    letterSpacing: "0.1px",
  },
  labelSmall: {
    fontFamily: "Roboto, sans-serif",
    fontSize: "11px",
    lineHeight: "16px",
    fontWeight: "500",
    letterSpacing: "0.5px",
  },
} as const;

export const GDS_STATE_LAYERS = {
  hover: "rgba(255, 255, 255, 0.08)",
  focus: "rgba(255, 255, 255, 0.12)",
  pressed: "rgba(255, 255, 255, 0.16)",
  dragged: "rgba(255, 255, 255, 0.20)",
} as const;
