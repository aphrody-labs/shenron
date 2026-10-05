#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Development entry (no embedded payload): bun apps/server/src/cli.ts serve
import { main } from "./main";

await main(process.argv.slice(2));
