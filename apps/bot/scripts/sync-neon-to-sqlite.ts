#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import "../src/db/wiki-write-guard";
import { runReplicaSync } from "../src/db/replica-cli";
process.exit(await runReplicaSync(process.argv.slice(2)));
