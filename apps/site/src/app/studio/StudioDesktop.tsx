// SPDX-License-Identifier: Apache-2.0
"use client";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { ShenronStudio } from "@shenron/ui/studio";

/** The studio itself, loaded only inside the desktop app (see `StudioScreen`). */
export default function StudioDesktop() {
  return (
    <PageShell width="wide" rhythm="tight">
      <ShenronStudio />
    </PageShell>
  );
}
