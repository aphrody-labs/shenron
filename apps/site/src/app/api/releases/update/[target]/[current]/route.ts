// SPDX-License-Identifier: Apache-2.0
/**
 * GET /api/releases/update/<target>/<current>: Tauri updater endpoint for Shenron Studio.
 * `target` is `windows-x86_64` or `linux-x86_64`. 204 when `current` is up to date or the
 * latest release has no signed Studio asset (the updater refuses unsigned payloads).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assetUrl, compareVersions, latestRelease, releasesDir } from "@/lib/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_OS = { "windows-x86_64": "windows", "linux-x86_64": "linux" } as const;
type Context = { params: Promise<{ target: string; current: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const { target, current } = await params;
  const os = TARGET_OS[target as keyof typeof TARGET_OS];
  const manifest = await latestRelease();
  if (!os || !manifest || compareVersions(current, manifest.version) >= 0)
    return new Response(null, { status: 204 });
  const asset = manifest.assets.find((a) => a.os === os && a.kind === "studio");
  const signature = asset
    ? await readFile(join(releasesDir().path, `${asset.name}.sig`), "utf8").catch(() => null)
    : null;
  if (!asset || !signature) return new Response(null, { status: 204 });
  return Response.json(
    {
      version: manifest.version,
      pub_date: manifest.publishedAt,
      url: new URL(assetUrl(asset.name), request.url).toString(),
      signature: signature.trim(),
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
