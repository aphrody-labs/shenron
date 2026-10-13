// SPDX-License-Identifier: Apache-2.0

/** Compare only explicit preconditions; error messages never echo row values. */
export function assertWikiUpdatePrecondition(
  before: Record<string, unknown>,
  expected: Record<string, unknown>,
): void {
  const entries = Object.entries(expected);
  if (entries.length === 0 || entries.length > 100) {
    throw new Error("Wiki update precondition must contain bounded fields");
  }
  for (const [field, value] of entries) {
    if (!Object.hasOwn(before, field) || !Bun.deepEquals(before[field], value)) {
      throw new Error("Wiki update precondition changed");
    }
  }
}
