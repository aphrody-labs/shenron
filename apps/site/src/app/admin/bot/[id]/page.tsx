import { redirect } from "next/navigation";

/**
 * The per-persona detail page duplicated `/admin/bot`: every persona id is an
 * alias of the one Gateway client. Keep the address, send it to the unified
 * page with the persona preselected.
 */
export default async function BotDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/bot?bot=${encodeURIComponent(id)}`);
}
