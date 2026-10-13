// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import Image from "next/image";
import { PageShell, LinkPager } from "@/components/kit";
import { T } from "@/components/T";
import { CatalogControls } from "@/components/catalog/CatalogControls";
import { CatalogAssetsNavigation } from "@/components/catalog/CatalogAssetsNavigation";
import { readCdnPage } from "@/lib/cdn-catalog";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
export const dynamic = "force-dynamic";
export default async function AssetsCatalog({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; page?: string; all?: string }>;
}) {
  const query = await searchParams;
  const data = await readCdnPage({
    path: query.path ?? "/",
    page: query.page ?? 1,
    all: query.all === "1",
  }).catch(() => null);
  const href = (path: string, page = 1) =>
    `/catalog/assets?${new URLSearchParams({ path, page: String(page), ...(query.all === "1" ? { all: "1" } : {}) })}`;
  const path = data?.page.path ?? "/";
  const parent =
    path === "/" ? null : path.slice(0, -1).slice(0, path.slice(0, -1).lastIndexOf("/") + 1);
  const assetHref = (assetPath: string) =>
    new URL(assetPath.split("/").map(encodeURIComponent).join("/"), DEFAULT_PUBLIC_ORIGINS.cdn)
      .href;
  return (
    <PageShell rhythm="loose">
      <Link href="/catalog" className="text-dbz-gold">
        <T k="catalog.title" />
      </Link>
      <h1 className="mt-5 font-display text-3xl">
        <T k="catalog.assets" />
      </h1>
      <CatalogControls />
      <CatalogAssetsNavigation all={query.all === "1"} parentHref={parent ? href(parent) : null} />
      {!data ? (
        <output className="block" aria-live="polite">
          <T k="catalog.unavailable" />
        </output>
      ) : (
        <>
          <p className="mb-4">
            <T k="catalog.files" values={{ count: data.index.totalFiles }} />
          </p>
          <p className="mb-4 break-all font-mono text-sm">{path}</p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.page.entries.map((asset, index) => (
              <li
                key={asset.path}
                className="min-w-0 rounded-xl border border-white/15 bg-white/5 p-4 hover:border-dbz-gold"
              >
                {asset.mime.startsWith("image/") && index < 96 ? (
                  <a
                    href={assetHref(asset.path)}
                    target="_blank"
                    rel="noreferrer"
                    tabIndex={-1}
                    aria-hidden
                    className="mb-3 block"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-dbz-card/80">
                      <Image
                        src={assetHref(asset.path)}
                        alt=""
                        fill
                        unoptimized
                        loading="lazy"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 384px"
                        className="object-contain"
                      />
                    </div>
                  </a>
                ) : null}
                {asset.mime === "inode/directory" ? (
                  <Link
                    href={`/catalog/assets?${new URLSearchParams({ path: asset.path })}`}
                    prefetch={false}
                    className="break-all text-dbz-gold"
                  >
                    {asset.path}
                  </Link>
                ) : (
                  <a
                    href={assetHref(asset.path)}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-dbz-gold"
                  >
                    {asset.path}
                  </a>
                )}
                <p className="mt-2 break-words text-xs text-white/60">{asset.mime}</p>
                {asset.mime !== "inode/directory" ? (
                  <p className="text-xs text-white/60">
                    <T k="catalog.bytes" values={{ size: asset.size }} />
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <LinkPager
            page={data.page.page + 1}
            pages={data.page.totalPages}
            href={(page) => href(path, page)}
          />
          <p className="mt-6 text-xs text-white/60">
            <T k="catalog.snapshot" values={{ time: data.index.observedAt }} />
          </p>
          <p className="mt-2 break-all text-xs text-white/60">
            <T k="catalog.revision" />: {data.index.revision}
          </p>
        </>
      )}
    </PageShell>
  );
}
