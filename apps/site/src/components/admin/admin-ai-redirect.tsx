import { redirect } from "next/navigation";

export type AdminAiTab = "overview" | "training" | "canon" | "agents";

/** Keeps former focused URLs valid while the AI administration has one home. */
export function redirectToAdminAi(tab: AdminAiTab) {
  redirect(`/admin/ai?tab=${tab}`);
}
