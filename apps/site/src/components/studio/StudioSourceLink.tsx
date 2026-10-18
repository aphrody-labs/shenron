"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export function StudioSourceLink({
  kind,
  id,
  page,
}: {
  kind: "chapter" | "databook";
  id: number | string;
  page: number;
}) {
  const t = useTranslations("StudioSource");
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded border border-border px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
      href={`/studio?${kind}=${encodeURIComponent(id)}&page=${page}`}
    >
      {t("open", { page })}
    </Link>
  );
}
