// SPDX-License-Identifier: Apache-2.0
"use client";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { ShenronStudio } from "@shenron/ui/studio";

/** The control panel itself, loaded only inside the desktop app (see `ControlScreen`). */
export default function ControlDesktop() {
  return (
    <PageShell width="wide" rhythm="tight">
      <ShenronStudio />
    </PageShell>
  );
}
