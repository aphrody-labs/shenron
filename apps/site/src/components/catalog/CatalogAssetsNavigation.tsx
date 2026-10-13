"use client";
// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useT } from "@/components/T";

export function CatalogAssetsNavigation({
  all,
  parentHref,
}: {
  all: boolean;
  parentHref: string | null;
}) {
  const t = useT();
  return (
    <nav aria-label={t("catalog.assets")} className="mb-5 flex flex-wrap gap-4">
      <Link
        href="/catalog/assets"
        aria-current={!all ? "page" : undefined}
        className="text-dbz-gold"
      >
        {t("catalog.folders")}
      </Link>
      <Link
        href="/catalog/assets?all=1"
        aria-current={all ? "page" : undefined}
        className="text-dbz-gold"
      >
        {t("catalog.allFiles")}
      </Link>
      {parentHref && !all ? (
        <Link href={parentHref} prefetch={false} className="text-dbz-gold">
          {t("catalog.parent")}
        </Link>
      ) : null}
    </nav>
  );
}
