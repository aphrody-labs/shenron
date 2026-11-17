// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { THEME_COLOR_VARS } from "@aphrody/shenron-config/site-theme";

const color = z.string().regex(/^#(?:[\da-fA-F]{3}|[\da-fA-F]{6}|[\da-fA-F]{8})$/);
export const SiteThemeSchema = z
  .object({
    version: z.literal(1),
    colors: z.object(Object.fromEntries(Object.keys(THEME_COLOR_VARS).map((key) => [key, color]))),
    radius: z.number().min(0).max(2),
    fontFamily: z.enum(["sans", "system", "serif", "mono"]),
    fontScale: z.number().min(0.875).max(1.25),
    contentWidth: z.number().min(960).max(1920),
    density: z.enum(["compact", "comfortable", "spacious"]),
    buttonShape: z.enum(["rounded", "pill", "square"]),
    buttonSize: z.enum(["compact", "comfortable", "spacious"]),
    buttonLabelCase: z.enum(["uppercase", "normal"]),
    homeActionLayout: z.enum(["row", "stacked"]),
    homeActionAlignment: z.enum(["start", "center", "end"]),
    panelStyle: z.enum(["comic", "soft", "flat"]),
  })
  .meta({ id: "SiteTheme" });
export const SiteThemeResponse = z
  .object({ theme: SiteThemeSchema })
  .meta({ id: "SiteThemeResponse" });
export const SiteThemeSaveResponse = z
  .object({ ok: z.literal(true), theme: SiteThemeSchema })
  .meta({ id: "SiteThemeSaveResponse" });
