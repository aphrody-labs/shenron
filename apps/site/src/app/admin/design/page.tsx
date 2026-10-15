import type { Metadata } from "next";
import { requireAdmin } from "@/lib/session";
import DesignEditor from "./DesignEditor";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminDesign");
  return { title: t("title") };
}

export default async function AdminDesignPage() {
  await requireAdmin();
  return <DesignEditor />;
}
