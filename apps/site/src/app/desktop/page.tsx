// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DesktopHome } from "./DesktopHome";

/** Local page of the desktop app (dynamic: the locale comes from the `NEXT_LOCALE` cookie). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("desktop.meta");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default function DesktopPage() {
  return <DesktopHome />;
}
