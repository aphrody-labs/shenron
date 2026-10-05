// SPDX-License-Identifier: Apache-2.0
/**
 * Plugin « shenron » servi par l'API publique : index, export complet et fichiers.
 * Runtime class: `pure`.
 */
import { z } from "zod";

export const PluginFormat = z.enum(["json", "md", "txt", "html"]).meta({ id: "PluginFormat" });
export type PluginFormat = z.infer<typeof PluginFormat>;

const PluginEntrySchema = z.object({
  kind: z.enum(["skill", "agent"]),
  name: z.string(),
  description: z.string(),
  path: z.string(),
  url: z.string(),
});

export const PluginIndexResponse = z
  .object({
    name: z.string(),
    version: z.string(),
    description: z.string(),
    sha256: z.string(),
    loadedAt: z.string(),
    usage: z.string(),
    formats: z.object({ json: z.string(), md: z.string(), txt: z.string(), html: z.string() }),
    skills: z.array(PluginEntrySchema),
    agents: z.array(PluginEntrySchema),
    files: z.array(
      z.object({
        path: z.string(),
        bytes: z.number().int().nonnegative(),
        sha256: z.string(),
        contentType: z.string(),
        url: z.string(),
      }),
    ),
  })
  .meta({ id: "PluginIndexResponse" });
export type PluginIndexResponse = z.infer<typeof PluginIndexResponse>;

/** `{format}` of the full export. */
export const PluginExportParams = z.object({ format: PluginFormat });

/** `?full=1` also inlines the large generated files. */
export const PluginExportQuery = z.object({ full: z.boolean().optional() });

export const PluginFileQuery = z.object({
  path: z.string().min(1).max(300),
  format: z.enum(["raw", "json", "md", "txt", "html"]).optional(),
});
