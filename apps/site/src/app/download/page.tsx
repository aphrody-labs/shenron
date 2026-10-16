// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/kit";
import { PageHeader } from "@/components/PageHeader";
import {
  assetUrl,
  assetsFor,
  detectOs,
  latestRelease,
  type ReleaseAsset,
  type ReleaseOs,
} from "@/lib/releases";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("releases");
  return { title: t("title"), description: t("subtitle") };
}

const OS_ORDER: readonly ReleaseOs[] = ["windows", "linux"];

/** `/download`: one button for the visitor's platform, the other files listed below it. */
export default async function DownloadPage() {
  const t = await getTranslations("releases");
  const format = await getFormatter();
  const manifest = await latestRelease();
  if (!manifest) {
    return (
      <PageShell width="narrow" rhythm="loose">
        <PageHeader title={t("title")} subtitle={t("empty")} />
      </PageShell>
    );
  }
  const detected = detectOs((await headers()).get("user-agent"));
  const primary = assetsFor(manifest, detected)[0] ?? manifest.assets[0];
  const mib = (asset: ReleaseAsset) => Math.max(1, Math.round(asset.size / 1048576));
  const others = OS_ORDER.flatMap((os) => {
    const assets = assetsFor(manifest, os).filter((asset) => asset !== primary);
    return assets.length > 0 ? [{ os, assets }] : [];
  });
  return (
    <PageShell width="narrow" rhythm="loose">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {primary && (
        <section className="flex flex-col items-start gap-3">
          <a
            href={assetUrl(primary.name)}
            download={primary.name}
            className="inline-flex items-center gap-3 rounded-2xl bg-dbz-orange px-8 py-5 text-[20px] font-bold text-black shadow-lg transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("button", { os: t(`os.${primary.os}`) })}
          </a>
          <p className="text-[14px] text-white/70">
            {t("latest", {
              version: manifest.version,
              date: format.dateTime(new Date(manifest.publishedAt), { dateStyle: "medium" }),
            })}{" "}
            · {t(`kind.${primary.kind}`)} · {t("size", { size: mib(primary) })}
          </p>
        </section>
      )}
      {others.map(({ os, assets }) => (
        <section key={os} className="mt-10 flex flex-col gap-2">
          <h2 className="font-display text-[20px] font-bold text-white">
            {t("os." + os)}
            <span className="sr-only"> — {t("otherOs")}</span>
          </h2>
          <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
            {assets.map((asset) => (
              <li
                key={asset.name}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
              >
                <a
                  href={assetUrl(asset.name)}
                  download={asset.name}
                  className="font-semibold text-dbz-orange hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  {t(`kind.${asset.kind}`)}
                </a>
                <span className="text-[13px] text-white/60">
                  {t("size", { size: mib(asset) })} ·{" "}
                  <code title={`${t("sha")} ${asset.sha256}`} className="font-mono">
                    {asset.sha256.slice(0, 12)}
                  </code>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-10 text-[14px] text-white/70">{t("autoUpdate")}</p>
      <p className="mt-1 text-[13px] text-white/50">{t("manual")}</p>
    </PageShell>
  );
}
