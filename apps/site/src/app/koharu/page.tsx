// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { SectionHeading } from "@shenron/ui/layout/SectionHeading";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BibliothequeNav } from "@/components/bibliotheque/BibliothequeNav";
import { T } from "@/components/T";
import { ogMeta } from "@/lib/og";
import { KoharuEditor } from "./KoharuEditor";

const title = "Koharu, l'éditeur de traduction manga";
const description =
  "Koharu détecte les bulles, transcrit le japonais, traduit avec le lexique canonique Dragon Ball de DBFR, nettoie et relettre la planche jusqu'à l'export PSD.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({ title, description, type: "website", canonical: "/koharu" }),
};

const FEATURES = ["detect", "ocr", "translate", "inpaint", "typeset", "export"] as const;

/** Presentation of the editor for the browser; the desktop app replaces it with the editor. */
function KoharuPresentation() {
  return (
    <PageShell rhythm="tight">
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Koharu", display: <T k="bibliotheque.tabs.koharu" /> }]}
      />
      <PageHeader
        className="mb-6"
        eyebrow={<T k="bibliotheque.eyebrow" />}
        title={<T k="bibliotheque.koharu.title" />}
        subtitle={<T k="bibliotheque.koharu.lead" />}
      />
      <BibliothequeNav />

      <section aria-labelledby="koharu-features" className="mb-10 space-y-4">
        <SectionHeading
          id="koharu-features"
          level={2}
          title={<T k="bibliotheque.koharu.featuresTitle" />}
        />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature}
              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <span className="font-display text-[13px] font-semibold uppercase tracking-wider text-dbz-orange">
                <T k={`bibliotheque.koharu.features.${feature}.label`} />
              </span>
              <span className="text-[14px] text-white/75">
                <T k={`bibliotheque.koharu.features.${feature}.text`} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="koharu-desktop"
        className="rounded-xl border border-dbz-orange/30 bg-dbz-card/70 p-5 sm:p-7"
      >
        <h2 id="koharu-desktop" className="font-display text-xl font-semibold text-white">
          <T k="bibliotheque.koharu.desktopTitle" />
        </h2>
        <p className="mt-2 max-w-3xl text-[15px] text-white/75">
          <T k="bibliotheque.koharu.desktopText" />
        </p>
        <Link
          href="/atelier"
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-dbz-orange hover:text-white"
        >
          <T k="bibliotheque.koharu.atelierLink" />
        </Link>
      </section>
    </PageShell>
  );
}

export default function KoharuPage() {
  return <KoharuEditor fallback={<KoharuPresentation />} />;
}
