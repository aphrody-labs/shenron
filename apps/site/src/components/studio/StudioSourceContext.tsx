"use client";
import { useTranslations } from "next-intl";

/** Names the chapter or databook page that the reader sent to Shenron Studio. */
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
    <p className="mt-2 text-[14px] text-white/75">
      {t("sourceContext", { label: t(kind), id, page })}
    </p>
  );
}
