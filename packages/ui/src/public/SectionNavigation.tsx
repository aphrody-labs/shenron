// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";

export interface PageSectionLink {
  id: string;
  label: string;
}

/** Native anchors remain usable before hydration and without a scrolling controller. */
export function SectionNavigation({
  sections,
  label,
}: {
  sections: readonly PageSectionLink[];
  label: string;
}) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let selected = sections[0]?.id ?? null;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= window.innerHeight / 3)
          selected = section.id;
      }
      setCurrent(selected);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);
  if (!sections.length) return null;
  return (
    <nav aria-label={label} className="min-w-0 overflow-x-auto py-2">
      <ul className="m-0 flex w-max min-w-full list-none gap-2 p-0">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${encodeURIComponent(section.id)}`}
              aria-current={current === section.id ? "location" : undefined}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-large border border-outline-variant bg-surface-container px-4 text-label-large text-on-surface transition-colors hover:bg-secondary-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-[current=location]:border-primary aria-[current=location]:bg-secondary-container aria-[current=location]:text-on-secondary-container"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
