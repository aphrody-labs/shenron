import { redirect } from "next/navigation";
import { getPublishedCardBySlug } from "@/lib/card-catalog";

export default async function OfficialCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = await getPublishedCardBySlug(slug).catch(() => null);
  if (!entry) redirect("/wiki/cards");
  redirect(`/wiki/cards?search=${encodeURIComponent(entry.card.cardNumber)}`);
}
