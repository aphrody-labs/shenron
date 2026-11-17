// SPDX-License-Identifier: Apache-2.0
/** Build-time constants and asset imports of the client bundle (scripts/build.ts). */

/** `true` only in development builds: the `?mock=1` stand-in SDK is bundled. */
declare const __ACTIVITY_MOCK__: boolean;

declare module "*.svg" {
  const url: string;
  export default url;
}

declare module "*.woff2" {
  const url: string;
  export default url;
}

/** Design tokens of `@aphrody/shenron-ui`, generated at build time as CSS custom properties. */
declare module "virtual:shenron-tokens.css";

declare module "*.css";
