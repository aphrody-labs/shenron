"use client";

import { SectionError } from "@/components/SectionError";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError
      {...props}
      titleKey="error.section.episodes"
      backHref="/wiki/episodes"
      backKey="error.back.episodes"
    />
  );
}
