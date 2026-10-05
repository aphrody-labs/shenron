// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";

/** Title block of a studio screen mounted in a tab of the studio page (h2 under its h1). */
export function StudioHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2 border-b border-os/12 pb-4">
      {eyebrow && (
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-dbz-orange">
          {eyebrow}
        </p>
      )}
      <h2 className="font-title text-[clamp(1.375rem,1.15rem+1vw,1.75rem)] leading-[1.1] text-os">
        {title}
      </h2>
      {subtitle && <p className="max-w-[72ch] text-[16px] leading-[1.55] text-os/75">{subtitle}</p>}
    </header>
  );
}
