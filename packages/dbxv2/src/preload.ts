/**
 * Bunfig preload: registers the `dbxv2:` import plugin.
 *
 *   [test]
 *   preload = ["./packages/dbxv2/src/preload.ts"]
 *   [run]
 *   preload = ["./packages/dbxv2/src/preload.ts"]
 *
 * Harmless when DBXV2 is disabled: importing a `dbxv2:` module then fails with an explicit message.
 */
import { registerDbxv2Plugin } from "./plugin";

registerDbxv2Plugin();
