"use client";

import { useT } from "@/components/T";

/** The loading label in the reader's language (`common.loading`), never a hard-coded string. */
export function LoadingText() {
  return <>{useT()("common.loading")}</>;
}
