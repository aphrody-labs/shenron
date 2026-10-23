#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Entry point of the Activity server: `bun src/main.ts`. Configuration comes from the environment
 * only (docs/operations/ENV.md, "Activité Discord"); the client is read from `dist/`
 * (`SHENRON_ACTIVITY_DIST`). The single-binary build has its own entry (`scripts/compile.ts`).
 */
import { run } from "./run";

run();
