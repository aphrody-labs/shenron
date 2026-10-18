// SPDX-License-Identifier: Apache-2.0

/** Match the native Studio source identity before attaching a manga atlas to its page. */
export function atlasMatchesPage(
  manifest: unknown,
  sourceSha256: string,
  size: { width: number; height: number },
): boolean {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return false;
  const source = (manifest as { source?: unknown }).source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const metadata = source as { sha256?: unknown; width?: unknown; height?: unknown };
  return (
    /^[a-f0-9]{64}$/u.test(sourceSha256) &&
    metadata.sha256 === sourceSha256 &&
    metadata.width === size.width &&
    metadata.height === size.height
  );
}
