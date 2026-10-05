// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";

/** Title block of a studio screen: `level` 1 for the page, 2 for a screen mounted in a tab. */
export function StudioHeader({
  eyebrow,
  title,
  subtitle,
  level = 2,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className="flex flex-col gap-2 border-b border-os/12 pb-4">
      {eyebrow && (
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-dbz-orange">
          {eyebrow}
        </p>
      )}
      <Heading
        className={`${level === 1 ? "text-[clamp(1.75rem,1.3rem+2vw,2.5rem)]" : "text-[clamp(1.375rem,1.15rem+1vw,1.75rem)]"} font-[850] leading-[1.1] tracking-[-0.02em] text-os`}
      >
        {title}
      </Heading>
      {subtitle && <p className="max-w-[72ch] text-[16px] leading-[1.55] text-os/75">{subtitle}</p>}
    </header>
  );
}
