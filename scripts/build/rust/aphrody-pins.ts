// SPDX-License-Identifier: Apache-2.0

const APHRODY_GIT = "https://github.com/aphrody-labs/aphrody";

/** Keep hand-written package aliases on the same revision as generated dependencies. */
export function alignAphrodyPins(manifest: string, revision: string): string {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("invalid Aphrody revision");
  return manifest.replace(/^([^\n]*\{[^\n]*\})[^\n]*$/gm, (line) => {
    if (!line.includes(`git = "${APHRODY_GIT}"`)) return line;
    if (!/\brev\s*=\s*"[0-9a-f]{40}"/.test(line)) {
      throw new Error("Aphrody git dependency requires an immutable revision");
    }
    return line.replace(/\brev\s*=\s*"[0-9a-f]{40}"/, `rev = "${revision}"`);
  });
}
