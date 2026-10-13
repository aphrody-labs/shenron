// SPDX-License-Identifier: Apache-2.0
/** Consumer bridge only: Bun Video selects frame colors and M3 owns color generation. */
export const FRAME_ROLE_BRIDGE = {
  "--dbz-bg": "--md-sys-color-surface",
  "--dbz-card": "--md-sys-color-surface-container-low",
  "--dbz-border": "--md-sys-color-outline-variant",
  "--dbz-orange": "--md-sys-color-primary",
  "--dbz-orange-dark": "--md-sys-color-primary",
  "--dbz-blue": "--md-sys-color-secondary-container",
  "--dbz-blue-light": "--md-sys-color-secondary",
  "--dbz-yellow": "--md-sys-color-tertiary",
  "--dbz-red": "--md-sys-color-error",
  "--dbz-purple": "--md-sys-color-tertiary",
  "--dbz-gold": "--md-sys-color-tertiary",
  "--dbz-cyan": "--md-sys-color-secondary",
  "--dbz-ember": "--md-sys-color-primary",
  "--dbz-ki": "--md-sys-color-secondary",
  "--dbz-amber": "--md-sys-color-tertiary",
  "--dbz-encre": "--md-sys-color-scrim",
  "--dbz-os": "--md-sys-color-on-surface",
  "--frame-on-primary": "--md-sys-color-on-primary",
  "--frame-on-surface-variant": "--md-sys-color-on-surface-variant",
  "--frame-on-error": "--md-sys-color-on-error",
} as const;

/** Project a complete, measured dark scheme without importing any extraction capability. */
export function frameRoleVariables(roles: Readonly<Record<string, string>>) {
  const result: Record<string, string> = {};
  for (const [variable, role] of Object.entries(FRAME_ROLE_BRIDGE)) {
    const value = roles[role];
    if (!/^#[a-f\d]{6}$/i.test(value ?? ""))
      throw new Error(`Qualified frame scheme is missing ${role}`);
    result[variable] = value.toLowerCase();
  }
  return result;
}

export function frameSchemeCss(roles: Readonly<Record<string, string>>) {
  const variables = frameRoleVariables(roles);
  return Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
}
