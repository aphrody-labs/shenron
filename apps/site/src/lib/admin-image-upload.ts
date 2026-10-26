// SPDX-License-Identifier: Apache-2.0
/** Binary image contract shared by the editor and its authenticated upload route. */
export const MAX_ADMIN_IMAGE_BYTES = 50 * 1024 * 1024;
export const ADMIN_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function sniffAdminImage(bytes: Uint8Array): { type: string; ext: string } | null {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { type: "image/png", ext: "png" };
  if (startsWith([0xff, 0xd8, 0xff])) return { type: "image/jpeg", ext: "jpg" };
  if (startsWith([0x47, 0x49, 0x46, 0x38]) && [0x37, 0x39].includes(bytes[4]!) && bytes[5] === 0x61)
    return { type: "image/gif", ext: "gif" };
  if (
    bytes.length >= 12 &&
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return { type: "image/webp", ext: "webp" };
  return null;
}

export async function adminImageUploadError(
  file: Blob,
): Promise<"empty" | "tooLarge" | "invalid" | null> {
  if (!file.size) return "empty";
  if (file.size > MAX_ADMIN_IMAGE_BYTES) return "tooLarge";
  return sniffAdminImage(new Uint8Array(await file.slice(0, 12).arrayBuffer())) ? null : "invalid";
}
