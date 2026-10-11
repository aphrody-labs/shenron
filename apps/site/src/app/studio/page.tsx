// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { SectionHeading } from "@aphrody/shenron-ui/layout/SectionHeading";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LibraryNav } from "@/components/library/LibraryNav";
import { T } from "@/components/T";
import { ogMeta } from "@/lib/og";
import { StudioEditor } from "./StudioEditor";

const title = "Shenron Studio, l'éditeur de traduction manga";
const description =
  "Shenron Studio détecte les bulles, transcrit le japonais, traduit avec le lexique canonique Dragon Ball de DBFR, nettoie et relettre la planche jusqu'à l'export PSD.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({ title, description, type: "website", canonical: "/studio" }),
};

const FEATURES = ["detect", "ocr", "translate", "inpaint", "typeset", "export"] as const;

/** Presentation of the editor for the browser; the desktop app replaces it with the editor. */
function StudioPresentation() {
  return (
    <PageShell rhythm="tight">
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Shenron Studio", display: <T k="library.tabs.studio" /> }]}
      />
      <PageHeader
        className="mb-6"
        eyebrow={<T k="library.eyebrow" />}
        title={<T k="library.studio.title" />}
        subtitle={<T k="library.studio.lead" />}
      />
      <LibraryNav />

      <section aria-labelledby="studio-features" className="mb-10 space-y-4">
        <SectionHeading
          id="studio-features"
          level={2}
          title={<T k="library.studio.featuresTitle" />}
        />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature}
              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <span className="font-display text-[13px] font-semibold uppercase tracking-wider text-dbz-orange">
                <T k={`library.studio.features.${feature}.label`} />
              </span>
              <span className="text-[14px] text-white/75">
                <T k={`library.studio.features.${feature}.text`} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="studio-desktop"
        className="rounded-xl border border-dbz-orange/30 bg-dbz-card/70 p-5 sm:p-7"
      >
        <h2 id="studio-desktop" className="font-display text-xl font-semibold text-white">
          <T k="library.studio.desktopTitle" />
        </h2>
        <p className="mt-2 max-w-3xl text-[15px] text-white/75">
          <T k="library.studio.desktopText" />
        </p>
        <Link
          href="/workshop"
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-dbz-orange hover:text-white"
        >
          <T k="library.studio.workshopLink" />
        </Link>
      </section>
    </PageShell>
  );
}

export default function StudioPage() {
  return <StudioEditor fallback={<StudioPresentation />} />;
}
