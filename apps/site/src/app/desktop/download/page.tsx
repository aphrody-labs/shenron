// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/kit";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { studioInstallerFor } from "@/lib/private-downloads";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("desktop.download");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/desktop/download`: one-click download of the Shenron Studio installer for administrators
 * (admin IP or token, see `@/lib/private-downloads`), while it carries the private chat adapter.
 * Anyone else gets a 404, like the file itself.
 */
export default async function DesktopDownloadPage() {
  const installer = await studioInstallerFor(await headers());
  if (!installer) notFound();
  const t = await getTranslations("desktop.download");
  const sizeMiB = Math.round(installer.size / 1048576);
  return (
    <PageShell width="narrow" rhythm="loose">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <section className="flex flex-col items-start gap-4">
        <a
          href={installer.url}
          download={installer.name}
          className="inline-flex items-center gap-3 rounded-2xl bg-dbz-orange px-8 py-5 text-[20px] font-bold text-black shadow-lg transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t("button")}
        </a>
        <p className="text-[15px] text-white/75">
          {t("meta", { name: installer.name, size: sizeMiB })}
        </p>
        <p className="text-[13px] text-white/60">
          {t("checksum")}{" "}
          <code className="break-all rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-white/85">
            {installer.sha256}
          </code>
        </p>
      </section>
      <section className="mt-10 flex flex-col gap-3 text-[15px] text-white/80">
        <h2 className="font-display text-[22px] font-bold text-white">{t("help.title")}</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li>{t("help.step1")}</li>
          <li>{t("help.step2")}</li>
          <li>{t("help.step3")}</li>
        </ol>
      </section>
      <section className="mt-10 flex flex-col gap-3 text-[15px] text-white/80">
        <h2 className="font-display text-[22px] font-bold text-white">{t("smartscreen.title")}</h2>
        <p>{t("smartscreen.why")}</p>
        <ol className="list-decimal space-y-2 pl-6">
          <li>{t("smartscreen.step1")}</li>
          <li>{t("smartscreen.step2")}</li>
        </ol>
      </section>
    </PageShell>
  );
}
