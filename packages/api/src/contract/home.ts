// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
export const HomeConfigResponse = z
  .object({ config: z.record(z.string(), z.unknown()) })
  .meta({ id: "HomeConfigResponse" });
export const HomeConfigSaveResponse = HomeConfigResponse.extend({ ok: z.literal(true) }).meta({
  id: "HomeConfigSaveResponse",
});
