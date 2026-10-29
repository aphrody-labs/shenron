// SPDX-License-Identifier: Apache-2.0
import { NextResponse, type NextRequest } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const episode = searchParams.get("episode") ?? "dbs-876";
  const seconds = parseFloat(searchParams.get("seconds") ?? "350");

  // In standard runtime, served directly from the generated frames cache
  const framesDir = join(process.cwd(), "public", "generated", "frames", episode);
  let targetFile = "";

  if (seconds >= 300) {
    targetFile = join(framesDir, "beerus-awakening-350s.png");
  } else {
    targetFile = join(framesDir, "kaioshin-warning-120s.png");
  }

  // Fallback to apps/site/public path if running inside Next cwd
  if (!existsSync(targetFile)) {
    targetFile = join(
      process.cwd(),
      "apps",
      "site",
      "public",
      "generated",
      "frames",
      episode,
      seconds >= 300 ? "beerus-awakening-350s.png" : "kaioshin-warning-120s.png",
    );
  }

  if (existsSync(targetFile)) {
    const fileBytes = readFileSync(targetFile);
    return new NextResponse(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  return NextResponse.json({ error: "Frame not rendered or not found" }, { status: 404 });
}
