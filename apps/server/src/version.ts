// SPDX-License-Identifier: Apache-2.0
/** Version de `shenron-server`, lue dans son `package.json` (embarqué par `bun build --compile`). */
import manifest from "../package.json" with { type: "json" };

export const VERSION: string = manifest.version;
