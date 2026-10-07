// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export const LaunchConfigSchema = z
  .object({
    openKeys: z.array(z.string()),
    order: z.array(z.string()),
    access: z.record(
      z.string(),
      z.object({
        mode: z.enum(["public", "members", "roles", "admin"]),
        roleIds: z.array(z.string()),
      }),
    ),
  })
  .meta({ id: "LaunchConfig" });
export const LaunchPatchSchema = z
  .object({
    openKeys: z.array(z.unknown()).optional(),
    order: z.array(z.unknown()).optional(),
    access: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "At least one launch field is required")
  .meta({ id: "LaunchPatch" });
export const LaunchConfigResponse = z
  .object({ config: LaunchConfigSchema })
  .meta({ id: "LaunchConfigResponse" });
export const LaunchConfigSaveResponse = LaunchConfigResponse.extend({ ok: z.literal(true) }).meta({
  id: "LaunchConfigSaveResponse",
});
