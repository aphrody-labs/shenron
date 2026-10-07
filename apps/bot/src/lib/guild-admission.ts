// SPDX-License-Identifier: Apache-2.0

/** Guild membership is separate from production command and editorial authority. */
export function admittedGuildIds(
  primary: string,
  additional: readonly string[] = [],
): ReadonlySet<string> {
  const ids = [primary, ...additional];
  if (ids.some((id) => !/^\d{17,20}$/.test(id))) throw new Error("Invalid admitted guild ID");
  return new Set(ids);
}
