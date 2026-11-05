// SPDX-License-Identifier: Apache-2.0
/**
 * Runs in the browser before hydration and before any other client module.
 *
 * Zod 4 probes `Function("")` the first time an object schema is built, to decide
 * whether it may compile a JIT parser. Under a `script-src` without
 * `'unsafe-eval'` that probe is a CSP violation (the site reports them with
 * Content-Security-Policy-Report-Only) although the failure is caught. Browsers
 * parse without JIT; servers keep the compiled fast path.
 */
import { z } from "zod";

z.config({ jitless: true });
