// SPDX-License-Identifier: Apache-2.0
/** Client-safe theme metadata; labels live in next-intl dictionaries. */
import { THEME_COLOR_VARS } from "@aphrody/shenron-config/site-theme";
export * from "@aphrody/shenron-config/site-theme";
export const THEME_COLORS = Object.keys(THEME_COLOR_VARS).map((key) => ({ key }));
