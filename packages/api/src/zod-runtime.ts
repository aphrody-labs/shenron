// SPDX-License-Identifier: Apache-2.0
/**
 * Zod 4 probes `Function("")` the first time an object schema is built to decide
 * whether it may compile a JIT parser. In a browser under a `script-src` policy
 * without `'unsafe-eval'` that probe is a CSP violation (reported by the
 * Report-Only header of the site), although the failure is caught and harmless.
 * Browsers therefore parse without JIT; servers keep the compiled fast path.
 *
 * Import this module first, before any zod schema is created.
 */
import { z } from "zod";

if (typeof window !== "undefined") z.config({ jitless: true });
