// SPDX-License-Identifier: Apache-2.0
import { canonicalWikiSnapshot as canonical, WikiUpdateRequestError } from "./wiki-snapshot";
export { WikiUpdateRequestError } from "./wiki-snapshot";

export class WikiUpdatePreconditionError extends Error {
  readonly code = "wiki_update_precondition_changed";
  constructor() {
    super("Wiki update precondition changed");
  }
}

/** Hash the canonical administrative JSON snapshot, never a public projection. */
export function wikiUpdateSnapshotHash(row: Record<string, unknown>): string {
  return new Bun.CryptoHasher("sha256").update(canonical(row)).digest("hex");
}

/** Reserved HTTP preconditions are kept outside mutable column coercion. */
export function parseWikiUpdateRequest(
  body: Record<string, unknown>,
  requireSnapshot = false,
): {
  data: Record<string, unknown>;
  expected?: Record<string, unknown>;
  expectedSha256?: string;
} {
  const { expected, expectedSha256, ...data } = body;
  const supplied = Object.hasOwn(body, "expected") || Object.hasOwn(body, "expectedSha256");
  if (!supplied && !requireSnapshot) return { data };
  if (
    expected === null ||
    typeof expected !== "object" ||
    Array.isArray(expected) ||
    Object.keys(expected).length === 0 ||
    Object.keys(expected).length > 100 ||
    JSON.stringify(expected).length > 4 * 1024 * 1024 ||
    typeof expectedSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(expectedSha256)
  ) {
    throw new WikiUpdateRequestError("Complete expected snapshot and SHA256 required");
  }
  return { data, expected: expected as Record<string, unknown>, expectedSha256 };
}

export function parseEpisodeUpdateRequest(body: Record<string, unknown>) {
  return parseWikiUpdateRequest(body, Object.hasOwn(body, "frames"));
}

/** Compare explicit or complete preconditions without echoing protected values. */
export function assertWikiUpdatePrecondition(
  before: Record<string, unknown>,
  expected: Record<string, unknown>,
  options: { complete?: boolean; sha256?: string } = {},
): void {
  const entries = Object.entries(expected);
  if (entries.length === 0 || entries.length > 100) {
    throw new Error("Wiki update precondition must contain bounded fields");
  }
  if (
    (options.complete && Object.keys(before).length !== entries.length) ||
    (options.sha256 &&
      (wikiUpdateSnapshotHash(expected) !== options.sha256 ||
        wikiUpdateSnapshotHash(before) !== options.sha256))
  ) {
    throw new WikiUpdatePreconditionError();
  }
  for (const [field, value] of entries) {
    if (!Object.hasOwn(before, field) || canonical(before[field]) !== canonical(value)) {
      throw new WikiUpdatePreconditionError();
    }
  }
}
