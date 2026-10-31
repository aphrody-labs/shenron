import CharacterPage from "@/app/wiki/characters/[slug]/page";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Loopback-only preview of the character page, bypassing its launch gate. */
export default async function CharacterVisualPreview({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    saga?: string | string[];
    timeline?: string | string[];
    demoAppearances?: string | string[];
  }>;
}) {
  return CharacterPage({ params, searchParams, preview: true });
}
