"use client";
import { useTranslations } from "next-intl";

/**
 * Names the chapter or databook page that the reader sent to Shenron Studio.
 * A single quiet strip under the header: the source is a fact to read, not a call to action.
 */
export function StudioSourceContext({
  kind,
  id,
  page,
}: {
  kind: "chapter" | "databook";
  id: number;
  page: number;
}) {
  const t = useTranslations("StudioSource");
  return (
    <p className="mb-6 border-l-2 border-dbz-orange/60 pl-4 text-[14px] tabular-nums text-white/75">
      {t("sourceContext", { label: t(kind), id, page })}
    </p>
  );
}
