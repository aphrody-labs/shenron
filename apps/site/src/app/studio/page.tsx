// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { SectionHeading } from "@aphrody/shenron-ui/layout/SectionHeading";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LibraryNav } from "@/components/library/LibraryNav";
import { StudioSourceContext } from "@/components/studio/StudioSourceContext";
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

/** The reader's source page, as sent by `StudioSourceLink` (`?chapter=<id>&page=<n>`). */
type StudioSource = { kind: "chapter" | "databook"; id: number; page: number };

function studioSource(params: { chapter?: string; databook?: string; page?: string }) {
  const kind = params.chapter !== undefined ? "chapter" : "databook";
  const id = params.chapter ?? params.databook;
  if (id === undefined || !/^\d{1,9}$/.test(id)) return null;
  const page = params.page !== undefined && /^\d{1,5}$/.test(params.page) ? Number(params.page) : 1;
  return { kind, id: Number(id), page: Math.max(1, page) } satisfies StudioSource;
}

/** Presentation of the editor for the browser; the desktop app replaces it with the editor. */
function StudioPresentation({ source }: { source: StudioSource | null }) {
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
      {source && <StudioSourceContext {...source} />}
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
        <div className="mt-4 flex flex-wrap gap-4">
          <Link
            href="/workshop"
            className="inline-flex min-h-11 items-center font-semibold text-dbz-orange hover:text-white"
          >
            <T k="library.studio.workshopLink" />
          </Link>
          <Link
            href="/studio/video"
            className="inline-flex min-h-11 items-center px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 font-semibold text-white transition shadow-[0_0_12px_rgba(168,85,247,0.3)]"
          >
            Ouvrir Shenron Video Studio (FilmCraft NLE)
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string; databook?: string; page?: string }>;
}) {
  const source = studioSource(await searchParams);
  return <StudioEditor source={source} fallback={<StudioPresentation source={source} />} />;
}
