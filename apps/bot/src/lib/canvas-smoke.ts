/** Exercise the installed native addon rather than accepting the no-op shim. */
export async function smokeCanvas(): Promise<number> {
  if ((globalThis as Record<string, unknown>).shenronCanvasNativeOk !== true)
    throw new Error("Native canvas is unavailable; a shim cannot qualify this runtime");
  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(2, 2);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ff8800";
  context.fillRect(0, 0, 2, 2);
  const bytes = await canvas.encode("png");
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error("Native canvas did not produce a PNG");
  if (bytes.length < 24 || bytes.readUInt32BE(16) !== 2 || bytes.readUInt32BE(20) !== 2)
    throw new Error("Native canvas PNG dimensions are incorrect");
  return bytes.length;
}
