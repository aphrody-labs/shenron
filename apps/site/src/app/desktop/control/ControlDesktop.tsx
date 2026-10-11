// SPDX-License-Identifier: Apache-2.0
"use client";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { ShenronStudio } from "@aphrody/shenron-ui/studio";

/** The control panel itself, loaded only inside the desktop app (see `ControlScreen`). */
export default function ControlDesktop() {
  return (
    <PageShell width="wide" rhythm="tight">
      <ShenronStudio />
    </PageShell>
  );
}
