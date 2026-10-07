#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Compatibility entry point; governance belongs to the Dragon Ball product module. */
export * from "../src/dragon-ball/source-coverage";
import { runSourceCoverageCli } from "../src/dragon-ball/source-coverage";

if (import.meta.main) await runSourceCoverageCli(Bun.argv.slice(2));
