// SPDX-License-Identifier: Apache-2.0
import { PageShell } from "@/components/kit";
import { T } from "@/components/T";
import { GifLibrary } from "@/components/gifs/GifLibrary";
import { readGifCatalog } from "@/lib/gif-catalog";
import { gifPage, gifQuery } from "@/lib/gif-catalog-contract";
import { getDictionary } from "@/lib/i18n";
export const dynamic = "force-dynamic";
export const metadata = {
  title: getDictionary("fr").gifLibrary.title,
  description: getDictionary("fr").gifLibrary.description,
};
export default async function GifIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const input = {
    page: Array.isArray(params.page) ? params.page[0] : params.page,
    q: Array.isArray(params.q) ? params.q[0] : params.q,
    revision: Array.isArray(params.revision) ? params.revision[0] : params.revision,
  };
  let data = gifPage(null, gifQuery({ q: input.q }));
  let error = false;
  try {
    data = await readGifCatalog(input);
  } catch {
    error = true;
  }
  return (
    <PageShell rhythm="loose">
      <h1 className="font-display text-3xl text-dbz-gold">
        <T k="gifLibrary.title" />
      </h1>
      <p className="my-4 max-w-2xl text-os/80">
        <T k="gifLibrary.description" />
      </p>
      <GifLibrary data={data} error={error} />
    </PageShell>
  );
}
